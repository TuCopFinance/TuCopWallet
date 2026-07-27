import {
  _resetForTests,
  FAILURE_THRESHOLD,
  OPEN_DURATION_MS,
  recordFailure,
  recordSuccess,
  shouldShortCircuit,
} from 'src/lib/circuitBreaker/circuitBreaker'

describe('circuitBreaker', () => {
  beforeEach(() => {
    _resetForTests()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('starts closed for unknown hosts', () => {
    expect(shouldShortCircuit('api.example.test')).toBe(false)
  })

  it('opens after threshold failures', () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      recordFailure('api.example.test')
    }
    expect(shouldShortCircuit('api.example.test')).toBe(false)
    recordFailure('api.example.test')
    expect(shouldShortCircuit('api.example.test')).toBe(true)
  })

  it('isolates state per host', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordFailure('a.test')
    }
    expect(shouldShortCircuit('a.test')).toBe(true)
    expect(shouldShortCircuit('b.test')).toBe(false)
  })

  it('auto-closes after open duration elapses', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordFailure('api.example.test')
    }
    expect(shouldShortCircuit('api.example.test')).toBe(true)

    jest.advanceTimersByTime(OPEN_DURATION_MS + 1)
    expect(shouldShortCircuit('api.example.test')).toBe(false)
  })

  it('recordSuccess clears failure history and closes the breaker', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordFailure('api.example.test')
    }
    expect(shouldShortCircuit('api.example.test')).toBe(true)

    recordSuccess('api.example.test')
    expect(shouldShortCircuit('api.example.test')).toBe(false)
  })

  it('old failures outside the rolling window do not count', () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      recordFailure('api.example.test')
    }
    jest.advanceTimersByTime(61_000) // > FAILURE_WINDOW_MS
    recordFailure('api.example.test')
    // Only 1 fresh failure -> still closed
    expect(shouldShortCircuit('api.example.test')).toBe(false)
  })

  it('isolates the breaker per key (host+path), not per host', () => {
    // Simulates the real problem this refactor addresses: 5 failures on
    // `/hooks-api` on tucop-backend used to open the breaker for the whole
    // host, blocking unrelated calls to `/api/prices/xaut` on the same host.
    // After the switch to `${host}${pathname}` keys, the two routes are
    // isolated even though they share a host component in the string.
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordFailure('tucop-backend-production.up.railway.app/hooks-api/triggerShortcut')
    }
    expect(
      shouldShortCircuit('tucop-backend-production.up.railway.app/hooks-api/triggerShortcut')
    ).toBe(true)
    expect(shouldShortCircuit('tucop-backend-production.up.railway.app/api/prices/xaut')).toBe(
      false
    )
    expect(shouldShortCircuit('tucop-backend-production.up.railway.app/api/positions')).toBe(false)
  })

  it('recordSuccess on one key does not affect another key', () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      recordFailure('host.test/pathA')
      recordFailure('host.test/pathB')
    }
    expect(shouldShortCircuit('host.test/pathA')).toBe(true)
    expect(shouldShortCircuit('host.test/pathB')).toBe(true)

    recordSuccess('host.test/pathA')
    expect(shouldShortCircuit('host.test/pathA')).toBe(false)
    // pathB is still open, success on pathA must not have cleared it.
    expect(shouldShortCircuit('host.test/pathB')).toBe(true)
  })
})
