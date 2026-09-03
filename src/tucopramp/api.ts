import { Address, Hex } from 'viem'
import { signTucopRampRequest, tucopRampFetch, FetchImpl } from 'src/tucopramp/client'
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
// Per guide V1.1 §Auth: multipart bodies are NOT covered by the signature
// (BODY_HASH = "" in the canonical string). The file bytes must still reach
// the upstream intact, so the proxy forwards them raw. Content-Type + boundary
// are set by the runtime automatically; we deliberately do not touch them.

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
    body: undefined, // BODY_HASH = "" for multipart per V1.1 §Auth
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
