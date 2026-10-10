import { Address } from 'viem'
import { PlatformFetchArgs, platformFetch } from 'src/bridgeramp/platformClient'

// Typed wrappers over TuCOPRamp's platform API for Bridge Ramp. Shapes follow
// TuCOPRamp PR #34 (developer-docs/parties.mdx, destinations.mdx,
// payments.mdx). Everything under "Withdraw" is the wallet's side of a product
// TuCOPRamp has designed but not shipped; see the note there.

type CallOpts = Pick<PlatformFetchArgs, 'baseUrl' | 'fetchImpl'>

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

export type PartyKycStatus = 'not_started' | 'pending' | 'approved' | 'rejected' | string
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
  legal_name: string
  document_type: 'CC' | 'CE' | 'TI' | 'NUIP' | 'NIT' | 'PAS'
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

export function deleteDestination(
  partySession: string,
  destinationId: string,
  opts?: CallOpts
): Promise<void> {
  return platformFetch<void>({
    ...opts,
    method: 'DELETE',
    path: `/v1/destinations/${encodeURIComponent(destinationId)}`,
    partySession,
  })
}

// ---------------------------------------------------------------------------
// Withdraw (COPm -> COP to the user's own Bre-B key)
// ---------------------------------------------------------------------------
//
// NOT SHIPPED BY TUCOPRAMP YET. PR #34 ships `pay` (third-party payouts with a
// per-payment deposit address and an exact USDC amount). The `withdraw`
// product exists only as the `first_party` destination kind and a product
// flag. The wallet needs it to differ from `pay` in one way: the deposit
// address must accept ANY amount at or above the quote. The Mento Router has
// no exact-output swap (swapTokensForExactTokens / getAmountsIn are absent
// from the deployed bytecode, checked 2026-10-10), so COPm -> USDC always
// lands a little above amountOutMin and the wallet cannot hit an exact figure
// in one atomic transaction. A per-party Bridge liquidation address does that
// naturally; a fixed-amount transfer does not. The shapes below assume the
// liquidation-address design; the paths are placeholders until TuCOPRamp
// confirms them.

const WITHDRAW_QUOTES_PATH = '/v1/quotes'
const WITHDRAWALS_PATH = '/v1/withdrawals'

export interface MoneyAmount {
  // Decimal string.
  amount: string
  asset: 'COP' | 'USDC' | string
}

export interface WithdrawQuote {
  id: string
  product: 'withdraw'
  destination_id: string
  // What the user receives.
  destination_amount: MoneyAmount
  // USDC that must reach the deposit address for destination_amount to be
  // paid out. Includes TuCOP's fee and the FX buffer.
  source_amount: MoneyAmount
  fees: { tucop: MoneyAmount; fx_buffer?: MoneyAmount }
  rate: { value: string; base: 'USDC'; quote: 'COP'; source: string; observed_at: string }
  rounding_mode: 'ceil'
  expires_at: string
  created_at: string
}

// Quote by the USDC the user will deliver (what the Mento swap produces) so
// TuCOPRamp tells us the COP the user gets, instead of the other way round.
export function createWithdrawQuote(
  partySession: string,
  request: { destination_id: string; source_amount: MoneyAmount },
  idempotencyKey: string,
  opts?: CallOpts
): Promise<WithdrawQuote> {
  return platformFetch<WithdrawQuote>({
    ...opts,
    method: 'POST',
    path: WITHDRAW_QUOTES_PATH,
    body: { product: 'withdraw', ...request },
    partySession,
    idempotencyKey,
  })
}

export type WithdrawalStatus =
  | 'creating'
  | 'awaiting_funds'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'canceled'

export interface Withdrawal {
  id: string
  product: 'withdraw'
  status: WithdrawalStatus
  quote_id: string
  destination_id: string
  destination_amount: MoneyAmount
  source_amount: MoneyAmount
  fees: { tucop: MoneyAmount }
  deposit: {
    // The user's own Bridge liquidation address: USDC on Celo in, COP to
    // their Bre-B key out. This is the Router swap's `to`.
    address: Address
    chain: 'eip155:42220'
    asset: 'USDC'
    token_contract: Address
    // Minimum USDC that must arrive for destination_amount to be paid.
    amount: MoneyAmount
  }
  return_address: Address
  error_code: string | null
  created_at: string
  updated_at: string
}

export function createWithdrawal(
  partySession: string,
  request: { quote_id: string; return_address: Address },
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
