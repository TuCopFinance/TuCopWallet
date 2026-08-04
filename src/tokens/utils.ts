import BigNumber from 'bignumber.js'
import { TokenProperties } from 'src/analytics/Properties'
import { getDynamicConfigParams, getMultichainFeatures } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs } from 'src/statsig/types'
import { CurrencyTokens } from 'src/tokens/selectors'
import { Network, NetworkId } from 'src/transactions/types'
import { Currency } from 'src/utils/currencies'
import Logger from 'src/utils/Logger'
import { ONE_DAY_IN_MILLIS, ONE_HOUR_IN_MILLIS } from 'src/utils/time'
import networkConfig from 'src/web3/networkConfig'
import { TokenBalance } from './slice'

export function getHigherBalanceCurrency(
  currencies: Currency[],
  tokens: CurrencyTokens
): Currency | undefined {
  let maxCurrency: Currency | undefined
  let maxUsdBalance: BigNumber | null = null
  for (const currency of currencies) {
    const usdBalance = tokens[currency]?.balance.multipliedBy(tokens[currency]?.priceUsd ?? 0)
    if (usdBalance?.gt(maxUsdBalance ?? 0)) {
      maxCurrency = currency
      maxUsdBalance = usdBalance
    }
  }
  return maxCurrency
}

export function sortByUsdBalance(token1: TokenBalance, token2: TokenBalance) {
  const token1UsdBalance = token1.balance.multipliedBy(token1.priceUsd ?? 0)
  const token2UsdBalance = token2.balance.multipliedBy(token2.priceUsd ?? 0)
  return token2UsdBalance.comparedTo(token1UsdBalance)
}

export function tokenSupportsComments(token: TokenBalance | undefined) {
  return (
    token?.canTransferWithComment &&
    token.symbol !== 'CELO' &&
    token.networkId === networkConfig.networkToNetworkId[Network.Celo]
  )
}

/**
 * It sorts in 3 categories:
 * Stable tokens: (cUSD, cEUR, cREAL) (sorted by usd balance)
 * CELO
 * Other tokens: sorted by usd balance
 *
 * If someone comes with a better name for this, I would appreciate it.
 */
export function sortFirstStableThenCeloThenOthersByUsdBalance(
  token1: TokenBalance,
  token2: TokenBalance
): number {
  // Show fee currency tokens first
  if (token1.isFeeCurrency && !token2.isFeeCurrency) {
    return -1
  }
  if (!token1.isFeeCurrency && token2.isFeeCurrency) {
    return 1
  }

  // Show stable tokens first
  if (token1.isFeeCurrency && token2.isFeeCurrency) {
    if (token1.symbol === 'CELO' && token2.symbol !== 'CELO') {
      return 1
    }
    if (token1.symbol !== 'CELO' && token2.symbol === 'CELO') {
      return -1
    }
  }

  // Show non-native tokens without usd price in the bottom of the list.
  // And show stable tokens without usd price at the bottom of their category.
  if (!token1.priceUsd && !token2.priceUsd) {
    return token2.balance.comparedTo(token1.balance)
  }

  if (!token1.priceUsd) {
    return 1
  }
  if (!token2.priceUsd) {
    return -1
  }

  // In each category sort by usd Balance
  return usdBalance(token2).comparedTo(usdBalance(token1))
}

/**
 *
 * Sorts by:
 * 1. cicoOrder value, smallest first
 *  1.1. If both tokens have cicoOrder value, sort by sortFirstStableThenCeloThenOthersByUsdBalance
 * 2. If only one token has cicoOrder value, it goes first
 * 3. If neither token has cicoOrder value, sort by sortFirstStableThenCeloThenOthersByUsdBalance
 */
export function sortCicoTokens(token1: TokenBalance, token2: TokenBalance): number {
  const cicoTokenInfo = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.CICO_TOKEN_INFO]
  ).tokenInfo
  if (
    (!cicoTokenInfo[token1.tokenId]?.cicoOrder && !cicoTokenInfo[token2.tokenId]?.cicoOrder) ||
    cicoTokenInfo[token1.tokenId]?.cicoOrder === cicoTokenInfo[token2.tokenId]?.cicoOrder
  ) {
    return sortFirstStableThenCeloThenOthersByUsdBalance(token1, token2)
  }
  if (!cicoTokenInfo[token1.tokenId]?.cicoOrder) {
    return 1
  }
  if (!cicoTokenInfo[token2.tokenId]?.cicoOrder) {
    return -1
  }
  return cicoTokenInfo[token1.tokenId]?.cicoOrder < cicoTokenInfo[token2.tokenId]?.cicoOrder
    ? -1
    : 1
}

