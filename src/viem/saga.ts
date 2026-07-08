import { endTransactional, pinTransactional } from 'src/pincode/PasswordCache'
import { tokensByIdSelector } from 'src/tokens/selectors'
import { BaseStandbyTransaction, addStandbyTransaction } from 'src/transactions/slice'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { getFeeCurrencyToken } from 'src/viem/prepareTransactions'
import {
  SerializableTransactionRequest,
  getPreparedTransactions,
} from 'src/viem/preparedTransactionSerialization'
import {
  findRecordByIndexSelector,
  markConfirmed,
  markFailed,
  recordSent,
} from 'src/viem/sentTransactionLog'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { getNetworkFromNetworkId } from 'src/web3/utils'
import { call, delay, put, select } from 'typed-redux-saga'
import { Hash } from 'viem'
import { getTransactionCount } from 'viem/actions'

const TAG = 'viem/saga'

// Mempool-commit polling knobs. 100ms is faster than a Celo block (~1s) and
// well within the observed propagation window (typically < 400ms in prod).
// The 2s cap bounds worst-case latency added to a multi-tx flow: after 20
// polls we accept the risk and proceed. If mempool truly didn't commit in
// 2s the next submission may still race, but that's the same failure mode
// we had before this guard.
const MEMPOOL_POLL_MS = 100
const MEMPOOL_POLL_MAX_ATTEMPTS = 20

/**
 * Poll `getTransactionCount('pending')` until it reaches (submittedNonce + 1),
 * meaning Forno has committed the just-submitted tx to its mempool state and
 * is ready to accept the next sequential nonce. Bounded by
 * MEMPOOL_POLL_MAX_ATTEMPTS to avoid hanging on Forno flakiness — if we hit
 * the cap we log a warn and fall through, matching the pre-guard behavior.
 */
function* waitForMempoolCommit(wallet: any, address: `0x${string}`, submittedNonce: number) {
  const expected = submittedNonce + 1
  Logger.info(
    `${TAG}/waitForMempoolCommit`,
    `MEMPOOL_WAIT start submittedNonce=${submittedNonce} expecting_pending_nonce>=${expected} address=${address}`
  )
  for (let attempt = 0; attempt < MEMPOOL_POLL_MAX_ATTEMPTS; attempt++) {
    // @ts-ignore typed-redux-saga erases parameterized types
    const pendingNonce: number = yield* call(getTransactionCount, wallet, {
      address,
      blockTag: 'pending',
    })
    if (pendingNonce >= expected) {
      return
    }
    yield* delay(MEMPOOL_POLL_MS)
  }
  Logger.warn(
    `${TAG}/waitForMempoolCommit`,
    `pending nonce never reached ${expected} after ${MEMPOOL_POLL_MAX_ATTEMPTS} polls; proceeding anyway`
  )
}

/**
 * Sends prepared transactions and adds standby transactions to the store.
 * Returns the hashes of the sent transactions. Throws if the transactions fail
 * to be sent to the network.
 *
 * Idempotency: each submission is logged (nonce + hash + index) to the
 * `sentTransactionLog` slice BEFORE the next iteration begins. On saga reentry
 * after a crash/restart with the same `flowId`, previously-confirmed records
 * are skipped, previously-pending records are awaited via
 * `waitForTransactionReceipt` instead of re-broadcast, and failed records are
 * re-attempted. This avoids double-spend / nonce collisions when the user
 * relaunches a flow that crashed mid-batch.
 *
 * @param {string} serializablePreparedTransactions - serialized prepared
 * transactions
 * @param {number} networkId - network id of the network the transactions are
 * being sent on
 * @param {number} createBaseStandbyTransactions - functions that create the
 * standby transactions, each element corresponding to the prepared transaction
 * of the matching index. It can return null if no standby transaction is needed.
 * @param {boolean} isGasSubsidized - an optional boolean that indicates whether
 * gas is subsidized for the transaction, which means an internal rpc node will be
 * used instead of the default alchemy rpc node
 * @param {string} flowId - optional idempotency key. Defaults to a per-call
 * unique value so existing callers that do not need reentry-safety behave the
 * same as before. Pass a stable id (e.g. a swap/earn flow id) to opt into the
 * resume-on-restart behaviour described above.
 */
