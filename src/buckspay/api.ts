import {
  CheckUserExistsResponse,
  SubmitTransactionRequest,
  SubmitTransactionResponse,
  TransactionStatusResponse,
} from 'src/buckspay/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import { BUCKSPAY_API_BASE_URL } from 'src/web3/networkConfig'
import Logger from 'src/utils/Logger'

const TAG = 'buckspay/api'

export async function checkUserExists(address: string): Promise<CheckUserExistsResponse> {
  const url = `${BUCKSPAY_API_BASE_URL}/api/check/${address}`
  Logger.debug(TAG, `Checking user exists: ${address}`)

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const errorBody = await response.json()
    throw new Error(errorBody.message || `HTTP ${response.status}`)
  }

  return response.json()
}

export async function submitTransaction(
  body: SubmitTransactionRequest
): Promise<SubmitTransactionResponse> {
  const url = `${BUCKSPAY_API_BASE_URL}/api/transaction`
  Logger.debug(TAG, `Submitting transaction: ${body.trxHash}`)

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.json()
    throw new Error(errorBody.message || `HTTP ${response.status}`)
  }

  return response.json()
}

export async function getTransactionStatus(trxHash: string): Promise<TransactionStatusResponse> {
  const url = `${BUCKSPAY_API_BASE_URL}/api/transaction/${trxHash}`
  Logger.debug(TAG, `Getting transaction status: ${trxHash}`)

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const errorBody = await response.json()
    throw new Error(errorBody.message || `HTTP ${response.status}`)
  }

  return response.json()
}
