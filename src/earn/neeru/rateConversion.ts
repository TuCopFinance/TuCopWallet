import BigNumber from 'bignumber.js'

const RAY = new BigNumber(10).pow(27)

export function monthlyPercentFromDailyRateRay(dailyRateRay: string): number {
  const daily = new BigNumber(dailyRateRay).dividedBy(RAY)
  if (daily.isLessThanOrEqualTo(1)) return 0
  const monthly = daily.pow(30).minus(1).multipliedBy(100)
  return Number(monthly.toFixed(6))
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
