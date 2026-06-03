import { ALLOWED_TOKEN_IDS } from 'src/tokens/constants'
import networkConfig from 'src/web3/networkConfig'

describe('ALLOWED_TOKEN_IDS', () => {
  it('includes COPm', () => {
    expect(ALLOWED_TOKEN_IDS.has(networkConfig.copmTokenId)).toBe(true)
  })

  it('includes USDT', () => {
    expect(ALLOWED_TOKEN_IDS.has(networkConfig.usdtTokenId)).toBe(true)
  })

  it('includes XAUt0', () => {
    expect(ALLOWED_TOKEN_IDS.has(networkConfig.xaut0TokenId)).toBe(true)
  })

  it('includes USDC', () => {
    expect(ALLOWED_TOKEN_IDS.has(networkConfig.usdcTokenId)).toBe(true)
  })

  it('includes USDm (aliased to cUSD contract)', () => {
    expect(ALLOWED_TOKEN_IDS.has(networkConfig.usdmTokenId)).toBe(true)
  })

  it('does not include empty string as a token ID (USAT on Sepolia)', () => {
    // On Sepolia, usatTokenId is '' and the set must not contain empty string.
    expect(ALLOWED_TOKEN_IDS.has('')).toBe(false)
  })

  it('includes USAT when usatTokenId is non-empty (mainnet)', () => {
    // Skipped on Sepolia where usatTokenId is ''.
    const usatId = networkConfig.usatTokenId
    expect(!usatId || ALLOWED_TOKEN_IDS.has(usatId)).toBe(true)
  })
})
