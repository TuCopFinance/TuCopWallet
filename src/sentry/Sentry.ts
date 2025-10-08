import * as Sentry from '@sentry/react-native'
import DeviceInfo from 'react-native-device-info'
import { sentryTracesSampleRateSelector } from 'src/app/selectors'
import { APP_BUNDLE_ID, SENTRY_CLIENT_URL, SENTRY_ENABLED } from 'src/config'
import Logger from 'src/utils/Logger'
import { currentAccountSelector } from 'src/web3/selectors'
import { select } from 'typed-redux-saga'

const TAG = 'sentry/Sentry'

// Set this to true, if you want to test Sentry on dev builds
// Set tracesSampleRate: 1 to capture all events for testing performance metrics in Sentry

// Navigation integration for Sentry tracing
// Using the new API: reactNavigationIntegration()
let _navigationIntegration: ReturnType<typeof Sentry.reactNavigationIntegration> | undefined

function getNavigationIntegration() {
  if (!_navigationIntegration) {
    _navigationIntegration = Sentry.reactNavigationIntegration()
  }
  return _navigationIntegration
}

// Export for backward compatibility with code that uses sentryRoutingInstrumentation
export const sentryRoutingInstrumentation = {
  registerNavigationContainer: (ref: any) => {
    if (SENTRY_ENABLED) {
      getNavigationIntegration().registerNavigationContainer(ref)
    }
  },
}

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

  // Note: tracingOrigins is no longer needed in Sentry v6+
  // The new API uses shouldCreateSpanForRequest option in reactNativeTracingIntegration
  // if needed for custom filtering

  Sentry.init({
    dsn: SENTRY_CLIENT_URL,
    environment: DeviceInfo.getBundleId(),
    enableAutoSessionTracking: true,
    integrations: [
      Sentry.reactNativeTracingIntegration(),
      getNavigationIntegration(),
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
    const client = Sentry.getClient()
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
