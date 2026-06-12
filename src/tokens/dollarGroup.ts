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

// Fixed display order for dollar tokens inside any picker that surfaces them.
// USDT first (most liquid / default settlement), then USDC, USAT, USDm. The
// order is independent of SPEND_ORDER (which controls spending priority) -
// this is purely about visual presentation.
const DOLLAR_TOKEN_PICKER_ORDER: readonly string[] = [
  networkConfig.usdtTokenId,
  networkConfig.usdcTokenId,
  networkConfig.usatTokenId,
  networkConfig.usdmTokenId,
].filter(Boolean)

// Returns a copy of `tokens` with the dollar tokens reshuffled into the
// canonical picker order. Non-dollar entries stay in their original index,
// so callers can rely on this as a drop-in replacement without disturbing
// the relative position of Pesos / non-dollar destinations.
export function sortDollarTokensForPicker<T extends { tokenId: string }>(tokens: T[]): T[] {
  const dollarIndexes: number[] = []
  const dollarItems: T[] = []
  tokens.forEach((t, i) => {
    if (DOLLAR_TOKEN_IDS.has(t.tokenId)) {
      dollarIndexes.push(i)
      dollarItems.push(t)
    }
  })
  if (dollarItems.length < 2) return tokens
  dollarItems.sort((a, b) => {
    const aIdx = DOLLAR_TOKEN_PICKER_ORDER.indexOf(a.tokenId)
    const bIdx = DOLLAR_TOKEN_PICKER_ORDER.indexOf(b.tokenId)
    // Tokens missing from the canonical order fall to the end of the dollar
    // group but still ahead of non-dollar entries.
    if (aIdx === -1 && bIdx === -1) return 0
    if (aIdx === -1) return 1
    if (bIdx === -1) return -1
    return aIdx - bIdx
  })
  const out = tokens.slice()
  dollarIndexes.forEach((pos, i) => {
    out[pos] = dollarItems[i]
  })
  return out
}
