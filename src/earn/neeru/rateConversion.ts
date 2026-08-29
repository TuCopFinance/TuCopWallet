import BigNumber from 'bignumber.js'

// Colombian financial-rate convention: the earn feature quotes a monthly
// effective rate (M.V. = mensual vencido). The user-facing headline should
// be the annual effective rate (E.A. = efectivo anual) so the number
// compares against every other yield surface (bank promos, other DeFi
// cards).
//
// Exact conversion (daily-compounding equivalent, matches backend PR #207,
// see tasks/specs/wallet-consumer-spec.md section 9):
//
//   E.A. = ((1 + M.V./100)^(365/30) - 1) * 100
//
// The 365/30 exponent projects a 30-day rate to a 365-day rate assuming
// daily compounding, which is how the backend now derives the value it
// publishes. Prior versions used ^12 (12 30-day periods per year), which
// produced a 0.15 to 0.21 pp drift versus the backend row. This function
// stays as a pre-catalogue fallback for PoolCard so a cold boot without a
// fresh /catalogue still surfaces a reasonable E.A. from the position's
// monthly rate; when the backend catalogue is available its E.A. wins.
//
// Implementation uses Math.pow because BigNumber.pow rejects fractional
// exponents (365/30 = 12.166...). Precision loss vs the backend is well
// under 0.0001 pp across the M.V. range (0.5 to 3.0), which is
// acceptable for a fallback surface.
export function effectiveAnnualPercentFromMonthly(monthlyPercent: number): number {
  if (monthlyPercent <= 0) return 0
  const rate = Math.pow(1 + monthlyPercent / 100, 365 / 30) - 1
  return Number((rate * 100).toFixed(6))
}

export function computePayout({
  amount,
  accruedInterest,
  penaltyBps,
  isEarly,
}: {
  amount: string
  accruedInterest: string
  penaltyBps: number
  isEarly: boolean
}) {
  const p = new BigNumber(amount)
  const i = new BigNumber(accruedInterest)
  const ip = isEarly ? i.multipliedBy(10000 - penaltyBps).dividedBy(10000) : i
  return {
    amount: p.toFixed(),
    interest: i.toFixed(),
    interestAfterPenalty: ip.toFixed(),
    total: p.plus(ip).toFixed(),
    penaltyBps,
    isEarly,
  }
}
