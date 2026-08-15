import * as Sentry from '@sentry/react-native'
import { getClient } from '@sentry/core'
import DeviceInfo from 'react-native-device-info'
import { sentryTracesSampleRateSelector } from 'src/app/selectors'
import { APP_BUNDLE_ID, SENTRY_CLIENT_URL, SENTRY_ENABLED } from 'src/config'
import Logger from 'src/utils/Logger'
import { opaqueAccountId, scrubSensitiveStrings } from 'src/sentry/piiScrub'
import networkConfig from 'src/web3/networkConfig'
import { currentAccountSelector } from 'src/web3/selectors'
import { select } from 'typed-redux-saga'

const TAG = 'sentry/Sentry'

// Set this to true, if you want to test Sentry on dev builds
// Set tracesSampleRate: 1 to capture all events for testing performance metrics in Sentry
let _sentryRoutingInstrumentation: ReturnType<typeof Sentry.reactNavigationIntegration> | undefined

function createSentryRoutingInstrumentation() {
  if (!_sentryRoutingInstrumentation) {
    // Only create real instrumentation if Sentry is enabled
    if (!SENTRY_ENABLED) {
      _sentryRoutingInstrumentation = {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        registerNavigationContainer: () => {},
      } as unknown as ReturnType<typeof Sentry.reactNavigationIntegration>
    } else {
      try {
        _sentryRoutingInstrumentation = Sentry.reactNavigationIntegration()
      } catch (error) {
        // Sentry not available - create a no-op instrumentation with required methods
        _sentryRoutingInstrumentation = {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          registerNavigationContainer: () => {},
        } as unknown as ReturnType<typeof Sentry.reactNavigationIntegration>
      }
    }
  }
  return _sentryRoutingInstrumentation
}

// Lazy-loaded export using Proxy with proper method binding
export const sentryRoutingInstrumentation: ReturnType<typeof Sentry.reactNavigationIntegration> =
  new Proxy({} as ReturnType<typeof Sentry.reactNavigationIntegration>, {
    get: (target, prop) => {
      const instance = createSentryRoutingInstrumentation()
      const value = instance[prop as keyof ReturnType<typeof Sentry.reactNavigationIntegration>]
      // If it's a function, bind it to the instance
      if (typeof value === 'function') {
        return value.bind(instance)
      }
      return value
    },
  })

// Drops transient network / timeout events that reached the global handler
// without a business tag. captureBusinessError sets feature/provider/action
// tags, so an event without any of them is either an unhandled rejection or
// something wrapped by the RN error boundary. AbortError and network-request-
// failed under those conditions is user-cancelled or offline noise, already
// surfaced to the user via a toast, and pollutes Sentry with tens of events
// per user per session.
function isUntaggedTransientNoise(event: {
  exception?: { values?: Array<{ type?: string; value?: string }> }
  tags?: Record<string, unknown> | null
}): boolean {
  const values = event.exception?.values
  if (!values || values.length === 0) return false
  const tags = event.tags ?? {}
  const hasBusinessTag =
    typeof tags === 'object' &&
    (tags.feature != null || tags.provider != null || tags.action != null)
  if (hasBusinessTag) return false
  return values.some((v) => {
    const type = v.type ?? ''
    const value = v.value ?? ''
    if (type === 'AbortError' || value.includes('AbortError') || value === 'Aborted') return true
    if (
      value.includes('Network request failed') ||
      value.includes('The network connection was lost') ||
      value.includes('The Internet connection appears to be offline')
    ) {
      return true
    }
    return false
  })
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

  const navigationIntegration = createSentryRoutingInstrumentation()

  Sentry.init({
    dsn: SENTRY_CLIENT_URL,
    environment: DeviceInfo.getBundleId(),
    enableAutoSessionTracking: true,
    // Never send PII by default. beforeSend below strips wallet addresses,
    // tx hashes and large numeric amounts from every payload; the SDK will
    // not attach IP address of its own either.
    sendDefaultPii: false,
    integrations: [
      navigationIntegration,
      Sentry.reactNativeTracingIntegration({
        shouldCreateSpanForRequest: (url) => {
          return tracingOrigins.some((origin) => url.includes(origin))
        },
      }),
    ],
    tracesSampleRate: 0.2, // Default sample rate, can be updated later
    beforeSend: (event) => {
      // Drop noise-only events that leaked to the global handler instead of
      // being intentionally captured via captureBusinessError (which adds
      // feature/provider/action tags). These are user-cancelled fetches
      // (AbortError from AbortController.abort()) or offline blips
      // ("Network request failed" / "The network connection was lost"),
      // both of which are already handled at the UI layer with a toast and
      // do not represent a bug. Filter is scoped tightly to un-tagged events
      // so we do not accidentally drop captureBusinessError'd timeouts.
      if (isUntaggedTransientNoise(event)) {
        return null
      }
      const scrubbed = scrubSensitiveStrings(event)
      if (!scrubbed) return null
      // Belt-and-suspenders: even with sendDefaultPii=false the SDK can attach
      // a client IP when the event has a user context. Force it null so
      // Sentry's ingest server never stores an IP even if the setting drifts.
      if (scrubbed.user) {
        // ip_address = null tells Sentry ingest to strip the connection IP
        // too. The SDK types disallow null explicitly, but the API accepts
        // it; deleting the property has the same effect and satisfies TS.
        const { ip_address: _drop, ...userWithoutIp } = scrubbed.user
        scrubbed.user = userWithoutIp as typeof scrubbed.user
      }
      return scrubbed
    },
    beforeBreadcrumb: (breadcrumb) => scrubSensitiveStrings(breadcrumb),
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
    const client = getClient()
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
  // Never send the raw wallet address to Sentry. opaqueAccountId returns a
  // stable, deterministic id that lets us count sessions per user without
  // exposing which on-chain account they are.
  const id = opaqueAccountId(account)
  Logger.debug(TAG, 'initializeSentryUserContext', 'Setting Sentry user context (opaque id)')
  Sentry.setUser({ id })
}
