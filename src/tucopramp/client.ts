import crypto from 'crypto'
import { Address, Hex } from 'viem'
import { getSiweSigningFunction } from 'src/fiatconnect/clients'
import { ErrorEnvelope, TucopRampError } from 'src/tucopramp/types'
import Logger from 'src/utils/Logger'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import { KeychainAccounts } from 'src/web3/KeychainAccounts'
import { TUCOPRAMP_API_BASE_URL } from 'src/web3/networkConfig'

const TAG = 'tucopramp/client'
const CANONICAL_PREFIX = 'TuCOPRamp'
const UPSTREAM_PATH_PREFIX = '/v1/p2p/'
const REQUEST_TIMEOUT_MS = 30_000

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

// Injectable fetch (defaults to fetchWithTimeout at request time; overridden in tests).
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

export interface SignedRequestFields {
  timestamp: string
  signature: Hex
  canonical: string
}

export interface SignTucopRampRequestArgs {
  method: string
  upstreamPath: string
  body?: string
  walletAddress: Address
  keychainAccounts: KeychainAccounts
  // Overrides for tests.
  now?: () => number
}

// Build the canonical string per guide V1.1 Auth section and sign it via the
// existing viem-based keychain path (getSiweSigningFunction). The signing
// primitive lives in src/fiatconnect/clients.ts:20-36; we do not reimplement it.
//
// The canonical string format is:
//   TuCOPRamp:<METHOD>:<PATH>:<WALLET_ADDRESS>:<TIMESTAMP>:<BODY_HASH>
// where <PATH> is the UPSTREAM path TuCOPRamp will verify, not the proxy-
// prefixed path the wallet actually hits. The Pattern B proxy strips
// `/api/tucopramp` before forwarding, so we sign what upstream sees.
export async function signTucopRampRequest(
  args: SignTucopRampRequestArgs
): Promise<SignedRequestFields> {
  assertUpstreamPath(args.upstreamPath)
  const now = args.now ?? (() => Date.now())
  const address = args.walletAddress.toLowerCase() as Address
  const timestamp = String(Math.floor(now() / 1000))
  const bodyHash = args.body === undefined ? '' : sha256Hex(args.body)
  const canonical = `${CANONICAL_PREFIX}:${args.method.toUpperCase()}:${args.upstreamPath}:${address}:${timestamp}:${bodyHash}`
  const signMessage = getSiweSigningFunction(args.keychainAccounts)
  const signature = (await signMessage(canonical)) as Hex
  return { timestamp, signature, canonical }
}

export interface TucopRampFetchArgs {
  method: HttpMethod
  upstreamPath: string
  // Query string WITHOUT leading `?`. Sent to the server but NOT covered by
  // the signature: per guide V1.1 §Auth the canonical string covers the path
  // only, no query string. Callers use this for list pagination + proof-url
  // ?kind=... on GET endpoints.
  queryString?: string
  body?: unknown
  walletAddress?: Address
  keychainAccounts?: KeychainAccounts
  skipWalletAuth?: boolean
  idempotencyKey?: string
  // Overrides for tests.
  baseUrl?: string
  fetchImpl?: FetchImpl
  now?: () => number
}

// The one wallet-side entry point for talking to TuCOPRamp via the backend
// proxy. Handles path prefixing, JSON serialization, wallet header attachment
// (or omission for public endpoints via skipWalletAuth), and typed error
// throwing on non-2xx.
//
// Does NOT retry on non-2xx responses. fetchWithTimeout already applies a
// retry-on-5xx policy at a lower level; wallet-side retry on top would double
// exposure to TuCOPRamp's rate limits without a coherent recovery strategy.
// Callers that need to retry (e.g. after signature_expired) should do so
// explicitly with a fresh timestamp.
export async function tucopRampFetch<T>(args: TucopRampFetchArgs): Promise<T> {
  assertUpstreamPath(args.upstreamPath)
  const baseUrl = args.baseUrl ?? TUCOPRAMP_API_BASE_URL
  const doFetch: FetchImpl =
    args.fetchImpl ?? ((url, init) => fetchWithTimeout(url, init ?? null, REQUEST_TIMEOUT_MS))
  const url = `${baseUrl}${args.upstreamPath}${args.queryString ? `?${args.queryString}` : ''}`

  const bodyStr = args.body === undefined ? undefined : JSON.stringify(args.body)
  const headers: Record<string, string> = {}
  if (bodyStr !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (args.idempotencyKey !== undefined) {
    headers['Idempotency-Key'] = args.idempotencyKey
  }

  if (!args.skipWalletAuth) {
    if (!args.walletAddress || !args.keychainAccounts) {
      throw new Error(
        'tucopRampFetch: walletAddress and keychainAccounts required unless skipWalletAuth=true'
      )
    }
    const signed = await signTucopRampRequest({
      method: args.method,
      upstreamPath: args.upstreamPath,
      body: bodyStr,
      walletAddress: args.walletAddress,
      keychainAccounts: args.keychainAccounts,
      now: args.now,
    })
    headers['X-Wallet-Address'] = args.walletAddress.toLowerCase()
    headers['X-Wallet-Timestamp'] = signed.timestamp
    headers['X-Wallet-Signature'] = signed.signature
  }

  const response = await doFetch(url, {
    method: args.method,
    headers,
    body: bodyStr,
  })

  if (response.ok) {
    const text = await response.text()
    if (text.length === 0) {
      return undefined as T
    }
    return JSON.parse(text) as T
  }

  const retryAfterHeader = response.headers.get('Retry-After')
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined
  const envelope = await parseErrorEnvelope(response)

  Logger.warn(
    TAG,
    `${args.method} ${args.upstreamPath} failed`,
    `status=${response.status}`,
    `code=${envelope.code}`,
    envelope.request_id ? `request_id=${envelope.request_id}` : ''
  )

  throw new TucopRampError({
    httpStatus: response.status,
    code: envelope.code,
    message: envelope.detail ?? envelope.title ?? envelope.code,
    request_id: envelope.request_id,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
    envelope,
  })
}

function assertUpstreamPath(path: string): void {
  if (!path.startsWith(UPSTREAM_PATH_PREFIX)) {
    throw new Error(
      `tucopramp: upstreamPath must start with "${UPSTREAM_PATH_PREFIX}" (Pattern B: wallet signs the upstream path, not the proxy-prefixed one). Got: "${path}"`
    )
  }
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

async function parseErrorEnvelope(response: Response): Promise<ErrorEnvelope> {
  const text = await response.text()
  if (text.length === 0) {
    return { code: `http_${response.status}`, status: response.status }
  }
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && typeof parsed.code === 'string') {
      return parsed as ErrorEnvelope
    }
    return {
      code: `http_${response.status}`,
      status: response.status,
      detail: text.slice(0, 500),
    }
  } catch {
    return {
      code: `http_${response.status}`,
      status: response.status,
      detail: text.slice(0, 500),
    }
  }
}
