import BigNumber from 'bignumber.js'
import type { TokenBalance } from 'src/tokens/slice'

// Bug E: CELO is hidden from TuCop's user-facing token list, so paying gas in
// CELO silently shrinks a balance the user can't see. This module deprioritizes
// CELO so any visible stable is preferred, with CELO only used when no stable
// is suitable. The deprioritization lives here (not in feeCurrenciesSelector)
// so legacy callers keep their CELO-first ordering until each one opts in.

export type FeeCurrencyReason =
  | 'preferred-stable' // user-visible token picked, hidden CELO debit avoided
  | 'celo-fallback' // no stable usable, fell back to CELO (last resort)

export type DeclineReason =
  | 'in-spending-set' // token is being spent in the same flow; would deplete reserve
  | 'insufficient-balance' // balance does not cover requiredGasUsd (or is zero)
  | 'no-price-data' // can't verify against requiredGasUsd; safer to skip
  | 'celo-deprioritized' // CELO would have qualified but a stable did too (Bug E)
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

const isCelo = (t: TokenBalance) => t.symbol === 'CELO'
const isNotCelo = (t: TokenBalance) => t.symbol !== 'CELO'

/**
 * Lightweight Bug-E reorder for downstream consumers that iterate the array
 * themselves (e.g. prepareTransactions). Stable + non-filtering: every entry
 * from the input survives; CELO just moves to the end. Use this when the
 * caller wants the full candidate list with the preferred order baked in.
 * For the "pick one with reasoning" use case use pickFeeCurrency instead.
 */
export function reorderForBugE(available: TokenBalance[]): TokenBalance[] {
  return [...available.filter(isNotCelo), ...available.filter(isCelo)]
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

  // Reorder candidates so stables come before CELO. Within each group the
  // selector-supplied order (priority + USD balance) is preserved.
  const nonCelo = available.filter(isNotCelo)
  const celo = available.filter(isCelo)
  const ordered = [...nonCelo, ...celo]

  const passing: TokenBalance[] = []
  for (const token of ordered) {
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

  const firstStable = passing.find(isNotCelo)
  const firstCelo = passing.find(isCelo)

  let chosen: TokenBalance
  let reason: FeeCurrencyReason

  if (firstStable) {
    chosen = firstStable
    reason = 'preferred-stable'
    // Surface the Bug-E preference: CELO was usable but we deprioritized it.
    if (firstCelo) {
      declined.push({ token: firstCelo, reason: 'celo-deprioritized' })
    }
  } else {
    // Only CELO remained. Acceptable last resort.
    chosen = firstCelo!
    reason = 'celo-fallback'
  }

  const alternatives = passing.filter((t) => t !== chosen)
  return { chosen, reason, alternatives, declined }
}
