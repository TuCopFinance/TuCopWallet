import { Address } from 'viem'
import { PlatformFetchArgs, platformFetch } from 'src/bridgeramp/platformClient'

// Typed wrappers over TuCOPRamp's platform API for TuCOP Ramp powered by
// Bridge. Shapes follow TuCOPRamp main developer-docs (parties.mdx,
// destinations.mdx, withdrawals.mdx, deposits.mdx; API version 2026-10-08).

type CallOpts = Pick<PlatformFetchArgs, 'baseUrl' | 'fetchImpl'>

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

export type PartyKycStatus =
  | 'not_started'
  | 'incomplete'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | string
export type PartyTosStatus = 'pending' | 'accepted' | string

export interface Party {
  id: string
  type: 'individual' | 'business'
  status: {
    kyc: PartyKycStatus
    tos: PartyTosStatus
    endorsements: Array<{ name: 'cop' | string; status: 'pending' | 'approved' | string }>
  }
  restricted: boolean
  links?: { kyc?: string; tos?: string }
  created_at: string
  updated_at: string
}

// The party can use products once KYC is approved, TOS accepted and the cop
// endorsement approved.
export function partyCanTransact(party: Party): boolean {
  return (
    !party.restricted &&
    party.status.kyc === 'approved' &&
    party.status.tos === 'accepted' &&
    party.status.endorsements.some((e) => e.name === 'cop' && e.status === 'approved')
  )
}

export function getParty(partySession: string, opts?: CallOpts): Promise<Party> {
  return platformFetch<Party>({ ...opts, method: 'GET', path: '/v1/parties/me', partySession })
}

export interface CreatePartyRequest {
  type: 'individual'
  // ISO 3166-1 alpha-3 of the document's issuer. TuCOPRamp defaults to COL.
  country?: 'COL'
  legal_name: string
  // Individuals in Colombia (GET /v1/document-types). NIT is a business
  // document; TI is a minor's and Bridge verifies adults only.
  document_type: 'CC' | 'CE' | 'NUIP' | 'PAS'
  document_number: string
  consent: { version: string; accepted_at: string }
  // Required for wallet sessions when the party has no verified email yet.
  email?: string
  redirect_url: string
}

export function createParty(
  partySession: string,
  request: CreatePartyRequest,
  idempotencyKey: string,
  opts?: CallOpts
): Promise<{ party: Party }> {
  return platformFetch<{ party: Party }>({
    ...opts,
    method: 'POST',
    path: '/v1/parties',
    body: request,
    partySession,
    idempotencyKey,
  })
}

// ---------------------------------------------------------------------------
// Destinations (Bre-B keys)
// ---------------------------------------------------------------------------

export type DestinationStatus = 'pending' | 'verified' | 'rejected'
export type DestinationRejectionReason =
  | 'directory_no_match'
  | 'holder_name_mismatch'
  | 'holder_document_mismatch'
  | 'verification_timeout'
  | string