export function* sendPreparedTransactions(
  serializablePreparedTransactions: SerializableTransactionRequest[],
  networkId: NetworkId,
  createBaseStandbyTransactions: ((
    transactionHash: string,
    feeCurrencyId?: string
  ) => BaseStandbyTransaction | null)[],
  isGasSubsidized: boolean = false,
  flowId: string = `viem-${Date.now()}-${Math.random()}`
) {
  if (serializablePreparedTransactions.length !== createBaseStandbyTransactions.length) {
    throw new Error('Mismatch in number of prepared transactions and standby transaction creators')
  }

  const network = getNetworkFromNetworkId(networkId)
  if (!network) {
    throw new Error(`No matching network found for network id: ${networkId}`)
  }

  const wallet = yield* call(getViemWallet, networkConfig.viemChain[network], isGasSubsidized)
  if (!wallet.account) {
    // this should never happen
    throw new Error('No account found in the wallet')
  }

  // Unlock account before executing tx
  yield* call(getConnectedUnlockedAccount)

  Logger.info(
    `${TAG}/sendTransactionsSaga`,
    `SEND_SAGA_START flowId=${flowId} preparedTxCount=${serializablePreparedTransactions.length} networkId=${networkId}`
  )

  // Hold the PIN cache for the duration of this multi-step transactional saga
  // so the inactivity TTL cannot expire between signing iterations and force
  // a mid-flow PIN re-prompt. Released on success, failure, or abort.
  const account = wallet.account.address
  pinTransactional(account)
  try {
    // @ts-ignore typed-redux-saga erases the parameterized types causing error, we can address this separately
    let nonce: number = yield* call(getTransactionCount, wallet, {
      address: wallet.account.address,
      blockTag: 'pending',
    })

    const preparedTransactions = getPreparedTransactions(serializablePreparedTransactions)
    const txHashes: Hash[] = []
    for (let i = 0; i < preparedTransactions.length; i++) {
      const preparedTransaction = preparedTransactions[i]
      const createBaseStandbyTransaction = createBaseStandbyTransactions[i]

      // Idempotency check: was this index already submitted on a prior saga
      // run with the same flowId? If so, skip resending (confirmed), wait for
      // receipt (pending), or fall through to re-attempt (failed).
      const existing = yield* select(findRecordByIndexSelector, flowId, i)
      if (existing && existing.status === 'confirmed') {
        Logger.debug(
          `${TAG}/sendTransactionsSaga`,
          `Skipping already-confirmed tx at index ${i} for flow ${flowId}`,
          existing.hash
        )
        // Advance the local nonce so subsequent un-submitted entries pick up
        // the correct value.
        nonce = Math.max(nonce, existing.nonce + 1)
        txHashes.push(existing.hash as Hash)
        continue
      }
      if (existing && existing.status === 'pending') {
        Logger.debug(
          `${TAG}/sendTransactionsSaga`,
          `Awaiting receipt for already-sent tx at index ${i} for flow ${flowId}`,
          existing.hash
        )
        try {
          // @ts-ignore typed-redux-saga loses the parameterized client type
          yield* call(publicClient[network].waitForTransactionReceipt, {
            hash: existing.hash as Hash,
          })
          yield* put(markConfirmed({ flowId, hash: existing.hash }))
        } catch (err) {
          yield* put(markFailed({ flowId, hash: existing.hash }))
          throw err
        }
        nonce = Math.max(nonce, existing.nonce + 1)
        txHashes.push(existing.hash as Hash)
        continue
      }
      // existing.status === 'failed' falls through to a fresh attempt below.

      const txNonce = nonce++
      const signedTx = yield* call([wallet, 'signTransaction'], {
        ...preparedTransaction,
        nonce: txNonce,
      } as any)
      const hash = yield* call([wallet, 'sendRawTransaction'], {
        serializedTransaction: signedTx,
      })

      // Persist the submission BEFORE moving on, so a crash on the next
      // iteration can resume from this point on reentry.
      yield* put(recordSent({ flowId, index: i, nonce: txNonce, hash }))

      Logger.debug(
        `${TAG}/sendTransactionsSaga`,
        'Successfully sent transaction to the network',
        hash
      )

      // Mempool commit race: `sendRawTransaction` returns as soon as Forno
      // acknowledges the tx, but Forno's global pending-nonce view may not
      // reflect the new tx for another few hundred ms while the mempool
      // propagates. If the NEXT tx we sign (either within this call or in a
      // follow-up caller like the multi-swap saga chaining steps) uses a
      // fresh `getTransactionCount('pending')` before that propagation
      // completes, Forno rejects it with a generic `-32602 Missing or invalid
      // parameters` (misleadingly, since our nonce is correct). Always poll
      // until the pending nonce catches up before letting the caller move on.
      yield* call(waitForMempoolCommit, wallet, wallet.account.address, txNonce)

      const tokensById = yield* select((state) => tokensByIdSelector(state, [networkId]))
      const feeCurrencyId = getFeeCurrencyToken(
        [preparedTransaction],
        networkId,
        tokensById
      )?.tokenId

      const standByTx = createBaseStandbyTransaction(hash, feeCurrencyId)
      if (standByTx) {
        yield* put(addStandbyTransaction(standByTx))
      }
      txHashes.push(hash)
    }

    return txHashes
  } finally {
    endTransactional(account)
  }
}
