import * as Sentry from '@sentry/react-native'
import { SENTRY_ENABLED } from 'src/config'

// Session-scoped dedupe. The same (key) fires at most once per app cold-start.
// Keeps event volume bounded regardless of how many times a user taps the
// same UI control. Reset on process death, which is the natural session
// boundary and matches how we reason about "did the feature work for this user
// at all today".
const SEEN = new Set<string>()

// Lightweight positive UX signal for post-release verification. Fires a
// Sentry event at level=info with a fixed fingerprint so all events for the
// same key group into ONE Sentry issue (count + userCount tell us reach and
// frequency). Use this when we want telemetry that a specific interaction
// happened at all in production, not to report errors.
//
// Cost: one Sentry event per (key) per session. Given a Set-based dedupe
// this is at most a handful per user per day even if they tap the control
// dozens of times.
//
// Do NOT use for high-cardinality signals (per-tx breadcrumbs, etc). Those
// belong in Sentry.addBreadcrumb (auto-attached to any subsequent error).
export function captureUxSignalOnce(
  key: string,
  message: string,
  tags: Record<string, string>
): void {
  if (!SENTRY_ENABLED) return
  if (SEEN.has(key)) return
  SEEN.add(key)
  Sentry.withScope((scope) => {
    scope.setLevel('info')
    scope.setTags(tags)
    // Fingerprint tuple = [message, ...tagValues] so Sentry groups by the
    // full descriptor (e.g. all "percentage_chip_tap flow=send percentage=25"
    // events collapse into one issue). Keep tag order stable across call
    // sites or the grouping fragments.
    scope.setFingerprint([message, ...Object.values(tags)])
    Sentry.captureMessage(message)
  })
}

// Test-only reset for the session-scoped dedupe Set. Not for runtime use.
export function _resetCapturedUxSignalsForTests(): void {
  SEEN.clear()
}
