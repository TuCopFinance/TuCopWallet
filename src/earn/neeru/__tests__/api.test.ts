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

  it('adapts positions with new wire names (amount/category/categoryLabel)', async () => {
    const newWirePosition = {
      positionId: '0xfondo:category-2',
      category: 2,
      categoryLabel: 'sixtyDays',
      amount: '1000',
      accruedInterest: '5',
      dailyRateRay: '1000000000000000000000000000',
      monthlyRatePercentage: 0.5,
      startTs: 1700000000,
      maturityTs: 1705184000,
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
        data: { ...mockFixture.data, positions: [newWirePosition] },
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
    expect(result.positions[0].tranche).toBe(2)
    expect(result.positions[0].trancheLabel).toBe('sixtyDays')
    expect(result.positions[0].principal).toBe('1000')
    expect(result.positions[0].currentPayoutIfClosed.principal).toBe('1000')
  })

  it('adapts positions with legacy wire names (principal/tranche/trancheLabel)', async () => {
    // Kept because backend recommended dual-read during rollout; if a cached
    // response predates the wire rename this branch keeps the position usable.
    const oldWirePosition = {
      positionId: '0xfondo:tranche-3',
      tranche: 3,
      trancheLabel: 'ninetyDays',
      principal: '500',
      accruedInterest: '2',
      dailyRateRay: '1000000000000000000000000000',
      monthlyRatePercentage: 0.75,
      startTs: 1700000000,
      maturityTs: 1707776000,
      depositBlock: 70000001,
      depositTxHash: '0xdef',
      renewedFromPositionId: null,
      currentPayoutIfClosed: {
        principal: '500',
        interest: '2',
        penaltyBps: 0,
        interestAfterPenalty: '2',
        total: '502',
        isEarly: false,
      },
    }
    mockFetch.mockResponseOnce(
      JSON.stringify({
        data: { ...mockFixture.data, positions: [oldWirePosition] },
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
    expect(result.positions[0].tranche).toBe(3)
    expect(result.positions[0].trancheLabel).toBe('ninetyDays')
    expect(result.positions[0].principal).toBe('500')
  })

  it('adaptNeeruPosition prefers new wire names when both are present', () => {
    const adapted = adaptNeeruPosition({
      positionId: '0xfondo:category-1',
      tranche: 3,
      category: 1,
      trancheLabel: 'old',
      categoryLabel: 'new',
      principal: '999',
      amount: '111',
      accruedInterest: '0',
      dailyRateRay: '1000000000000000000000000000',
      monthlyRatePercentage: 0.3,
      startTs: 0,
      maturityTs: 0,
      depositBlock: 0,
      depositTxHash: '0x0',
      renewedFromPositionId: null,
      currentPayoutIfClosed: {
        amount: '111',
        principal: '999',
        interest: '0',
        penaltyBps: 0,
        interestAfterPenalty: '0',
        total: '111',
        isEarly: false,
      },
    })
    expect(adapted.tranche).toBe(1)
    expect(adapted.trancheLabel).toBe('new')
    expect(adapted.principal).toBe('111')
    expect(adapted.currentPayoutIfClosed.principal).toBe('111')
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
