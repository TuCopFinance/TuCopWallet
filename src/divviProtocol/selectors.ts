import { getDataSuffix } from '@divvi/referral-sdk'
import { getPublicAppConfig } from 'src/app/selectors'
import { selectReferrals } from 'src/divviProtocol/slice'
import { RootState } from 'src/redux/reducers'
import { Address } from 'viem'

export interface DivviConfig {
  divviId: string
  campaignIds: string[]
  consumer?: string
  providers?: string[]
}

export const getDivviProtocolState = (state: RootState) => state.divviProtocol

export const getDivviConfig = (state: RootState): DivviConfig | undefined => {
  const appConfig = getPublicAppConfig(state)

  if (!appConfig?.divviProtocol) {
    return undefined
  }

  return {
    divviId: appConfig.divviProtocol.divviId,
    campaignIds: appConfig.divviProtocol.campaignIds || [],
    consumer: appConfig.divviProtocol.consumer,
    providers: appConfig.divviProtocol.providers || [],
  }
}

/**
 * Verifica si un referido específico ha sido completado exitosamente
 */
export const hasReferralSucceeded = (state: RootState, consumer: Address, providers: Address[]) => {
  // Usar el selector de slice.ts
  const referrals = selectReferrals(state)
  const key = getDataSuffix({ consumer, providers })
  return referrals[key]?.status === 'successful'
}
