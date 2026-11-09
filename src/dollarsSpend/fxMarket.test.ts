import { isCopFxWeekendPause } from 'src/dollarsSpend/fxMarket'

describe('isCopFxWeekendPause', () => {
  it('pauses on Saturday and Sunday (UTC)', () => {
    expect(isCopFxWeekendPause(new Date('2026-11-07T12:00:00Z'))).toBe(true) // Saturday
    expect(isCopFxWeekendPause(new Date('2026-11-08T12:00:00Z'))).toBe(true) // Sunday
  })

  it('does not pause on weekdays (UTC)', () => {
    expect(isCopFxWeekendPause(new Date('2026-11-06T12:00:00Z'))).toBe(false) // Friday
    expect(isCopFxWeekendPause(new Date('2026-11-09T12:00:00Z'))).toBe(false) // Monday
  })

  it('uses the UTC day, not the device timezone', () => {
    // Friday 23:59 UTC is still open; Saturday 00:00 UTC is closed, whatever
    // the phone's local day says.
    expect(isCopFxWeekendPause(new Date('2026-11-06T23:59:59Z'))).toBe(false)
    expect(isCopFxWeekendPause(new Date('2026-11-07T00:00:00Z'))).toBe(true)
    expect(isCopFxWeekendPause(new Date('2026-11-08T23:59:59Z'))).toBe(true)
    expect(isCopFxWeekendPause(new Date('2026-11-09T00:00:00Z'))).toBe(false)
  })
})
