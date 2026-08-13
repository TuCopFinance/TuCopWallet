import type {
  DynamicConfig,
  Experiment,
  FeatureGate,
  OverrideAdapter,
  StatsigUser,
} from '@statsig/js-client'
import { StatsigClientRN } from '@statsig/react-native-bindings'
import * as _ from 'lodash'
import { LaunchArguments } from 'react-native-launch-arguments'
import { startOnboardingTimeSelector } from 'src/account/selectors'
import { multichainBetaStatusSelector } from 'src/app/selectors'
import { ExpectedLaunchArgs, isE2EEnv } from 'src/config'
import { DynamicConfigs } from 'src/statsig/constants'
import {
  StatsigDynamicConfigs,
  StatsigExperiments,
  StatsigFeatureGates,
  StatsigMultiNetworkDynamicConfig,
  StatsigParameter,
} from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'Statsig'

// Local override adapter — replaces `Statsig.overrideGate()` / `removeGateOverride()`
// from the legacy static API. Only gates are supported (matches how the app used
// launch-arg overrides). Installed once in `StatsigOptions.overrideAdapter` at
// init time; callers mutate `localGateOverrides` at runtime.
class LocalGateOverrideAdapter implements OverrideAdapter {
  private overrides = new Map<string, boolean>()

  set(gate: string, value: boolean) {
    this.overrides.set(gate, value)
  }

  clear() {
    this.overrides.clear()
  }

  getGateOverride(current: FeatureGate): FeatureGate | null {
    if (!this.overrides.has(current.name)) {
      return null
    }
    return {
      ...current,
      value: this.overrides.get(current.name)!,
      details: { ...current.details, reason: 'LocalOverride' },
    }
  }
}

export const localGateOverrides = new LocalGateOverrideAdapter()

let statsigClient: StatsigClientRN | null = null

export function setStatsigClient(client: StatsigClientRN) {
  statsigClient = client
}

export function getStatsigClient(): StatsigClientRN | null {
  return statsigClient
}

function getParams<T extends Record<string, StatsigParameter>>({
  config,
  defaultValues,
}: {
  config: DynamicConfig | Experiment
  defaultValues: T
}) {
  type Parameter = keyof T
  type DefaultValue = T[Parameter]
  const output = {} as T
  for (const [param, defaultValue] of Object.entries(defaultValues) as [
    Parameter,
    DefaultValue,
  ][]) {
    output[param] = config.get(param as string, defaultValue) as DefaultValue
  }
  return output
}

export function getExperimentParams<T extends Record<string, StatsigParameter>>({
  experimentName,
  defaultValues,
}: {
  experimentName: StatsigExperiments
  defaultValues: T
}): T {
  try {
    if (!statsigClient) {
      return defaultValues
    }
    const experiment = statsigClient.getExperiment(experimentName)
    if (!isE2EEnv && experiment.details.reason === 'Uninitialized') {
      // SDK is uninitialized, return default values silently
      return defaultValues
    }
    return getParams({ config: experiment, defaultValues })
  } catch (error) {
    Logger.warn(
      TAG,
      `getExperimentParams: Error getting params for experiment: ${experimentName}`,
      error
    )
    return defaultValues
  }
}

function _getDynamicConfigParams<T extends Record<string, StatsigParameter>>({
  configName,
  defaultValues,
}: {
  configName: StatsigDynamicConfigs | StatsigMultiNetworkDynamicConfig
  defaultValues: T
}): T {
  try {
    if (!statsigClient) {
      return defaultValues
    }
    const config = statsigClient.getDynamicConfig(configName)
    if (!isE2EEnv && config.details.reason === 'Uninitialized') {
      // SDK is uninitialized, return default values silently
      return defaultValues
    }
    return getParams({ config, defaultValues })
  } catch (error) {
    Logger.warn(TAG, `Error getting params for dynamic config: ${configName}`, error)
    return defaultValues
  }
}

