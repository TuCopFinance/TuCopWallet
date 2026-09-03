import { Address, Hex } from 'viem'
import {
  parseCacheControlMaxAgeMs,
  signTucopRampRequest,
  tucopRampFetch,
  tucopRampFetchWithMeta,
  FetchImpl,
} from 'src/tucopramp/client'
import {
  Bank,
  BanksResponse,
  ErrorEnvelope,
  MeResponse,
  OfframpOrderRequest,
  OfframpOrderResponse,
  OfframpQuoteRequest,
  OnrampOrderRequest,
  OnrampOrderResponse,
  OnrampQuoteRequest,
  OrderCancelResponse,
  OrderDetail,
  OrdersListResponse,
  QuoteResponse,
  ReceivingAccountResponse,
  TucopRampError,
  TucopRampLimits,
} from 'src/tucopramp/types'
import Logger from 'src/utils/Logger'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import { KeychainAccounts } from 'src/web3/KeychainAccounts'
import { TUCOPRAMP_API_BASE_URL } from 'src/web3/networkConfig'

const TAG = 'tucopramp/api'
const PROOF_UPLOAD_TIMEOUT_MS = 60_000

// Every wallet-scoped call needs an auth context. The signer wrapping happens
// inside client.ts (getSiweSigningFunction over the current viem account); we
// only need to pass the address + keychain reference through.
export interface TucopRampAuth {
  walletAddress: Address
  keychainAccounts: KeychainAccounts
}

// Optional injection hooks for tests. Screens/sagas pass nothing and get the
// production defaults (TUCOPRAMP_API_BASE_URL + real fetchWithTimeout).
interface CallOpts {
  baseUrl?: string
  fetchImpl?: FetchImpl
}

// ---------- Public endpoints (no wallet signature) ----------

export async function getBanks(opts?: CallOpts): Promise<Bank[]> {
  const response = await tucopRampFetch<BanksResponse>({
    method: 'GET',
    upstreamPath: '/v1/p2p/banks',
    skipWalletAuth: true,
    ...opts,
  })
  return response.banks
}

export function getReceivingAccount(opts?: CallOpts): Promise<ReceivingAccountResponse> {
  return tucopRampFetch<ReceivingAccountResponse>({
    method: 'GET',
    upstreamPath: '/v1/p2p/onramp/receiving-account',
    skipWalletAuth: true,
    ...opts,
  })
}

// Server-provided operational caps. See getCachedLimits() in limits.ts for the
// caller-facing lookup that falls back to hardcoded defaults when the runtime
// fetch has not landed yet. Cache-Control: max-age=300 upstream, TTL enforced
// by the fetch saga (skip refetch within 12h per guide sec 10).
export function getLimits(opts?: CallOpts): Promise<TucopRampLimits> {
  return tucopRampFetch<TucopRampLimits>({
    method: 'GET',
    upstreamPath: '/v1/p2p/limits',
    skipWalletAuth: true,
    ...opts,
  })
}

// Metadata-aware variant. Returns { value, serverMaxAgeMs } so the caller can
// implement stale-while-revalidate against the server's Cache-Control hint
// (guide sec 10: server sends max-age=300, wallet had a fixed 12h TTL — this
// variant lets the saga honour whichever is shorter).
export async function getLimitsWithMeta(
  opts?: CallOpts
): Promise<{ value: TucopRampLimits; serverMaxAgeMs: number | null }> {
  const { data, meta } = await tucopRampFetchWithMeta<TucopRampLimits>({
    method: 'GET',
    upstreamPath: '/v1/p2p/limits',
    skipWalletAuth: true,
    ...opts,
  })
  return { value: data, serverMaxAgeMs: parseCacheControlMaxAgeMs(meta.headers) }
}

// ---------- User ----------

