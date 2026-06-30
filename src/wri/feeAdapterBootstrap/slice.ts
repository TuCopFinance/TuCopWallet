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

// Ephemeral handoff between the orchestration saga and the BootstrapSheetHost
// component. The saga sets `pending` to non-null when the detector decides to
// offer the bootstrap; the Host subscribes via useSelector and present()s the
// BottomSheetModal. User taps on the sheet dispatch bootstrapAccepted or
// bootstrapDismissed, which the saga listens to and resolves the flow.
//
// Persisted (along with byAdapter) but always wiped to null on REHYDRATE by
// the saga, so a kill-9 in the middle of the sheet flow does not resurrect
// the sheet next boot. Treating it as non-persisted in spirit, persisted in
// shape only so autoMergeLevel2 keeps the key visible to TypeScript.
export interface PendingState {
  visible: boolean
  candidates: AdapterSymbol[]
}

export interface State {
  byAdapter: Record<AdapterSymbol, AdapterState>
  pending: PendingState | null
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
  pending: null,
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
    // this. The bootstrapped flag matches the on-chain allowance state and
    // resetting it locally without revoking on-chain leaves a stale UX.
    bootstrapReset(state, action: PayloadAction<{ adapter: AdapterSymbol }>) {
      state.byAdapter[action.payload.adapter] = { ...initialAdapterState }
    },
    // Saga calls this when the detector says yes. The Host component watches
    // pending.visible and present()s the sheet.
    bootstrapSheetShown(state, action: PayloadAction<{ candidates: AdapterSymbol[] }>) {
      state.pending = { visible: true, candidates: action.payload.candidates }
    },
    // Closes the sheet. Called by both the saga (after the call resolves) and
    // by the Host's onDismiss (pan-down-to-close gesture).
    bootstrapSheetHidden(state) {
      state.pending = null
    },
    // Signal action with no state change. The saga listens on this action's
    // type to kick off the actual API call. The reducer being a no-op keeps
    // the dispatched payload available to the saga via take().
    bootstrapAccepted(_state, _action: PayloadAction<{ candidates: AdapterSymbol[] }>) {
      // intentionally empty: saga consumes via take()
    },
    // Signal action. Saga listens and marks lastAttemptAt for every candidate
    // so the 24h debounce kicks in and we do not re-prompt on the next boot.
    bootstrapDismissed(_state, _action: PayloadAction<{ candidates: AdapterSymbol[] }>) {
      // intentionally empty: saga consumes via take()
    },
  },
})

export const {
  bootstrapStarted,
  bootstrapSucceeded,
  bootstrapFailed,
  bootstrapReset,
  bootstrapSheetShown,
  bootstrapSheetHidden,
  bootstrapAccepted,
  bootstrapDismissed,
} = slice.actions

export default slice.reducer
