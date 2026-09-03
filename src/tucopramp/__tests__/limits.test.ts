import { CEDULA_REGEX, TUCOPRAMP_HARDCODED_LIMITS, isValidCedula } from 'src/tucopramp/limits'

describe('tucopramp/limits', () => {
  describe('isValidCedula (mirrors server ^\\d{6,10}$)', () => {
    it.each([
      ['', false, 'empty'],
      ['12345', false, '5 digits (below server floor)'],
      ['12345678901', false, '11 digits (above server ceiling)'],
      ['abcdef', false, 'letters only'],
      ['12345abc', false, 'digits + letters'],
      ['123-456', false, 'digits + separator'],
      ['1234 5678', false, 'digits + space'],
      ['123456', true, '6 digits (min)'],
      ['1234567', true, '7 digits'],
      ['1234567890', true, '10 digits (max)'],
    ])('%p -> %p (%s)', (cedula, expected) => {
      expect(isValidCedula(cedula)).toBe(expected)
    })

    it('exposes the regex constant for callers that need it directly', () => {
      expect(CEDULA_REGEX.source).toBe('^\\d{6,10}$')
    })
  })

  describe('TUCOPRAMP_HARDCODED_LIMITS fallback', () => {
    it('shape matches the server TucopRampLimits response (4 required integer fields)', () => {
      expect(TUCOPRAMP_HARDCODED_LIMITS).toEqual({
        min_order_cop: 100_000,
        max_order_cop: 500_000,
        max_daily_cop: 1_000_000,
        max_monthly_cop: 3_000_000,
      })
    })

    it('min < max, daily > max, monthly > daily (sanity)', () => {
      const { min_order_cop, max_order_cop, max_daily_cop, max_monthly_cop } =
        TUCOPRAMP_HARDCODED_LIMITS
      expect(min_order_cop).toBeLessThan(max_order_cop)
      expect(max_daily_cop).toBeGreaterThanOrEqual(max_order_cop)
      expect(max_monthly_cop).toBeGreaterThan(max_daily_cop)
    })
  })
})
