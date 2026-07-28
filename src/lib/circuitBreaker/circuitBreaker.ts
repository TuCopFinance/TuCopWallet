/**
 * Per-key circuit breaker.
 *
 * Tracks recent failures per key. After {@link FAILURE_THRESHOLD} failures
 * within {@link FAILURE_WINDOW_MS}, the breaker opens for {@link OPEN_DURATION_MS}.
 * While open, callers should short-circuit instead of dispatching the request.
 *
 * The key is an opaque string chosen by the caller. `fetchWithTimeout`
 * historically used the URL host (e.g. "api.example.com") but that
 * contaminated unrelated endpoints: a burst of 502s on `/hooks-api` would
 * open the breaker for `/api/prices/xaut` on the same host. `fetchWithTimeout`
 * now uses `${host}${pathname}` so failures on one route do not affect
 * others; see `extractCircuitKey` in `src/utils/fetchWithTimeout.ts`.
 *
 * State is held in a module-level Map keyed by the caller-supplied string.
 * Exported {@link _resetForTests} resets state between unit tests.
 */

export const FAILURE_THRESHOLD = 5
export const FAILURE_WINDOW_MS = 60_000
export const OPEN_DURATION_MS = 30_000

interface KeyState {
  failures: number[]
  openedAt: number | null
}

const state = new Map<string, KeyState>()

function getOrCreate(key: string): KeyState {
  let entry = state.get(key)
  if (!entry) {
    entry = { failures: [], openedAt: null }
    state.set(key, entry)
  }
  return entry
}

function prune(entry: KeyState, now: number): void {
  const cutoff = now - FAILURE_WINDOW_MS
  entry.failures = entry.failures.filter((t) => t >= cutoff)
}

/**
 * True if requests for this key should be short-circuited.
 * Auto-closes the breaker once the open duration has elapsed.
 */
export function shouldShortCircuit(key: string): boolean {
  const entry = state.get(key)
  if (!entry || entry.openedAt === null) return false
  const now = Date.now()
  if (now - entry.openedAt >= OPEN_DURATION_MS) {
    entry.openedAt = null
    entry.failures = []
    return false
  }
  return true
}

/**
 * Record a failed request under `key`. If the failure count within the
 * rolling window reaches the threshold, the breaker opens.
 */
export function recordFailure(key: string): void {
  const entry = getOrCreate(key)
  const now = Date.now()
  if (entry.openedAt !== null) return
  entry.failures.push(now)
  prune(entry, now)
  if (entry.failures.length >= FAILURE_THRESHOLD) {
    entry.openedAt = now
  }
}

/**
 * Record a successful request. Clears recent failure history and closes the
 * breaker if it was open.
 */
export function recordSuccess(key: string): void {
  const entry = state.get(key)
  if (!entry) return
  entry.failures = []
  entry.openedAt = null
}

/** Test-only helper to clear all state between cases. */
export function _resetForTests(): void {
  state.clear()
}
