import { createAction, PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { Address, Hex, decodeFunctionData, erc20Abi } from 'viem'
import {
  COPM_DECIMALS,
  MENTO_ROUTER_ABI,
  MENTO_ROUTER_ADDRESS_CELO,
  MentoDirection,
  USDC_DECIMALS,
  inputTokenFor,
} from 'src/bridgeramp/mentoRouter'
import {
  BridgeRampSwapErrorCode,
  swapBroadcast,
  swapConfirmed,
  swapFailed,
  swapSubmitting,
} from 'src/bridgeramp/slice'
import { BRIDGE_RAMP_QUOTE_TTL_SECONDS } from 'src/bridgeramp/swapCalls'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { BaseStandbyTransaction } from 'src/transactions/slice'
import { NetworkId, TokenTransactionTypeV2, newTransactionContext } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import networkConfig, { networkIdToNetwork } from 'src/web3/networkConfig'
import { call, put, takeLeading } from 'typed-redux-saga'

const TAG = 'bridgeramp/saga'

export interface ExecuteBridgeRampSwapPayload {
  flowId: string
  direction: MentoDirection
  // Base units as decimal strings (see slice).
  amountIn: string
  quotedAmountOut: string
  quotedAt: number
  // Expected output recipient: the user's liquidation address (withdraw) or
  // the user's own wallet (deposit conversion). Checked against the calldata
  // before anything is signed.
  recipient: Address
  // [approve, swap] from prepareBridgeRampCalls, already fee-priced.
  serializablePreparedTransactions: SerializableTransactionRequest[]
}

export const executeBridgeRampSwap =
  createAction<ExecuteBridgeRampSwapPayload>('bridgeramp/executeSwap')

export class RampTransactionGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RampTransactionGuardError'
  }
}

// Last line of defence before signing: the two transactions must be exactly
// "approve the Router for amountIn of the input token" and "swap amountIn on
// the Router with the output going to `recipient`". The screen builds these
// itself, but a stale closure or a bug upstream must never turn into a swap
// whose USDC lands somewhere else.
export function assertRampTransactions(
  txs: Pick<SerializableTransactionRequest, 'to' | 'data'>[],
  expected: { direction: MentoDirection; amountIn: bigint; recipient: Address }
) {
  if (txs.length !== 2) {
    throw new RampTransactionGuardError(`expected 2 transactions, got ${txs.length}`)
  }
  const [approveTx, swapTx] = txs
  const inputToken = inputTokenFor(expected.direction).toLowerCase()

  if ((approveTx.to ?? '').toLowerCase() !== inputToken) {
    throw new RampTransactionGuardError('approve is not on the input token')
  }
  const approve = decodeFunctionData({ abi: erc20Abi, data: (approveTx.data ?? '0x') as Hex })
  if (approve.functionName !== 'approve') {
    throw new RampTransactionGuardError(`first tx is ${approve.functionName}, not approve`)
  }
  const [spender, allowance] = approve.args as readonly [Address, bigint]
  if (spender.toLowerCase() !== MENTO_ROUTER_ADDRESS_CELO.toLowerCase()) {
    throw new RampTransactionGuardError('approve spender is not the Mento Router')
  }
  if (allowance !== expected.amountIn) {
    throw new RampTransactionGuardError('approve amount does not match amountIn')
  }

  if ((swapTx.to ?? '').toLowerCase() !== MENTO_ROUTER_ADDRESS_CELO.toLowerCase()) {
    throw new RampTransactionGuardError('swap is not on the Mento Router')
  }
  const swap = decodeFunctionData({ abi: MENTO_ROUTER_ABI, data: (swapTx.data ?? '0x') as Hex })
  if (swap.functionName !== 'swapExactTokensForTokens') {
    throw new RampTransactionGuardError(`second tx is ${swap.functionName}, not a swap`)
  }
  const [amountIn, , routes, to] = swap.args as unknown as readonly [
    bigint,
    bigint,
    readonly { from: Address; to: Address }[],
    Address,
    bigint,
  ]
  if (amountIn !== expected.amountIn) {
    throw new RampTransactionGuardError('swap amountIn does not match')
  }
  if (routes.length === 0 || routes[0].from.toLowerCase() !== inputToken) {
    throw new RampTransactionGuardError('swap route does not start at the input token')
  }
  if (to.toLowerCase() !== expected.recipient.toLowerCase()) {
    throw new RampTransactionGuardError('swap recipient does not match')
  }
}

function tokenIdsFor(direction: MentoDirection): { inTokenId: string; outTokenId: string } {
  return direction === 'copmToUsdc'
    ? { inTokenId: networkConfig.copmTokenId, outTokenId: networkConfig.usdcTokenId }
    : { inTokenId: networkConfig.usdcTokenId, outTokenId: networkConfig.copmTokenId }
}

function wholeAmount(baseUnits: string, direction: MentoDirection, side: 'in' | 'out'): string {
  const decimals = (direction === 'copmToUsdc') === (side === 'in') ? COPM_DECIMALS : USDC_DECIMALS
  return new BigNumber(baseUnits).shiftedBy(-decimals).toString()
}

