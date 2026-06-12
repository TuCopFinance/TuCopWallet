import BigNumber from 'bignumber.js'
import { DollarTokenBalanceSnapshot, MultiSwapPlan, SpendStep } from 'src/dollarsSpend/types'

// Hard-coded priority. Top-of-list is consumed first.
// See spec rationale: spend least-liquid / most-regulated first.
const SPEND_ORDER_SYMBOLS: SpendStep['symbol'][] = ['USAT', 'USDm', 'USDC', 'USDT']

export function planSpend({
  requestedUsd,
  balances,
}: {
  requestedUsd: BigNumber
  balances: DollarTokenBalanceSnapshot[]
}): MultiSwapPlan {
  const steps: SpendStep[] = []
  let remaining = requestedUsd

  if (remaining.lte(0)) {
    return { steps, shortfall: new BigNumber(0) }
  }

  // Index balances by symbol so the planner is order-independent on input.
  const bySymbol: Partial<Record<SpendStep['symbol'], DollarTokenBalanceSnapshot>> = {}
  for (const b of balances) {
    if (SPEND_ORDER_SYMBOLS.includes(b.symbol)) {
      bySymbol[b.symbol] = b
    }
  }

  for (const symbol of SPEND_ORDER_SYMBOLS) {
    if (remaining.lte(0)) break
    const snap = bySymbol[symbol]
    if (!snap) continue
    if (snap.priceUsd.lte(0)) continue

    const balanceUsd = snap.balance.multipliedBy(snap.priceUsd)
    if (balanceUsd.lt(snap.minAmountUsd)) continue // dust
    if (balanceUsd.lte(0)) continue

    const takeUsd = BigNumber.min(balanceUsd, remaining)
    const takeTokenWhole = takeUsd.dividedBy(snap.priceUsd)

    steps.push({
      tokenId: snap.tokenId,
      symbol,
      amountUsd: takeUsd,
      amountTokenWhole: takeTokenWhole,
      decimals: snap.decimals,
    })

    remaining = remaining.minus(takeUsd)
  }

  return {
    steps,
    shortfall: BigNumber.max(remaining, new BigNumber(0)),
  }
}