export function getMultichainFeatures() {
  const multichainParams = _getDynamicConfigParams({
    configName: StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES,
    defaultValues:
      DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES].defaultValues,
  })
  const filteredParams = {} as { [key: string]: NetworkId[] }
  Object.entries(multichainParams).forEach(([key, value]) => {
    filteredParams[key] = value.filter((networkId) => networkId in NetworkId)
  })
  return filteredParams
}

// Cannot be used to retrieve dynamic config for multichain features
export function getDynamicConfigParams<T extends Record<string, StatsigParameter>>({
  configName,
  defaultValues,
}: {
  configName: StatsigDynamicConfigs
  defaultValues: T
}): T {
  return _getDynamicConfigParams({ configName, defaultValues })
}

export function getFeatureGate(featureGateName: StatsigFeatureGates) {
  // Two gates default to true; every other gate defaults to false.
  const defaultValue =
    featureGateName === StatsigFeatureGates.ALLOW_HOOKS_PREVIEW ||
    featureGateName === StatsigFeatureGates.SHOW_ONBOARDING_PHONE_VERIFICATION
  try {
    if (!statsigClient) {
      return defaultValue
    }
    // Use the object form + check details.reason for 'Uninitialized' the same
    // way getExperimentParams and _getDynamicConfigParams do. Prior version
    // called .checkGate() which silently returned false while the SDK bundle
    // was still fetching — combined with useMemo([]) at call sites, this
    // froze the false value for the entire JS session, so any gate created
    // after the last cached bundle stayed hidden until the user killed and
    // reopened the app AND the fetch finished before TabHome mounted.
    const gate = statsigClient.getFeatureGate(featureGateName)
    if (!isE2EEnv && gate.details.reason === 'Uninitialized') {
      return defaultValue
    }
    return gate.value
  } catch (error) {
    Logger.warn(TAG, `Error getting feature gate: ${featureGateName}`, error)
    return defaultValue
  }
}

export function getDefaultStatsigUser(): StatsigUser {
  // Inlined to avoid require cycles
  // like src/statsig/index.ts -> src/redux/store.ts -> src/redux/sagas.ts -> src/positions/saga.ts -> src/statsig/index.ts
  // and similar
  const { store } = require('src/redux/store')
  const state = store.getState()
  return {
    userID: walletAddressSelector(state) ?? undefined,
    custom: {
      startOnboardingTime: startOnboardingTimeSelector(state),
      multichainBetaStatus: multichainBetaStatusSelector(state),
      loadTime: Date.now(),
    },
  }
}

/**
 * Updates the current Statsig user. If no argument is given, a default StatsigUser
 * object is used to update the user, based on values from the redux store. If a StatsigUser
 * object is provided as a parameter, the provided object will be deep merged with the default
 * object from redux, with the provided object overriding fields in the default
 * object. The default object also includes a `loadTime` field which is set to
 * current time, so calling this method with no args will always force a refresh
 * since `loadTime` will change.
 *
 * If the update fails for whatever reason, an error will be logged.
 *
 * This function does not update default values in redux; callers are expected to update redux
 * state themselves.
 */
export async function patchUpdateStatsigUser(statsigUser?: StatsigUser) {
  try {
    if (!statsigClient) {
      Logger.debug(TAG, 'Statsig not initialized yet, skipping user update')
      return
    }
    const defaultUser = getDefaultStatsigUser()
    await statsigClient.updateUserAsync(_.merge(defaultUser, statsigUser))
  } catch (error) {
    Logger.error(TAG, 'Failed to update Statsig user', error)
  }
}

export function setupOverridesFromLaunchArgs() {
  try {
    Logger.debug(TAG, 'Cleaning up local overrides')
    localGateOverrides.clear()
    const { statsigGateOverrides } = LaunchArguments.value<ExpectedLaunchArgs>()
    if (statsigGateOverrides) {
      Logger.debug(TAG, 'Setting up gate overrides', statsigGateOverrides)
      statsigGateOverrides.split(',').forEach((gateOverride: string) => {
        const [gate, value] = gateOverride.split('=')
        localGateOverrides.set(gate, value === 'true')
      })
    }
  } catch (err) {
    Logger.debug(TAG, 'Overrides setup failed', err)
  }
}
