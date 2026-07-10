import BigNumber from 'bignumber.js'
import { DollarTokenBalanceSnapshot, MultiSwapPlan, SpendStep } from 'src/dollarsSpend/types'

// Hard-coded priority. Top-of-list is consumed first.
// See spec rationale: spend least-liquid / most-regulated first.
const SPEND_ORDER_SYMBOLS: SpendStep['symbol'][] = ['USAT', 'USDm', 'USDC', 'USDT']

// Dust tolerance: when the user types the exact rounded balance displayed on
// screen ("$3.00 Dolares") but the actual on-chain sum is a few cents less
// (e.g. USDT 1.984 + USDm 0.994 = 2.979), planSpend would otherwise compute a
// $0.021 shortfall and the UI would surface "Saldo insuficiente". We tolerate
// sub-cent gaps by treating shortfall < $0.05 as 0; the swap just proceeds
// with the actual balance and the user is not blocked by the rounding lie.
const SHORTFALL_DUST_TOLERANCE_USD = 0.05

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

  const rawShortfall = BigNumber.max(remaining, new BigNumber(0))
  // Collapse dust shortfalls to 0 so the user can swap their full displayed
  // balance even when sub-cent on-chain precision means the actual sum is
  // slightly below the rounded-to-2-decimals saldo.
  const shortfall = rawShortfall.lt(SHORTFALL_DUST_TOLERANCE_USD) ? new BigNumber(0) : rawShortfall
  return { steps, shortfall }
}
