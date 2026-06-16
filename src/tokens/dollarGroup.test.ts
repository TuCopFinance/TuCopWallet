import { DOLLAR_TOKEN_IDS, getDollarTokenIds, isDollarToken } from 'src/tokens/dollarGroup'
import networkConfig from 'src/web3/networkConfig'

// Assertions read networkConfig so the tests stay correct against the
// mainnet-only configuration shipped by the app.

describe('DOLLAR_TOKEN_IDS', () => {
  it('includes USDT token ID', () => {
    expect(DOLLAR_TOKEN_IDS.has(networkConfig.usdtTokenId)).toBe(true)
  })

  it('includes USDC token ID', () => {
    expect(DOLLAR_TOKEN_IDS.has(networkConfig.usdcTokenId)).toBe(true)
  })

  it('includes USDm token ID', () => {
    expect(DOLLAR_TOKEN_IDS.has(networkConfig.usdmTokenId)).toBe(true)
  })

  it('does not contain empty string', () => {
    // filter(Boolean) in dollarGroup.ts drops any empty-string token id
    expect(DOLLAR_TOKEN_IDS.has('')).toBe(false)
  })

  it('contains exactly the non-empty token IDs from networkConfig', () => {
    const expected = new Set(
      [
        networkConfig.usdtTokenId,
        networkConfig.usdcTokenId,
        networkConfig.usdmTokenId,
        networkConfig.usatTokenId,
      ].filter(Boolean)
    )
    expect(DOLLAR_TOKEN_IDS).toEqual(expected)
  })
})

describe('isDollarToken', () => {
  it('returns true for USDT', () => {
    expect(isDollarToken(networkConfig.usdtTokenId)).toBe(true)
  })

  it('returns true for USDC', () => {
    expect(isDollarToken(networkConfig.usdcTokenId)).toBe(true)
  })

  it('returns true for USDm', () => {
    expect(isDollarToken(networkConfig.usdmTokenId)).toBe(true)
  })

  it('returns false for COPm', () => {
    expect(isDollarToken(networkConfig.copmTokenId)).toBe(false)
  })

  it('returns false for XAUt0', () => {
    expect(isDollarToken(networkConfig.xaut0TokenId)).toBe(false)
  })

  it('returns false for CELO native token', () => {
    expect(isDollarToken(networkConfig.celoTokenId)).toBe(false)
  })

  it('returns false for an unknown token ID', () => {
    expect(isDollarToken('celo-mainnet:0x0000000000000000000000000000000000000000')).toBe(false)
  })
})

describe('getDollarTokenIds', () => {
  it('returns an array equivalent of DOLLAR_TOKEN_IDS', () => {
    const ids = getDollarTokenIds()
    expect(Array.isArray(ids)).toBe(true)
    expect(new Set(ids)).toEqual(DOLLAR_TOKEN_IDS)
  })

  it('contains USDT, USDC, and USDm at minimum', () => {
    const ids = getDollarTokenIds()
    expect(ids).toContain(networkConfig.usdtTokenId)
    expect(ids).toContain(networkConfig.usdcTokenId)
    expect(ids).toContain(networkConfig.usdmTokenId)
  })
})
