import { getPublicAppConfig } from 'src/app/selectors'
import { RootState } from 'src/redux/reducers'

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
