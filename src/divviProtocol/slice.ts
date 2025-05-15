import { getDataSuffix } from '@divvi/referral-sdk'
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { RootState } from 'src/redux/reducers'
import { Address } from 'viem'

// Definimos la interfaz para los referidos
export interface Referral {
  divviId: string
  campaignIds: Address[]
  txHash?: string
  networkId?: string | number
  chainId?: number
  status: 'pending' | 'successful' | 'cancelled'
  timestamp: number
}

interface DivviProtocolState {
  isInitialized: boolean
  isSDKInitialized: boolean
  pendingRegistration: boolean
  referrals: Record<string, Referral>
}

const initialState: DivviProtocolState = {
  isInitialized: false,
  isSDKInitialized: false,
  pendingRegistration: false,
  referrals: {},
}

const divviProtocolSlice = createSlice({
  name: 'divviProtocol',
  initialState,
  reducers: {
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload
    },
    setSDKInitialized: (state, action: PayloadAction<boolean>) => {
      state.isSDKInitialized = action.payload
    },
    setPendingRegistration: (state, action: PayloadAction<boolean>) => {
      state.pendingRegistration = action.payload
    },
    // Registra un nuevo referido
    referralSubmitted: (state, action: PayloadAction<Referral>) => {
      const { divviId, campaignIds } = action.payload
      const key = getDataSuffix({
        consumer: divviId as Address,
        providers: campaignIds,
      })
      state.referrals[key] = action.payload
    },
    // Actualiza el estado de un referido a exitoso
    referralSuccessful: (state, action: PayloadAction<Referral>) => {
      const { divviId, campaignIds } = action.payload
      const key = getDataSuffix({
        consumer: divviId as Address,
        providers: campaignIds,
      })
      if (state.referrals[key]) {
        state.referrals[key].status = 'successful'
      }
    },
    // Actualiza el estado de un referido a cancelado
    referralCancelled: (state, action: PayloadAction<Referral>) => {
      const { divviId, campaignIds } = action.payload
      const key = getDataSuffix({
        consumer: divviId as Address,
        providers: campaignIds,
      })
      if (state.referrals[key]) {
        state.referrals[key].status = 'cancelled'
      }
    },
  },
})

export const {
  setInitialized,
  setSDKInitialized,
  setPendingRegistration,
  referralSubmitted,
  referralSuccessful,
  referralCancelled,
} = divviProtocolSlice.actions

// Selector para verificar si un referido se ha completado exitosamente
export const hasReferralSucceededSelector = (
  state: RootState,
  divviId: Address,
  campaignIds: Address[]
) => {
  const key = getDataSuffix({ consumer: divviId, providers: campaignIds })
  return state.divviProtocol.referrals[key]?.status === 'successful'
}

// Selector para obtener todos los referidos
export const selectReferrals = (state: RootState) => {
  return state.divviProtocol.referrals
}

export default divviProtocolSlice.reducer
