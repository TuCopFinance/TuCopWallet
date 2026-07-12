import {
  neeruClosingPositionIdSelector,
  neeruFetchStatusSelector,
  neeruPositionsByCategorySelector,
  neeruPositionsSelector,
} from 'src/earn/neeru/selectors'
import { initialState as initialNeeruState } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'

const txHash = (n: number): string => '0x' + n.toString(16).padStart(64, '0')

const make = (
  id: string,
  category: 0 | 1 | 2 | 3,
  overrides: Partial<NeeruIndividualPosition> = {}
): NeeruIndividualPosition => ({
  positionId: id,
  category,
  categoryLabel: '',
  amount: '100',
  accruedInterest: '1',
  rateValue: '0',
  monthlyRatePercentage: 0,
  startTs: 0,
  endTs: 0,
  depositBlock: 0,
  depositTxHash: txHash(Number(id) || 1),
  renewedFromPositionId: null,
  currentPayoutIfClosed: {
    amount: '100',
    interest: '1',
    penaltyBps: 0,
    interestAfterPenalty: '1',
    total: '101',
    isEarly: false,
  },
  ...overrides,
})

const buildState = (overrides: Partial<typeof initialNeeruState>) =>
  ({ neeru: { ...initialNeeruState, ...overrides } }) as any

describe('neeru selectors', () => {
  it('returns fetch status', () => {
    expect(neeruFetchStatusSelector(buildState({ fetchStatus: 'loading' }))).toBe('loading')
  })
  it('groups positions by category', () => {
    const state = buildState({
      positions: [make('1', 0), make('2', 1), make('3', 1)],
    })
    const grouped = neeruPositionsByCategorySelector(state)
    expect(grouped[0]).toHaveLength(1)
    expect(grouped[1]).toHaveLength(2)
    expect(grouped[2]).toHaveLength(0)
    expect(grouped[3]).toHaveLength(0)
  })
  it('returns closingPositionId', () => {
    expect(neeruClosingPositionIdSelector(buildState({ closingPositionId: '99' }))).toBe('99')
  })

  describe('optimistic merge', () => {
    const backendOnly = make('100', 1, { depositTxHash: txHash(100) })
    const optimisticOnly = make('optimistic:0x...', 2, {
      depositTxHash: txHash(200),
      optimistic: true,
    })
    const optimisticThatBackendCaughtUpWith = make('optimistic:0x...', 3, {
      depositTxHash: txHash(100),
      optimistic: true,
    })

    it('returns backend positions as-is when no optimistic entries', () => {
      const state = buildState({ positions: [backendOnly], optimisticPositions: [] })
      expect(neeruPositionsSelector(state)).toEqual([backendOnly])
    })

    it('appends optimistic positions whose txHash is not in backend list', () => {
      const state = buildState({
        positions: [backendOnly],
        optimisticPositions: [optimisticOnly],
      })
      const merged = neeruPositionsSelector(state)
      expect(merged).toHaveLength(2)
      expect(merged).toEqual([backendOnly, optimisticOnly])
    })

    it('drops optimistic positions whose txHash matches a backend position (backend wins)', () => {
      const state = buildState({
        positions: [backendOnly],
        optimisticPositions: [optimisticThatBackendCaughtUpWith, optimisticOnly],
      })
      const merged = neeruPositionsSelector(state)
      expect(merged).toHaveLength(2)
      expect(merged.map((p) => p.depositTxHash)).toEqual([txHash(100), txHash(200)])
      // The collided optimistic (also at txHash(100)) was dropped
      expect(merged.find((p) => p.optimistic === true)?.depositTxHash).toBe(txHash(200))
    })

    it('dedupe by txHash is case-insensitive', () => {
      const lowerHash = '0x' + 'a'.repeat(64)
      const upperHash = '0x' + 'A'.repeat(64)
      const backend = make('1', 1, { depositTxHash: lowerHash })
      const optimistic = make('optimistic', 1, {
        depositTxHash: upperHash,
        optimistic: true,
      })
      const state = buildState({ positions: [backend], optimisticPositions: [optimistic] })
      const merged = neeruPositionsSelector(state)
      expect(merged).toEqual([backend])
    })

    it('optimistic-only state surfaces the optimistic position in byCategory grouping', () => {
      const state = buildState({
        positions: [],
        optimisticPositions: [optimisticOnly],
      })
      const grouped = neeruPositionsByCategorySelector(state)
      expect(grouped[2]).toEqual([optimisticOnly])
      expect(grouped[0]).toEqual([])
    })
  })
})
