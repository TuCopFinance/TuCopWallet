import BigNumber from 'bignumber.js'
import { useMemo } from 'react'
import { DollarSymbol, DollarTokenBalanceSnapshot } from 'src/dollarsSpend/types'
import { useSelector } from 'src/redux/hooks'
import { tokensByIdSelector } from 'src/tokens/selectors'
import { getSupportedNetworkIdsForTokenBalances } from 'src/tokens/utils'
import networkConfig from 'src/web3/networkConfig'

// Maps a tokenId to the canonical DollarSymbol used in the planner.
function tokenIdToSymbol(tokenId: string): DollarSymbol | null {
  if (tokenId === networkConfig.usdtTokenId) return 'USDT'
  if (tokenId === networkConfig.usdcTokenId) return 'USDC'
  if (tokenId === networkConfig.usdmTokenId) return 'USDm'
  if (tokenId === networkConfig.usatTokenId && networkConfig.usatTokenId) return 'USAT'
  return null
}

// Builds the snapshots array that planSpend consumes.
// minAmountUsd defaults to 0 (no dust filter at this layer); upstream callers
// can override after fetching Squid's minAmount once the quote returns.
export function useDollarBalanceSnapshots(): DollarTokenBalanceSnapshot[] {
  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  const tokensById = useSelector((state) => tokensByIdSelector(state, supportedNetworkIds))

  return useMemo(() => {
    const out: DollarTokenBalanceSnapshot[] = []
    for (const token of Object.values(tokensById)) {
      if (!token) continue
      const symbol = tokenIdToSymbol(token.tokenId)
      if (!symbol) continue
      if (token.priceUsd === null || token.priceUsd === undefined) continue
      const balance = token.balance ?? new BigNumber(0)
      if (balance.lte(0)) continue
      out.push({
        tokenId: token.tokenId,
        symbol,
        balance,
        priceUsd: new BigNumber(token.priceUsd),
        minAmountUsd: new BigNumber(0),
      })
    }
    return out
  }, [tokensById])
}
