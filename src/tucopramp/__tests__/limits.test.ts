import { TUCOPRAMP_HARDCODED_LIMITS } from 'src/tucopramp/limits'

describe('tucopramp/limits', () => {
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
