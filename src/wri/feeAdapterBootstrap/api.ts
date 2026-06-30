import networkConfig from 'src/web3/networkConfig'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import Logger from 'src/utils/Logger'

const TAG = 'wri/feeAdapterBootstrap/api'

// The backend processes USDC + USDT in one request (no per-token call). It
// reads the user balance on-chain, skips tokens with 0 balance, checks the
// existing allowance, and only calls approve via BatchExecutor.execute() when
// needed. Wallet sends just the address. See contract with backend in PR
// reply from 2026-06-30.
export interface BootstrapRequest {
  address: string
}

// One entry per adapter the backend has configured (today USDC + USDT). The
// status field is the source of truth for whether the wallet should mark the
// adapter as bootstrapped locally.
export type AdapterStatus =
  | 'approved' // relay submitted tx, receipt success, allowance now MAX_UINT256
  | 'already_approved' // on-chain allowance was already >= 2^200, no tx sent
  | 'skipped_no_balance' // user has 0 of this token, no need to approve yet
  | 'skipped_no_adapter' // backend env var missing for this token (should not happen)
  | 'relay_failed' // sendTransaction threw, receipt reverted, or RPC failed

export interface AdapterResult {
  tokenSymbol: 'USDC' | 'USDT'
  tokenAddress: string
  adapterAddress: string
  status: AdapterStatus
  txHash: string | null
  alreadyApproved: boolean
}

export interface BootstrapResponse {
  ok: true
  relayAddress: string
  results: AdapterResult[]
}

// 4xx errors from the endpoint surface as typed errors so the saga can branch
// on them without parsing error messages. 5xx + network errors throw
// BootstrapRelayError so the saga can retry with backoff.
export class BootstrapBadAddressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BootstrapBadAddressError'
  }
}
export class BootstrapNotDelegatedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BootstrapNotDelegatedError'
  }
}
export class BootstrapRelayError extends Error {
  readonly retryAfterMs: number
  constructor(message: string, retryAfterMs = 0) {
    super(message)
    this.name = 'BootstrapRelayError'
    this.retryAfterMs = retryAfterMs
  }
}
export class BootstrapDisabledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BootstrapDisabledError'
  }
}

// 30 second timeout. The relay may take 5-15s to sign + submit + wait for the
// receipt, depending on Celo block conditions. 30s gives headroom without
// hanging the saga indefinitely.
const BOOTSTRAP_TIMEOUT_MS = 30_000

export async function postFeeAdapterBootstrap(address: string): Promise<BootstrapResponse> {
  Logger.info(TAG, `POST ${networkConfig.wriFeeAdapterBootstrapUrl} for ${address}`)
  const response = await fetchWithTimeout(
    networkConfig.wriFeeAdapterBootstrapUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address } as BootstrapRequest),
    },
    BOOTSTRAP_TIMEOUT_MS
  )

  if (response.ok) {
    const body = (await response.json()) as BootstrapResponse
    Logger.info(
      TAG,
      `bootstrap ok for ${address}: ${body.results.map((r) => `${r.tokenSymbol}=${r.status}`).join(', ')}`
    )
    return body
  }

  // Read the body for the error message but tolerate non-JSON 5xx responses.
  let errorText = ''
  try {
    errorText = await response.text()
  } catch {
    errorText = `<could not read body for ${response.status}>`
  }

  if (response.status === 400) {
    throw new BootstrapBadAddressError(errorText || 'invalid address')
  }
  if (response.status === 412) {
    throw new BootstrapNotDelegatedError(errorText || 'user not delegated to BatchExecutor')
  }
  if (response.status === 503) {
    // Backend uses 503 for both kill-switch off and "relay temporarily
    // unavailable". The saga decides retry policy based on the body text.
    const isKillSwitch = /fee bootstrap disabled/i.test(errorText)
    if (isKillSwitch) {
      throw new BootstrapDisabledError(errorText)
    }
    // Recommended retry window for relay unavailable: 5 min minimum.
    throw new BootstrapRelayError(errorText || 'relay temporarily unavailable', 5 * 60 * 1000)
  }
  // 500 + anything else: generic relay error with default backoff.
  throw new BootstrapRelayError(errorText || `bootstrap returned ${response.status}`)
}