export function usdBalance(token: TokenBalance): BigNumber {
  return token.balance.times(token.priceUsd ?? 0)
}

// TuCop is COP-first: COPm is Mento-pegged to COP and the wallet treats the
// two as 1:1 for every user-visible balance. Skipping priceUsd + usdToLocal
// removes the double-oracle drift (CoinGecko priceUsd vs backend COP rate)
// that otherwise made "COP$1,753" jitter between rate refreshes even when
// the on-chain COPm balance was flat.
function isCopmPeggedToLocal(tokenInfo: TokenBalance | undefined): boolean {
  return tokenInfo?.tokenId === networkConfig.copmTokenId
}

// Duck-typed local-currency converter shared by call sites that hold
// heterogeneous token shapes (position tokens have string priceUsd,
// TokenBalance uses BigNumber, etc.). Preserves the same COPm 1:1 rule
// as convertTokenToLocalAmount above. Prefer this helper (or the
// TokenBalance-typed convertTokenToLocalAmount) over inline
// `balance * priceUsd * usdToLocalRate` -- inline usage is grep-guarded
// by src/tokens/copmPegInvariant.test.ts.
export function tokenBalanceToLocalCurrency({
  tokenId,
  balance,
  priceUsd,
  usdToLocalRate,
}: {
  tokenId: string
  balance: BigNumber
  priceUsd: BigNumber | string | null | undefined
  usdToLocalRate: string | null
}): BigNumber {
  if (tokenId === networkConfig.copmTokenId) {
    return balance
  }
  if (!priceUsd || !usdToLocalRate) {
    return new BigNumber(0)
  }
  return balance.multipliedBy(priceUsd).multipliedBy(usdToLocalRate)
}

export function convertLocalToTokenAmount({
  localAmount,
  tokenInfo,
  usdToLocalRate,
}: {
  localAmount: BigNumber | null
  tokenInfo: TokenBalance | undefined
  usdToLocalRate: string | null
}) {
  if (!localAmount) {
    return null
  }
  if (isCopmPeggedToLocal(tokenInfo)) {
    return localAmount
  }
  const tokenPriceUsd = tokenInfo?.priceUsd
  if (!tokenPriceUsd || !usdToLocalRate) {
    return null
  }

  return localAmount.dividedBy(usdToLocalRate).dividedBy(tokenPriceUsd)
}

export function convertTokenToLocalAmount({
  tokenAmount,
  tokenInfo,
  usdToLocalRate,
}: {
  tokenAmount: BigNumber | null
  tokenInfo: TokenBalance | undefined
  usdToLocalRate: string | null
}) {
  if (!tokenAmount) {
    return null
  }
  if (isCopmPeggedToLocal(tokenInfo)) {
    return tokenAmount
  }
  const tokenPriceUsd = tokenInfo?.priceUsd
  if (!tokenPriceUsd || !usdToLocalRate) {
    return null
  }

  return tokenAmount.multipliedBy(tokenPriceUsd).multipliedBy(usdToLocalRate)
}

export function getSupportedNetworkIdsForTokenBalances(): NetworkId[] {
  return getMultichainFeatures()?.showBalances ?? [networkConfig.defaultNetworkId]
}

export function getTokenId(networkId: NetworkId, tokenAddress?: string): string {
  if (
    (networkId === networkConfig.networkToNetworkId[Network.Celo] &&
      tokenAddress === networkConfig.celoTokenAddress) ||
    !tokenAddress
  ) {
    return `${networkId}:native`
  }
  return `${networkId}:${tokenAddress}`
}

export function getSupportedNetworkIdsForSend(): NetworkId[] {
  return getMultichainFeatures()?.showSend ?? [networkConfig.defaultNetworkId]
}

export function getSupportedNetworkIdsForSwap(): NetworkId[] {
  const features = getMultichainFeatures()
  Logger.debug(`getSupportedNetworkIdsForSwap`, `${features?.showSwap}`)

  return features?.showSwap ?? [networkConfig.defaultNetworkId]
}

