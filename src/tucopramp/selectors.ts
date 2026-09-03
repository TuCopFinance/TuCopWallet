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
export const offrampErrorRetryAfterSecondsSelector = (state: RootState) =>
  state.tucopramp.offramp.errorRetryAfterSeconds
export const offrampErrorRequestIdSelector = (state: RootState) =>
  state.tucopramp.offramp.errorRequestId
export const offrampPendingIdempotencyKeySelector = (state: RootState) =>
  state.tucopramp.offramp.pendingIdempotencyKey
export const offrampProofUrlSelector = (state: RootState) => state.tucopramp.offramp.proofUrl
export const offrampProofUrlLoadingSelector = (state: RootState) =>
  state.tucopramp.offramp.proofUrlLoading
export const offrampProofUrlErrorCodeSelector = (state: RootState) =>
  state.tucopramp.offramp.proofUrlErrorCode

// On-ramp flow
export const onrampStatusSelector = (state: RootState) => state.tucopramp.onramp.status
export const onrampLastQuoteSelector = (state: RootState) => state.tucopramp.onramp.lastQuote
export const onrampCurrentOrderSelector = (state: RootState) => state.tucopramp.onramp.currentOrder
export const onrampErrorCodeSelector = (state: RootState) => state.tucopramp.onramp.errorCode
export const onrampErrorRetryAfterSecondsSelector = (state: RootState) =>
  state.tucopramp.onramp.errorRetryAfterSeconds
export const onrampErrorRequestIdSelector = (state: RootState) =>
  state.tucopramp.onramp.errorRequestId
export const onrampPendingIdempotencyKeySelector = (state: RootState) =>
  state.tucopramp.onramp.pendingIdempotencyKey

// Cedula update (settings flow)
export const cedulaUpdateStatusSelector = (state: RootState) => state.tucopramp.cedulaUpdate.status
export const cedulaUpdateErrorCodeSelector = (state: RootState) =>
  state.tucopramp.cedulaUpdate.errorCode
