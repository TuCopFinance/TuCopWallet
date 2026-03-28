import BigNumber from 'bignumber.js'
import { RootState } from 'src/redux/reducers'
import { tokensByIdSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import { XAUT0_DECIMALS, XAUT0_NAME, XAUT0_SYMBOL } from './types'

// XAUt0 token address on Celo mainnet (from Squid/MiniPay integration)
const XAUT0_ADDRESS = '0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff'

// Fallback XAUt0 token data when not in wallet
const XAUT0_FALLBACK_TOKEN: TokenBalance = {
  tokenId: networkConfig.xaut0TokenId,
  address: XAUT0_ADDRESS,
  networkId: NetworkId['celo-mainnet'],
  decimals: XAUT0_DECIMALS,
  symbol: XAUT0_SYMBOL,
  name: XAUT0_NAME,
  balance: new BigNumber(0),
  priceUsd: null,
  lastKnownPriceUsd: null,
  priceFetchedAt: Date.now(),
  isSwappable: true,
  isCashInEligible: false,
  isCashOutEligible: false,
  isStableCoin: false,
  imageUrl:
    'https://raw.githubusercontent.com/valora-inc/address-metadata/main/assets/tokens/XAUt.png',
}

// XAUt0 token selector - always returns a valid token with address (fallback if not in wallet)
export const xaut0TokenSelector = (state: RootState): TokenBalance => {
  const tokensById = tokensByIdSelector(state, [NetworkId['celo-mainnet']])
  const token = tokensById[networkConfig.xaut0TokenId]

  // Return existing token if found AND has address, otherwise return fallback
  // This ensures the address is always present for swap quotes
  if (token && token.address) {
    return token
  }

  // If token exists but missing address, merge with fallback address
  if (token) {
    return {
      ...XAUT0_FALLBACK_TOKEN,
      ...token,
      address: XAUT0_ADDRESS, // Ensure address is always present
    }
  }

  return XAUT0_FALLBACK_TOKEN
}

// Price selectors
export const goldPriceUsdSelector = (state: RootState) => state.gold.goldPriceUsd

export const goldPrice24hChangeSelector = (state: RootState) => state.gold.goldPrice24hChange

export const goldPriceFetchedAtSelector = (state: RootState) => state.gold.goldPriceFetchedAt

export const goldPriceFetchStatusSelector = (state: RootState) => state.gold.priceFetchStatus

// Operation status selectors
export const goldBuyStatusSelector = (state: RootState) => state.gold.buyStatus

export const goldSellStatusSelector = (state: RootState) => state.gold.sellStatus

export const goldBuyTxHashSelector = (state: RootState) => state.gold.buyTxHash

export const goldSellTxHashSelector = (state: RootState) => state.gold.sellTxHash

// Price alerts selectors
export const priceAlertsSelector = (state: RootState) => state.gold.priceAlerts

export const enabledPriceAlertsSelector = (state: RootState) =>
  state.gold.priceAlerts.filter((alert) => alert.enabled)

// Error selector
export const goldErrorSelector = (state: RootState) => state.gold.error

// Has seen gold info screen selector
export const hasSeenGoldInfoSelector = (state: RootState) => state.gold.hasSeenGoldInfo
