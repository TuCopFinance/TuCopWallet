import { FetchMock } from 'jest-fetch-mock'
import { fetchNeeruPositions } from 'src/earn/neeru/api'
import { _resetForTests } from 'src/lib/circuitBreaker/circuitBreaker'

const mockFetch = fetch as FetchMock

const mockFixture = {
  data: {
    address: '0x' + 'a'.repeat(40),
    positions: [],
    lastSyncedBlock: 70750000,
    lastSyncedAt: '2026-06-26T00:00:00Z',
  },
}

const runWithTimers = async <T>(fn: () => Promise<T>): Promise<T> => {
  const p = fn()
  // Drive backoff timers between retries without exhausting the abort timer.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    jest.advanceTimersByTime(2000)
  }
  return p
}

describe('fetchNeeruPositions', () => {
  beforeEach(() => {
    mockFetch.resetMocks()
    _resetForTests()
  })

  it('returns parsed data on 200', async () => {
    mockFetch.mockResponseOnce(JSON.stringify(mockFixture), { status: 200 })

    const result = await runWithTimers(() =>
      fetchNeeruPositions({
        baseUrl: 'https://example.test',
        walletAddress: '0x' + 'a'.repeat(40),
      })
    )
    expect(result.address).toBe('0x' + 'a'.repeat(40))
    expect(result.positions).toEqual([])
    expect(result.lastSyncedBlock).toBe(70750000)
  })

  it('throws on non-2xx', async () => {
    // 503 is treated as transient by fetchWithTimeout, so it retries 3 times
    mockFetch
      .mockResponseOnce('', { status: 503, statusText: 'Service Unavailable' })
      .mockResponseOnce('', { status: 503, statusText: 'Service Unavailable' })
      .mockResponseOnce('', { status: 503, statusText: 'Service Unavailable' })

    await expect(
      runWithTimers(() =>
        fetchNeeruPositions({
          baseUrl: 'https://example.test',
          walletAddress: '0x' + 'b'.repeat(40),
        })
      )
    ).rejects.toThrow(/503/)
  })
})
