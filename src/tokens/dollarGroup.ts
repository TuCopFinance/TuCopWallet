import networkConfig from 'src/web3/networkConfig'

// Set of token IDs that represent USD-denominated stablecoins shown
// as "Dolares" on the home screen. USAT is mainnet-only; on Sepolia
// networkConfig.usatTokenId is '' and filter(Boolean) drops it.
export const DOLLAR_TOKEN_IDS = new Set<string>(
  [
    networkConfig.usdtTokenId,
    networkConfig.usdcTokenId,
    networkConfig.usdmTokenId,
    networkConfig.usatTokenId,
  ].filter(Boolean)
)

export function isDollarToken(tokenId: string): boolean {
  return DOLLAR_TOKEN_IDS.has(tokenId)
}

export function getDollarTokenIds(): string[] {
  return Array.from(DOLLAR_TOKEN_IDS)
}

// Maps a concrete dollar tokenId to the i18n key for its specific brand name
// (Tether USD / USD Coin / Dolar Mento / Tether America USD). Returns null
// when the tokenId is not one of the four concrete dollar tokens; callers
// fall back to the generic "Dolares" label or to `token.name`.
//
// Used so the swap picker can show distinct rows when both the aggregated
// "Dolares" virtual token AND its underlying brands appear together.
export function getDollarTokenLabelKey(tokenId: string): string | null {
  if (tokenId === networkConfig.usdtTokenId) return 'assets.tetherUsd'
  if (tokenId === networkConfig.usdcTokenId) return 'assets.usdCoin'
  if (tokenId === networkConfig.usdmTokenId) return 'assets.mentoDollar'
  if (networkConfig.usatTokenId && tokenId === networkConfig.usatTokenId) {
    return 'assets.tetherAmericaUsd'
  }
  return null
}
