import { createAction, PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { getEarthquakeDonationConfig } from 'src/donation/earthquake/config'
import { vibrateSuccess, vibrateError } from 'src/styles/hapticFeedback'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { BaseStandbyTransaction } from 'src/transactions/slice'
import { newTransactionContext, TokenTransactionTypeV2 } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { ensureError } from 'src/utils/ensureError'
import { safely } from 'src/utils/safely'
import { publicClient } from 'src/viem'
import { prepareERC20TransferTransaction } from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, select, takeLeading } from 'typed-redux-saga'
import { Hash } from 'viem'

const TAG = 'donation/earthquake/saga'

// Redux entry point. Payload is the amount in whole COPm (user-typed).
// Config (destination Safe address, feature enablement) is read from
// Statsig inside the saga so a mid-flight config rotation is picked up
// on the next tap without a JS reload.
export interface ExecuteEarthquakeDonationPayload {
  amountWhole: string
  // How the user reached the donate action, for analytics. 'popup' fires
  // from the first-open sheet, 'card' from the always-visible TabHome card.
  source: 'popup' | 'card'
}

export const executeEarthquakeDonation = createAction<ExecuteEarthquakeDonationPayload>(
  'donation/earthquake/execute'
)

export function* executeEarthquakeDonationSaga(
  action: PayloadAction<ExecuteEarthquakeDonationPayload>
) {
  const { amountWhole, source } = action.payload
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    Logger.warn(TAG, 'No wallet address available; aborting donation')
    return
  }

  let receiptHash: Hash | undefined
  try {
    const { destinationAddress } = getEarthquakeDonationConfig()
    const tokenId = networkConfig.copmTokenId
    const network = networkConfig.networkToNetworkId
      ? undefined
      : undefined /* keep placeholder resolution for network below */
    void network

    const amountBn = new BigNumber(amountWhole)
    if (!amountBn.isFinite() || amountBn.lte(0)) {
      throw new Error(`Invalid donation amount ${amountWhole}`)
    }
    // COPm has 18 decimals; convert user-typed whole tokens to wei.
    const amountWei = BigInt(amountBn.shiftedBy(18).integerValue(BigNumber.ROUND_DOWN).toFixed(0))

    const networkId = networkConfig.defaultNetworkId
    const feeCurrencies = yield* select(feeCurrenciesSelector, networkId)

    // Reuse the standard ERC20 transfer prep so gas + fee currency picking
    // stays consistent with regular sends. CIP-64 with COPm as feeCurrency
    // works when the user has any COPm balance (they must, to donate).
    const copmToken = feeCurrencies.find((t) => t.tokenId === tokenId)
    if (!copmToken || !copmToken.address) {
      throw new Error('COPm token not present in feeCurrencies')
    }

    const prepared = yield* call(prepareERC20TransferTransaction, {
      fromWalletAddress: walletAddress,
      toWalletAddress: destinationAddress,
      sendToken: copmToken as any,
      amount: amountWei,
      feeCurrencies,
    })

    if (prepared.type !== 'possible') {
      throw new Error(`Prepared transactions not possible: ${prepared.type}`)
    }

    const serializablePreparedTransactions = getSerializablePreparedTransactions(
      prepared.transactions
    )
    const context = newTransactionContext(TAG, 'earthquake_donation')

    const createStandbyTx = (
      transactionHash: string,
      feeCurrencyId?: string
    ): BaseStandbyTransaction => ({
      context,
      networkId,
      type: TokenTransactionTypeV2.Sent,
      amount: {
        value: amountBn.negated().toString(),
        tokenAddress: copmToken.address ?? undefined,
        tokenId,
      },
      address: destinationAddress,
      metadata: {},
      transactionHash,
      feeCurrencyId,
    })

    // sendPreparedTransactions requires 1 standby handler per prepared tx.
    // For a plain ERC20 transfer there is exactly one tx; pad the array
    // defensively so we never mismatch on future multi-tx variants.
    const standbyHandlers = serializablePreparedTransactions.map((_tx, idx) =>
      idx === serializablePreparedTransactions.length - 1 ? createStandbyTx : () => null
    )

    const hashes = yield* call(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkId,
      standbyHandlers
    )
    receiptHash = hashes[hashes.length - 1]

    // Wait for receipt so the analytics + success screen have a confirmed
    // tx to reference. Users on the popup path expect a snappy "gracias"
    // once the tx is mined.
    const receipt = yield* call(
      [
        publicClient[networkConfig.networkToNetworkId ? 'celo' : 'celo'],
        'waitForTransactionReceipt',
      ],
      { hash: receiptHash }
    )
    if (receipt.status !== 'success') {
      throw new Error(`Donation tx reverted: ${receiptHash}`)
    }

    // Standby tx entry already deducted the amount from the user's
    // balance in the feed; add a positive receiver-side entry so the
    // history reads as a real "Enviado a ReFi Colombia" instead of a
    // silent transfer. Standard Sent + standby already covers this,
    // no extra dispatch needed here.
    vibrateSuccess()
    Logger.info(TAG, `Donation success (${source}) tx=${receiptHash} amount=${amountWhole} COPm`)

    navigate(Screens.EarthquakeDonationSuccessScreen, {
      amountWhole: amountBn.toString(),
      transactionHash: receiptHash,
      networkId,
    })
  } catch (err) {
    vibrateError()
    const error = ensureError(err)
    Logger.error(TAG, 'Donation failed', error)
    captureBusinessError(error, {
      feature: 'transactions',
      provider: 'internal',
      action: 'earthquake_donation',
      errorCode: receiptHash ? 'revert' : 'prepare_or_submit_failed',
      extra: { source, hasReceiptHash: !!receiptHash },
    })
  }
}

export function* donationSaga() {
  yield* takeLeading(executeEarthquakeDonation.type, safely(executeEarthquakeDonationSaga))
}

// Test-only helper so the unit tests can drive the saga directly.
export const __TESTING__ = {
  executeEarthquakeDonationSaga,
}
