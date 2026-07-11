import { trancheIdFromPositionId } from 'src/earn/neeru/constants'

describe('trancheIdFromPositionId', () => {
  it('extracts tranche id from a valid Neeru positionId', () => {
    expect(
      trancheIdFromPositionId('celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:tranche-2')
    ).toBe(2)
  })
  it('returns null for non-Neeru positionId', () => {
    expect(trancheIdFromPositionId('celo-mainnet:0xabc:allbridge-pool-1')).toBeNull()
  })
  it('returns null for out-of-range tranche', () => {
    expect(
      trancheIdFromPositionId('celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:tranche-9')
    ).toBeNull()
  })
  it('extracts tranche id from a positionId using the new :category- suffix', () => {
    expect(
      trancheIdFromPositionId('celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:category-2')
    ).toBe(2)
  })
  it('returns null for out-of-range category', () => {
    expect(
      trancheIdFromPositionId('celo-mainnet:0x988af5977201a0e988f2c75ea952532f6beb5082:category-9')
    ).toBeNull()
  })
})
