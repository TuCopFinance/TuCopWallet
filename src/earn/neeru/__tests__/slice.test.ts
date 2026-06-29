import reducer, {
  closePositionFailure,
  closePositionStart,
  closePositionSuccess,
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
  initialState,
} from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'

const fixturePosition: NeeruIndividualPosition = {
  positionId: '1234',
  tranche: 1,
  trancheLabel: '30 dias',
  principal: '10000',
  accruedInterest: '82.5',
  dailyRateRay: '1000003290000000000000000000',
  monthlyRatePercentage: 1.0,
  startTs: 1700000000,
  maturityTs: 1702592000,
  depositBlock: 70594027,
  depositTxHash: '0x' + 'a'.repeat(64),
  renewedFromPositionId: null,
  currentPayoutIfClosed: {
    principal: '10000',
    interest: '82.5',
    penaltyBps: 2000,
    interestAfterPenalty: '66',
    total: '10066',
    isEarly: true,
  },
}

describe('neeru slice', () => {
  it('starts in idle state', () => {
    expect(initialState.fetchStatus).toBe('idle')
    expect(initialState.positions).toEqual([])
    expect(initialState.closingPositionId).toBeNull()
  })

  it('handles fetchPositionsStart -> fetchPositionsSuccess', () => {
    let state = reducer(initialState, fetchPositionsStart())
    expect(state.fetchStatus).toBe('loading')
    state = reducer(
      state,
      fetchPositionsSuccess({
        positions: [fixturePosition],
        lastSyncedBlock: 70750000,
        lastSyncedAt: '2026-06-26T00:00:00Z',
      })
    )
    expect(state.fetchStatus).toBe('success')
    expect(state.positions).toEqual([fixturePosition])
    expect(state.lastSyncedBlock).toBe(70750000)
  })

  it('handles fetchPositionsFailure', () => {
    const state = reducer(initialState, fetchPositionsFailure({ error: 'network' }))
    expect(state.fetchStatus).toBe('error')
    expect(state.lastError).toBe('network')
  })

  it('handles close flow lifecycle - success removes closed position from cache', () => {
    const withPosition = reducer(
      initialState,
      fetchPositionsSuccess({
        positions: [fixturePosition],
        lastSyncedBlock: 70750000,
        lastSyncedAt: '2026-06-26T00:00:00Z',
      })
    )
    let state = reducer(withPosition, closePositionStart({ positionId: '1234' }))
    expect(state.closingPositionId).toBe('1234')
    expect(state.closeStatus).toBe('loading')
    state = reducer(state, closePositionSuccess({ positionId: '1234' }))
    expect(state.closingPositionId).toBeNull()
    expect(state.closeStatus).toBe('success')
    expect(state.positions).toEqual([])
  })

  it('handles closePositionFailure', () => {
    let state = reducer(initialState, closePositionStart({ positionId: '1234' }))
    state = reducer(state, closePositionFailure({ positionId: '1234', error: 'InterestPoolLow' }))
    expect(state.closeStatus).toBe('error')
    expect(state.lastError).toBe('InterestPoolLow')
  })
})
