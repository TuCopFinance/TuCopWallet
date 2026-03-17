import { BUCKSPAY_API_KEY, BUCKSPAY_API_SECRET } from 'src/config'
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

function getAuthHeaders(): HeadersInit {
  return {
    'X-API-Key': BUCKSPAY_API_KEY ?? '',
    'X-API-Secret': BUCKSPAY_API_SECRET ?? '',
    'Content-Type': 'application/json',
  }
}

export async function checkUserExists(address: string): Promise<CheckUserExistsResponse> {
  const url = `${BUCKSPAY_API_BASE_URL}/external/check/${address}`
  Logger.debug(TAG, `Checking user exists: ${address}`)

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getAuthHeaders(),
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
  const url = `${BUCKSPAY_API_BASE_URL}/external/transaction`
  Logger.debug(TAG, `Submitting transaction: ${body.trxHash}`)

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.json()
    throw new Error(errorBody.message || `HTTP ${response.status}`)
  }

  return response.json()
}

export async function getTransactionStatus(trxHash: string): Promise<TransactionStatusResponse> {
  const url = `${BUCKSPAY_API_BASE_URL}/external/transaction/${trxHash}`
  Logger.debug(TAG, `Getting transaction status: ${trxHash}`)

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    const errorBody = await response.json()
    throw new Error(errorBody.message || `HTTP ${response.status}`)
  }

  return response.json()
}
