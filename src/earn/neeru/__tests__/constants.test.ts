import { categoryIdFromPositionId } from 'src/earn/neeru/constants'

describe('categoryIdFromPositionId', () => {
  it('extracts tranche id from a valid Neeru positionId', () => {
    expect(
      categoryIdFromPositionId('celo-mainnet:0xd05cdf2dc56d97333c547519df58d56145766294:category-2')
    ).toBe(2)
  })
  it('returns null for non-Neeru positionId', () => {
    expect(categoryIdFromPositionId('celo-mainnet:0xabc:allbridge-pool-1')).toBeNull()
  })
  it('returns null for out-of-range tranche', () => {
    expect(
      categoryIdFromPositionId('celo-mainnet:0xd05cdf2dc56d97333c547519df58d56145766294:category-9')
    ).toBeNull()
  })
})
