import { LaunchArguments } from 'react-native-launch-arguments'
import { MultichainBetaStatus } from 'src/app/actions'
import { store } from 'src/redux/store'
import { DynamicConfigs, ExperimentConfigs } from 'src/statsig/constants'
import {
  getDynamicConfigParams,
  getExperimentParams,
  getFeatureGate,
  getMultichainFeatures,
  localGateOverrides,
  patchUpdateStatsigUser,
  setStatsigClient,
  setupOverridesFromLaunchArgs,
} from 'src/statsig/index'
import {
  StatsigDynamicConfigs,
  StatsigExperiments,
  StatsigFeatureGates,
  StatsigMultiNetworkDynamicConfig,
} from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { getMockStoreData } from 'test/utils'

jest.mock('src/redux/store', () => ({ store: { getState: jest.fn() } }))
jest.mock('src/utils/Logger')

const mockCheckGate = jest.fn()
const mockGetFeatureGate = jest.fn()
const mockGetExperiment = jest.fn()
const mockGetDynamicConfig = jest.fn()
const mockUpdateUserAsync = jest.fn()

const mockClient = {
  checkGate: mockCheckGate,
  getFeatureGate: mockGetFeatureGate,
  getExperiment: mockGetExperiment,
  getDynamicConfig: mockGetDynamicConfig,
  updateUserAsync: mockUpdateUserAsync,
} as any

const mockStore = jest.mocked(store)
const MOCK_ACCOUNT = '0x000000000000000000000000000000000000000000'
const MOCK_START_ONBOARDING_TIME = 1680563877
mockStore.getState.mockImplementation(() =>
  getMockStoreData({
    web3: { account: MOCK_ACCOUNT },
    account: { startOnboardingTime: MOCK_START_ONBOARDING_TIME },
  })
)

