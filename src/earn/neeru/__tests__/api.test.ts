import { FetchMock } from 'jest-fetch-mock'
import { adaptNeeruPosition, fetchNeeruPositions } from 'src/earn/neeru/api'
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

  it('adapts positions from the wire shape into the wallet-internal shape', async () => {
    const wirePosition = {
      positionId: 'earn:category-2',
      category: 2 as const,
      categoryLabel: 'sixtyDays',
      amount: '1000',
      accruedInterest: '5',
      rateValue: '1000000000000000000000000000',
      monthlyRatePercentage: 0.5,
      startTs: 1700000000,
      endTs: 1705184000,
      depositBlock: 70000000,
      depositTxHash: '0xabc',
      renewedFromPositionId: null,
      currentPayoutIfClosed: {
        amount: '1000',
        interest: '5',
        penaltyBps: 0,
        interestAfterPenalty: '5',
        total: '1005',
        isEarly: false,
      },
    }
    mockFetch.mockResponseOnce(
      JSON.stringify({
        data: { ...mockFixture.data, positions: [wirePosition] },
      }),
      { status: 200 }
    )

    const result = await runWithTimers(() =>
      fetchNeeruPositions({
        baseUrl: 'https://example.test',
        walletAddress: '0x' + 'a'.repeat(40),
      })
    )
    expect(result.positions).toHaveLength(1)
    expect(result.positions[0].category).toBe(2)
    expect(result.positions[0].categoryLabel).toBe('sixtyDays')
    expect(result.positions[0].amount).toBe('1000')
    expect(result.positions[0].currentPayoutIfClosed.amount).toBe('1000')
  })

  it('adaptNeeruPosition normalizes amount via BigNumber (dedupes trailing zeros)', () => {
    const adapted = adaptNeeruPosition({
      positionId: 'earn:category-1',
      category: 1 as const,
      categoryLabel: 'thirtyDays',
      amount: '111.00',
      accruedInterest: '0',
      rateValue: '1000000000000000000000000000',
      monthlyRatePercentage: 0.3,
      startTs: 0,
      endTs: 0,
      depositBlock: 0,
      depositTxHash: '0x0',
      renewedFromPositionId: null,
      currentPayoutIfClosed: {
        amount: '111.00',
        interest: '0',
        penaltyBps: 0,
        interestAfterPenalty: '0',
        total: '111.00',
        isEarly: false,
      },
    })
    expect(adapted.category).toBe(1)
    expect(adapted.categoryLabel).toBe('thirtyDays')
    expect(adapted.amount).toBe('111')
    expect(adapted.currentPayoutIfClosed.amount).toBe('111')
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
