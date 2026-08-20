import BigNumber from 'bignumber.js'
import { STABLE_TRANSACTION_MIN_AMOUNT, TIME_UNTIL_TOKEN_INFO_BECOMES_STALE } from 'src/config'
import { DOLLAR_TOKEN_IDS, sortDollarTokensForPicker } from 'src/tokens/dollarGroup'
import { usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { totalPositionsBalanceUsdSelector } from 'src/positions/selectors'
import { useSelector } from 'src/redux/hooks'
import { getFeatureGate, getMultichainFeatures } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import {
  cashInTokensByNetworkIdSelector,
  cashOutTokensByNetworkIdSelector,
  spendTokensByNetworkIdSelector,
  swappableFromTokensByNetworkIdSelector,
  swappableToTokensByNetworkIdSelector,
  tokensByAddressSelector,
  tokensByCurrencySelector,
  tokensByIdSelector,
  tokensListSelector,
  tokensListWithAddressSelector,
  tokensWithTokenBalanceSelector,
  tokensWithUsdValueSelector,
  totalTokenBalanceSelector,
} from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import {
  convertLocalToTokenAmount,
  convertTokenToLocalAmount,
  getSupportedNetworkIdsForTokenBalances,
} from 'src/tokens/utils'
import { NetworkId } from 'src/transactions/types'
import { Currency, CURRENCY_TO_CHAIN_SYMBOL, resolveCurrency } from 'src/utils/currencies'
import { deterministicShuffle } from 'src/utils/random'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'

/**
 * @deprecated use useTokenInfo and select using tokenId
 */
export function useTokenInfoByAddress(tokenAddress?: string | null) {
  const tokens = useSelector(tokensByAddressSelector)
  return tokenAddress ? tokens[tokenAddress] : undefined
}

export function useCOPm() {
  return useTokenInfo(networkConfig.copmTokenId)
}

export function useUSDT() {
  return useTokenInfo(networkConfig.usdtTokenId)
}

export function useUSDC() {
  return useTokenInfo(networkConfig.usdcTokenId)
}

export function useUSDm() {
  return useTokenInfo(networkConfig.usdmTokenId)
}

export function useUSAT() {
  return useTokenInfo(networkConfig.usatTokenId)
}

export function useTokensWithUsdValue(networkIds: NetworkId[]) {
  return useSelector((state) => tokensWithUsdValueSelector(state, networkIds))
}

export function useTotalTokenBalance() {
  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  return useSelector((state) => totalTokenBalanceSelector(state, supportedNetworkIds))
}

/**
 * Returns balances split into "available" (cash-like tokens) and
 * "investments" (gold + earn positions like Allbridge / Marranitos),
 * plus the legacy combined total.
 *
 * Single source of truth for the home-screen balance display.
 */
export function useTotalBalanceWithInvestments(goldBalance: BigNumber) {
  const totalTokenBalance = useTotalTokenBalance()
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const positionsBalanceUsd = useSelector(totalPositionsBalanceUsdSelector)

  const goldPriceUsd = useSelector(
    (state: { gold: { goldPriceUsd: number | null } }) => state.gold.goldPriceUsd
  )

  const goldLocalValue =
    goldPriceUsd && usdToLocalRate && !goldBalance.isZero()
      ? new BigNumber(goldPriceUsd).multipliedBy(usdToLocalRate).multipliedBy(goldBalance)
      : new BigNumber(0)

  const positionsLocalValue =
    positionsBalanceUsd && usdToLocalRate
      ? positionsBalanceUsd.multipliedBy(usdToLocalRate)
      : new BigNumber(0)

  const availableBalance = totalTokenBalance ?? new BigNumber(0)
  const investmentsBalance = goldLocalValue.plus(positionsLocalValue)

  return {
    availableBalance,
    investmentsBalance,
    goldLocalValue,
    positionsLocalValue,
    // Legacy: tokens + gold (kept for callers that haven't migrated)
    totalBalance: availableBalance.plus(goldLocalValue),
  }
}

export function useTokensWithTokenBalance() {
  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  return useSelector((state) => tokensWithTokenBalanceSelector(state, supportedNetworkIds))
}

export function useTokensInfoUnavailable(networkIds: NetworkId[]) {
  const totalBalance = useSelector((state) => totalTokenBalanceSelector(state, networkIds))
  return totalBalance === null
}

export function useTokensList() {
  const networkIds = Object.values(networkConfig.networkToNetworkId)
  return useSelector((state) => tokensListSelector(state, networkIds))
}

export function useTokenPricesAreStale(networkIds: NetworkId[]) {
  const tokens = useSelector((state) => tokensListSelector(state, networkIds))
  // If no tokens then prices cannot be stale
  if (tokens.length === 0) return false
  // Put tokens with priceUsd into an array
  const tokensWithUsdValue = tokens.filter((tokenInfo) => tokenInfo.priceUsd !== null)
  // If tokens with usd value exist, check the time price was fetched and if ANY are stale - return true
  // Else tokens usd values are not present so we know prices are stale - return true
  if (tokensWithUsdValue.length > 0) {
    return tokensWithUsdValue.some(
      (tokenInfo) =>
        (tokenInfo.priceFetchedAt ?? 0) < Date.now() - TIME_UNTIL_TOKEN_INFO_BECOMES_STALE
    )
  } else {
    return true
  }
}

export function useSwappableTokens() {
  const networkIdsForSwap = getMultichainFeatures()?.showSwap ?? [networkConfig.defaultNetworkId]
  const shouldShuffleTokens = getFeatureGate(StatsigFeatureGates.SHUFFLE_SWAP_TOKENS_ORDER)

  const walletAddress = useSelector(walletAddressSelector)
  const swappableFromTokens = useSelector((state) =>
    swappableFromTokensByNetworkIdSelector(state, networkIdsForSwap)
  )
  const swappableToTokens = useSelector((state) =>
    swappableToTokensByNetworkIdSelector(state, networkIdsForSwap)
  )

  if (shouldShuffleTokens && walletAddress) {
    return {
      swappableFromTokens: deterministicShuffle(swappableFromTokens, 'tokenId', walletAddress),
      swappableToTokens: deterministicShuffle(swappableToTokens, 'tokenId', walletAddress),
      areSwapTokensShuffled: true,
    }
  }

  return {
    swappableFromTokens,
    swappableToTokens,
    areSwapTokensShuffled: false,
  }
}

export function useCashInTokens() {
  const networkIdsForCico = getMultichainFeatures()?.showCico ?? [networkConfig.defaultNetworkId]
  return useSelector((state) => cashInTokensByNetworkIdSelector(state, networkIdsForCico))
}

export function useCashOutTokens(showZeroBalanceTokens: boolean = false) {
  const networkIdsForCico = getMultichainFeatures()?.showCico ?? [networkConfig.defaultNetworkId]
  return useSelector((state) =>
    cashOutTokensByNetworkIdSelector(state, networkIdsForCico, showZeroBalanceTokens)
  )
}

export function useSpendTokens() {
  const networkIdsForCico = getMultichainFeatures()?.showCico ?? [networkConfig.defaultNetworkId]
  return useSelector((state) => spendTokensByNetworkIdSelector(state, networkIdsForCico))
}

export function useTokenInfo(tokenId?: string): TokenBalance | undefined {
  const networkIds = Object.values(networkConfig.networkToNetworkId)
  const tokens = useSelector((state) =>
    tokensByIdSelector(state, { networkIds, includePositionTokens: true })
  )
  return tokenId ? tokens[tokenId] : undefined
}

export function useTokensInfo(tokenIds: string[]): (TokenBalance | undefined)[] {
  const networkIds = Object.values(networkConfig.networkToNetworkId)
  const tokens = useSelector((state) =>
    tokensByIdSelector(state, { networkIds, includePositionTokens: true })
  )
  return tokenIds.map((tokenId) => tokens[tokenId])
}

/**
 * @deprecated
 * Legacy symbol-based token lookup. Post the Mento rebrand deploy on
 * 2026-08-20 the on-chain `symbol()` returns 'USDm'/'EURm' for the cUSD /
 * cEUR contracts, but historical callers (FiatConnect cached quotes,
 * legacy deeplinks) still pass 'cUSD' / 'cEUR' / 'cREAL'. Normalize via
 * resolveCurrency + CURRENCY_TO_CHAIN_SYMBOL before the direct symbol
 * match so those legacy inputs keep resolving.
 */
export function useTokenInfoWithAddressBySymbol(symbol: string) {
  const tokens = useSelector(tokensListWithAddressSelector)
  const currency = symbol ? resolveCurrency(symbol) : undefined
  const resolvedSymbol = currency ? CURRENCY_TO_CHAIN_SYMBOL[currency] : symbol
  // Try the current on-chain symbol first (post 2026-08-20 Mento rebrand:
  // 'USDm' for the cUSD contract, 'EURm' for cEUR). Fall back to the raw
  // input symbol so legacy state (or tests) that still store 'cUSD' /
  // 'cEUR' on the token entry keep resolving.
  return (
    tokens.find((tokenInfo) => tokenInfo.symbol === resolvedSymbol) ??
    (resolvedSymbol !== symbol
      ? tokens.find((tokenInfo) => tokenInfo.symbol === symbol)
      : undefined)
  )
}

export function useTokenInfoByCurrency(currency: Currency) {
  const tokens = useSelector(tokensByCurrencySelector)
  return tokens[currency]
}

export function useLocalToTokenAmount(
  localAmount: BigNumber,
  tokenId: string | undefined
): BigNumber | null {
  const tokenInfo = useTokenInfo(tokenId)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  return convertLocalToTokenAmount({
    localAmount,
    tokenInfo,
    usdToLocalRate,
  })
}

export function useTokenToLocalAmount(
  tokenAmount: BigNumber,
  tokenId: string | undefined
): BigNumber | null {
  const tokenInfo = useTokenInfo(tokenId)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  return convertTokenToLocalAmount({
    tokenAmount,
    tokenInfo,
    usdToLocalRate,
  })
}

export function useAmountAsUsd(amount: BigNumber, tokenId: string | undefined) {
  const tokenInfo = useTokenInfo(tokenId)
  if (!tokenInfo?.priceUsd) {
    return null
  }
  return amount.multipliedBy(tokenInfo.priceUsd)
}

// Returns each dollar-denominated stable that has a non-dust USD value,
// listed in the canonical picker order (USDT / USDC / USAT / USDm). Used
// for the Dolares card breakdown. Dust threshold
// (>= STABLE_TRANSACTION_MIN_AMOUNT, i.e. 0.01 USD) matches
// tokensWithUsdValueSelector so row counts agree across screens.
export function useDollarTokensWithBalance(): Array<{
  tokenInfo: TokenBalance
  usdValue: BigNumber
  localValue: BigNumber
}> {
  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  const tokens = useSelector((state) => tokensListSelector(state, supportedNetworkIds))
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const filtered = tokens.filter((t) => {
    if (!DOLLAR_TOKEN_IDS.has(t.tokenId)) return false
    // Stablecoins are 1:1 USD by design. If the fresh price is missing
    // (backend price fetch flaked) fall back to lastKnownPriceUsd and then
    // to 1.0. Prior version filtered dollar tokens out entirely when the
    // fresh price was null, so users with real on-chain balance saw no
    // dollar card and no dollar row in wallet (Oppo Reno 14F user report
    // 2026-08-14 on 1.118.11).
    const effectivePrice = t.priceUsd ?? t.lastKnownPriceUsd ?? new BigNumber(1)
    const usdValue = t.balance.multipliedBy(effectivePrice)
    return usdValue.gt(STABLE_TRANSACTION_MIN_AMOUNT)
  })
  return sortDollarTokensForPicker(filtered).map((t) => {
    const effectivePrice = t.priceUsd ?? t.lastKnownPriceUsd ?? new BigNumber(1)
    const usdValue = t.balance.multipliedBy(effectivePrice)
    const localValue = usdToLocalRate ? usdValue.multipliedBy(usdToLocalRate) : new BigNumber(0)
    return { tokenInfo: t, usdValue, localValue }
  })
}

// Returns the total local-currency value of all dollar stablecoins.
export function useDollarBalance(): BigNumber {
  const dollarTokens = useDollarTokensWithBalance()
  return dollarTokens.reduce((sum, t) => sum.plus(t.localValue), new BigNumber(0))
}

// Returns the total USD value of all dollar stablecoins (sum of priceUsd * balance).
export function useDollarUsdBalance(): BigNumber {
  const dollarTokens = useDollarTokensWithBalance()
  return dollarTokens.reduce((sum, t) => sum.plus(t.usdValue), new BigNumber(0))
}
