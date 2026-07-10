import BigNumber from 'bignumber.js'
import { DOLARES_VIRTUAL_TOKEN_ID } from 'src/dollarsSpend/types'
import type { DollarTokenBalanceSnapshot } from 'src/dollarsSpend/types'
import type { TokenBalance } from 'src/tokens/slice'
import type { NetworkId } from 'src/transactions/types'

// Builds the synthetic TokenBalance shown as a single "Dolares" row in
// pickers. Aggregates USD value across USAT/USDm/USDC/USDT. Returns null
// when no dollar tokens have positive USD value (caller hides the row).
//
// IMPORTANT: This is a synthetic shape. Code that handles it must detect
// `tokenId === DOLARES_VIRTUAL_TOKEN_ID` BEFORE treating it as a real ERC-20
// (it has no address, no real decimals, no real price feed).
export function buildDolaresVirtualToken({
  snapshots,
  networkId,
}: {
  snapshots: DollarTokenBalanceSnapshot[]
  networkId: NetworkId
}): TokenBalance | null {
  const totalUsd = snapshots.reduce(
    (sum, s) => sum.plus(s.balance.multipliedBy(s.priceUsd)),
    new BigNumber(0)
  )
  if (totalUsd.lte(0)) {
    return null
  }
  return {
    tokenId: DOLARES_VIRTUAL_TOKEN_ID,
    address: null,
    networkId,
    symbol: 'Dolares',
    name: 'Dolares',
    decimals: 2,
    balance: totalUsd,
    priceUsd: new BigNumber(1),
    lastKnownPriceUsd: new BigNumber(1),
    priceFetchedAt: Date.now(),
  } as TokenBalance
}
