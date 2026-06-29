import { computePayout, monthlyPercentFromDailyRateRay } from 'src/earn/neeru/rateConversion'

describe('monthlyPercentFromDailyRateRay', () => {
  it('returns 0 for RAY (1e27)', () => {
    expect(monthlyPercentFromDailyRateRay('1000000000000000000000000000')).toBeCloseTo(0, 4)
  })
  it('computes ~1% monthly for the launch 30d rate', () => {
    // dailyRateRay corresponding to ~1%/30d compounding
    const rate = monthlyPercentFromDailyRateRay('1000331300000000000000000000')
    expect(rate).toBeGreaterThan(0.9)
    expect(rate).toBeLessThan(1.1)
  })
})

describe('computePayout', () => {
  it('isEarly=false returns full payout', () => {
    const r = computePayout({
      principal: '10000',
      accruedInterest: '100',
      penaltyBps: 2000,
      isEarly: false,
    })
    expect(r.total).toBe('10100')
    expect(r.interestAfterPenalty).toBe('100')
  })

  it('isEarly=true applies penalty to interest only', () => {
    const r = computePayout({
      principal: '10000',
      accruedInterest: '100',
      penaltyBps: 2000,
      isEarly: true,
    })
    expect(r.interestAfterPenalty).toBe('80')
    expect(r.total).toBe('10080')
  })
})
