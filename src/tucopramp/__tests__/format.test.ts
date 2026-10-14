import { errorMessageKey, isRateLimitedCode } from 'src/tucopramp/errorCopy'
import { formatCop, formatPercent } from 'src/tucopramp/format'

describe('formatCop', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [100_000, '100.000'],
    [1_500_000, '1.500.000'],
    [-25_000, '-25.000'],
    [1234.5, '1.234,5'],
    [1234.567, '1.234,57'],
  ])('formatCop(%p) -> %p', (value, expected) => {
    expect(formatCop(value)).toBe(expected)
  })
})

describe('formatPercent', () => {
  it('uses a comma decimal separator', () => {
    expect(formatPercent(0.5)).toBe('0,5')
    expect(formatPercent(1.25)).toBe('1,25')
    expect(formatPercent(0)).toBe('0')
  })
})

describe('errorMessageKey', () => {
  it('maps codes to tucopramp.errors keys, every 5xx to http_5xx', () => {
    expect(errorMessageKey('amount_limit_exceeded')).toBe('tucopramp.errors.amount_limit_exceeded')
    expect(errorMessageKey('http_502')).toBe('tucopramp.errors.http_5xx')
    expect(errorMessageKey('http_409')).toBe('tucopramp.errors.http_409')
    expect(errorMessageKey(null)).toBe('tucopramp.errors.unknown')
  })
})

describe('isRateLimitedCode', () => {
  it('matches every bucket by prefix', () => {
    expect(isRateLimitedCode('rate_limited_ip')).toBe(true)
    expect(isRateLimitedCode('rate_limited_api_key')).toBe(true)
    expect(isRateLimitedCode('invalid_body')).toBe(false)
    expect(isRateLimitedCode(null)).toBe(false)
  })
})
