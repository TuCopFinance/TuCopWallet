/**
 * Manual mock for src/statsig
 *
 * Provides sensible defaults so tests using jest.mock('src/statsig')
 * do not crash on getMultichainFeatures().showBalances etc.
 * Individual tests can still override with jest.mocked(...).mockReturnValue(...)
 */
import { NetworkId } from 'src/transactions/types'

const defaultMultichainFeatures: Record<string, NetworkId[]> = {
  showCico: [NetworkId['celo-mainnet']],
  showBalances: [NetworkId['celo-mainnet']],
  showSend: [NetworkId['celo-mainnet']],
  showSwap: [NetworkId['celo-mainnet']],
  showTransfers: [NetworkId['celo-mainnet']],
  showWalletConnect: [NetworkId['celo-mainnet']],
  showApprovalTxsInHomefeed: [] as NetworkId[],
  showNfts: [NetworkId['celo-mainnet']],
  showPositions: [NetworkId['celo-mainnet']],
  showShortcuts: [NetworkId['celo-mainnet']],
}

export const getMultichainFeatures = jest.fn(() => defaultMultichainFeatures)

export const getDynamicConfigParams = jest.fn(
  ({ defaultValues }: { configName: string; defaultValues: Record<string, any> }) => defaultValues
)

export const getExperimentParams = jest.fn(
  ({ defaultValues }: { experimentName: string; defaultValues: Record<string, any> }) =>
    defaultValues
)

export const getFeatureGate = jest.fn(() => false)

export const getDefaultStatsigUser = jest.fn(() => ({
  userID: undefined,
  custom: {
    startOnboardingTime: undefined,
    multichainBetaStatus: undefined,
    loadTime: Date.now(),
  },
}))

export const patchUpdateStatsigUser = jest.fn(() => Promise.resolve())

export const setupOverridesFromLaunchArgs = jest.fn()
