import BigNumber from 'bignumber.js'
import type { TokenBalance } from 'src/tokens/slice'
import type {
  AdapterSymbol,
  AdapterState,
  State as BootstrapState,
} from 'src/wri/feeAdapterBootstrap/slice'
import networkConfig from 'src/web3/networkConfig'

// Window between offer attempts when the user dismisses or the backend
// reports relay_failed. Prevents the wallet from spamming the same offer on
// every reopen for users that already declined or for users hit by a
// transient relay outage. 24h matches the user-facing UX: "we will not ask
// again today" is a friendly enough boundary.
export const BOOTSTRAP_DEBOUNCE_MS = 24 * 60 * 60 * 1000

// Strict subset of TokenBalance the detector needs. Decoupled from the full
// TokenBalance shape so test fixtures stay tiny.
type DetectBalances = Pick<TokenBalance, 'tokenId' | 'balance'>

// Reasons that block the offer, surfaced for telemetry + dev logs.
export type SkipReason =
  | 'gate-off'
  | 'no-dollar-balance' // neither USDC nor USDT held
  | 'has-other-gas-option' // user already has CELO or a Mento stable
  | 'all-adapters-bootstrapped' // both USDC and USDT already approved locally
  | 'in-debounce-window' // attempted too recently

export type DetectResult =
  | { shouldOffer: true; adaptersToBootstrap: AdapterSymbol[] }
  | { shouldOffer: false; reason: SkipReason }

interface DetectInput {
  // Just the tokens the detector cares about, in any order. Callers pass the
  // result of selecting from the Redux token registry.
  balances: DetectBalances[]
  bootstrapState: BootstrapState
  now: number
  gateOn: boolean
}

function balanceOf(balances: DetectBalances[], tokenId: string): BigNumber {
  const entry = balances.find((b) => b.tokenId === tokenId)
  return entry ? new BigNumber(entry.balance) : new BigNumber(0)
}

// The user has at least one alternative gas source if their CELO native
// balance OR any Mento stable balance is above zero. Mento stables (USDm,
// COPm) work as CIP-64 fee currencies without any pre-approval because their
// adapter is the protocol itself (isFeeCurrency=true on the token registry).
function hasOtherGasOption(balances: DetectBalances[]): boolean {
  const celo = balanceOf(balances, networkConfig.celoTokenId)
  if (celo.gt(0)) return true
  const usdm = balanceOf(balances, networkConfig.usdmTokenId)
  if (usdm.gt(0)) return true
  const copm = balanceOf(balances, networkConfig.copmTokenId)
  if (copm.gt(0)) return true
  return false
}

// An adapter qualifies for the offer if the user has a positive balance of
// its underlying token AND the local bootstrap flag is not yet true. Backend
// reporting already_approved still flips the local flag on success, so this
// stays correct across the next boot.
function adaptersNeedingBootstrap(
  balances: DetectBalances[],
  bootstrapState: BootstrapState
): AdapterSymbol[] {
  const result: AdapterSymbol[] = []
  const usdcBalance = balanceOf(balances, networkConfig.usdcTokenId)
  const usdtBalance = balanceOf(balances, networkConfig.usdtTokenId)
  if (usdcBalance.gt(0) && !bootstrapState.byAdapter.USDC.bootstrapped) {
    result.push('USDC')
  }
  if (usdtBalance.gt(0) && !bootstrapState.byAdapter.USDT.bootstrapped) {
    result.push('USDT')
  }
  return result
}

function inDebounceWindow(state: AdapterState, now: number): boolean {
  if (state.lastAttemptAt === null) return false
  return now - state.lastAttemptAt < BOOTSTRAP_DEBOUNCE_MS
}

// Pure detector. Returns a decision plus enough context for the saga to
// log telemetry. Does not touch Redux, does not call the network, does not
// dispatch. Easy to unit test against handcrafted balance arrays.
export function detectShouldOfferBootstrap(input: DetectInput): DetectResult {
  if (!input.gateOn) {
    return { shouldOffer: false, reason: 'gate-off' }
  }

  const candidates = adaptersNeedingBootstrap(input.balances, input.bootstrapState)
  if (candidates.length === 0) {
    // Either user has zero USDC + USDT, OR both adapters already flipped to
    // bootstrapped=true locally. Distinguish for telemetry.
    const usdc = balanceOf(input.balances, networkConfig.usdcTokenId)
    const usdt = balanceOf(input.balances, networkConfig.usdtTokenId)
    if (usdc.eq(0) && usdt.eq(0)) {
      return { shouldOffer: false, reason: 'no-dollar-balance' }
    }
    return { shouldOffer: false, reason: 'all-adapters-bootstrapped' }
  }

  if (hasOtherGasOption(input.balances)) {
    return { shouldOffer: false, reason: 'has-other-gas-option' }
  }

  // Debounce on a per-candidate basis: if EVERY candidate hit its
  // lastAttemptAt within the window, skip. If at least one is fresh, fire.
  const anyFresh = candidates.some(
    (sym) => !inDebounceWindow(input.bootstrapState.byAdapter[sym], input.now)
  )
  if (!anyFresh) {
    return { shouldOffer: false, reason: 'in-debounce-window' }
  }

  return { shouldOffer: true, adaptersToBootstrap: candidates }
}