describe('Statsig helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setStatsigClient(mockClient)
  })
  describe('data validation', () => {
    it.each(Object.entries(ExperimentConfigs))(
      `ExperimentConfigs.%s has correct experimentName`,
      (key, { experimentName }) => {
        expect(key).toEqual(experimentName)
      }
    )
    it.each(Object.entries(DynamicConfigs))(
      `DynamicConfigs.%s has correct configName`,
      (key, { configName }) => {
        expect(key).toEqual(configName)
      }
    )
  })
  describe('getExperimentParams', () => {
    it('returns default values if getting statsig experiment throws error', () => {
      mockGetExperiment.mockImplementation(() => {
        throw new Error('mock error')
      })
      const defaultValues = { param1: 'defaultValue1', param2: 'defaultValue2' }
      const experimentName = 'mock_experiment_name' as StatsigExperiments
      const output = getExperimentParams({ experimentName, defaultValues })
      expect(Logger.warn).toHaveBeenCalled()
      expect(output).toEqual(defaultValues)
    })
    it('returns Statsig values if no error is thrown', () => {
      const getMock = jest.fn().mockImplementation((paramName: string, _defaultValue: string) => {
        if (paramName === 'param1') {
          return 'statsigValue1'
        } else if (paramName === 'param2') {
          return 'statsigValue2'
        } else {
          throw new Error('unexpected param name')
        }
      })
      mockGetExperiment.mockImplementation(() => ({
        get: getMock,
        details: { reason: 'Network' },
      }))
      const defaultValues = { param1: 'defaultValue1', param2: 'defaultValue2' }
      const experimentName = 'mock_experiment_name' as StatsigExperiments
      const output = getExperimentParams({ experimentName, defaultValues })
      expect(Logger.warn).not.toHaveBeenCalled()
      expect(mockGetExperiment).toHaveBeenCalledWith(experimentName)
      expect(getMock).toHaveBeenCalledWith('param1', 'defaultValue1')
      expect(getMock).toHaveBeenCalledWith('param2', 'defaultValue2')
      expect(output).toEqual({ param1: 'statsigValue1', param2: 'statsigValue2' })
    })
    it('returns default values silently if sdk uninitialized', () => {
      const getMock = jest.fn()
      mockGetExperiment.mockImplementation(() => ({
        get: getMock,
        details: { reason: 'Uninitialized' },
      }))
      const defaultValues = { param1: 'defaultValue1', param2: 'defaultValue2' }
      const experimentName = 'mock_experiment_name' as StatsigExperiments
      const output = getExperimentParams({ experimentName, defaultValues })
      expect(Logger.warn).not.toHaveBeenCalled()
      expect(mockGetExperiment).toHaveBeenCalledWith(experimentName)
      expect(getMock).not.toHaveBeenCalled()
      expect(output).toEqual(defaultValues)
    })
  })

  describe('getFeatureGate', () => {
    it('returns false if getting statsig feature gate throws error', () => {
      mockGetFeatureGate.mockImplementation(() => {
        throw new Error('mock error')
      })
      const output = getFeatureGate(StatsigFeatureGates.APP_REVIEW)
      expect(Logger.warn).toHaveBeenCalled()
      expect(output).toEqual(false)
    })
    it('returns Statsig value when SDK is initialized', () => {
      mockGetFeatureGate.mockImplementation(() => ({
        value: true,
        details: { reason: 'Network' },
      }))
      const output = getFeatureGate(StatsigFeatureGates.APP_REVIEW)
      expect(Logger.warn).not.toHaveBeenCalled()
      expect(output).toEqual(true)
    })
    it('returns default value when SDK is still Uninitialized (avoids freezing false at call sites)', () => {
      mockGetFeatureGate.mockImplementation(() => ({
        value: true,
        details: { reason: 'Uninitialized' },
      }))
      // APP_REVIEW defaults to false, so we should get false even though
      // the SDK returned true (because the reason is Uninitialized, meaning
      // the SDK hasn't fetched real values yet).
      const output = getFeatureGate(StatsigFeatureGates.APP_REVIEW)
      expect(Logger.warn).not.toHaveBeenCalled()
      expect(output).toEqual(false)
    })
  })

  describe('getMultichainFeatures', () => {
    it('returns default values if getting statsig dynamic config throws error', () => {
      mockGetDynamicConfig.mockImplementation(() => {
        throw new Error('mock error')
      })
      const defaultValues =
        DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES].defaultValues
      const output = getMultichainFeatures()
      expect(Logger.warn).toHaveBeenCalled()
      expect(output).toEqual(defaultValues)
    })
    it('filters out invalid NetworkIds', () => {
      const defaultValues =
        DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES].defaultValues
      const getMock = jest
        .fn()
        .mockImplementation((paramName: keyof typeof defaultValues, _defaultValue: string) => {
          if (paramName === 'showCico') {
            return [NetworkId['arbitrum-one'], NetworkId['base-mainnet']]
          } else if (paramName === 'showBalances') {
            // celo is not a valid network id
            return [NetworkId['ethereum-mainnet'], 'celo']
          } else {
            return DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES]
              .defaultValues[paramName]
          }
        })
      mockGetDynamicConfig.mockImplementation(() => ({
        get: getMock,
        details: { reason: 'Network' },
      }))
      const output = getMultichainFeatures()
      expect(Logger.warn).not.toHaveBeenCalled()
      expect(output).toEqual({
        ...DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES].defaultValues,
        showCico: [NetworkId['arbitrum-one'], NetworkId['base-mainnet']],
        showBalances: [NetworkId['ethereum-mainnet']],
      })
      expect(mockGetDynamicConfig).toHaveBeenCalledWith(
        StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES
      )
    })
    it('returns values and logs error if sdk uninitialized', () => {
      const defaultValues =
        DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES].defaultValues
      const getMock = jest
        .fn()
        .mockImplementation((paramName: keyof typeof defaultValues, _defaultValue: string) => {
          if (paramName === 'showCico') {
            return [NetworkId['arbitrum-one'], NetworkId['base-mainnet']]
          } else if (paramName === 'showBalances') {
            // celo is not a valid network id
            return [NetworkId['ethereum-mainnet'], 'celo']
          } else {
            return DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES]
              .defaultValues[paramName]
          }
        })
      mockGetDynamicConfig.mockImplementation(() => ({
        get: getMock,
        details: { reason: 'Network' },
      }))
      const output = getMultichainFeatures()
      expect(Logger.warn).not.toHaveBeenCalled()
      expect(output).toEqual({
        ...DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES].defaultValues,
        showCico: [NetworkId['arbitrum-one'], NetworkId['base-mainnet']],
        showBalances: [NetworkId['ethereum-mainnet']],
      })
      expect(mockGetDynamicConfig).toHaveBeenCalledWith(
        StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES
      )
    })
  })

  describe('getDynamicConfigParams', () => {
    it('returns default values if getting statsig dynamic config throws error', () => {
      mockGetDynamicConfig.mockImplementation(() => {
        throw new Error('mock error')
      })
      const defaultValues = { param1: 'defaultValue1', param2: 'defaultValue2' }
      const configName = 'mock_config' as StatsigDynamicConfigs
      const output = getDynamicConfigParams({ configName, defaultValues })
      expect(Logger.warn).toHaveBeenCalled()
      expect(output).toEqual(defaultValues)
    })
    it('returns Statsig values if no error is thrown', () => {
      const getMock = jest.fn().mockImplementation((paramName: string, _defaultValue: string) => {
        if (paramName === 'param1') {
          return 'statsigValue1'
        } else if (paramName === 'param2') {
          return 'statsigValue2'
        } else {
          throw new Error('unexpected param name')
        }
      })
      mockGetDynamicConfig.mockImplementation(() => ({
        get: getMock,
        details: { reason: 'Network' },
      }))
      const defaultValues = { param1: 'defaultValue1', param2: 'defaultValue2' }
      const configName = 'mock_config' as StatsigDynamicConfigs
      const output = getDynamicConfigParams({ configName, defaultValues })
      expect(Logger.warn).not.toHaveBeenCalled()
      expect(mockGetDynamicConfig).toHaveBeenCalledWith(configName)
      expect(getMock).toHaveBeenCalledWith('param1', 'defaultValue1')
      expect(getMock).toHaveBeenCalledWith('param2', 'defaultValue2')
      expect(output).toEqual({ param1: 'statsigValue1', param2: 'statsigValue2' })
    })
    it('returns default values silently if sdk uninitialized', () => {
      const getMock = jest.fn()
      mockGetDynamicConfig.mockImplementation(() => ({
        get: getMock,
        details: { reason: 'Uninitialized' },
      }))
      const defaultValues = { param1: 'defaultValue1', param2: 'defaultValue2' }
      const configName = 'mock_config' as StatsigDynamicConfigs
      const output = getDynamicConfigParams({ configName, defaultValues })
      expect(Logger.warn).not.toHaveBeenCalled()
      expect(mockGetDynamicConfig).toHaveBeenCalledWith(configName)
      expect(getMock).not.toHaveBeenCalled()
      expect(output).toEqual(defaultValues)
    })
  })
  describe('patchUpdateStatsigUser', () => {
    let mockDateNow: jest.SpyInstance

    beforeEach(() => {
      mockDateNow = jest.spyOn(Date, 'now').mockReturnValue(1234)
    })

    afterEach(() => {
      mockDateNow.mockReset()
    })

    it('logs an error if statsig throws', async () => {
      mockUpdateUserAsync.mockRejectedValue(new Error())
      await patchUpdateStatsigUser()
      expect(mockUpdateUserAsync).toHaveBeenCalledTimes(1)
      expect(mockUpdateUserAsync).toHaveBeenCalledWith({
        userID: MOCK_ACCOUNT.toLowerCase(),
        custom: {
          startOnboardingTime: MOCK_START_ONBOARDING_TIME,
          multichainBetaStatus: MultichainBetaStatus.NotSeen,
          loadTime: 1234,
        },
      })
      expect(Logger.error).toHaveBeenCalledTimes(1)
    })
    it('uses default values when passed no parameters', async () => {
      await patchUpdateStatsigUser()
      expect(mockUpdateUserAsync).toHaveBeenCalledTimes(1)
      expect(mockUpdateUserAsync).toHaveBeenCalledWith({
        userID: MOCK_ACCOUNT.toLowerCase(),
        custom: {
          startOnboardingTime: MOCK_START_ONBOARDING_TIME,
          multichainBetaStatus: MultichainBetaStatus.NotSeen,
          loadTime: 1234,
        },
      })
    })
    it('overrides custom fields when passed', async () => {
      const statsigUser = {
        custom: {
          startOnboardingTime: 1680563880,
          multichainBetaStatus: MultichainBetaStatus.OptedIn,
          otherCustomProperty: 'foo',
          loadTime: 12345,
        },
      }
      await patchUpdateStatsigUser(statsigUser)
      expect(mockUpdateUserAsync).toHaveBeenCalledTimes(1)
      expect(mockUpdateUserAsync).toHaveBeenCalledWith({
        userID: MOCK_ACCOUNT.toLowerCase(),
        custom: statsigUser.custom,
      })
    })
    it('overrides user ID when passed', async () => {
      const statsigUser = {
        userID: 'some address',
        custom: {
          startOnboardingTime: 1680563880,
          multichainBetaStatus: MultichainBetaStatus.OptedIn,
          otherCustomProperty: 'foo',
          loadTime: 12345,
        },
      }
      await patchUpdateStatsigUser(statsigUser)
      expect(mockUpdateUserAsync).toHaveBeenCalledTimes(1)
      expect(mockUpdateUserAsync).toHaveBeenCalledWith(statsigUser)
    })
    it('uses custom and default fields', async () => {
      const statsigUser = {
        custom: {
          otherCustomProperty1: 'foo',
          otherCustomProperty2: 'bar',
        },
      }
      await patchUpdateStatsigUser(statsigUser)
      expect(mockUpdateUserAsync).toHaveBeenCalledTimes(1)
      expect(mockUpdateUserAsync).toHaveBeenCalledWith({
        userID: MOCK_ACCOUNT.toLowerCase(),
        custom: {
          startOnboardingTime: MOCK_START_ONBOARDING_TIME,
          multichainBetaStatus: MultichainBetaStatus.NotSeen,
          ...statsigUser.custom,
          loadTime: 1234,
        },
      })
    })
  })

  describe('setupOverridesFromLaunchArgs', () => {
    it('cleans up overrides and skips setup if no override is set', () => {
      const clearSpy = jest.spyOn(localGateOverrides, 'clear')
      const setSpy = jest.spyOn(localGateOverrides, 'set')
      jest.mocked(LaunchArguments.value).mockReturnValue({})
      setupOverridesFromLaunchArgs()
      expect(clearSpy).toHaveBeenCalledWith()
      expect(setSpy).not.toHaveBeenCalled()
    })

    it('cleans up and sets up gate overrides if set', () => {
      const clearSpy = jest.spyOn(localGateOverrides, 'clear')
      const setSpy = jest.spyOn(localGateOverrides, 'set')
      jest
        .mocked(LaunchArguments.value)
        .mockReturnValue({ statsigGateOverrides: 'gate1=true,gate2=false' })
      setupOverridesFromLaunchArgs()
      expect(clearSpy).toHaveBeenCalledWith()
      expect(setSpy).toHaveBeenCalledTimes(2)
      expect(setSpy).toHaveBeenCalledWith('gate1', true)
      expect(setSpy).toHaveBeenCalledWith('gate2', false)
    })
  })
})
