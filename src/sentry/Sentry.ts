import * as Sentry from '@sentry/react-native'
import DeviceInfo from 'react-native-device-info'
import { sentryTracesSampleRateSelector } from 'src/app/selectors'
import { APP_BUNDLE_ID, SENTRY_CLIENT_URL, SENTRY_ENABLED } from 'src/config'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'
import { currentAccountSelector } from 'src/web3/selectors'
import { select } from 'typed-redux-saga'

const TAG = 'sentry/Sentry'

// Set this to true, if you want to test Sentry on dev builds
// Set tracesSampleRate: 1 to capture all events for testing performance metrics in Sentry
let _sentryRoutingInstrumentation: Sentry.ReactNavigationInstrumentation | undefined

function createSentryRoutingInstrumentation() {
  if (!_sentryRoutingInstrumentation) {
    // Only create real instrumentation if Sentry is enabled
    if (!SENTRY_ENABLED) {
      _sentryRoutingInstrumentation = {
        registerNavigationContainer: () => {},
        onRouteWillChange: () => {},
      } as Sentry.ReactNavigationInstrumentation
    } else {
      try {
        _sentryRoutingInstrumentation = new Sentry.ReactNavigationInstrumentation()
      } catch (error) {
        // Sentry not available - create a no-op instrumentation with required methods
        _sentryRoutingInstrumentation = {
          registerNavigationContainer: () => {},
          onRouteWillChange: () => {},
        } as Sentry.ReactNavigationInstrumentation
      }
    }
  }
  return _sentryRoutingInstrumentation
}

// Lazy-loaded export using Proxy with proper method binding
export const sentryRoutingInstrumentation: Sentry.ReactNavigationInstrumentation =
  new Proxy({} as Sentry.ReactNavigationInstrumentation, {
    get: (target, prop) => {
      const instance = createSentryRoutingInstrumentation()
      const value = instance[prop as keyof Sentry.ReactNavigationInstrumentation]
      // If it's a function, bind it to the instance
      if (typeof value === 'function') {
        return value.bind(instance)
      }
      return value
    }
  })

// Initialize Sentry early, before App component mounts
// This prevents the "Sentry.wrap called before Sentry.init" warning
export function initializeSentryEarly() {
  if (!SENTRY_ENABLED) {
    Logger.info(TAG, 'Sentry not enabled')
    return
  }

  if (!SENTRY_CLIENT_URL) {
    Logger.info(TAG, 'installSentry', 'Sentry URL not found, skipping installation')
    return
  }

  // Tentative to avoid Sentry reports from apps that modified the bundle id from published builds
  // We're not yet sure who/what does that. Suspecting an automated tool testing the published builds.
  // It's polluting the Sentry dashboard unnecessarily, since the environment is based on the bundle id.
  const bundleId = DeviceInfo.getBundleId()
  if (bundleId !== APP_BUNDLE_ID) {
    Logger.info(TAG, 'Sentry skipped for this app')
    return
  }

  // tracingOrigins is an array of regexes to match domain names against:
  //   https://docs.sentry.io/platforms/javascript/performance/instrumentation/automatic-instrumentation/#tracingorigins
  // If you want to match against a specific domain (which we do) make sure to
  // use the domain name (not the URL).
  const tracingOrigins = networkConfig.sentryTracingUrls.map((url) => {
    // hostname does not include the port (while host does include the port).
    // Use hostname because it will match agaist a request to the host on any
    // port.
    return new URL(url).hostname
  })

  Sentry.init({
    dsn: SENTRY_CLIENT_URL,
    environment: DeviceInfo.getBundleId(),
    enableAutoSessionTracking: true,
    integrations: [
      new Sentry.ReactNativeTracing({
        routingInstrumentation: createSentryRoutingInstrumentation(),
        tracingOrigins,
      }),
    ],
    tracesSampleRate: 0.2, // Default sample rate, can be updated later
  })

  Logger.info(TAG, 'installSentry', 'Sentry installation complete')
}

export function* initializeSentry() {
  // Sentry.init is already called in initializeSentryEarly()
  // This saga now only updates the sample rate if needed
  if (!SENTRY_ENABLED) {
    return
  }

  const tracesSampleRate = yield* select(sentryTracesSampleRateSelector)

  // Update the sample rate if it's different from the default
  if (tracesSampleRate !== 0.2) {
    const client = Sentry.getCurrentHub().getClient()
    if (client && client.getOptions()) {
      client.getOptions().tracesSampleRate = tracesSampleRate
      Logger.info(TAG, 'Updated Sentry tracesSampleRate to', tracesSampleRate)
    }
  }
}

// This should not be called at cold start since it can slow down the cold start.
export function* initializeSentryUserContext() {
  const account = yield* select(currentAccountSelector)

  if (!account) {
    return
  }
  Logger.debug(
    TAG,
    'initializeSentryUserContext',
    `Setting Sentry user context to account "${account}"`
  )
  Sentry.setUser({
    username: account,
  })
}