export interface Destination {
  id: string
  // Bridge Ramp only ever registers the user's own key.
  ownership: 'first_party' | 'third_party'
  rail: 'bre_b'
  status: DestinationStatus
  key_masked: string
  owner_name: string | null
  holder: { name: string; bank: string; document_last4: string } | null
  rejection_reason: DestinationRejectionReason | null
  verified_at: string | null
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

export function listDestinations(partySession: string, opts?: CallOpts): Promise<Destination[]> {
  return platformFetch<Destination[]>({
    ...opts,
    method: 'GET',
    path: '/v1/destinations',
    partySession,
  })
}

export function getDestination(
  partySession: string,
  destinationId: string,
  opts?: CallOpts
): Promise<Destination> {
  return platformFetch<Destination>({
    ...opts,
    method: 'GET',
    path: `/v1/destinations/${encodeURIComponent(destinationId)}`,
    partySession,
  })
}

// Registers the user's own Bre-B key. 202 + pending while the Bre-B directory
// answers (about a minute); 200 with the existing destination when the party
// already has this key. The holder must match the party's verified name and
// document, otherwise it comes back rejected.
export function createFirstPartyDestination(
  partySession: string,
  breBKey: string,
  idempotencyKey: string,
  opts?: CallOpts
): Promise<Destination> {
  return platformFetch<Destination>({
    ...opts,
    method: 'POST',
    path: '/v1/destinations',
    body: { ownership: 'first_party', bre_b_key: breBKey },
    partySession,
    idempotencyKey,
  })
}

// ---------------------------------------------------------------------------
// Withdraw (COPm -> COP to the user's own Bre-B key)
// ---------------------------------------------------------------------------
//
// TuCOPRamp developer-docs/withdrawals.mdx. A withdrawal is the party's
// reusable address for one of its own verified Bre-B keys (a Bridge
// liquidation address): any USDC on Celo that arrives there is paid out in
// COP to that key, at or above Bridge's 4,000 COP floor. There is no
// per-withdrawal operation and no exact amount, which is what the Mento swap
// needs (it always lands a little above amountOutMin). A quote is only a
// price; nothing takes it.

const WITHDRAWALS_PATH = '/v1/withdrawals'
const QUOTES_PATH = '/v1/quotes'

export interface MoneyAmount {
  // Decimal string with the asset's decimals (COP 2, USDC 6).
  amount: string
  asset: 'COP' | 'USDC' | string
}

export interface WithdrawQuote {
  id: string
  product: 'withdraw'
  destination_id: string
  // COP that arrives at the destination.
  destination_amount: MoneyAmount
  // USDC to send for at least destination_amount, fee and FX buffer included.
  source_amount: MoneyAmount
  fees: { tucop: MoneyAmount; consumer?: MoneyAmount; fx_buffer?: MoneyAmount }
  total_amount?: MoneyAmount
  // COP per USDC as Bridge gave it.
  rate: { value: string; base: 'USDC'; quote: 'COP'; source: string; observed_at: string }
  rounding_mode: 'ceil' | string
  expires_at: string
  created_at: string
}

// Bridge drain states, passed through as they come.
export type WithdrawalPayoutStatus =
  | 'awaiting_funds'
  | 'in_review'
  | 'funds_received'
  | 'payment_submitted'
  | 'payment_processed'
  | 'undeliverable'
  | 'returned'
  | 'refunded'
  | 'canceled'
  | 'error'
  | string

export interface WithdrawalPayout {
  id: string
  status: WithdrawalPayoutStatus
  // USDC received at the address.
  amount: MoneyAmount | null
  // COP sent to the key.
  destination_amount: MoneyAmount | null
  created_at: string
  updated_at: string
}

export interface Withdrawal {
  id: string
  product: 'withdraw'
  status: 'active' | 'disabled'
  destination_id: string
  deposit: {
    // The Router swap's `to`. Reusable.
    address: Address
    chain: 'eip155:42220' | string
    asset: 'USDC'
    token_contract: Address
    minimum_destination_amount: MoneyAmount
  }
  // TuCOP's fee on this address, e.g. 150 = 1.5 percent of what arrives.
  fee_bps: number | null
  return_address: Address | null
  // Only on GET /v1/withdrawals/{id}; most recent first.
  payouts?: WithdrawalPayout[]
  created_at: string
}

// Creates the address the first time (201), returns the same one later (200).
// return_address defaults to the wallet the session was opened with.
export function createWithdrawal(
  partySession: string,
  request: { destination_id: string; return_address?: Address },
  idempotencyKey: string,
  opts?: CallOpts
): Promise<Withdrawal> {
  return platformFetch<Withdrawal>({
    ...opts,
    method: 'POST',
    path: WITHDRAWALS_PATH,
    body: request,
    partySession,
    idempotencyKey,
  })
}

export function getWithdrawal(
  partySession: string,
  withdrawalId: string,
  opts?: CallOpts
): Promise<Withdrawal> {
  return platformFetch<Withdrawal>({
    ...opts,
    method: 'GET',
    path: `${WITHDRAWALS_PATH}/${encodeURIComponent(withdrawalId)}`,
    partySession,
  })
}

// The USDC to send so that at least amount_cop arrives, with Bridge's rate.
export function createWithdrawQuote(
  partySession: string,
  request: { destination_id: string; amount_cop: MoneyAmount },
  idempotencyKey: string,
  opts?: CallOpts
): Promise<WithdrawQuote> {
  return platformFetch<WithdrawQuote>({
    ...opts,
    method: 'POST',
    path: QUOTES_PATH,
    body: { product: 'withdraw', ...request },
    partySession,
    idempotencyKey,
  })
}

// ---------------------------------------------------------------------------
// Deposit (COP over Bre-B -> USDC to the user's wallet)
// ---------------------------------------------------------------------------
//
// TuCOPRamp developer-docs/deposits.mdx. The deposit account is the party's
// Bridge virtual account: a Bre-B key issued for the party, tied to one
// wallet, created once and reused. The COPm conversion happens in the app
// (convertBridgeDeposit).

const DEPOSITS_PATH = '/v1/deposits'

export interface DepositEvent {
  id: string
  type: string
  amount: MoneyAmount | null
  created_at: string | null
}

export interface DepositAccount {
  id: string
  product: 'deposit'
  status: 'active' | 'deactivated' | string
  // What the user pays.
  deposit_instructions: {
    rail: 'bre_b'
    currency: 'COP'
    bre_b_key: string
    account_holder_name: string | null
    bank_name: string | null
  }
  // Where Bridge sends the USDC.
  destination: { address: Address; chain: string; asset: 'USDC'; token_contract: Address }
  fee_bps: number
  // Only on GET /v1/deposits/{id}; most recent first.
  events?: DepositEvent[]
  created_at: string
}

// The wallet defaults to the one the session was opened with; a different
// wallet gets its own account. 201 the first time, 200 after.
export function createDepositAccount(
  partySession: string,
  request: { wallet_address?: Address },
  idempotencyKey: string,
  opts?: CallOpts
): Promise<DepositAccount> {
  return platformFetch<DepositAccount>({
    ...opts,
    method: 'POST',
    path: DEPOSITS_PATH,
    body: request,
    partySession,
    idempotencyKey,
  })
}

export function getDepositAccount(
  partySession: string,
  depositId: string,
  opts?: CallOpts
): Promise<DepositAccount> {
  return platformFetch<DepositAccount>({
    ...opts,
    method: 'GET',
    path: `${DEPOSITS_PATH}/${encodeURIComponent(depositId)}`,
    partySession,
  })
}
