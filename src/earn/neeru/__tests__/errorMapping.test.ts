import { extractNeeruErrorCode, mapNeeruErrorToI18nKey } from 'src/earn/neeru/errorMapping'

describe('mapNeeruErrorToI18nKey', () => {
  it('maps known codes', () => {
    expect(mapNeeruErrorToI18nKey('DEPOSITS_PAUSED')).toBe('neeruVaults.errors.depositsPaused')
    expect(mapNeeruErrorToI18nKey('POSITION_NOT_OWNED')).toBe('neeruVaults.errors.positionStale')
  })
  it('returns unknown for null', () => {
    expect(mapNeeruErrorToI18nKey(null)).toBe('neeruVaults.errors.unknown')
  })
  it('returns unknown for unrecognized', () => {
    expect(mapNeeruErrorToI18nKey('SOME_NEW_CODE')).toBe('neeruVaults.errors.unknown')
  })
})

describe('extractNeeruErrorCode', () => {
  it('finds known code in message', () => {
    expect(extractNeeruErrorCode(new Error('fetch failed: DEPOSITS_PAUSED'))).toBe(
      'DEPOSITS_PAUSED'
    )
  })
  it('returns null when no match', () => {
    expect(extractNeeruErrorCode(new Error('network ECONNRESET'))).toBeNull()
  })
})
