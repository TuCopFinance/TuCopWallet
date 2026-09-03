// TuCOPRamp public types.
//
// Most shapes are re-exported from the generated `./generated/openapi.ts`,
// which is produced by `yarn tucopramp:regen-types` from the upstream
// openapi.yaml. If Ramp bumps the guide, re-run the generator and the wallet
// picks up the new schema automatically. The re-exports here are name-only
// aliases (no schema drift) so downstream imports (`Bank`, `QuoteResponse`,
// etc.) do not have to change when we regenerate.
//
// Anything that ISN'T in the openapi (custom classes like TucopRampError,
// TucopRampLimits derived shape, error-code enum) stays declared inline.

import type { components } from 'src/tucopramp/generated/openapi'

type Schemas = components['schemas']

// ---------- Direct re-exports from the openapi ----------

export type Bank = Schemas['P2PBank']
export type BanksResponse = Schemas['P2PBanksResponse']
export type ReceivingAccountResponse = Schemas['P2PReceivingAccountResponse']
export type MeResponse = Schemas['P2PMeResponse']
export type QuoteResponse = Schemas['P2PQuoteResponse']

export type OfframpQuoteRequest = Schemas['P2POfframpQuoteRequest']
export type OfframpOrderRequest = Schemas['P2POfframpOrderRequest']
export type OfframpOrderResponse = Schemas['P2POfframpOrderResponse']

export type OnrampQuoteRequest = Schemas['P2POnrampQuoteRequest']
export type OnrampOrderRequest = Schemas['P2POnrampOrderRequest']
export type OnrampOrderResponse = Schemas['P2POnrampOrderResponse']

export type OrderSummary = Schemas['P2POrderSummary']
export type OrdersListResponse = Schemas['P2POrdersListResponse']
export type OrderDetail = Schemas['P2POrderDetail']
export type OrderCancelResponse = Schemas['P2POrderCancelResponse']

// ---------- Enums derived from schema unions ----------
//
// openapi-typescript emits enum values as inline unions on the parent
// property. Extract them here so callers can `import { PayoutMethod }` etc.

export type PayoutMethod = OfframpOrderRequest['payout_method']
export type BankAccountType = NonNullable<OfframpOrderRequest['bank_account_type']>
export type P2POrderType = OrderSummary['order_type']

// Off-ramp state machine (guide section 6.1). The openapi types `status` as
// a plain string, so we keep the enum listed here as the wallet's known
// vocabulary. If Ramp adds a state, ordering picks it up as a raw string;
// terminal-state predicates in saga.ts have to be updated by hand.
export type OfframpOrderStatus =
  | 'AWAITING_DEPOSIT'
  | 'DEPOSIT_CONFIRMED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'REFUND_OWED'
  | 'REFUNDED'
  | 'CANCELLED'
  | 'EXPIRED'

// On-ramp state machine (guide section 6.2). Same caveat as off-ramp.
export type OnrampOrderStatus =
  | 'AWAITING_PROOF'
  | 'AWAITING_REVIEW'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'

export type OrderStatus = OfframpOrderStatus | OnrampOrderStatus

// ---------- Limits (server-provided caps + hardcoded fallback shape) ----------

export interface TucopRampLimits {
  min_order_cop: number
  max_order_cop: number
  max_daily_cop: number
  max_monthly_cop: number
}

// ---------- Error envelope (RFC 7807 Problem Details) ----------
//
// Match on `code` (stable), never on `detail` (human-facing, may drift).

export interface ErrorEnvelope {
  type?: string
  title?: string
  status?: number
  code: TucopRampErrorCode | string // widen to survive new server codes without a build break
  detail?: string
  request_id?: string
  issues?: Array<{ path?: string; code: string }>
}

// Error codes cross-checked with Ramp on 2026-09-03 against the actual
// server emit sites. `rate_limited` (no suffix) and `idempotency_conflict`
// were dead branches, removed. Nine codes that the server does emit but
// our union missed were added; UI copy for the ALTA/MEDIA codes is
// mapped in locales/{es-419,en-US}/translation.json under
// `tucopramp.errors.*`.
export type TucopRampErrorCode =
  // Auth
  | 'invalid_api_key'
  | 'signature_invalid'
  | 'signature_expired'
  // User
  | 'wallet_not_linked'
  | 'wallet_linked_to_other_user'
  | 'user_not_found'
  | 'cedula_invalid_format'
  | 'cedula_locked_by_active_order'
  // Body / validation
  | 'invalid_body'
  | 'invalid_query'
  | 'consent_required'
  | 'payout_invalid_shape'
  // Amounts
  | 'amount_limit_exceeded'
  // Orders
  | 'order_not_found'
  | 'order_not_cancelable'
  // Proofs
  | 'proof_missing_file'
  | 'proof_invalid_type'
  | 'proof_too_large'
  | 'proof_not_acceptable_in_state'
  | 'proof_url_expired'
  | 'proof_not_found'
  | 'proof_signature_invalid'
  | 'invalid_upload'
  // Rate limits (bucket-specific; `rate_limited` without a suffix is never
  // emitted by the server per Ramp audit 2026-09-03).
  | 'rate_limited_ip'
  | 'rate_limited_consumer'
  | 'rate_limited_wallet'
  // Idempotency
  | 'idempotency_key_reuse'
  | 'idempotency_key_required'
  // Server-side generic fallback
  | 'internal_error'
  // Wallet-backend proxy specific (not emitted by TuCOPRamp)
  | 'proxy_disabled'
  | 'proxy_misconfigured'

// Structured error thrown by the client on non-2xx responses.

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
