import { REHYDRATE } from 'redux-persist'
import reducer, {
  addOptimisticPosition,
  clearOptimisticPositions,
  closePositionFailure,
  closePositionStart,
  closePositionSuccess,
  emergencyCloseStart,
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
  initialState,
  markOptimisticPositionStale,
  removeOptimisticPosition,
} from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'

const fixturePosition: NeeruIndividualPosition = {
  positionId: '1234',
  category: 1,
  categoryLabel: '30 dias',
  amount: '10000',
  accruedInterest: '82.5',
  rateValue: '1000003290000000000000000000',
  monthlyRatePercentage: 1.0,
  startTs: 1700000000,
  endTs: 1702592000,
  depositBlock: 70594027,
  depositTxHash: '0x' + 'a'.repeat(64),
  renewedFromPositionId: null,
  currentPayoutIfClosed: {
    amount: '10000',
    interest: '82.5',
    penaltyBps: 2000,
    interestAfterPenalty: '66',
    total: '10066',
    isEarly: true,
  },
}

const optimisticFixture = (txHash: string): NeeruIndividualPosition => ({
  ...fixturePosition,
  positionId: `optimistic:${txHash}`,
  depositTxHash: txHash,
  optimistic: true,
  staleOptimistic: false,
})

describe('neeru slice', () => {
  it('starts in idle state', () => {
    expect(initialState.fetchStatus).toBe('idle')
    expect(initialState.positions).toEqual([])
    expect(initialState.optimisticPositions).toEqual([])
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
    state = reducer(
      state,
      closePositionFailure({ positionId: '1234', error: 'wallet-error-signal' })
    )
    expect(state.closeStatus).toBe('error')
    expect(state.lastError).toBe('wallet-error-signal')
  })

  it('emergencyCloseStart sets loading + closingPositionId', () => {
    const state = reducer(initialState, emergencyCloseStart({ positionId: '99' }))
    expect(state.closeStatus).toBe('loading')
    expect(state.closingPositionId).toBe('99')
    expect(state.lastError).toBeNull()
  })

  describe('optimistic positions', () => {
    const txA = '0x' + '1'.repeat(64)
    const txB = '0x' + '2'.repeat(64)

    it('addOptimisticPosition appends when new and replaces when txHash matches', () => {
      let state = reducer(initialState, addOptimisticPosition(optimisticFixture(txA)))
      expect(state.optimisticPositions).toHaveLength(1)
      expect(state.optimisticPositions[0].depositTxHash).toBe(txA)

      // Second deposit with a different txHash appends
      state = reducer(state, addOptimisticPosition(optimisticFixture(txB)))
      expect(state.optimisticPositions).toHaveLength(2)

      // Same txHash with different amount replaces in place
      const updated = { ...optimisticFixture(txA), amount: '99999' }
      state = reducer(state, addOptimisticPosition(updated))
      expect(state.optimisticPositions).toHaveLength(2)
      expect(state.optimisticPositions.find((p) => p.depositTxHash === txA)?.amount).toBe('99999')
    })

    it('removeOptimisticPosition filters by depositTxHash', () => {
      let state = reducer(initialState, addOptimisticPosition(optimisticFixture(txA)))
      state = reducer(state, addOptimisticPosition(optimisticFixture(txB)))
      state = reducer(state, removeOptimisticPosition({ depositTxHash: txA }))
      expect(state.optimisticPositions).toHaveLength(1)
      expect(state.optimisticPositions[0].depositTxHash).toBe(txB)
    })

    it('markOptimisticPositionStale flips staleOptimistic on matching entry only', () => {
      let state = reducer(initialState, addOptimisticPosition(optimisticFixture(txA)))
      state = reducer(state, addOptimisticPosition(optimisticFixture(txB)))
      state = reducer(state, markOptimisticPositionStale({ depositTxHash: txA }))
      const a = state.optimisticPositions.find((p) => p.depositTxHash === txA)
      const b = state.optimisticPositions.find((p) => p.depositTxHash === txB)
      expect(a?.staleOptimistic).toBe(true)
      expect(b?.staleOptimistic).toBe(false)
    })

    it('clearOptimisticPositions wipes the array', () => {
      let state = reducer(initialState, addOptimisticPosition(optimisticFixture(txA)))
      state = reducer(state, addOptimisticPosition(optimisticFixture(txB)))
      state = reducer(state, clearOptimisticPositions())
      expect(state.optimisticPositions).toEqual([])
    })

    it('REHYDRATE resets optimisticPositions even when persisted payload includes them', () => {
      const rehydrate = {
        type: REHYDRATE,
        key: 'root',
        payload: {
          neeru: {
            ...initialState,
            positions: [fixturePosition],
            optimisticPositions: [optimisticFixture(txA)],
          },
        },
      }
      const state = reducer(initialState, rehydrate as any)
      expect(state.positions).toEqual([fixturePosition])
      expect(state.optimisticPositions).toEqual([])
    })
  })
})
