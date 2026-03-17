import { RootState } from 'src/redux/reducers'

export const bucksPayFlowStatusSelector = (state: RootState) => state.buckspay.flowStatus
export const bucksPayLastBankDetailsSelector = (state: RootState) => state.buckspay.lastBankDetails
export const bucksPayTransactionHashSelector = (state: RootState) => state.buckspay.transactionHash
export const bucksPayCodeSelector = (state: RootState) => state.buckspay.bucksPayCode
export const bucksPayStatusSelector = (state: RootState) => state.buckspay.bucksPayStatus
export const bucksPayCertificateUrlSelector = (state: RootState) => state.buckspay.certificateUrl
export const bucksPayErrorSelector = (state: RootState) => state.buckspay.error
