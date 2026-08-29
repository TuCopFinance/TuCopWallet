import BigNumber from 'bignumber.js'
import type { TokenBalance } from 'src/tokens/slice'

// TuCop pays gas in CELO first because CELO is invisible in the app (excluded
// from ALLOWED_TOKEN_IDS). Silently draining a token the user never sees is
// better UX than draining a visible stable (Dolares/Pesos) that the user is
// counting on. This picker iterates the incoming array in the order supplied
// by the selector (already CELO-first, then COPm, USDm, USDC, USDT) and
// returns the first candidate that clears the balance, spending-set and
// adapter-allowance checks. Historic "stables-first" Bug-E preference and the
// paired `reorderForBugE` wrapper were removed on 2026-08-20 (see
// [[project_bug_e_reversed_20260820]]).

// Reason the picker returned a choice. Post Bug-E-reversal (2026-08-20) the
// picker is order-preserving with no discrimination by symbol, so the only
// non-null return path is "the first candidate that cleared every check".
// The absence case is `pickFeeCurrency(...) === null` (typed at the return),
// so no reason enum value is needed for it.
export type FeeCurrencyReason = 'first-viable'

export type DeclineReason =
  | 'in-spending-set' // token is being spent in the same flow; would deplete reserve
  | 'insufficient-balance' // balance does not cover requiredGasUsd (or is zero)
  | 'no-price-data' // can't verify against requiredGasUsd; safer to skip
  | 'adapter-allowance-missing' // CIP-64 adapter not pre-approved; caller-supplied

export interface DeclinedCandidate {
  token: TokenBalance
  reason: DeclineReason
}

export interface FeeCurrencyChoice {
  chosen: TokenBalance
  reason: FeeCurrencyReason
  alternatives: TokenBalance[]
  declined: DeclinedCandidate[]
}

export interface PickFeeCurrencyInput {
  /** Candidate fee currencies, already filtered to a single network. */
  available: TokenBalance[]
  /** Token IDs (or addresses) being spent in this flow; never pick these. */
  excludeTokenIds?: string[]
  /** If set, skip any candidate whose balance × priceUsd is below this. */
  requiredGasUsd?: BigNumber
  /**
   * Addresses of CIP-64 adapter-based fee currencies the caller already
   * checked and found without sufficient allowance. The picker can't query
   * the chain synchronously, so callers (sagas) pre-flight allowance and
   * pass in the rejects here.
   */
  adapterAllowanceMissing?: string[]
}

function normalizeLower(values: string[] | undefined): Set<string> {
  return new Set((values ?? []).map((v) => v.toLowerCase()))
}

export function pickFeeCurrency({
  available,
  excludeTokenIds,
  requiredGasUsd,
  adapterAllowanceMissing,
}: PickFeeCurrencyInput): FeeCurrencyChoice | null {
  const excludeSet = normalizeLower(excludeTokenIds)
  const adapterSkipSet = normalizeLower(adapterAllowanceMissing)
  const declined: DeclinedCandidate[] = []
  const passing: TokenBalance[] = []

  for (const token of available) {
    const idMatch = excludeSet.has(token.tokenId.toLowerCase())
    const addressMatch = !!token.address && excludeSet.has(token.address.toLowerCase())
    if (idMatch || addressMatch) {
      declined.push({ token, reason: 'in-spending-set' })
      continue
    }

    if (token.address && adapterSkipSet.has(token.address.toLowerCase())) {
      declined.push({ token, reason: 'adapter-allowance-missing' })
      continue
    }

    if (token.balance.lte(0)) {
      declined.push({ token, reason: 'insufficient-balance' })
      continue
    }

    if (requiredGasUsd) {
      if (!token.priceUsd) {
        declined.push({ token, reason: 'no-price-data' })
        continue
      }
      const balanceUsd = token.balance.multipliedBy(token.priceUsd)
      if (balanceUsd.lt(requiredGasUsd)) {
        declined.push({ token, reason: 'insufficient-balance' })
        continue
      }
    }

    passing.push(token)
  }

  if (passing.length === 0) return null

  const [chosen, ...alternatives] = passing
  return { chosen, reason: 'first-viable', alternatives, declined }
}