export function getSupportedNetworkIdsForWalletConnect(): NetworkId[] {
  return getMultichainFeatures()?.showWalletConnect ?? [networkConfig.defaultNetworkId]
}

export function getSupportedNetworkIdsForApprovalTxsInHomefeed(): NetworkId[] {
  return getMultichainFeatures()?.showApprovalTxsInHomefeed ?? []
}

export function getTokenAnalyticsProps(token: TokenBalance): TokenProperties {
  return {
    symbol: token.symbol,
    address: token.address,
    balanceUsd: token.balance.multipliedBy(token.priceUsd ?? 0).toNumber(),
    networkId: token.networkId,
    tokenId: token.tokenId,
  }
}

/**
 * Checks whether the historical price is updated and is one day old +/- 1 hour.
 * Used for showing / hiding the price delta on legacy Assets and TokenDetails
 * pages
 *
 * @param {TokenBalance} token
 * @returns {boolean}
 */
export function isHistoricalPriceUpdated(token: TokenBalance) {
  return (
    !!token.historicalPricesUsd?.lastDay &&
    ONE_HOUR_IN_MILLIS >
      Math.abs(token.historicalPricesUsd.lastDay.at - (Date.now() - ONE_DAY_IN_MILLIS))
  )
}

export function isFeeCurrency(token: TokenBalance | undefined): token is TokenBalance {
  return token?.isNative || !!token?.isFeeCurrency || !!token?.feeCurrencyAdapterAddress
}

/**
 * Returns user-friendly display name for tokens.
 * UI Rules:
 * - COPm, cCOP → "Pesos"
 * - USDT, USDC, USDm, cUSD, USD₮ → "Dólares"
 * - cEUR → "Euros"
 * - XAUt0 → "Oro"
 * - Others → symbol as-is
 */
export function getTokenDisplayName(symbol: string): string {
  const normalizedSymbol = symbol.toUpperCase()

  // Colombian Peso
  if (normalizedSymbol === 'COPM' || normalizedSymbol === 'CCOP') {
    return 'Pesos'
  }

  // US Dollar stablecoins (cUSD = legacy Mento name for USDm, kept here so
  // older balances + tests resolve to the same Spanish label).
  if (['USDT', 'USDC', 'USDM', 'CUSD', 'USD₮'].includes(normalizedSymbol) || symbol === 'USD₮') {
    return 'Dólares'
  }

  // Euro stable (cEUR = legacy Mento name for EURm).
  if (normalizedSymbol === 'CEUR' || normalizedSymbol === 'EURM') {
    return 'Euros'
  }

  // Digital Gold
  if (normalizedSymbol === 'XAUT0') {
    return 'Oro'
  }

  // Keep original for others (CELO, etc.)
  return symbol
}

// Mento local-currency stablecoins pegged 1:1 to a national fiat currency.
// When a pool's `dataProps.tvl` or `balance * priceUsd` produces a value in
// one of these tokens' units, that value is ALREADY in the user's local
// currency. Passing it through `useDollarsToLocalAmount` would multiply by
// the USD->local rate a second time (e.g. by ~4000 for COP), inflating the
// display 4000x.
//
// Not the same as the "dollars" family (USDT / USDC / USDm / USAT), which
// are USD-denominated and DO need the USD->local conversion.
//
// Callers use this to branch between two rendering paths in earn / pool
// screens. See src/earn/utils.ts:getEarnPositionBalanceValues and consumers.
const LOCAL_CURRENCY_STABLE_SYMBOLS = new Set([
  'COPM', // Colombian Peso (Mento)
  'EURM', // Euro (Mento)
  'BRLM', // Brazilian Real (Mento)
  'XOFM', // West African CFA Franc (Mento)
  'GHSM', // Ghanaian Cedi (Mento)
  'KESM', // Kenyan Shilling (Mento)
  // Legacy Mento names still in circulation on older tx / balance records.
  'CCOP',
  'CEUR',
  'CREAL',
])

export function isLocalCurrencyStable(symbol: string | undefined | null): boolean {
  if (!symbol) return false
  return LOCAL_CURRENCY_STABLE_SYMBOLS.has(symbol.toUpperCase())
}
