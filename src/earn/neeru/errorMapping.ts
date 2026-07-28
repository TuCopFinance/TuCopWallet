// Stable enumeration of the wallet-facing trigger error codes emitted by the
// backend post-2026-07-11 categoria cutover. Source of truth: backend
// consumer spec section 8 (hooks-api triggerShortcut, bilateral doc).
const NEERU_ERROR_KEYS: Record<string, string> = {
  INVALID_CATEGORY: 'neeruVaults.errors.invalidCategory',
  INVALID_AMOUNT: 'neeruVaults.errors.invalidAmount',
  AMOUNT_BELOW_MIN: 'neeruVaults.errors.amountBelowMin',
  DEPOSITS_PAUSED: 'neeruVaults.errors.depositsPaused',
  GLOBAL_CAP_EXCEEDED: 'neeruVaults.errors.globalCapExceeded',
  CATEGORY_CAP_EXCEEDED: 'neeruVaults.errors.categoryCapExceeded',
  RATE_NOT_SET: 'neeruVaults.errors.rateNotSet',
  POSITION_NOT_FOUND: 'neeruVaults.errors.positionStale',
  POSITION_NOT_OWNED: 'neeruVaults.errors.positionStale',
  POSITION_ALREADY_CLOSED: 'neeruVaults.errors.positionAlreadyClosed',
  NEERU_NOT_CONFIGURED: 'neeruVaults.errors.serviceUnavailable',
}

export function mapNeeruErrorToI18nKey(code: string | null | undefined): string {
  if (!code) return 'neeruVaults.errors.unknown'
  return NEERU_ERROR_KEYS[code] ?? 'neeruVaults.errors.unknown'
}

/**
 * Extract a backend error code from an error message. Backend returns
 * { error: "<CODE>" } as JSON in 400 responses, surfaced as
 * "fetch failed: 400 Bad Request" + body string in our fetch wrapper.
 */
export function extractNeeruErrorCode(error: Error | unknown): string | null {
  if (!(error instanceof Error)) return null
  const msg = error.message
  // Look for known codes in the error message
  for (const code of Object.keys(NEERU_ERROR_KEYS)) {
    if (msg.includes(code)) return code
  }
  return null
}
