import { PayloadAction } from '@reduxjs/toolkit'
import { checkUserExists, getTransactionStatus, submitTransaction } from 'src/buckspay/api'
import {
  apiSubmitted,
  checkUserComplete,
  checkUserStart,
  cryptoSent,
  offrampError,
  offrampStart,
  resetFlow,
  resumeTracking,
  statusUpdated,
} from 'src/buckspay/slice'
import { bucksPayFlowStatusSelector, bucksPayTransactionHashSelector } from 'src/buckspay/selectors'
import { BankDetails, BucksPayTransactionStatus } from 'src/buckspay/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { sendPreparedTransactions } from 'src/viem/saga'
import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'
import { walletAddressSelector } from 'src/web3/selectors'
import { BUCKSPAY_CELO_NETWORK_ID } from 'src/web3/networkConfig'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { call, cancelled, delay, put, race, select, take, takeLeading } from 'typed-redux-saga'

const TAG = 'buckspay/saga'
const STATUS_POLL_INTERVAL = 30_000 // 30 seconds
const STATUS_POLL_TIMEOUT = 24 * 60 * 60_000 // 24 hours
const API_SUBMIT_MAX_RETRIES = 3
const API_SUBMIT_RETRY_DELAY = 5_000 // 5 seconds

export function* checkUserRegistrationSaga() {
  try {
    const walletAddress: string | null = yield* select(walletAddressSelector)
    if (!walletAddress) {
      Logger.warn(TAG, 'No wallet address found')
      yield* put(checkUserComplete())
      return
    }

    const result = yield* call(checkUserExists, walletAddress)

    if (result.exists) {
      Logger.info(TAG, 'User is registered on BucksPay')
      yield* put(checkUserComplete())
      navigate(Screens.BucksPayBankForm)
    } else {
      Logger.info(TAG, 'User not registered, opening WebView')
      yield* put(checkUserComplete())
      navigate(Screens.WebViewScreen, { uri: 'https://app.buckspay.xyz/' })
    }
  } catch (error) {
    Logger.warn(TAG, 'User check failed, falling back to WebView', error)
    yield* put(checkUserComplete())
    navigate(Screens.WebViewScreen, { uri: 'https://app.buckspay.xyz/' })
  }
}

function* submitWithRetry(walletAddress: string, txHash: string, bankDetails: BankDetails) {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= API_SUBMIT_MAX_RETRIES; attempt++) {
    try {
      Logger.info(TAG, `Submitting to BucksPay API (attempt ${attempt}/${API_SUBMIT_MAX_RETRIES})`)
      const apiResult = yield* call(submitTransaction, {
        address: walletAddress,
        trxHash: txHash,
        network: BUCKSPAY_CELO_NETWORK_ID,
        type: 'transfer',
        number: bankDetails.accountNumber,
        bankName: bankDetails.bankName,
        bankCountry: bankDetails.bankCountry || 'Colombia',
        nationalCurrency: 'COP',
      })
      return apiResult
    } catch (error: any) {
      lastError = error
      Logger.warn(TAG, `API submit attempt ${attempt} failed`, error)
      if (attempt < API_SUBMIT_MAX_RETRIES) {
        yield* delay(API_SUBMIT_RETRY_DELAY * attempt)
      }
    }
  }

  throw lastError ?? new Error('API submit failed after retries')
}

function* pollStatusSaga(txHash: string) {
  const startTime = Date.now()

  while (Date.now() - startTime < STATUS_POLL_TIMEOUT) {
    yield* delay(STATUS_POLL_INTERVAL)

    try {
      const statusResult = yield* call(getTransactionStatus, txHash)

      if (statusResult.status === 'NOT_FOUND') {
        continue
      }

      yield* put(
        statusUpdated({
          status: statusResult.status as BucksPayTransactionStatus,
          certificateUrl: statusResult.transaction?.certificate,
        })
      )

      if (statusResult.status === 'FINISHED') {
        Logger.info(TAG, 'Transaction finished')
        return
      }
    } catch (pollError) {
      Logger.warn(TAG, 'Status poll error, will retry', pollError)
    }
  }

  Logger.warn(TAG, 'Status polling timed out')
  throw new Error('POLLING_TIMEOUT')
}

export function* offrampSaga(
  action: PayloadAction<{
    bankDetails: BankDetails
    preparedTransactions: SerializableTransactionRequest[]
  }>
) {
  const { bankDetails, preparedTransactions } = action.payload

  try {
    const walletAddress: string | null = yield* select(walletAddressSelector)
    if (!walletAddress) {
      throw new Error('No wallet address')
    }

    if (!preparedTransactions || preparedTransactions.length === 0) {
      throw new Error('No prepared transactions')
    }

    // Step 1: Send COPm to BucksPay wallet
    Logger.info(TAG, 'Sending crypto to BucksPay wallet')

    const txHashes = yield* call(
      sendPreparedTransactions,
      preparedTransactions,
      NetworkId['celo-mainnet'],
      preparedTransactions.map(() => () => null)
    )

    const txHash = txHashes[txHashes.length - 1]
    if (!txHash) {
      throw new Error('No transaction hash returned')
    }

    yield* put(cryptoSent({ transactionHash: txHash }))
    navigate(Screens.BucksPayStatus)

    // Step 2: Submit to BucksPay API (with retry)
    const apiResult = yield* call(submitWithRetry, walletAddress, txHash, bankDetails)
    yield* put(apiSubmitted({ code: apiResult.code }))

    // Step 3: Poll for status (cancellable via resetFlow)
    yield* race({
      poll: call(pollStatusSaga, txHash),
      cancel: take(resetFlow.type),
    })
  } catch (error: any) {
    Logger.error(TAG, 'Offramp failed', error)
    const errorKey = error.message === 'POLLING_TIMEOUT' ? 'buckspay.pollingTimeout' : undefined
    yield* put(offrampError(errorKey || error.message || 'Unknown error'))
  } finally {
    if (yield* cancelled()) {
      Logger.info(TAG, 'Offramp saga was cancelled')
    }
  }
}

function* resumeTrackingSaga() {
  const flowStatus = yield* select(bucksPayFlowStatusSelector)
  const txHash = yield* select(bucksPayTransactionHashSelector)

  if ((flowStatus === 'tracking' || flowStatus === 'submitting-to-api') && txHash) {
    Logger.info(TAG, `Resuming tracking for tx ${txHash}`)
    yield* put(resumeTracking())
    navigate(Screens.BucksPayStatus)

    try {
      yield* race({
        poll: call(pollStatusSaga, txHash),
        cancel: take(resetFlow.type),
      })
    } catch (error: any) {
      Logger.error(TAG, 'Resume tracking failed', error)
      const errorKey = error.message === 'POLLING_TIMEOUT' ? 'buckspay.pollingTimeout' : undefined
      yield* put(offrampError(errorKey || error.message || 'Unknown error'))
    }
  }
}

export function* bucksPaySaga() {
  yield* takeLeading(checkUserStart.type, checkUserRegistrationSaga)
  yield* takeLeading(offrampStart.type, offrampSaga)
  // Check if there's an active flow to resume after app restart
  yield* call(resumeTrackingSaga)
}
