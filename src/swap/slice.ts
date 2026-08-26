import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE, RehydrateAction } from 'redux-persist'
import { Actions as AppActions, UpdateConfigValuesAction } from 'src/app/actions'
import { getRehydratePayload } from 'src/redux/persist-helper'
import { SwapInfo } from 'src/swap/types'
import { Hash } from 'viem'
import { NetworkId } from 'src/transactions/types'

type SwapStatus = 'idle' | 'started' | 'success' | 'error'

interface SwapTask {
  id: string
  status: SwapStatus
}

interface SwapResult {
  swapId: string
  fromTokenId: string
  toTokenId: string
  transactionHash: Hash
  networkId: NetworkId
}

export interface SwapFeeMetadata {
  // Squid integrator ("provider") fee in USD, already deducted from the
  // delivered token by Squid at quote time. Sagas persist this on every
  // successful swap so the tx-details 'Cambiar' screen can render the
  // same 'Tarifa del proveedor' row the immediate success screen shows.
  // Without this the backend indexer's tx entry lacks AppFee for these
  // paths and the row disappears once the pending tx settles.
  appFeeUsd: string
  // Which venue actually executed the swap (squid / uniswap-v4 / etc).
  // Stored as the raw saga-level slug; the UI maps it to a display label
  // via formatSwapProvider so future venues surface without a wallet
  // release. Optional so pre-existing persisted entries stay readable
  // (undefined -> the 'Proveedor' row simply hides for that tx).
  provider?: string
  // Wall-clock timestamp for FIFO eviction (see MAX_FEE_METADATA_ENTRIES).
  recordedAt: number
}

export interface State {
  currentSwap: SwapTask | null
  /**
   * In percentage, between 0 and 100
   */
  priceImpactWarningThreshold: number
  lastSwapped: string[]
  // Wallet-local overlay for tx metadata the backend indexer does not emit
  // (Squid integrator fee). Keyed by lowercase txHash. Bounded to
  // MAX_FEE_METADATA_ENTRIES with FIFO eviction so it does not grow
  // unbounded across the user's lifetime.
  feeMetadataByTxHash: { [txHash: string]: SwapFeeMetadata }
}

// Cap: 500 swaps of metadata per user. A power user doing 5 swaps/day
// hits this in ~100 days; older entries eviction is FIFO on write.
const MAX_FEE_METADATA_ENTRIES = 500

const initialState: State = {
  currentSwap: null,
  priceImpactWarningThreshold: 4, // 4% by default
  lastSwapped: [],
  feeMetadataByTxHash: {},
}

function updateCurrentSwapStatus(currentSwap: SwapTask | null, swapId: string, status: SwapStatus) {
  if (!currentSwap || currentSwap.id !== swapId) {
    return
  }
  currentSwap.status = status
}

export function updateLastSwappedTokens(tokenIds: string[], newTokenIds: string[]) {
  const MAX_TOKEN_COUNT = 10

  const uniqueNewTokenIds = new Set(newTokenIds)
  const prevTokenIds = [...tokenIds]
  tokenIds.length = 0 // clear the array while keeping the reference

  for (const tokenId of prevTokenIds) {
    if (!uniqueNewTokenIds.has(tokenId)) {
      tokenIds.push(tokenId)
    }
  }

  tokenIds.push(...uniqueNewTokenIds)

  if (tokenIds.length > MAX_TOKEN_COUNT) {
    tokenIds.splice(0, tokenIds.length - MAX_TOKEN_COUNT)
  }
}

export const slice = createSlice({
  name: 'swap',
  initialState,
  reducers: {
    swapStart: (state, action: PayloadAction<SwapInfo>) => {
      state.currentSwap = {
        id: action.payload.swapId,
        status: 'started',
      }
    },
    swapSuccess: (state, action: PayloadAction<SwapResult>) => {
      const { swapId, fromTokenId, toTokenId } = action.payload
      updateCurrentSwapStatus(state.currentSwap, swapId, 'success')
      updateLastSwappedTokens(state.lastSwapped, [fromTokenId, toTokenId])
    },
    swapError: (state, action: PayloadAction<string>) => {
      updateCurrentSwapStatus(state.currentSwap, action.payload, 'error')
    },
    swapCancel: (state, action: PayloadAction<string>) => {
      updateCurrentSwapStatus(state.currentSwap, action.payload, 'idle')
    },
    // Sagas call this on every successful swap that reports a positive
    // integrator fee. Kept in a dedicated action (rather than tucked inside
    // swapSuccess) so the aggregated multi-swap flow — which fires one
    // parent success + N per-leg records — can dispatch it independently
    // for each leg without doubling other side effects.
    recordSwapFeeMetadata: (
      state,
      action: PayloadAction<{ txHash: string; appFeeUsd: string; provider?: string }>
    ) => {
      const key = action.payload.txHash.toLowerCase()
      state.feeMetadataByTxHash[key] = {
        appFeeUsd: action.payload.appFeeUsd,
        provider: action.payload.provider,
        recordedAt: Date.now(),
      }
      const entries = Object.entries(state.feeMetadataByTxHash)
      if (entries.length > MAX_FEE_METADATA_ENTRIES) {
        entries.sort((a, b) => a[1].recordedAt - b[1].recordedAt)
        const trimmed = entries.slice(entries.length - MAX_FEE_METADATA_ENTRIES)
        state.feeMetadataByTxHash = Object.fromEntries(trimmed)
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(
        AppActions.UPDATE_REMOTE_CONFIG_VALUES,
        (state, action: UpdateConfigValuesAction) => {
          state.priceImpactWarningThreshold = action.configValues.priceImpactWarningThreshold
        }
      )
      .addCase(REHYDRATE, (state, action: RehydrateAction) => ({
        ...state,
        ...getRehydratePayload(action, 'swap'),
        currentSwap: null,
      }))
  },
})

export const { swapStart, swapSuccess, swapError, swapCancel, recordSwapFeeMetadata } =
  slice.actions

export default slice.reducer
