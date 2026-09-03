// Types aligned with TuCOPRamp openapi.yaml v1.1 (commit 3012f01 in TuCOPRamp/main).
// See .claude/coordination/tucopramp.md for source-of-truth pointers.

export type P2POrderType = 'offramp' | 'onramp'
export type PayoutMethod = 'bank_account' | 'bre_b_key'
export type BankAccountType = 'savings' | 'checking'

// Offramp state machine (guide section 6.1)
export type OfframpOrderStatus =
  | 'AWAITING_DEPOSIT'
  | 'DEPOSIT_CONFIRMED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'REFUND_OWED'
  | 'REFUNDED'
  | 'CANCELLED'
  | 'EXPIRED'

// Onramp state machine (guide section 6.2). Note the AWAITING_REVIEW -> AWAITING_PROOF
// loop when the operator marks the proof retryable:true.
export type OnrampOrderStatus =
  | 'AWAITING_PROOF'
  | 'AWAITING_REVIEW'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'

export type OrderStatus = OfframpOrderStatus | OnrampOrderStatus

// ---------- Public endpoints (consumer key only, no signature) ----------

export interface Bank {
  code: string
  display_name: string
  supported_account_types: BankAccountType[]
}

export interface BanksResponse {
  banks: Bank[]
}

// Operational caps served by GET /v1/p2p/limits. Values are Colombian pesos,
// integers, unaggregated. The hardcoded fallback in src/tucopramp/limits.ts
// matches the server default; the runtime fetch is the source of truth.
export interface TucopRampLimits {
  min_order_cop: number
  max_order_cop: number
  max_daily_cop: number
  max_monthly_cop: number
}

export interface ReceivingAccountResponse {
  kind: 'bre_b_key'
  bre_b_key: string
  display_name: string
}

// ---------- User ----------

export interface MeResponse {
  user_id: string
  full_name: string
  cedula_last_4: string | null
  primary_email?: string
}

// ---------- Quotes ----------

export interface OfframpQuoteRequest {
  gross_amount_cop: number
  payout_method: PayoutMethod
  bank_code?: string
  bank_account_type?: BankAccountType
  cedula: string
}

export interface OnrampQuoteRequest {
  gross_amount_cop: number
  cedula: string
}

export interface QuoteResponse {
  quote_id: string
  gross_amount_cop: number
  gross_amount_copm: number
  fee_percent: number
  fee_amount_cop: number
  fee_absorbed_by: 'tucop' | 'user'
  net_amount_to_user_cop: number
  display_text: string
  remaining_daily_cop: number
  remaining_monthly_cop: number
  expires_at: string
}

// ---------- Orders (create) ----------
//
// email is REQUIRED in both onramp and offramp order bodies per v1.1 schema
// (used by Ops to send the outgoing tx hash on COMPLETE).

export interface OfframpOrderRequest {
  gross_amount_cop: number
  cedula: string
  full_name: string
  email: string
  phone?: string
  payout_method: PayoutMethod
  bank_code?: string
  bank_account_type?: BankAccountType
  bank_account_number?: string
  bre_b_key?: string
  consent_accepted: true
  quote_id?: string
}

export interface OfframpOrderResponse {
  order_id: string
  status: OfframpOrderStatus
  multisig_address: string
  chain_id: number
  gross_amount_copm: number
  expires_at: string
}

export interface OnrampOrderRequest {
  gross_amount_cop: number
  cedula: string
  full_name: string
  email: string
  phone?: string
  consent_accepted: true
  quote_id?: string
}

export interface OnrampOrderResponse {
  order_id: string
  status: OnrampOrderStatus
  receiving_account: ReceivingAccountResponse
  gross_amount_cop: number
  expires_at: string
  proof_upload_required: true
  instructions: string
}

// ---------- Orders (read) ----------

export interface OrderSummary {
  id: string
  order_type: P2POrderType
  status: OrderStatus
  gross_amount_cop: number
  gross_amount_copm: number
  created_at: string
  expires_at: string
}

export interface OrdersListResponse {
  orders: OrderSummary[]
  next_cursor: string | null
}

export interface OrderDetail extends OrderSummary {
  fee_percent?: number
  fee_amount_cop?: number
  fee_absorbed_by?: 'tucop' | 'user'
  net_amount_to_user_cop?: number
  payout?: Record<string, unknown>
  deposit?: Record<string, unknown>
  proof?: Record<string, unknown>
  tx_hashes?: Record<string, string | null>
}

export interface OrderCancelResponse {
  id: string
  status: OrderStatus
  cancelled_at: string
}

// ---------- Error envelope: RFC 7807 (Problem Details) ----------
// Match on `code` (stable), never on `detail` (human-facing, may drift).

export interface ErrorEnvelope {
  type?: string
  title?: string
  status?: number
  code: TucopRampErrorCode | string // widen: survive unknown new codes without a build break
  detail?: string
  request_id?: string
  issues?: Array<{ path?: string; code: string }>
}

// Error codes from guide section 9.2 + Pattern B proxy specific.
// Cross-audit 2026-09-02 added the 10 codes tagged (NEW) below: server ships
// 29 codes total, wallet knew 22, users saw the fallback for the missing 10.
export type TucopRampErrorCode =
  | 'invalid_api_key'
  | 'signature_invalid'
  | 'signature_expired'
  | 'wallet_not_linked'
  | 'invalid_body'
  | 'invalid_query'
  | 'consent_required'
  | 'amount_limit_exceeded'
  | 'order_not_found'
  | 'order_not_cancelable'
  | 'proof_missing_file'
  | 'proof_invalid_type'
  | 'proof_too_large'
  | 'proof_not_acceptable_in_state'
  | 'proof_url_expired'
  | 'rate_limited'
  | 'rate_limited_ip'
  | 'rate_limited_consumer'
  | 'rate_limited_wallet'
  | 'idempotency_conflict'
  | 'proxy_disabled' // Wallet-backend proxy specific (kill switch)
  | 'proxy_misconfigured' // Wallet-backend proxy specific (missing env vars)
  // NEW 2026-09-02 (server codes not previously enumerated wallet-side):
  | 'wallet_linked_to_other_user'
  | 'cedula_invalid_format'
  | 'cedula_locked_by_active_order'
  | 'user_not_found'
  | 'payout_invalid_shape'
  | 'idempotency_key_required'
  | 'proof_signature_invalid'
  | 'proof_not_found'
  | 'invalid_upload'
  | 'internal_error'

// Structured error thrown by the client on non-2xx responses.
// Fields exposed intact for both dashboards (code, request_id) and clients
// wanting a friendly display (detail on the envelope).
export interface TucopRampErrorInit {
  httpStatus: number
  code: string
  message: string
  request_id?: string
  retryAfterSeconds?: number
  envelope: ErrorEnvelope
}

export class TucopRampError extends Error {
  readonly httpStatus: number
  readonly code: string
  readonly request_id?: string
  readonly retryAfterSeconds?: number
  readonly envelope: ErrorEnvelope

  constructor(init: TucopRampErrorInit) {
    super(init.message || `TuCOPRamp ${init.httpStatus} ${init.code}`)
    this.name = 'TucopRampError'
    this.httpStatus = init.httpStatus
    this.code = init.code
    this.request_id = init.request_id
    this.retryAfterSeconds = init.retryAfterSeconds
    this.envelope = init.envelope
  }
}
