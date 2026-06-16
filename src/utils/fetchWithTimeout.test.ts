import { FetchMock } from 'jest-fetch-mock'
import { _resetForTests } from 'src/lib/circuitBreaker/circuitBreaker'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'

const mockFetch = fetch as FetchMock

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    mockFetch.resetMocks()
    _resetForTests()
  })

  it('returns response if request completes within timeout', async () => {
    mockFetch.mockResponseOnce('success')

    const response = await fetchWithTimeout('https://does-not-matter')

    expect(response.ok).toEqual(true)
    expect(await response.text()).toEqual('success')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('https://does-not-matter', {
      signal: expect.any(AbortSignal),
    })
  })

  it('returns response for request with options if it completes within timeout', async () => {
    mockFetch.mockResponseOnce('success')

    const response = await fetchWithTimeout('https://does-not-matter', {
      method: 'POST',
      body: JSON.stringify({ some: 'body' }),
    })

    expect(response.ok).toEqual(true)
    expect(await response.text()).toEqual('success')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith('https://does-not-matter', {
      method: 'POST',
      body: JSON.stringify({ some: 'body' }),
      signal: expect.any(AbortSignal),
    })
  })

  it('throws if request does not complete within timeout (after retries)', async () => {
    // Each attempt aborts due to the 1000ms timeout; with retry, we expect 3
    // attempts before the final rejection.
    const slowResponder = async () => {
      jest.advanceTimersByTime(2000) // timeout is 1000
      return 'success'
    }
    mockFetch
      .mockResponseOnce(slowResponder)
      .mockResponseOnce(slowResponder)
      .mockResponseOnce(slowResponder)

    const p = fetchWithTimeout('https://does-not-matter', null, 1000)
    // Drain microtasks + advance backoff timers between attempts.
    const drain = (async () => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve()
        jest.advanceTimersByTime(2000)
      }
    })()
    await expect(p).rejects.toThrow()
    await drain

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockFetch).toHaveBeenCalledWith('https://does-not-matter', {
      signal: expect.any(AbortSignal),
    })
  })
})

describe('fetchWithTimeout with retry', () => {
  beforeEach(() => {
    mockFetch.resetMocks()
    _resetForTests()
  })

  const runWithTimers = async (fn: () => Promise<Response>): Promise<Response> => {
    const p = fn()
    // Backoff delays between attempts are 250ms * 2^attempt + jitter (< 100ms).
    // Advance time enough to fire backoff timers while leaving the long abort
    // timer (15s default) untouched - otherwise we'd abort in-flight requests
    // and trigger spurious retries.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve()
      jest.advanceTimersByTime(2000)
    }
    return p
  }

  it('retries up to 3 times on 5xx then returns the 2xx', async () => {
    mockFetch
      .mockResponseOnce('', { status: 503 })
      .mockResponseOnce('', { status: 503 })
      .mockResponseOnce('{"ok":true}', { status: 200 })

    const res = await runWithTimers(() => fetchWithTimeout('https://retry5xx.test/x'))
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(res.status).toBe(200)
  })

  it('does not retry on 4xx', async () => {
    mockFetch.mockResponseOnce('', { status: 400 })
    const res = await runWithTimers(() => fetchWithTimeout('https://no-retry-4xx.test/x'))
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(400)
  })

  it('retries on network error and returns success', async () => {
    mockFetch
      .mockRejectOnce(new Error('network request failed'))
      .mockResponseOnce('{"ok":true}', { status: 200 })
    const res = await runWithTimers(() => fetchWithTimeout('https://retry-net.test/x'))
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(200)
  })

  it('gives up after 3 attempts and returns last 5xx response', async () => {
    mockFetch
      .mockResponseOnce('', { status: 503 })
      .mockResponseOnce('', { status: 502 })
      .mockResponseOnce('', { status: 500 })
    const res = await runWithTimers(() => fetchWithTimeout('https://final-5xx.test/x'))
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(res.status).toBe(500)
  })

  it('short-circuits with 503 once the breaker is open for that host', async () => {
    // Trip the breaker: 5 failed runs (each returning 5xx 3 times) -> 5 recorded failures
    mockFetch.mockResponse('', { status: 503 })
    for (let i = 0; i < 5; i++) {
      await runWithTimers(() => fetchWithTimeout('https://tripped.test/x'))
    }
    const callsBefore = mockFetch.mock.calls.length

    // Next call should short-circuit: no new fetch invocation.
    const res = await fetchWithTimeout('https://tripped.test/x')
    expect(res.status).toBe(503)
    expect(mockFetch.mock.calls.length).toBe(callsBefore)
  })
})
