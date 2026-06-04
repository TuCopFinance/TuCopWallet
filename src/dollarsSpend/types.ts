import BigNumber from 'bignumber.js'
import networkConfig from 'src/web3/networkConfig'

// Synthetic tokenId used in pickers to represent the aggregated dollar bucket.
// Consumers detect this and route into the multi-step planner instead of using
// a real ERC-20 tokenId. Not a real token; never appears on-chain.
export const DOLARES_VIRTUAL_TOKEN_ID = 'virtual:dolares'

// Spend priority. Index 0 is consumed first; later items only fire when earlier
// ones are exhausted (or below Squid minAmount). Tied to the wallet strategy:
// spend the least-liquid / most-regulated stables first so USDT is kept
// available as long as possible. Order is a constant; trivial to change.
//
// NOTE: this is an array of tokenId getters because networkConfig is read
// lazily (some tokens are mainnet-only and resolve to '' on Sepolia).
export const SPEND_ORDER: ReadonlyArray<keyof typeof networkConfig> = [
  'usatTokenId',
  'usdmTokenId',
  'usdcTokenId',
  'usdtTokenId',
] as const

export type DollarSymbol = 'USAT' | 'USDm' | 'USDC' | 'USDT'

export interface SpendStep {
  tokenId: string
  symbol: DollarSymbol
  amountUsd: BigNumber // USD value of this step (priceUsd * tokenAmount)
  amountTokenWhole: BigNumber // amount in token's whole units (BigNumber, decimal)
}

export interface MultiSwapPlan {
  steps: SpendStep[]
  // > 0 when total dollar balance cannot meet requestedUsd.
  // Equals requestedUsd minus the sum of step.amountUsd.
  shortfall: BigNumber
}

export interface DollarTokenBalanceSnapshot {
  tokenId: string
  symbol: DollarSymbol
  balance: BigNumber // whole-units BigNumber
  priceUsd: BigNumber // USD per token (e.g., 0.998)
  // Smallest amount accepted by Squid for this token's swap, in USD.
  // Tokens with `balance * priceUsd < minAmountUsd` are skipped (dust filter).
  // 0 means "no minimum known yet" - planner treats it as 0 (no filter).
  minAmountUsd: BigNumber
}
