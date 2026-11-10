import { FETCH_TIMEOUT_DURATION } from 'src/config'
import {
  recordFailure,
  recordSuccess,
  shouldShortCircuit,
} from 'src/lib/circuitBreaker/circuitBreaker'
import { addRpcBreadcrumb } from 'src/sentry/breadcrumbs'
import { toBackendFallbackUrl } from 'src/web3/backendHosts'

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 250

// Circuit-breaker key is `${host}${pathname}` (query string intentionally
// excluded so that different query params on the same route do not fragment
// the failure counter). Path-level scoping prevents cross-endpoint
// contamination on shared hosts: a burst of 502s on `/hooks-api` no longer
// opens the breaker for `/api/prices/xaut` on the same tucop-backend host.
function extractCircuitKey(url: string): string | null {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffDelayMs(attempt: number): number {
  // 250ms * 2^attempt + up to 100ms jitter
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt)
  const jitter = Math.floor(Math.random() * 100)
  return base + jitter
}

// Bridge into the canonical rpc.call breadcrumb category. Stamps host-only
// URL so query strings never leak into Sentry, adds method + status +
// durationMs when known. Called on every retry (attempt attempt) so an
// eventual final failure lands with a trail of the retry cadence.
function addRetryBreadcrumb(
  url: string,
  method: string,
  data: { status?: number; error?: string; durationMs?: number }
): void {
  try {
    addRpcBreadcrumb(url, { method, ...data })
  } catch {
    // Sentry not initialized in tests; ignore.
  }
}

async function attemptFetch(
  url: string,
  options: RequestInit | null,
  duration: number
): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => {
    controller.abort()
  }, duration)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

// ---------- Backend host failover (VPS primary, Railway secondary) ----------
//
// Semantics agreed with the backend team (2026-11-10), bilateral:
//
//   GET/HEAD: failover on network error or any 5xx, EXCEPT a 503 whose body
//     carries code `proxy_disabled`. That one is the operator's kill switch
//     and MUST stay final on every method: failing over to the secondary
//     would mean the switch kills nothing. (Their summary table listed the
//     two 503s as failover-able for GET; their prose says proxy_disabled is
//     final. We implement the prose: the safe reading.)
//   POST/other mutating: failover ONLY on network error (the request never
//     got through) or a 503 with code `proxy_misconfigured` (the proxy
//     answers it BEFORE any upstream call, guaranteed not-processed). Never
//     on 502 `upstream_unavailable` (ambiguous: upstream may have processed
//     it) and never on passthrough 5xx, even though the ramp POSTs carry an
//     Idempotency-Key: other backend POSTs do not.
//   4xx: always final, never retried, never failed over.
//
// Only URLs on the effective PRIMARY backend origin are eligible
// (toBackendFallbackUrl returns null for everything else), and the fallback
// is a single attempt with no circuit-breaker bookkeeping: it is the
// emergency path, not a second first-class origin.
const FAILOVER_SAFE_503_CODES = new Set(['proxy_misconfigured'])
const NEVER_FAILOVER_CODE = 'proxy_disabled'

async function bodyCode(response: Response): Promise<string | null> {
  try {
    const parsed = await response.clone().json()
    return typeof parsed?.code === 'string' ? parsed.code : null
  } catch {
    return null
  }
}

async function resolveBackendFailoverUrl(
  url: string,
  method: string,
  outcome: { response: Response | null; error: unknown }
): Promise<string | null> {
  const fallbackUrl = toBackendFallbackUrl(url)
  if (!fallbackUrl) return null
  // Network error: the request never completed against the primary.
  if (!outcome.response) return fallbackUrl
  const status = outcome.response.status
  if (status < 500) return null
  const code = await bodyCode(outcome.response)
  if (code === NEVER_FAILOVER_CODE) return null
  const isMutating = method !== 'GET' && method !== 'HEAD'
  if (isMutating) {
    return status === 503 && code !== null && FAILOVER_SAFE_503_CODES.has(code) ? fallbackUrl : null
  }
  return fallbackUrl
}

/**
 * Fetch with timeout, retry on transient failures, per-endpoint circuit
 * breaker, and a one-shot host failover for the wallet's own backend.
 *
 * - Retries up to {@link MAX_ATTEMPTS} times on 5xx responses or network errors.
 * - Does NOT retry on 4xx (client errors are not transient).
 * - Exponential backoff between attempts: 250ms * 2^attempt + jitter.
 * - Circuit breaker keyed by `${host}${pathname}` (see `extractCircuitKey`):
 *   after sustained failures on a specific route the breaker opens and
 *   subsequent requests to that same route short-circuit with a synthetic
 *   503 until it closes. Other routes on the same host are unaffected.
 *
 * External signature is unchanged (returns `Promise<Response>`); callers do
 * not need updating.
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit | null = null,
  duration: number = FETCH_TIMEOUT_DURATION
): Promise<Response> => {
  const circuitKey = extractCircuitKey(url)

  if (circuitKey && shouldShortCircuit(circuitKey)) {
    return new Response('', {
      status: 503,
      statusText: 'Service Unavailable (circuit open)',
    })
  }

  const method = (options?.method ?? 'GET').toUpperCase()
  let lastResponse: Response | null = null
  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now()
    try {
      const response = await attemptFetch(url, options, duration)
      const durationMs = Date.now() - startedAt
      if (response.status >= 500) {
        lastResponse = response
        if (circuitKey) recordFailure(circuitKey)
        addRetryBreadcrumb(url, method, { status: response.status, durationMs })
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(backoffDelayMs(attempt))
          continue
        }
        // Retries exhausted on a 5xx: fall through to the failover check
        // below instead of returning here, so an eligible request gets its
        // one shot against the fallback host.
        break
      }
      // 2xx, 3xx, 4xx: do not retry. 2xx clears breaker, others leave as-is.
      if (response.status < 400 && circuitKey) recordSuccess(circuitKey)
      // Slow requests still land a breadcrumb so Sentry-side "receipt
      // timeout" issues can point at slow-but-2xx upstreams. 4xx get
      // logged unconditionally so a burst of 401s or 429s is visible.
      if (response.status >= 400 || durationMs > 5000) {
        addRetryBreadcrumb(url, method, { status: response.status, durationMs })
      }
      return response
    } catch (err) {
      const durationMs = Date.now() - startedAt
      lastError = err
      if (circuitKey) recordFailure(circuitKey)
      addRetryBreadcrumb(url, method, {
        error: (err as Error)?.message ?? String(err),
        durationMs,
      })
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffDelayMs(attempt))
        continue
      }
    }
  }

  const failoverUrl = await resolveBackendFailoverUrl(url, method, {
    response: lastResponse,
    error: lastError,
  })
  if (failoverUrl) {
    const startedAt = Date.now()
    try {
      const response = await attemptFetch(failoverUrl, options, duration)
      addRetryBreadcrumb(failoverUrl, method, {
        status: response.status,
        durationMs: Date.now() - startedAt,
      })
      return response
    } catch (err) {
      addRetryBreadcrumb(failoverUrl, method, {
        error: (err as Error)?.message ?? String(err),
        durationMs: Date.now() - startedAt,
      })
      // Both origins unreachable: surface the primary's outcome below, which
      // is the one the caller's error handling is written against.
    }
  }

  if (lastResponse) return lastResponse
  throw lastError
}