// Signs and broadcasts the [approve, swap] pair, then waits for the swap
// receipt. The swap is one transaction with the output delivered straight
// to `recipient`, so for the off-ramp a revert means the user still has
// every COPm (minus gas) and nothing reached Bridge; there is no partial
// state to clean up.
export function* executeBridgeRampSwapSaga(action: PayloadAction<ExecuteBridgeRampSwapPayload>) {
  const {
    flowId,
    direction,
    amountIn,
    quotedAmountOut,
    quotedAt,
    recipient,
    serializablePreparedTransactions,
  } = action.payload
  yield* put(swapSubmitting({ flowId, direction, amountIn, quotedAmountOut, recipient }))

  const fail = function* (code: BridgeRampSwapErrorCode, error: Error, actionName: string) {
    Logger.warn(TAG, `swap ${flowId} failed: ${actionName}`, error)
    yield* put(swapFailed({ code }))
    captureBusinessError(error, {
      feature: 'bridgeramp',
      provider: 'mento',
      action: actionName,
      errorCode: code,
      extra: { direction },
    })
  }

  const now = Math.floor(Date.now() / 1000)
  if (now - quotedAt > BRIDGE_RAMP_QUOTE_TTL_SECONDS) {
    yield* fail('stale_quote', new Error('quote expired before signing'), 'swap_stale_quote')
    return
  }
  try {
    assertRampTransactions(serializablePreparedTransactions, {
      direction,
      amountIn: BigInt(amountIn),
      recipient,
    })
  } catch (err) {
    yield* fail(
      'invalid_recipient',
      err instanceof Error ? err : new Error(String(err)),
      'swap_guard_rejected'
    )
    return
  }

  const networkId = NetworkId['celo-mainnet']
  const { inTokenId, outTokenId } = tokenIdsFor(direction)
  const approveContext = newTransactionContext(TAG, `Bridge Ramp approve ${flowId}`)
  const swapContext = newTransactionContext(TAG, `Bridge Ramp swap ${flowId}`)

  const createApproveStandbyTx = (
    transactionHash: string,
    feeCurrencyId?: string
  ): BaseStandbyTransaction => ({
    context: approveContext,
    networkId,
    type: TokenTransactionTypeV2.Approval,
    transactionHash,
    tokenId: inTokenId,
    approvedAmount: wholeAmount(amountIn, direction, 'in'),
    feeCurrencyId,
  })
  // Off-ramp: from the user's ledger this is COPm leaving towards Bridge, so
  // it shows as a send to the liquidation address. On-ramp conversion: a
  // plain USDC -> COPm swap back into the same wallet.
  const createSwapStandbyTx = (
    transactionHash: string,
    feeCurrencyId?: string
  ): BaseStandbyTransaction =>
    direction === 'copmToUsdc'
      ? {
          context: swapContext,
          networkId,
          type: TokenTransactionTypeV2.Sent,
          amount: { value: `-${wholeAmount(amountIn, direction, 'in')}`, tokenId: inTokenId },
          address: recipient,
          metadata: {},
          transactionHash,
          feeCurrencyId,
        }
      : {
          context: swapContext,
          networkId,
          type: TokenTransactionTypeV2.SwapTransaction,
          inAmount: { value: wholeAmount(quotedAmountOut, direction, 'out'), tokenId: outTokenId },
          outAmount: { value: wholeAmount(amountIn, direction, 'in'), tokenId: inTokenId },
          transactionHash,
          feeCurrencyId,
        }

  let swapHash: Hex
  let approveHash: Hex
  try {
    const hashes = yield* call(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkId,
      [createApproveStandbyTx, createSwapStandbyTx],
      false,
      `bridgeramp-${flowId}`
    )
    ;[approveHash, swapHash] = hashes
    yield* put(swapBroadcast({ approveTxHash: approveHash, swapTxHash: swapHash }))
  } catch (err) {
    yield* fail(
      'broadcast_failed',
      err instanceof Error ? err : new Error(String(err)),
      'swap_broadcast_failed'
    )
    return
  }

  try {
    const receipt = yield* call(
      [publicClient[networkIdToNetwork[networkId]], 'waitForTransactionReceipt'],
      { hash: swapHash }
    )
    if (receipt.status !== 'success') {
      yield* fail('reverted', new Error(`Bridge Ramp swap reverted: ${swapHash}`), 'swap_reverted')
      return
    }
    yield* put(swapConfirmed({ confirmedAt: Math.floor(Date.now() / 1000) }))
    Logger.info(TAG, `swap ${flowId} confirmed`, swapHash)
  } catch (err) {
    // The tx was broadcast; we just could not confirm it from here. Treat as
    // a broadcast failure for the UI, the feed will pick the real status up.
    yield* fail(
      'broadcast_failed',
      err instanceof Error ? err : new Error(String(err)),
      'swap_receipt_failed'
    )
  }
}

export function* bridgeRampSaga() {
  yield* takeLeading(executeBridgeRampSwap.type, executeBridgeRampSwapSaga)
}
