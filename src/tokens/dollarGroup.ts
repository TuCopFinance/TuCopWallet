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
