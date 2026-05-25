import { Platform } from 'react-native'
import * as DeviceInfo from 'react-native-device-info'
// react-native-localize is installed (^3.2.1) and has getLocales; no fallback needed
import { getLocales } from 'react-native-localize'
import networkConfig, { networkIdToChainId } from 'src/web3/networkConfig'
import { ErrorContext } from 'src/components/ErrorMessage/types'

interface BuildErrorContextInput {
  error: unknown
  partial?: Partial<Pick<ErrorContext, 'screen' | 'action' | 'tokenSymbol' | 'walletAddress'>>
}

const truncate = (addr: string): string => {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

const getLanguage = (): string => {
  try {
    return getLocales()[0]?.languageTag ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function buildErrorContext({ error, partial = {} }: BuildErrorContextInput): ErrorContext {
  const errorObj = error instanceof Error ? error : null
  const errorName = errorObj?.name ?? 'UnknownError'
  const errorMessage = errorObj?.message ?? (typeof error === 'string' ? error : String(error))
  const errorStack = errorObj?.stack
  const errorCause =
    errorObj && 'cause' in errorObj && errorObj.cause ? String((errorObj as any).cause) : undefined

  const networkId = networkConfig.defaultNetworkId
  const chainId = networkIdToChainId[networkId] ?? 0

  return {
    appVersion: DeviceInfo.getVersion(),
    buildNumber: DeviceInfo.getBuildNumber(),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    osVersion: DeviceInfo.getSystemVersion(),
    language: getLanguage(),
    network: networkId,
    chainId,
    walletAddress: partial.walletAddress ? truncate(partial.walletAddress) : undefined,
    timestamp: new Date().toISOString(),
    screen: partial.screen,
    action: partial.action,
    tokenSymbol: partial.tokenSymbol,
    errorName,
    errorMessage,
    errorStack,
    errorCause,
  }
}
