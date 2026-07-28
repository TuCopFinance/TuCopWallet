// HTTP-class error classification for captureBusinessError's errorCode field.
// Safe by construction: never leaks contract selectors, backend error codes,
// or user data. Buckets the error into an operational family we can alert on
// (network vs backend 5xx vs bad request vs parse). Aligned with backend's
// 2026-07-26 review of the Sentry schema.

type HttpErrorClass =
  | 'network_error' // fetch rejected, DNS, connection refused, offline
  | 'timeout' // AbortError from fetchWithTimeout / any explicit timeout
  | 'http_4xx' // backend returned 400-499 (client-side classification)
  | 'http_5xx' // backend returned 500-599 (server flakiness)
  | 'parse_error' // response body could not be parsed (JSON malformed, etc)

// Confidence-based revert tag for errors thrown by enforceReceiptsOrThrow.
// Each value corresponds to one cell of the wallet-vs-backend cross-check
// matrix agreed with backend on 2026-07-25 (see saga.ts resolveRevert).
// Emitting these as errorCode gives operational signal (spikes in
// revert_unknown indicate the backend /tx/status endpoint degraded) without
// exposing any contract-level selector.
type RevertConfidenceClass =
  | 'revert_confirmed'
  | 'revert_transient'
  | 'revert_live_only'
  | 'revert_unknown'

// Reads err.cause.confidence when the error was raised by
// enforceReceiptsOrThrow. Returns null otherwise so callers can fall back
// to classifyHttpError.
export function classifyRevertConfidence(error: unknown): RevertConfidenceClass | null {
  if (!(error instanceof Error)) return null
  const cause = (error as { cause?: { confidence?: unknown } }).cause
  const c = cause?.confidence
  if (c === 'confirmed') return 'revert_confirmed'
  if (c === 'transient') return 'revert_transient'
  if (c === 'live-only') return 'revert_live_only'
  if (c === 'unknown') return 'revert_unknown'
  return null
}

// Anything not obviously classifiable falls back to network_error so we do
// not accidentally treat an unknown failure as "no error".
export function classifyHttpError(error: unknown): HttpErrorClass {
  if (!(error instanceof Error)) return 'network_error'
  const msg = error.message ?? ''
  const name = error.name ?? ''

  // Timeouts: AbortController.abort() surfaces as DOMException 'AbortError'
  // on modern React Native, or plain 'AbortError' from node-fetch fallbacks.
  if (
    name === 'AbortError' ||
    msg.includes('AbortError') ||
    msg.toLowerCase().includes('timeout')
  ) {
    return 'timeout'
  }

  // Parse errors from response.json() / JSON.parse.
  if (
    name === 'SyntaxError' ||
    msg.includes('Unexpected end of JSON input') ||
    msg.includes('Unexpected token')
  ) {
    return 'parse_error'
  }

  // Explicit HTTP status code embedded in the thrown message. Every fetch
  // wrapper in the wallet throws with `${status} ${statusText}` on !ok.
  const statusMatch = msg.match(/\b(\d{3})\b/)
  if (statusMatch) {
    const status = Number(statusMatch[1])
    if (status >= 500 && status < 600) return 'http_5xx'
    if (status >= 400 && status < 500) return 'http_4xx'
  }

  // Common React Native network-layer failures.
  if (
    msg.includes('Network request failed') ||
    msg.includes('network request') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('The network connection was lost')
  ) {
    return 'network_error'
  }

  return 'network_error'
}
