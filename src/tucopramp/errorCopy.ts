// Maps a TuCOPRamp error code to its i18n key under `tucopramp.errors`.
// Codes without dedicated copy fall back to `errors.unknown` at the call
// site (t(key, { defaultValue })). Every 5xx shares one generic message.
export function errorMessageKey(code: string | null): string {
  if (!code) return 'tucopramp.errors.unknown'
  if (/^http_5\d\d$/.test(code)) return 'tucopramp.errors.http_5xx'
  return `tucopramp.errors.${code}`
}

// The server never sends a bare `rate_limited`: every 429 names its bucket
// (rate_limited_ip / _consumer / _wallet / _api_key).
export function isRateLimitedCode(code: string | null | undefined): boolean {
  return !!code && code.startsWith('rate_limited')
}
