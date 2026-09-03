import { RootState } from 'src/redux/reducers'

// Reference data
export const banksSelector = (state: RootState) => state.tucopramp.banks
export const receivingAccountSelector = (state: RootState) => state.tucopramp.receivingAccount
export const userProfileSelector = (state: RootState) => state.tucopramp.userProfile
export const limitsSelector = (state: RootState) => state.tucopramp.limits.value
export const limitsFetchedAtSelector = (state: RootState) => state.tucopramp.limits.fetchedAt

// Off-ramp flow
export const offrampStatusSelector = (state: RootState) => state.tucopramp.offramp.status
export const offrampLastQuoteSelector = (state: RootState) => state.tucopramp.offramp.lastQuote
export const offrampCurrentOrderSelector = (state: RootState) =>
  state.tucopramp.offramp.currentOrder
export const offrampErrorCodeSelector = (state: RootState) => state.tucopramp.offramp.errorCode

// On-ramp flow
export const onrampStatusSelector = (state: RootState) => state.tucopramp.onramp.status
export const onrampLastQuoteSelector = (state: RootState) => state.tucopramp.onramp.lastQuote
export const onrampCurrentOrderSelector = (state: RootState) => state.tucopramp.onramp.currentOrder
export const onrampErrorCodeSelector = (state: RootState) => state.tucopramp.onramp.errorCode

// Cedula update (settings flow)
export const cedulaUpdateStatusSelector = (state: RootState) => state.tucopramp.cedulaUpdate.status
export const cedulaUpdateErrorCodeSelector = (state: RootState) =>
  state.tucopramp.cedulaUpdate.errorCode
