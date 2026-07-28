import { computePayout, effectiveAnnualPercentFromMonthly } from 'src/earn/neeru/rateConversion'

describe('effectiveAnnualPercentFromMonthly', () => {
  it('returns 0 for a non-positive monthly rate', () => {
    expect(effectiveAnnualPercentFromMonthly(0)).toBe(0)
    expect(effectiveAnnualPercentFromMonthly(-1)).toBe(0)
  })
  it('compounds 1% monthly to ~12.68% annual (matches backend catalogue)', () => {
    expect(effectiveAnnualPercentFromMonthly(1)).toBeCloseTo(12.6825, 3)
  })
})

describe('computePayout', () => {
  it('isEarly=false returns full payout', () => {
    const r = computePayout({
      amount: '10000',
      accruedInterest: '100',
      penaltyBps: 2000,
      isEarly: false,
    })
    expect(r.total).toBe('10100')
    expect(r.interestAfterPenalty).toBe('100')
  })

  it('isEarly=true applies penalty to interest only', () => {
    const r = computePayout({
      amount: '10000',
      accruedInterest: '100',
      penaltyBps: 2000,
      isEarly: true,
    })
    expect(r.interestAfterPenalty).toBe('80')
    expect(r.total).toBe('10080')
  })
})
