import { SegmentClient } from '@segment/analytics-react-native'
import { StatsigClientRN } from '@statsig/react-native-bindings'
import _ from 'lodash'
import PostHog from 'posthog-react-native'
import { Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import { check, PERMISSIONS, request, RESULTS } from 'react-native-permissions'
import { AppEvents } from 'src/analytics/Events'
import { AnalyticsPropertiesList } from 'src/analytics/Properties'
import { getCurrentUserTraits } from 'src/analytics/selectors'
import {
  E2E_TEST_STATSIG_ID,
  isE2EEnv,
  POSTHOG_API_KEY,
  POSTHOG_ENABLED,
  POSTHOG_ENVIRONMENT,
  POSTHOG_HOST,
  STATSIG_API_KEY,
  STATSIG_ENV,
} from 'src/config'
import { store } from 'src/redux/store'
import { getFeatureGate } from 'src/statsig'
import { getDefaultStatsigUser, localGateOverrides, setStatsigClient } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { getSupportedNetworkIdsForTokenBalances } from 'src/tokens/utils'
import { ensureError } from 'src/utils/ensureError'
import Logger from 'src/utils/Logger'
import { sha256 } from 'viem'

const TAG = 'AppAnalytics'

interface DeviceInfoType {
  AppName: string
  Brand: string
  BuildNumber: string
  BundleId: string
  Carrier: string
  DeviceId: string // this is the device model + version
  FirstInstallTime: number
  FontScale: number
  FreeDiskStorage: number
  InstallReferrer: string
  InstanceID: string
  LastUpdateTime: number
  Manufacturer: string
  MaxMemory: number
  Model: string
  ReadableVersion: string
  SystemName: string
  SystemVersion: string
  TotalDiskCapacity: number
  TotalMemory: number
  UniqueID: string // this is the unique id of the device, which maps to deviceId in the data
  UserAgent: string
  Version: string
  isEmulator: boolean
  isTablet: boolean
  UsedMemory: number
}

async function getDeviceInfo(): Promise<DeviceInfoType> {
  return {
    AppName: DeviceInfo.getApplicationName(),
    Brand: DeviceInfo.getBrand(),
    BuildNumber: DeviceInfo.getBuildNumber(),
    BundleId: DeviceInfo.getBundleId(),
    Carrier: await DeviceInfo.getCarrier(),
    DeviceId: DeviceInfo.getDeviceId(),
    FirstInstallTime: await DeviceInfo.getFirstInstallTime(),
    FontScale: await DeviceInfo.getFontScale(),
    FreeDiskStorage: await DeviceInfo.getFreeDiskStorage(),
    InstallReferrer: await DeviceInfo.getInstallReferrer(),
    InstanceID: await DeviceInfo.getInstanceId(),
    LastUpdateTime: await DeviceInfo.getLastUpdateTime(),
    Manufacturer: await DeviceInfo.getManufacturer(),
    MaxMemory: await DeviceInfo.getMaxMemory(),
    Model: DeviceInfo.getModel(),
    ReadableVersion: DeviceInfo.getReadableVersion(),
    SystemName: DeviceInfo.getSystemName(),
    SystemVersion: DeviceInfo.getSystemVersion(),
    TotalDiskCapacity: await DeviceInfo.getTotalDiskCapacity(),
    TotalMemory: await DeviceInfo.getTotalMemory(),
    UniqueID: await DeviceInfo.getUniqueId(),
    UserAgent: await DeviceInfo.getUserAgent(),
    Version: DeviceInfo.getVersion(),
    isEmulator: await DeviceInfo.isEmulator(),
    isTablet: DeviceInfo.isTablet(),
    UsedMemory: await DeviceInfo.getUsedMemory(),
  }
}

class AppAnalytics {
  sessionId: string = ''
  deviceInfo: DeviceInfoType | undefined

  private currentScreenId: string | undefined
  private prevScreenId: string | undefined
  private segmentClient: SegmentClient | undefined
  // PostHog RN SDK client. Initialized lazily inside init() only when the
  // POSTHOG_TRACKING_ENABLED Statsig gate is on AND the build has a real
  // `phc_` project token. Left undefined on E2E, dev opt-out, and gate-off
  // rollouts so track/identify/page short-circuit before any network I/O.
  private posthogClient: PostHog | undefined

  async init() {
    let uniqueID
    try {
      // if (!SEGMENT_API_KEY) {
      //   throw Error('API Key not present, likely due to environment. Skipping enabling')
      // }
      // this.segmentClient = createClient({
      //   debug: __DEV__,
      //   trackAppLifecycleEvents: true,
      //   trackDeepLinks: true,
      //   writeKey: SEGMENT_API_KEY,
      //   storePersistor: AsyncStoragePersistor,
      // })

      // this.segmentClient.add({ plugin: new DestinationFiltersPlugin() })
      // this.segmentClient.add({ plugin: new InjectTraits() })
      // this.segmentClient.add({ plugin: new AdjustPlugin() })
      // this.segmentClient.add({ plugin: new ClevertapPlugin() })

      try {
        const deviceInfo = await getDeviceInfo()
        this.deviceInfo = deviceInfo
        uniqueID = deviceInfo.UniqueID
        this.sessionId = sha256(new Uint8Array(Buffer.from(uniqueID + String(Date.now())))).slice(2)
      } catch (error) {
        Logger.error(TAG, 'getDeviceInfo error', error)
      }

      Logger.info(TAG, 'Segment Analytics Integration initialized!')
    } catch (err) {
      const error = ensureError(err)
      Logger.error(TAG, `Segment setup error: ${error.message}\n`, error)
    }

    try {
      const statsigUser = getDefaultStatsigUser()
      // getAnonymousId causes the e2e tests to fail
      let overrideStableID: string = E2E_TEST_STATSIG_ID
      if (!isE2EEnv) {
        if (!this.segmentClient) {
          // Segment client is not initialized (commented out above)
          // Use device unique ID as fallback for anonymous ID
          // Only log in production builds
          if (!__DEV__) {
            Logger.warn(TAG, 'segmentClient is undefined, using device uniqueID as fallback')
          }
          overrideStableID = uniqueID || E2E_TEST_STATSIG_ID
        } else {
          overrideStableID = this.segmentClient.userInfo.get().anonymousId
        }
      }
      Logger.debug(TAG, 'Statsig stable ID', overrideStableID)

      Logger.info(TAG, 'Statsig Integration initialized!', STATSIG_API_KEY)
      const client = new StatsigClientRN(
        STATSIG_API_KEY,
        // StableID must match Segment anonymousId; the new SDK reads it from
        // the user's `customIDs.stableID` field instead of a top-level option.
        { ...statsigUser, customIDs: { ...statsigUser.customIDs, stableID: overrideStableID } },
        {
          environment: STATSIG_ENV,
          // In E2E, block all network traffic so tests are deterministic and
          // the client falls back to default values (analog of legacy `localMode`).
          networkConfig: { preventAllNetworkTraffic: isE2EEnv },
          overrideAdapter: localGateOverrides,
        }
      )
      setStatsigClient(client)
      await client.initializeAsync()
    } catch (error) {
      Logger.warn(TAG, `Statsig setup error`, error)
    }

    // PostHog init - runs AFTER Statsig so the rollout gate is readable.
    // Silent no-op when the gate is off, when the env-level POSTHOG_ENABLED
    // flag is false, when no project token is baked in, or under E2E. Each
    // guard is checked explicitly (instead of a single boolean) so an ops
    // page reading these logs can tell which lever gated the init.
    try {
      if (isE2EEnv) {
        Logger.debug(TAG, 'PostHog skipped: E2E environment')
      } else if (!POSTHOG_ENABLED) {
        Logger.debug(TAG, 'PostHog skipped: POSTHOG_ENABLED=false in env file')
      } else if (!POSTHOG_API_KEY) {
        Logger.warn(TAG, 'PostHog skipped: POSTHOG_API_KEY missing from secrets.json')
      } else if (!getFeatureGate(StatsigFeatureGates.POSTHOG_TRACKING_ENABLED)) {
        Logger.info(TAG, 'PostHog skipped: posthog_tracking_enabled gate OFF')
      } else {
        // Independent gate: session replay + mobile heatmaps are much
        // heavier + more sensitive than plain event tracking, so they
        // ramp on their own Statsig switch. When ON the SDK enters replay
        // mode with defensive defaults (mask every TextInput, every image,
        // every sandboxed system view). Per-view masking on high-risk
        // components — balance cards, mnemonic screens, address strings —
        // is enforced separately by wrapping those components in
        // <PostHogMaskView>. Heatmaps on the PostHog dashboard aggregate
        // from replay tap coordinates; enabling replay unlocks that
        // surface without a separate config knob.
        const sessionReplayEnabled = getFeatureGate(
          StatsigFeatureGates.POSTHOG_SESSION_REPLAY_ENABLED
        )
        this.posthogClient = new PostHog(POSTHOG_API_KEY, {
          host: POSTHOG_HOST,
          // Auto capture app-open / install / update. Cheap, matches Sentry
          // release tracking and lets funnels start at first-open without
          // needing an explicit AppAnalytics.track() at every entry point.
          captureAppLifecycleEvents: true,
          // Session replay: gated. Config defaults are already conservative
          // (mask all inputs + images + sandboxed views); we pin them
          // explicitly here so a future SDK bump that changes defaults
          // does not silently unmask a wallet screen.
          enableSessionReplay: sessionReplayEnabled,
          sessionReplayConfig: {
            maskAllTextInputs: true,
            maskAllImages: true,
            maskAllSandboxedViews: true,
            // console.log capture would ship every Logger.debug/info line
            // to PostHog. TuCop logs occasionally contain token IDs and
            // wallet addresses in dev/prod builds; keep off to be safe.
            captureLog: false,
          },
          // Feature flags live in Statsig; disabling PostHog's own flag
          // system avoids two competing sources of truth + one extra
          // network round-trip on init.
          preloadFeatureFlags: false,
          sendFeatureFlagEvent: false,
        })
        // register() returns a Promise; a `void`-discarded rejection
        // becomes an unhandled rejection that surfaces as a fatal
        // onerror in React Native (Sentry TUCOPWALLET-1P root cause,
        // 1.118.13). Attach an explicit .catch so a lib-internal
        // throw (e.g. UUIDv7 counter overflow) never derails startup.
        this.posthogClient
          .register({
            environment: POSTHOG_ENVIRONMENT,
            app_version: DeviceInfo.getReadableVersion(),
            build_number: DeviceInfo.getBuildNumber(),
            platform: Platform.OS,
          })
          .catch((err) => {
            Logger.warn(TAG, 'PostHog register failed', err)
          })
        Logger.info(TAG, 'PostHog initialized', {
          host: POSTHOG_HOST,
          env: POSTHOG_ENVIRONMENT,
          sessionReplay: sessionReplayEnabled,
        })
      }
    } catch (error) {
      Logger.warn(TAG, 'PostHog setup error', error)
      this.posthogClient = undefined
    }
  }

  isEnabled() {
    // Remove __DEV__ here to test analytics in dev builds
    return !__DEV__ && !isE2EEnv && store.getState().app.analyticsEnabled
  }

  // PostHog dispatch predicate. Deliberately does NOT gate on `!__DEV__`,
  // unlike isEnabled(): dev builds route to the same project but the
  // POSTHOG_ENVIRONMENT super-property tags them so prod dashboards can
  // filter them out. That way we can smoke-test the pipeline from a mainnetdev
  // sim without shipping a release. The other gates (POSTHOG_ENABLED env,
  // secret presence, Statsig rollout gate, E2E) are already checked at
  // init() and reflected in posthogClient presence; here we only enforce
  // the OS-level analytics opt-out.
  private isPostHogSendable(): boolean {
    return !isE2EEnv && store.getState().app.analyticsEnabled
  }

  startSession(
    eventName: typeof AppEvents.app_launched,
    eventProperties: AnalyticsPropertiesList[AppEvents.app_launched]
  ) {
    this.track(eventName, {
      deviceInfo: this.deviceInfo,
      ...eventProperties,
    })

    this.requestTrackingPermissionIfNeeded().catch((error) => {
      Logger.error(TAG, 'Failure while requesting tracking permission', error)
    })
  }

  getSessionId() {
    return this.sessionId
  }

  track<EventName extends keyof AnalyticsPropertiesList>(
    ...args: undefined extends AnalyticsPropertiesList[EventName]
      ? [EventName] | [EventName, AnalyticsPropertiesList[EventName]]
      : [EventName, AnalyticsPropertiesList[EventName]]
  ) {
    const [eventName, eventProperties] = args

    const segmentEnabled = this.isEnabled()
    const posthogEnabled = this.isPostHogSendable()

    if (!segmentEnabled && !posthogEnabled) {
      Logger.debug(TAG, `Analytics disabled everywhere, not tracking ${eventName}`, eventProperties)
      return
    }

    const props: {} = {
      ...this.getSuperProps(),
      ...eventProperties,
    }

    if (__DEV__) {
      Logger.debug(TAG, `Tracking event ${eventName} with properties:`, props)
    } else {
      Logger.info(TAG, `Tracking event ${eventName}`)
    }

    if (segmentEnabled && this.segmentClient) {
      this.segmentClient.track(eventName, props).catch((err) => {
        Logger.error(TAG, `Failed to track event ${eventName} to Segment`, err)
      })
    }

    if (posthogEnabled && this.posthogClient) {
      try {
        this.posthogClient.capture(eventName, props)
      } catch (err) {
        Logger.error(TAG, `Failed to track event ${eventName} to PostHog`, err)
      }
    }
  }

  identify(userID: string | null, traits: {}) {
    // Only identify user if userID (walletAddress) is set
    if (!userID) {
      return
    }

    const segmentEnabled = this.isEnabled()
    const posthogEnabled = this.isPostHogSendable()

    if (!segmentEnabled && !posthogEnabled) {
      Logger.debug(TAG, `Analytics disabled everywhere, not identifying user ${userID}`)
      return
    }

    // The firebase segment plugin can't handle null or undefined values
    const safeTraits = _.omitBy(traits, _.isNil)

    if (segmentEnabled && this.segmentClient) {
      this.segmentClient.identify(userID, safeTraits).catch((err) => {
        Logger.error(TAG, `Failed to identify user ${userID} to Segment`, err)
        throw err
      })
    }

    if (posthogEnabled && this.posthogClient) {
      try {
        this.posthogClient.identify(userID, safeTraits)
      } catch (err) {
        Logger.error(TAG, `Failed to identify user ${userID} to PostHog`, err)
      }
    }
  }

  page(screenId: string, eventProperties = {}) {
    const segmentEnabled = this.isEnabled()
    const posthogEnabled = this.isPostHogSendable()

    if (!segmentEnabled && !posthogEnabled) {
      Logger.debug(TAG, `Analytics disabled everywhere, not tracking screen ${screenId}`)
      return
    }

    if (screenId !== this.currentScreenId) {
      this.prevScreenId = this.currentScreenId
      this.currentScreenId = screenId
    }

    const props: {} = {
      ...this.getSuperProps(),
      ...eventProperties,
    }

    if (segmentEnabled && this.segmentClient) {
      this.segmentClient.screen(screenId, props).catch((err) => {
        Logger.error(TAG, 'Error tracking page to Segment', err)
      })
    }

    if (posthogEnabled && this.posthogClient) {
      try {
        // screen() returns a Promise; discarding it with `void` turns any
        // internal async throw into an unhandled rejection (RN surfaces
        // those as fatal onerror). Chain a .catch so lib-internal
        // failures degrade to a log line instead of crashing the app.
        this.posthogClient.screen(screenId, props).catch((err) => {
          Logger.error(TAG, 'Error tracking page to PostHog', err)
        })
      } catch (err) {
        Logger.error(TAG, 'Error tracking page to PostHog', err)
      }
    }
  }

  async reset() {
    if (this.segmentClient) {
      try {
        await this.segmentClient.flush()
        await this.segmentClient.reset()
      } catch (error) {
        Logger.error(TAG, 'Error resetting Segment analytics', error)
      }
    }

    if (this.posthogClient) {
      try {
        await this.posthogClient.flush()
        this.posthogClient.reset()
      } catch (error) {
        Logger.error(TAG, 'Error resetting PostHog analytics', error)
      }
    }
  }

  private async requestTrackingPermissionIfNeeded() {
    // TODO: remove `isE2EEnv` and set permission via Detox when we upgrade
    if (Platform.OS !== 'ios' || isE2EEnv) {
      return
    }

    const appTrackingPermission = await check(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY)
    Logger.debug(TAG, `iOS tracking permission: ${appTrackingPermission}`)
    if (appTrackingPermission !== RESULTS.DENIED) {
      // The permission has already been requested / is not requestable
      // See https://github.com/zoontek/react-native-permissions#permissions-statuses
      return
    }

    Logger.debug(TAG, `iOS requesting tracking permission`)
    this.track(AppEvents.request_tracking_permission_started, {
      currentPermission: appTrackingPermission,
    })
    const newAppTrackingPermission = await request(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY)
    Logger.debug(TAG, `iOS tracking permission after request: ${newAppTrackingPermission}`)
    if (newAppTrackingPermission === RESULTS.GRANTED) {
      this.track(AppEvents.request_tracking_permission_accepted, {
        newPermission: newAppTrackingPermission,
      })
    } else {
      this.track(AppEvents.request_tracking_permission_declined, {
        newPermission: newAppTrackingPermission,
      })
    }
  }

  // Super props, i.e. props sent with all events
  private getSuperProps() {
    const traits = getCurrentUserTraits(store.getState(), getSupportedNetworkIdsForTokenBalances())
    // Prefix super props with `s` so they don't clash with events props
    const prefixedSuperProps = Object.fromEntries(
      Object.entries({
        ...traits,
        currentScreenId: this.currentScreenId,
        prevScreenId: this.prevScreenId,
      }).map(([key, value]) => [`s${key.charAt(0).toUpperCase() + key.slice(1)}`, value])
    )

    return {
      // Legacy super props
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userAddress: traits.walletAddress,
      celoNetwork: 'mainnet',
      // Prefixed super props
      ...prefixedSuperProps,
      // Statsig prop, won't be read properly by Statsig if prefixed
      statsigEnvironment: STATSIG_ENV,
    }
  }
}

let isInitialized = false
type KeysOfType<T, TProp> = { [P in keyof T]: T[P] extends TProp ? P : never }[keyof T]
type AppAnalyticsKeyFunction = KeysOfType<AppAnalytics, Function>
// Type checked function keys to queue until `init` has finished
const funcsToQueue = new Set<AppAnalyticsKeyFunction>(['startSession', 'track', 'identify', 'page'])
let queuedCalls: Function[] = []

function isFuncToQueue(prop: string | number | symbol): prop is AppAnalyticsKeyFunction {
  return funcsToQueue.has(prop as AppAnalyticsKeyFunction)
}

/**
 * Use a proxy to queue specific calls until async `init` has finished
 * So all events are sent with the right props to our initialized analytics integrations
 */
export default new Proxy(new AppAnalytics(), {
  get: function (target, prop, receiver) {
    if (!isInitialized) {
      if (prop === 'init') {
        return new Proxy(target[prop], {
          apply: (target, thisArg, argumentsList) => {
            return Reflect.apply(target, thisArg, argumentsList).finally(() => {
              isInitialized = true
              // Init finished, we can now process queued calls
              for (const fn of queuedCalls) {
                fn()
              }
              queuedCalls = []
            })
          },
        })
      } else if (isFuncToQueue(prop)) {
        return new Proxy(target[prop], {
          apply: (target, thisArg, argumentsList) => {
            queuedCalls.push(() => Reflect.apply(target, thisArg, argumentsList))
            Logger.debug(TAG, `Queued call to ${prop}`, ...argumentsList)
          },
        })
      }
    }
    return Reflect.get(target, prop, receiver)
  },
})
