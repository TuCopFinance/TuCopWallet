import * as Sentry from '@sentry/react-native'
import { FETCH_TIMEOUT_DURATION } from 'src/config'
import {
  recordFailure,
  recordSuccess,
  shouldShortCircuit,
} from 'src/lib/circuitBreaker/circuitBreaker'

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

function addRetryBreadcrumb(
  circuitKey: string | null,
  attempt: number,
  data: { status?: number; error?: string }
): void {
  try {
    Sentry.addBreadcrumb({
      category: 'fetch',
      level: 'warning',
      message: `Retry attempt ${attempt} for ${circuitKey ?? 'unknown'}`,
      data,
    })
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

/**
 * Fetch with timeout, retry on transient failures, and per-endpoint circuit
 * breaker.
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

  let lastResponse: Response | null = null
  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await attemptFetch(url, options, duration)
      if (response.status >= 500) {
        lastResponse = response
        if (circuitKey) recordFailure(circuitKey)
        addRetryBreadcrumb(circuitKey, attempt + 1, { status: response.status })
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(backoffDelayMs(attempt))
          continue
        }
        return response
      }
      // 2xx, 3xx, 4xx: do not retry. 2xx clears breaker, others leave as-is.
      if (response.status < 400 && circuitKey) recordSuccess(circuitKey)
      return response
    } catch (err) {
      lastError = err
      if (circuitKey) recordFailure(circuitKey)
      addRetryBreadcrumb(circuitKey, attempt + 1, {
        error: (err as Error)?.message ?? String(err),
      })
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffDelayMs(attempt))
        continue
      }
    }
  }

  if (lastResponse) return lastResponse
  throw lastError
}
