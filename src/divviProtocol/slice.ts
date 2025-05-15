import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface DivviProtocolState {
  isInitialized: boolean
  isSDKInitialized: boolean
  pendingRegistration: boolean
}

const initialState: DivviProtocolState = {
  isInitialized: false,
  isSDKInitialized: false,
  pendingRegistration: false,
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
  },
})

export const { setInitialized, setSDKInitialized, setPendingRegistration } = divviProtocolSlice.actions
export default divviProtocolSlice.reducer
