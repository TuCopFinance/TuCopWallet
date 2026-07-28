import * as Sentry from '@sentry/react-native'
import { SENTRY_ENABLED } from 'src/config'

// Shared taxonomy of business features the wallet reports on. Any new
// integration (Squid, Allbridge, Aave, Compound, etc) gets a value here so
// the Sentry dashboard can group / filter without pattern-matching free-form
// strings. Keep names stable, they become the tag values in every event.
type BusinessFeature =
  | 'earn' // earn-vaults family (deposits, withdraws, close, emergency)
  | 'swap' // any token-to-token swap
  | 'transactions' // generic tx send / receipt / feed
  | 'buckspay' // COPm to COP off-ramp
  | 'jumpstart' // send-via-link
  | 'positions' // hooks-api positions fetch / trigger

// Provider / integration behind the feature. Kept small on purpose; add
// values as the wallet integrates new backends. 'internal' covers wallet-
// native flows (e.g. positions fetch failure that is not a specific
// provider). Aligned with backend's taxonomy so joint dashboards work.
type BusinessProvider =
  | 'neeru'
  | 'marranitos'
  | 'squid'
  | 'allbridge'
  | 'jumpstart'
  | 'buckspay'
  | 'wri'
  | 'internal'

interface BusinessContext {
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
export function captureBusinessError(error: unknown, context: BusinessContext): void {
  if (!SENTRY_ENABLED) return
  const err = error instanceof Error ? error : new Error(String(error))
  Sentry.withScope((scope) => {
    scope.setTags({
      feature: context.feature,
      provider: context.provider,
      action: context.action,
      ...(context.errorCode ? { errorCode: context.errorCode } : {}),
    })
    if (context.extra) scope.setContext('business', context.extra)
    scope.setFingerprint([
      context.feature,
      context.provider,
      context.action,
      context.errorCode ?? 'unclassified',
    ])
    Sentry.captureException(err)
  })
}
