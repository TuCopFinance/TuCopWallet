import * as Sentry from '@sentry/react-native'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import { AppState, AppStateStatus } from 'react-native'
import { SENTRY_ENABLED } from 'src/config'
import Logger from 'src/utils/Logger'

// Global side-band context installer for Sentry. Wires OS-level signals
// (network connectivity + app foreground/background) into two continuously
// updated Sentry contexts so every event that fires - including UNTAGGED
// events routed through the default global handler (unhandled promise
// rejections, ErrorUtils fatal, RN error boundary catches) - carries the
// runtime state at the moment of the crash without the caller having to
// remember to attach it.
//
// Why contexts instead of one-shot event enrichers in beforeSend:
//   - beforeSend can only enrich if it has the data at capture time.
//     Attaching a live snapshot per event would require re-reading NetInfo
//     synchronously (expensive) or reading from Redux (breaks when the
//     store isn't ready yet, e.g. crashes during boot).
//   - Sentry.setContext writes into the client's scope; every subsequent
//     event picks it up automatically until the next setContext call
//     overwrites it. Zero per-event cost.
//   - Contexts render as a labeled section on the event detail page in
//     Sentry ("Connectivity", "App State"), which is more searchable than
//     scattered tags for cardinality-heavy fields.
//
// Called once from initializeSentryEarly() before App renders, so the
// contexts are populated before the first render-cycle can crash.

const TAG = 'sentry/globalContext'

let installed = false

// Map NetInfo's granular `type` to a small, stable enum so Sentry search
// stays consistent even if NetInfo adds new subtypes upstream. The raw
// type is also preserved in the context payload for the rare case where
// the difference between (e.g.) `cellular` and `wimax` matters.
function normalizeConnectionType(t: NetInfoState['type']): string {
  switch (t) {
    case 'wifi':
    case 'ethernet':
    case 'cellular':
    case 'bluetooth':
    case 'wimax':
    case 'vpn':
    case 'other':
    case 'none':
    case 'unknown':
      return t
    default:
      return 'unknown'
  }
}

function installNetInfoContext(): () => void {
  const apply = (state: NetInfoState) => {
    const connectivity = {
      type: normalizeConnectionType(state.type),
      rawType: state.type,
      isConnected: state.isConnected ?? false,
      // isInternetReachable can be null on iOS during the first fetch;
      // treat that as unknown rather than false so we don't false-flag
      // an event as "offline" when it may just be pre-probe.
      isInternetReachable: state.isInternetReachable,
      // On cellular, subtype is 3g/4g/5g and can explain latency spikes.
      // On wifi, ssid is intentionally NOT read; it is PII and gated
      // behind location permission on iOS anyway.
      cellularGeneration:
        state.type === 'cellular' && state.details && 'cellularGeneration' in state.details
          ? state.details.cellularGeneration
          : undefined,
    }
    Sentry.setContext('connectivity', connectivity)
    Sentry.addBreadcrumb({
      category: 'app.connectivity',
      level: connectivity.isConnected ? 'info' : 'warning',
      message: `connectivity=${connectivity.type} connected=${connectivity.isConnected} reachable=${connectivity.isInternetReachable}`,
      data: connectivity,
    })
  }

  // Prime the context immediately so events firing before the first
  // change-event still have connectivity data attached.
  NetInfo.fetch()
    .then(apply)
    .catch((err) => Logger.warn(TAG, 'NetInfo.fetch failed', err))

  const unsubscribe = NetInfo.addEventListener(apply)
  return unsubscribe
}

function installAppStateContext(): () => void {
  const apply = (status: AppStateStatus) => {
    const app_state = {
      status,
      changedAt: new Date().toISOString(),
    }
    Sentry.setContext('app_state', app_state)
    Sentry.addBreadcrumb({
      category: 'app.state',
      level: 'info',
      message: `app_state=${status}`,
      data: app_state,
    })
  }

  // Prime with the current value.
  apply(AppState.currentState)

  const subscription = AppState.addEventListener('change', apply)
  return () => subscription.remove()
}

// Installer. Idempotent; call once from initializeSentryEarly().
// Returns a teardown fn so tests can reset between suites (production
// code never calls it).
// Shared no-op teardown returned when there is nothing to tear down (already
// installed, or Sentry disabled). Declared once so eslint's no-empty-function
// only lints the intentional single instance.
// eslint-disable-next-line @typescript-eslint/no-empty-function
const noopTeardown = (): void => {}

export function installGlobalContextForSentry(): () => void {
  if (installed) {
    return noopTeardown
  }
  installed = true

  if (!SENTRY_ENABLED) {
    // Sentry.setContext is a no-op when the SDK isn't initialized, and
    // NetInfo listeners keep the JS bridge busy for nothing. Skip both
    // when Sentry is disabled (dev builds).
    installed = false
    return noopTeardown
  }

  const teardownNet = installNetInfoContext()
  const teardownAppState = installAppStateContext()

  Logger.info(TAG, 'Global Sentry context installed (connectivity + app_state)')

  return () => {
    teardownNet()
    teardownAppState()
    installed = false
  }
}

// Test-only reset so unit tests can install fresh listeners across suites.
export function _resetInstalledForTests(): void {
  installed = false
}
