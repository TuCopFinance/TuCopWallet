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
})
