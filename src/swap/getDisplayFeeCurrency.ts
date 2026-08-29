import type { TokenBalance } from 'src/tokens/slice'

// Picks the token that should render in the pre-confirm "Fees" row when the
// wallet is about to run a multi-swap (virtual-Dolares path). Called before
// the per-step CIP-64 picker runs, so we can only estimate what it will end
// up choosing. The heuristic mirrors `pickFeeCurrency` exactly so the display
// matches the on-chain outcome in the common case:
//
//   1. iterate `availableFeeCurrencies` in its natural order (already CELO,
//      COPm, USDm, USDC, USDT per the picker contract in tokens/feeCurrencyPicker.ts),
//   2. skip candidates that appear in `excludedTokenIds` (tokens being spent
//      in this same flow — the real picker refuses those too so the reserve
//      is not depleted),
//   3. return the first survivor whose `balance` is strictly positive.
//
// If nothing survives, falls back to `fallbackToken` (typically USDm) so the
// row is never empty. This is the same fallback the previous static-USDm
// implementation used; it only kicks in for wallets that hold zero of every
// fee-viable token, which cannot execute the swap anyway.
export function pickDisplayFeeCurrency({
  availableFeeCurrencies,
  excludedTokenIds,
  fallbackToken,
}: {
  availableFeeCurrencies: TokenBalance[]
  excludedTokenIds: string[]
  fallbackToken: TokenBalance | undefined
}): TokenBalance | undefined {
  const excludeSet = new Set(excludedTokenIds.map((id) => id.toLowerCase()))
  for (const token of availableFeeCurrencies) {
    if (excludeSet.has(token.tokenId.toLowerCase())) continue
    if (token.balance.lte(0)) continue
    return token
  }
  return fallbackToken
}
