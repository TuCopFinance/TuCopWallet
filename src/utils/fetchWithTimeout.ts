import * as Sentry from '@sentry/react-native'
import { FETCH_TIMEOUT_DURATION } from 'src/config'
import {
  recordFailure,
  recordSuccess,
  shouldShortCircuit,
} from 'src/lib/circuitBreaker/circuitBreaker'

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 250

function extractHost(url: string): string | null {
  try {
    return new URL(url).host
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
  host: string | null,
  attempt: number,
  data: { status?: number; error?: string }
): void {
  try {
    Sentry.addBreadcrumb({
      category: 'fetch',
      level: 'warning',
      message: `Retry attempt ${attempt} for ${host ?? 'unknown'}`,
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
 * Fetch with timeout, retry on transient failures, and per-host circuit breaker.
 *
 * - Retries up to {@link MAX_ATTEMPTS} times on 5xx responses or network errors.
 * - Does NOT retry on 4xx (client errors are not transient).
 * - Exponential backoff between attempts: 250ms * 2^attempt + jitter.
 * - Per-host circuit breaker: after sustained failures the breaker opens and
 *   subsequent requests short-circuit with a synthetic 503 until it closes.
 *
 * External signature is unchanged (returns `Promise<Response>`); callers do
 * not need updating.
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit | null = null,
  duration: number = FETCH_TIMEOUT_DURATION
): Promise<Response> => {
  const host = extractHost(url)

  if (host && shouldShortCircuit(host)) {
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
        if (host) recordFailure(host)
        addRetryBreadcrumb(host, attempt + 1, { status: response.status })
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(backoffDelayMs(attempt))
          continue
        }
        return response
      }
      // 2xx, 3xx, 4xx: do not retry. 2xx clears breaker, others leave as-is.
      if (response.status < 400 && host) recordSuccess(host)
      return response
    } catch (err) {
      lastError = err
      if (host) recordFailure(host)
      addRetryBreadcrumb(host, attempt + 1, { error: (err as Error)?.message ?? String(err) })
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffDelayMs(attempt))
        continue
      }
    }
  }

  if (lastResponse) return lastResponse
  throw lastError
}
