import * as Sentry from '@sentry/react-native'

// Consent acknowledgment audit trail. When the user ticks the TuCOPRamp
// terms-and-conditions checkbox we drop a Sentry breadcrumb so any
// subsequent error event in the same session carries proof that consent
// was recorded (with the timestamp). The breadcrumb is client-side only;
// the wire body still sends `consent_accepted: true` per the openapi
// schema. If Legal/Ops later requires server-side audit, coordinate a
// backend addition first (see .claude/coordination/tucopramp.md).
//
// Category `tucopramp.consent` is stable so future queries can filter by
// this specific event.
export function addConsentBreadcrumb(flow: 'offramp' | 'onramp'): number {
  const timestamp = Date.now()
  Sentry.addBreadcrumb({
    category: 'tucopramp.consent',
    message: `user_accepted_terms:${flow}`,
    level: 'info',
    data: { flow, timestampMs: timestamp },
  })
  return timestamp
}

// Renamed export kept for the alternate import name used in flow screens.
export const addBusinessErrorBreadcrumb = addConsentBreadcrumb
