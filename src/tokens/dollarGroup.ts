import networkConfig from 'src/web3/networkConfig'

// Set of token IDs that represent USD-denominated stablecoins shown
// as "Dolares" on the home screen.
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

// Concrete ticker for a dollar-family tokenId (USDT / USDC / USDm / USAT).
// Used in the tx feed detail breakdown so the user sees "0.91 USDT" instead
// of the localized brand name "0.91 Tether USD". Tickers are locale-neutral
// and match the canonical asset names in .claude/rules/tokens.md; keep them
// as literal strings, not i18n keys.
export function getDollarTokenTicker(tokenId: string): string | null {
  if (tokenId === networkConfig.usdtTokenId) return 'USDT'
  if (tokenId === networkConfig.usdcTokenId) return 'USDC'
  if (tokenId === networkConfig.usdmTokenId) return 'USDm'
  if (networkConfig.usatTokenId && tokenId === networkConfig.usatTokenId) {
    return 'USAT'
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
