import { computePayout, effectiveAnnualPercentFromMonthly } from 'src/earn/neeru/rateConversion'

describe('effectiveAnnualPercentFromMonthly', () => {
  it('returns 0 for a non-positive monthly rate', () => {
    expect(effectiveAnnualPercentFromMonthly(0)).toBe(0)
    expect(effectiveAnnualPercentFromMonthly(-1)).toBe(0)
  })
  // Post backend PR #207 (2026-08-18) alignment: E.A. is derived from a
  // daily-compounding equivalent, exponent 365/30 instead of 12. Each row
  // matches the corresponding backend Flex-catalogue value; previous
  // fallback (^12) drifted by 0.15 to 0.21 pp across this range.
  it.each([
    [0.8, 10.180095],
    [1.0, 12.869529],
    [1.05, 13.551236],
    [1.1, 14.23672],
  ])('compounds %f%% monthly to %f%% annual (matches backend row)', (monthly, expected) => {
    expect(effectiveAnnualPercentFromMonthly(monthly)).toBeCloseTo(expected, 5)
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
