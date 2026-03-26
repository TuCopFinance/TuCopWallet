import { RootState } from 'src/redux/reducers'

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
