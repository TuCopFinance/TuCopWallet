import BigNumber from 'bignumber.js'

const RAY = new BigNumber(10).pow(27)

export function monthlyPercentFromRateValue(rateValue: string): number {
  const daily = new BigNumber(rateValue).dividedBy(RAY)
  if (daily.isLessThanOrEqualTo(1)) return 0
  const monthly = daily.pow(30).minus(1).multipliedBy(100)
  return Number(monthly.toFixed(6))
}

// Colombian financial-rate convention: Neeru quotes a monthly effective rate
// (M.V. = mensual vencido). The user-facing headline in the wallet should be
// the annual effective rate (E.A. = efectivo anual) so the number compares
// against every other yield surface (bank promos, other DeFi cards). Exact
// conversion: E.A. = ((1 + M.V./100)^12 - 1) * 100.
export function effectiveAnnualPercentFromMonthly(monthlyPercent: number): number {
  if (monthlyPercent <= 0) return 0
  const monthlyRate = new BigNumber(monthlyPercent).dividedBy(100)
  const annual = monthlyRate.plus(1).pow(12).minus(1).multipliedBy(100)
  return Number(annual.toFixed(6))
}

export function computePayout({
  principal,
  accruedInterest,
  penaltyBps,
  isEarly,
}: {
  principal: string
  accruedInterest: string
  penaltyBps: number
  isEarly: boolean
}) {
  const p = new BigNumber(principal)
  const i = new BigNumber(accruedInterest)
  const ip = isEarly ? i.multipliedBy(10000 - penaltyBps).dividedBy(10000) : i
  return {
    principal: p.toFixed(),
    interest: i.toFixed(),
    interestAfterPenalty: ip.toFixed(),
    total: p.plus(ip).toFixed(),
    penaltyBps,
    isEarly,
  }
}
