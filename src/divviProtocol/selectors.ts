import { getReferralTag } from '@divvi/referral-sdk'
import { getPublicAppConfig } from 'src/app/selectors'
import { selectReferrals } from 'src/divviProtocol/slice'
import { RootState } from 'src/redux/reducers'
import { walletAddressSelector } from 'src/web3/selectors'
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
 * Nota: En v2, solo necesitamos user y consumer, pero mantenemos compatibilidad con providers
 */
export const hasReferralSucceeded = (state: RootState, consumer: Address, providers: Address[]) => {
  const userAddress = walletAddressSelector(state)
  if (!userAddress) {
    return false
  }

  // Usar el selector de slice.ts
  const referrals = selectReferrals(state)

  // Generar la clave usando v2 (solo user y consumer)
  const key = getReferralTag({
    user: userAddress as Address,
    consumer,
  })

  return referrals[key]?.status === 'successful'
}
