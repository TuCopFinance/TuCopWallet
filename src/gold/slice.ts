import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction } from 'redux-persist'
import { getRehydratePayload } from 'src/redux/persist-helper'
import {
  GoldBuyInfo,
  GoldIconVariant,
  GoldOperationStatus,
  GoldPriceData,
  GoldSellInfo,
  PriceAlert,
} from 'src/gold/types'

export interface State {
  // Price data
  goldPriceUsd: number | null
  goldPrice24hChange: number | null
  goldPriceFetchedAt: number | null

  // Operation status
  buyStatus: GoldOperationStatus
  sellStatus: GoldOperationStatus
  priceFetchStatus: GoldOperationStatus

  // Transaction tracking
  buyTxHash: string | null
  sellTxHash: string | null

  // Price alerts
  priceAlerts: PriceAlert[]

  // Error handling
  error: string | null

  // User has seen intro screen
  hasSeenGoldInfo: boolean

  // User preferred icon style
  preferredIconVariant: GoldIconVariant
}

const initialState: State = {
  goldPriceUsd: null,
  goldPrice24hChange: null,
  goldPriceFetchedAt: null,
  buyStatus: 'idle',
  sellStatus: 'idle',
  priceFetchStatus: 'idle',
  buyTxHash: null,
  sellTxHash: null,
  priceAlerts: [],
  error: null,
  hasSeenGoldInfo: false,
  preferredIconVariant: 'bar',
}

export const slice = createSlice({
  name: 'gold',
  initialState,
  reducers: {
    // Price actions
    fetchGoldPrice: (state) => {
      state.priceFetchStatus = 'loading'
    },
    setGoldPrice: (state, action: PayloadAction<GoldPriceData>) => {
      state.goldPriceUsd = action.payload.priceUsd
      state.goldPrice24hChange = action.payload.price24hChange
      state.goldPriceFetchedAt = action.payload.timestamp
      state.priceFetchStatus = 'success'
    },
    fetchGoldPriceError: (state, action: PayloadAction<string>) => {
      state.priceFetchStatus = 'error'
      state.error = action.payload
    },

    // Buy actions
    buyGoldStart: (state, _action: PayloadAction<GoldBuyInfo>) => {
      state.buyStatus = 'loading'
      state.buyTxHash = null
      state.error = null
    },
    buyGoldSuccess: (state, action: PayloadAction<{ txHash: string }>) => {
      state.buyStatus = 'success'
      state.buyTxHash = action.payload.txHash
    },
    buyGoldError: (state, action: PayloadAction<string>) => {
      state.buyStatus = 'error'
      state.error = action.payload
    },

    // Sell actions
    sellGoldStart: (state, _action: PayloadAction<GoldSellInfo>) => {
      state.sellStatus = 'loading'
      state.sellTxHash = null
      state.error = null
    },
    sellGoldSuccess: (state, action: PayloadAction<{ txHash: string }>) => {
      state.sellStatus = 'success'
      state.sellTxHash = action.payload.txHash
    },
    sellGoldError: (state, action: PayloadAction<string>) => {
      state.sellStatus = 'error'
      state.error = action.payload
    },

    // Price alerts
    addPriceAlert: (state, action: PayloadAction<Omit<PriceAlert, 'id' | 'createdAt'>>) => {
      const newAlert: PriceAlert = {
        ...action.payload,
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
      }
      state.priceAlerts.push(newAlert)
    },
    removePriceAlert: (state, action: PayloadAction<string>) => {
      state.priceAlerts = state.priceAlerts.filter((alert) => alert.id !== action.payload)
    },
    updatePriceAlert: (
      state,
      action: PayloadAction<{ id: string; updates: Partial<PriceAlert> }>
    ) => {
      const index = state.priceAlerts.findIndex((alert) => alert.id === action.payload.id)
      if (index !== -1) {
        state.priceAlerts[index] = { ...state.priceAlerts[index], ...action.payload.updates }
      }
    },
    markAlertTriggered: (state, action: PayloadAction<string>) => {
      const index = state.priceAlerts.findIndex((alert) => alert.id === action.payload)
      if (index !== -1) {
        state.priceAlerts[index].triggeredAt = Date.now()
        state.priceAlerts[index].enabled = false
      }
    },

    // Reset
    resetGoldFlow: (state) => {
      state.buyStatus = 'idle'
      state.sellStatus = 'idle'
      state.buyTxHash = null
      state.sellTxHash = null
      state.error = null
    },

    // Mark intro screen as seen
    setHasSeenGoldInfo: (state) => {
      state.hasSeenGoldInfo = true
    },

    // Toggle icon variant
    toggleGoldIconVariant: (state) => {
      state.preferredIconVariant = state.preferredIconVariant === 'bar' ? 'vault' : 'bar'
    },
    setGoldIconVariant: (state, action: PayloadAction<GoldIconVariant>) => {
      state.preferredIconVariant = action.payload
    },
  },
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action: RehydrateAction) => {
      const persisted = getRehydratePayload(action, 'gold')

      return {
        ...state,
        ...persisted,
        // Reset operation status on rehydrate
        buyStatus: 'idle' as const,
        sellStatus: 'idle' as const,
        priceFetchStatus: 'idle' as const,
        // Keep price data, alerts, and hasSeenGoldInfo
        goldPriceUsd: persisted.goldPriceUsd ?? null,
        goldPrice24hChange: persisted.goldPrice24hChange ?? null,
        goldPriceFetchedAt: persisted.goldPriceFetchedAt ?? null,
        priceAlerts: persisted.priceAlerts ?? [],
        hasSeenGoldInfo: persisted.hasSeenGoldInfo ?? false,
        preferredIconVariant: persisted.preferredIconVariant ?? 'bar',
        // Clear transient state
        buyTxHash: null,
        sellTxHash: null,
        error: null,
      }
    })
  },
})

export const {
  fetchGoldPrice,
  setGoldPrice,
  fetchGoldPriceError,
  buyGoldStart,
  buyGoldSuccess,
  buyGoldError,
  sellGoldStart,
  sellGoldSuccess,
  sellGoldError,
  addPriceAlert,
  removePriceAlert,
  updatePriceAlert,
  markAlertTriggered,
  resetGoldFlow,
  setHasSeenGoldInfo,
  toggleGoldIconVariant,
  setGoldIconVariant,
} = slice.actions

export default slice.reducer
