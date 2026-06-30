import { createSlice, PayloadAction } from '@reduxjs/toolkit'

// Pre-authorization status per supported CIP-64 fee adapter. Persisted across
// boots so we don't ask the user to re-activate the same token after the
// wallet restarts. Backend can also tell from on-chain allowance (it's the
// source of truth), but reading allowance for every supported token on every
// boot is expensive and noisy; we treat the persisted flag as the cache and
// fall back to on-chain reads only when the flag is false or stale.
export type AdapterSymbol = 'USDC' | 'USDT'

export interface AdapterState {
  bootstrapped: boolean
  // Wallet-local timestamps. Useful for telemetry + UX ("último intento hace
  // N min"); not safety-critical. If we ever need to invalidate the cache
  // we'll bump the migration version and re-detect from chain.
  lastAttemptAt: number | null
  lastSuccessAt: number | null
  // Error message from the most recent failed attempt. Used by the saga to
  // surface a retry copy; cleared on success.
  lastError: string | null
}

export interface State {
  byAdapter: Record<AdapterSymbol, AdapterState>
}

const initialAdapterState: AdapterState = {
  bootstrapped: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
}

const initialState: State = {
  byAdapter: {
    USDC: { ...initialAdapterState },
    USDT: { ...initialAdapterState },
  },
}

const slice = createSlice({
  name: 'wriFeeAdapterBootstrap',
  initialState,
  reducers: {
    bootstrapStarted(state, action: PayloadAction<{ adapter: AdapterSymbol }>) {
      const a = state.byAdapter[action.payload.adapter]
      a.lastAttemptAt = Date.now()
      a.lastError = null
    },
    bootstrapSucceeded(state, action: PayloadAction<{ adapter: AdapterSymbol }>) {
      const a = state.byAdapter[action.payload.adapter]
      a.bootstrapped = true
      a.lastSuccessAt = Date.now()
      a.lastError = null
    },
    bootstrapFailed(
      state,
      action: PayloadAction<{ adapter: AdapterSymbol; errorMessage: string }>
    ) {
      const a = state.byAdapter[action.payload.adapter]
      a.lastError = action.payload.errorMessage
    },
    // Escape hatch used by tests / dev tools. Production code should not call
    // this — the bootstrapped flag matches the on-chain allowance state and
    // resetting it locally without revoking on-chain leaves a stale UX.
    bootstrapReset(state, action: PayloadAction<{ adapter: AdapterSymbol }>) {
      state.byAdapter[action.payload.adapter] = { ...initialAdapterState }
    },
  },
})

export const { bootstrapStarted, bootstrapSucceeded, bootstrapFailed, bootstrapReset } =
  slice.actions

export default slice.reducer
