import * as Sentry from '@sentry/react-native'
import { SENTRY_ENABLED } from 'src/config'

// Shared taxonomy of business features the wallet reports on. Any new
// integration (Squid, Allbridge, Aave, Compound, etc) gets a value here so
// the Sentry dashboard can group / filter without pattern-matching free-form
// strings. Keep names stable, they become the tag values in every event.
export type BusinessFeature =
  | 'earn' // earn-vaults family (deposits, withdraws, close, emergency)
  | 'gold' // digital gold buy / sell (XAUt0)
  | 'swap' // any token-to-token swap
  | 'transactions' // generic tx send / receipt / feed
  | 'buckspay' // COPm to COP off-ramp
  | 'jumpstart' // send-via-link
  | 'positions' // hooks-api positions fetch / trigger

// Provider / integration behind the feature. Kept small on purpose; add
// values as the wallet integrates new backends. 'internal' covers wallet-
// native flows (e.g. positions fetch failure that is not a specific
// provider). Aligned with backend's taxonomy so joint dashboards work.
export type BusinessProvider =
  | 'neeru'
  | 'marranitos'
  | 'squid'
  | 'uniswap-v4'
  | 'allbridge'
  | 'jumpstart'
  | 'buckspay'
  | 'wri'
  | 'internal'

export interface BusinessContext {
  feature: BusinessFeature
  provider: BusinessProvider
  action: string // e.g. 'close_position', 'trigger_shortcut', 'send_prepared'
  errorCode?: string // e.g. 'LOW_POOL', 'GAS_ESTIMATE_FAILED', 'RPC_TIMEOUT'
  // Additional context that is safe to send (never addresses, tx hashes or
  // amounts, those get scrubbed in beforeSend regardless).
  extra?: Record<string, unknown>
}

// Single entry point every saga uses so the schema is enforced by shape,
// not by convention. Fingerprint is set to the tuple
// [feature, provider, action, errorCode ?? 'unclassified'] so Sentry
// groups the same business failure into ONE issue across users regardless
// of the underlying exception message. Trade-off: this favours
// count/rate dashboards over per-user triage. Per-user detail is still
// available on the individual events within the issue; if in the future
// we need finer grouping (e.g. per HTTP status code), we can append more
// segments here without changing the tag shape.
// Defensive coercion so a caller passing a non-string errorCode (e.g. an
// object like classifyError() returns) never lands in Sentry as the
// useless "[object Object]" string. Strings pass through; primitives
// stringify normally; objects go through JSON.stringify with a fallback
// to their constructor name if serialization throws (circular refs).
function normalizeErrorCode(errorCode: unknown): string | undefined {
  if (errorCode == null) return undefined
  if (typeof errorCode === 'string') return errorCode
  if (typeof errorCode !== 'object') return String(errorCode)
  try {
    const json = JSON.stringify(errorCode)
    // JSON.stringify returns undefined for functions / symbols
    return json ?? (errorCode as object).constructor?.name ?? 'unknown_object'
  } catch {
    return (errorCode as object).constructor?.name ?? 'unstringifiable_object'
  }
}

// In-memory throttle for identical fingerprints. Prevents pollers (gold
// price fetch every 30s, positions refresh, etc.) from firing hundreds of
// Sentry events per user session when the underlying condition is
// persistent (device offline, backend circuit open). Same fingerprint fires
// at most once per THROTTLE_WINDOW_MS. Sentry-side grouping already
// collapses events into ONE issue; throttling reduces event volume so
// count/rate dashboards stay readable and we do not blow through the
// event quota during a Railway incident. Reset on app restart is
// intentional: each fresh session should still surface at least one
// event so persistent problems are visible.
const THROTTLE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const lastFiredByFingerprint = new Map<string, number>()

export function captureBusinessError(error: unknown, context: BusinessContext): void {
  if (!SENTRY_ENABLED) return
  const err = error instanceof Error ? error : new Error(String(error))
  const normalizedErrorCode = normalizeErrorCode(context.errorCode)
  const fingerprint = [
    context.feature,
    context.provider,
    context.action,
    normalizedErrorCode ?? 'unclassified',
  ]
  const key = fingerprint.join('|')
  const now = Date.now()
  const last = lastFiredByFingerprint.get(key)
  if (last !== undefined && now - last < THROTTLE_WINDOW_MS) {
    return
  }
  lastFiredByFingerprint.set(key, now)
  Sentry.withScope((scope) => {
    scope.setTags({
      feature: context.feature,
      provider: context.provider,
      action: context.action,
      ...(normalizedErrorCode ? { errorCode: normalizedErrorCode } : {}),
    })
    if (context.extra) scope.setContext('business', context.extra)
    scope.setFingerprint(fingerprint)
    Sentry.captureException(err)
  })
}

// Test-only: reset the throttle table so unit tests can assert firing
// behavior across "sessions" without needing to wait 5 minutes.
export function _resetCaptureBusinessErrorThrottleForTests(): void {
  lastFiredByFingerprint.clear()
}
