import {
  neeruClosingPositionIdSelector,
  neeruFetchStatusSelector,
  neeruPositionsByTrancheSelector,
} from 'src/earn/neeru/selectors'
import { initialState as initialNeeruState } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'

const make = (id: string, tranche: 0 | 1 | 2 | 3): NeeruIndividualPosition => ({
  positionId: id,
  tranche,
  trancheLabel: '',
  principal: '100',
  accruedInterest: '1',
  dailyRateRay: '0',
  monthlyRatePercentage: 0,
  startTs: 0,
  maturityTs: 0,
  depositBlock: 0,
  depositTxHash: '0x' + 'a'.repeat(64),
  renewedFromPositionId: null,
  currentPayoutIfClosed: {
    principal: '100',
    interest: '1',
    penaltyBps: 0,
    interestAfterPenalty: '1',
    total: '101',
    isEarly: false,
  },
})

const buildState = (overrides: Partial<typeof initialNeeruState>) =>
  ({ neeru: { ...initialNeeruState, ...overrides } }) as any

describe('neeru selectors', () => {
  it('returns fetch status', () => {
    expect(neeruFetchStatusSelector(buildState({ fetchStatus: 'loading' }))).toBe('loading')
  })
  it('groups positions by tranche', () => {
    const state = buildState({
      positions: [make('1', 0), make('2', 1), make('3', 1)],
    })
    const grouped = neeruPositionsByTrancheSelector(state)
    expect(grouped[0]).toHaveLength(1)
    expect(grouped[1]).toHaveLength(2)
    expect(grouped[2]).toHaveLength(0)
    expect(grouped[3]).toHaveLength(0)
  })
  it('returns closingPositionId', () => {
    expect(neeruClosingPositionIdSelector(buildState({ closingPositionId: '99' }))).toBe('99')
  })
})
