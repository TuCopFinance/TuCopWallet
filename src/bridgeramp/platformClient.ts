import { Address, Hex } from 'viem'
import { getSiweSigningFunction } from 'src/fiatconnect/clients'
import { FetchImpl, HttpMethod, parseErrorEnvelope } from 'src/tucopramp/client'
import { TucopRampError } from 'src/tucopramp/types'
import Logger from 'src/utils/Logger'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import { KeychainAccounts } from 'src/web3/KeychainAccounts'
import { TUCOPRAMP_API_BASE_URL } from 'src/web3/networkConfig'

const TAG = 'bridgeramp/platformClient'
const REQUEST_TIMEOUT_MS = 30_000

// Bridge Ramp talks to TuCOPRamp's platform API (/v1/sessions, /v1/parties,
// /v1/destinations, /v1/quotes, ...), not to the /v1/p2p/* routes TuCOP Ramp
// uses. The platform API authenticates the APP with a consumer key
// (X-TuCOPRamp-Key) and the USER with a party session
// (X-TuCOPRamp-Party-Session). The consumer key never ships in the app: the
// wallet hits the same backend proxy as TuCOP Ramp and the proxy adds the key
// before forwarding. The party session is the user's and travels end to end.
export const PARTY_SESSION_HEADER = 'X-TuCOPRamp-Party-Session'

export interface PlatformFetchArgs {
  method: HttpMethod
  // Upstream path, e.g. '/v1/parties/me'.
  path: string
  body?: unknown
  partySession?: string
  idempotencyKey?: string
  // Overrides for tests.
  baseUrl?: string
  fetchImpl?: FetchImpl
}

export async function platformFetch<T>(args: PlatformFetchArgs): Promise<T> {
  if (!args.path.startsWith('/v1/')) {
    throw new Error(`platformFetch: path must be an upstream /v1/ path, got "${args.path}"`)
  }
  const baseUrl = args.baseUrl ?? TUCOPRAMP_API_BASE_URL
  const doFetch: FetchImpl =
    args.fetchImpl ?? ((url, init) => fetchWithTimeout(url, init ?? null, REQUEST_TIMEOUT_MS))

  const bodyStr = args.body === undefined ? undefined : JSON.stringify(args.body)
  const headers: Record<string, string> = {}
  if (bodyStr !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (args.partySession) {
    headers[PARTY_SESSION_HEADER] = args.partySession
  }
  if (args.idempotencyKey) {
    headers['Idempotency-Key'] = args.idempotencyKey
  }

  const response = await doFetch(`${baseUrl}${args.path}`, {
    method: args.method,
    headers,
    body: bodyStr,
  })

  if (response.ok) {
    const text = await response.text()
    return (text.length === 0 ? undefined : JSON.parse(text)) as T
  }

  const envelope = await parseErrorEnvelope(response)
  const retryAfterHeader = response.headers.get('Retry-After')
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined
  Logger.warn(
    TAG,
    `${args.method} ${args.path} failed`,
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

export interface PartySession {
  token: string
  method: 'wallet' | 'email_otp'
  // ISO-8601. Sessions last one hour.
  expires_at: string
  // null until the person has a party linked to this app.
  party_id: string | null
}

interface WalletNonceResponse {
  nonce: string
  // The exact text to sign (EIP-191 personal_sign). Names the consumer, the
  // wallet, the chain (42220), the nonce and its 5-minute expiry.
  message: string
}

// Opens a party session by proving control of the wallet: fetch a nonce and
// its message, sign it with the wallet key, exchange the signature. The
// session token comes back once and is kept in memory by the slice.
export async function openWalletPartySession(
  walletAddress: Address,
  keychainAccounts: KeychainAccounts,
  opts: Pick<PlatformFetchArgs, 'baseUrl' | 'fetchImpl'> = {}
): Promise<PartySession> {
  const { nonce, message } = await platformFetch<WalletNonceResponse>({
    ...opts,
    method: 'POST',
    path: '/v1/sessions/wallet/nonce',
    body: { address: walletAddress },
  })
  const signature = (await getSiweSigningFunction(keychainAccounts)(message)) as Hex
  return platformFetch<PartySession>({
    ...opts,
    method: 'POST',
    path: '/v1/sessions/wallet',
    body: { address: walletAddress, nonce, signature },
  })
}
