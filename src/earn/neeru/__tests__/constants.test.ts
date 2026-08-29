import { categoryIdFromPositionId } from 'src/earn/neeru/constants'

describe('categoryIdFromPositionId', () => {
  it('extracts category id from a valid positionId', () => {
    expect(
      categoryIdFromPositionId('celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:category-2')
    ).toBe(2)
  })
  it('returns null for a non-earn positionId', () => {
    expect(categoryIdFromPositionId('celo-mainnet:0xabc:allbridge-pool-1')).toBeNull()
  })
  it('accepts any non-negative category id (backend may extend the ladder)', () => {
    // Backend added categories 4 (180d) and 5 (365d) on 2026-08-25; the
    // extractor stopped hard-capping so a future category-6 surfaces too.
    expect(
      categoryIdFromPositionId('celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:category-9')
    ).toBe(9)
  })
  it('returns null for a negative id', () => {
    expect(
      categoryIdFromPositionId(
        'celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:category--1'
      )
    ).toBeNull()
  })
  it('returns null for an unknown suffix', () => {
    expect(
      categoryIdFromPositionId('celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:legacy-2')
    ).toBeNull()
  })
})