export function getMe(auth: TucopRampAuth, opts?: CallOpts): Promise<MeResponse> {
  return tucopRampFetch<MeResponse>({
    method: 'GET',
    upstreamPath: '/v1/p2p/users/me',
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

// Server PATCH /v1/p2p/users/cedula. Body { new_cedula, reason } (both required
// per openapi P2PPatchCedulaRequest). Server rejects with 409
// cedula_locked_by_active_order when there is any non-terminal order — the UI
// should surface that state before firing this call to avoid the round-trip.
// Response { userId, updated_at }; the wallet re-fetches getMe() after
// success to refresh the cached profile with the new cedula_last_4.
export interface UpdateCedulaRequest {
  new_cedula: string
  reason: string
}

export interface UpdateCedulaResponse {
  userId: string
  updated_at: string
}

export function updateCedula(
  auth: TucopRampAuth,
  body: UpdateCedulaRequest,
  opts?: CallOpts
): Promise<UpdateCedulaResponse> {
  return tucopRampFetch<UpdateCedulaResponse>({
    method: 'PATCH',
    upstreamPath: '/v1/p2p/users/cedula',
    body,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

// ---------- Off-ramp ----------

export function getOfframpQuote(
  auth: TucopRampAuth,
  body: OfframpQuoteRequest,
  opts?: CallOpts
): Promise<QuoteResponse> {
  return tucopRampFetch<QuoteResponse>({
    method: 'POST',
    upstreamPath: '/v1/p2p/offramp/quote',
    body,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

export function createOfframpOrder(
  auth: TucopRampAuth,
  body: OfframpOrderRequest,
  idempotencyKey: string,
  opts?: CallOpts
): Promise<OfframpOrderResponse> {
  return tucopRampFetch<OfframpOrderResponse>({
    method: 'POST',
    upstreamPath: '/v1/p2p/offramp/orders',
    body,
    idempotencyKey,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

// ---------- On-ramp ----------

export function getOnrampQuote(
  auth: TucopRampAuth,
  body: OnrampQuoteRequest,
  opts?: CallOpts
): Promise<QuoteResponse> {
  return tucopRampFetch<QuoteResponse>({
    method: 'POST',
    upstreamPath: '/v1/p2p/onramp/quote',
    body,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

export function createOnrampOrder(
  auth: TucopRampAuth,
  body: OnrampOrderRequest,
  idempotencyKey: string,
  opts?: CallOpts
): Promise<OnrampOrderResponse> {
  return tucopRampFetch<OnrampOrderResponse>({
    method: 'POST',
    upstreamPath: '/v1/p2p/onramp/orders',
    body,
    idempotencyKey,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

// ---------- Orders ----------

export interface ListOrdersParams {
  cursor?: string
  limit?: number
}

export function listOrders(
  auth: TucopRampAuth,
  params?: ListOrdersParams,
  opts?: CallOpts
): Promise<OrdersListResponse> {
  const query = new URLSearchParams()
  if (params?.cursor) query.set('cursor', params.cursor)
  if (params?.limit !== undefined) query.set('limit', String(params.limit))
  const queryString = query.toString()
  return tucopRampFetch<OrdersListResponse>({
    method: 'GET',
    upstreamPath: '/v1/p2p/orders',
    queryString: queryString || undefined,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

export function getOrder(
  auth: TucopRampAuth,
  orderId: string,
  opts?: CallOpts
): Promise<OrderDetail> {
  return tucopRampFetch<OrderDetail>({
    method: 'GET',
    upstreamPath: `/v1/p2p/orders/${encodeURIComponent(orderId)}`,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

export function cancelOrder(
  auth: TucopRampAuth,
  orderId: string,
  idempotencyKey: string,
  opts?: CallOpts
): Promise<OrderCancelResponse> {
  return tucopRampFetch<OrderCancelResponse>({
    method: 'POST',
    upstreamPath: `/v1/p2p/orders/${encodeURIComponent(orderId)}/cancel`,
    idempotencyKey,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

export interface ProofUrlResponse {
  url: string
  expires_at: string
}

export type ProofKind = 'operator_outgoing' | 'user_incoming'

export function getProofUrl(
  auth: TucopRampAuth,
  orderId: string,
  kind: ProofKind,
  opts?: CallOpts
): Promise<ProofUrlResponse> {
  return tucopRampFetch<ProofUrlResponse>({
    method: 'GET',
    upstreamPath: `/v1/p2p/orders/${encodeURIComponent(orderId)}/proof-url`,
    queryString: `kind=${encodeURIComponent(kind)}`,
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    ...opts,
  })
}

// ---------- Proof upload (multipart, special case) ----------
//
// Per Ramp server implementation (`middleware/wallet-auth.ts:72-74` +
// `routes/p2p.uploads.ts:12-17`): wallet-auth runs BEFORE multer parses the
// multipart body, so `req.rawBody` is `undefined` at signature-check time
// and the server hashes an empty buffer. That produces the well-known
// `sha256('')` digest `e3b0c442...98b855`, which is what the server
// verifies against. The wallet MUST sign the same digest, NOT the literal
// empty string. `signTucopRampRequest` takes `body: ''` here so its
// `sha256Hex('')` branch runs and produces the matching digest.
//
// Note: guide text at openapi.yaml:51-52 says "sha256 of the raw request
// body for mutating methods" which suggests hashing the multipart bytes,
// but that is documentation drift; server behaviour (which is what the
// signature is verified against) wins. Confirmed via `crypto` in node:
// `sha256('') === sha256(Buffer.alloc(0))`.
//
// The file bytes still reach the upstream intact via the proxy's byte-per-
// byte multipart forwarding. Content-Type + boundary are set by the RN
// runtime automatically; we deliberately do not touch them.

export interface ProofFile {
  uri: string
  name: string
  type: string
}

export interface UploadProofResponse {
  proof_id: string
  status: string
}

interface UploadProofOpts extends CallOpts {
  now?: () => number
}

export async function uploadProof(
  auth: TucopRampAuth,
  orderId: string,
  file: ProofFile,
  opts?: UploadProofOpts
): Promise<UploadProofResponse> {
  const baseUrl = opts?.baseUrl ?? TUCOPRAMP_API_BASE_URL
  const doFetch: FetchImpl =
    opts?.fetchImpl ?? ((url, init) => fetchWithTimeout(url, init ?? null, PROOF_UPLOAD_TIMEOUT_MS))
  const upstreamPath = `/v1/p2p/orders/${encodeURIComponent(orderId)}/proof`

  const address = auth.walletAddress.toLowerCase() as Address
  const signed = await signTucopRampRequest({
    method: 'POST',
    upstreamPath,
    // Empty string, NOT undefined, so signTucopRampRequest hashes ''
    // (=> `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`)
    // matching Ramp's server-side hash of `Buffer.alloc(0)`. See long
    // comment above the class of endpoints for the rationale.
    body: '',
    walletAddress: auth.walletAddress,
    keychainAccounts: auth.keychainAccounts,
    now: opts?.now,
  })

  const formData = new FormData()
  // React Native FormData accepts { uri, name, type } for files; TS widens to
  // Blob to satisfy the DOM lib types.
  formData.append('file', file as unknown as Blob)

  const url = `${baseUrl}${upstreamPath}`
  const response = await doFetch(url, {
    method: 'POST',
    headers: {
      'X-Wallet-Address': address,
      'X-Wallet-Timestamp': signed.timestamp,
      'X-Wallet-Signature': signed.signature as Hex,
      // Do NOT set Content-Type here; runtime sets multipart with the boundary.
    },
    body: formData as unknown as BodyInit,
  })

  if (response.ok) {
    return (await response.json()) as UploadProofResponse
  }

  const text = await response.text()
  let envelope: ErrorEnvelope
  try {
    const parsed = JSON.parse(text)
    envelope =
      parsed && typeof parsed.code === 'string'
        ? (parsed as ErrorEnvelope)
        : { code: `http_${response.status}`, detail: text.slice(0, 500) }
  } catch {
    envelope = { code: `http_${response.status}`, detail: text.slice(0, 500) }
  }
  Logger.warn(TAG, `uploadProof ${orderId} failed`, response.status, envelope.code)
  throw new TucopRampError({
    httpStatus: response.status,
    code: envelope.code,
    message: envelope.detail ?? envelope.title ?? envelope.code,
    request_id: envelope.request_id,
    envelope,
  })
}
