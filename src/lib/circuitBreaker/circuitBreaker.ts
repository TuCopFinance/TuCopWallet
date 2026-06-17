/**
 * Per-host circuit breaker.
 *
 * Tracks recent failures per host. After {@link FAILURE_THRESHOLD} failures
 * within {@link FAILURE_WINDOW_MS}, the breaker opens for {@link OPEN_DURATION_MS}.
 * While open, callers should short-circuit instead of dispatching the request.
 *
 * State is held in a module-level Map keyed by host (e.g. "api.example.com").
 * Exported {@link _resetForTests} resets state between unit tests.
 */

export const FAILURE_THRESHOLD = 5
export const FAILURE_WINDOW_MS = 60_000
export const OPEN_DURATION_MS = 30_000

interface HostState {
  failures: number[]
  openedAt: number | null
}

const state = new Map<string, HostState>()

function getOrCreate(host: string): HostState {
  let entry = state.get(host)
  if (!entry) {
    entry = { failures: [], openedAt: null }
    state.set(host, entry)
  }
  return entry
}

function prune(entry: HostState, now: number): void {
  const cutoff = now - FAILURE_WINDOW_MS
  entry.failures = entry.failures.filter((t) => t >= cutoff)
}

/**
 * True if requests to this host should be short-circuited.
 * Auto-closes the breaker once the open duration has elapsed.
 */
export function shouldShortCircuit(host: string): boolean {
  const entry = state.get(host)
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
 * Record a failed request to `host`. If the failure count within the rolling
 * window reaches the threshold, the breaker opens.
 */
export function recordFailure(host: string): void {
  const entry = getOrCreate(host)
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
export function recordSuccess(host: string): void {
  const entry = state.get(host)
  if (!entry) return
  entry.failures = []
  entry.openedAt = null
}

/** Test-only helper to clear all host state between cases. */
export function _resetForTests(): void {
  state.clear()
}
