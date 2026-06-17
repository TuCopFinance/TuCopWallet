import BigNumber from 'bignumber.js'
import reducer, {
  multiSwapStarted,
  multiSwapStepSucceeded,
  multiSwapStepFailed,
  multiSwapTransitionComplete,
  multiSwapCompleted,
  multiSwapCleared,
} from 'src/dollarsSpend/slice'
import { SpendStep } from 'src/dollarsSpend/types'

const stepUsat: SpendStep = {
  tokenId: 'celo-mainnet:usat',
  symbol: 'USAT',
  amountUsd: new BigNumber(30),
  amountTokenWhole: new BigNumber(30),
  decimals: 6,
}
const stepUsdm: SpendStep = {
  tokenId: 'celo-mainnet:usdm',
  symbol: 'USDm',
  amountUsd: new BigNumber(50),
  amountTokenWhole: new BigNumber(50),
  decimals: 18,
}

describe('dollarsSpend slice', () => {
  it('returns initial state', () => {
    expect(reducer(undefined, { type: 'init' })).toEqual({
      inFlight: null,
      transitioning: false,
    })
  })

  it('handles multiSwapStarted by setting inFlight with planned steps', () => {
    const state = reducer(undefined, multiSwapStarted({ steps: [stepUsat, stepUsdm] }))
    expect(state.inFlight).not.toBeNull()
    expect(state.inFlight?.plannedSteps).toEqual([stepUsat, stepUsdm])
    expect(state.inFlight?.completedSteps).toBe(0)
    expect(state.inFlight?.failedAtIndex).toBeNull()
    expect(state.inFlight?.lastError).toBeNull()
  })

  it('increments completedSteps on step success', () => {
    const startedState = reducer(undefined, multiSwapStarted({ steps: [stepUsat, stepUsdm] }))
    const next = reducer(startedState, multiSwapStepSucceeded({ index: 0 }))
    expect(next.inFlight?.completedSteps).toBe(1)
  })

  it('records failedAtIndex and lastError on step failure and sets transitioning', () => {
    const startedState = reducer(undefined, multiSwapStarted({ steps: [stepUsat, stepUsdm] }))
    const failed = reducer(
      startedState,
      multiSwapStepFailed({ index: 1, errorMessage: 'slippage exceeded' })
    )
    expect(failed.inFlight?.failedAtIndex).toBe(1)
    expect(failed.inFlight?.lastError).toBe('slippage exceeded')
    expect(failed.transitioning).toBe(true)
  })

  it('clears transitioning on multiSwapTransitionComplete', () => {
    const startedState = reducer(undefined, multiSwapStarted({ steps: [stepUsat] }))
    const failed = reducer(
      startedState,
      multiSwapStepFailed({ index: 0, errorMessage: 'tx reverted' })
    )
    expect(failed.transitioning).toBe(true)
    const settled = reducer(failed, multiSwapTransitionComplete())
    expect(settled.transitioning).toBe(false)
    expect(settled.inFlight?.failedAtIndex).toBe(0)
  })

  it('clears inFlight on multiSwapCompleted', () => {
    const startedState = reducer(undefined, multiSwapStarted({ steps: [stepUsat] }))
    const succeeded = reducer(startedState, multiSwapStepSucceeded({ index: 0 }))
    const completed = reducer(succeeded, multiSwapCompleted())
    expect(completed.inFlight).toBeNull()
  })

  it('clears inFlight on multiSwapCleared (user dismissed sheet)', () => {
    const startedState = reducer(undefined, multiSwapStarted({ steps: [stepUsat] }))
    const failed = reducer(
      startedState,
      multiSwapStepFailed({ index: 0, errorMessage: 'tx reverted' })
    )
    const cleared = reducer(failed, multiSwapCleared())
    expect(cleared.inFlight).toBeNull()
  })

  it('ignores stepSucceeded when no in-flight session', () => {
    const state = reducer(undefined, multiSwapStepSucceeded({ index: 0 }))
    expect(state).toEqual({ inFlight: null, transitioning: false })
  })

  it('ignores stepFailed when no in-flight session', () => {
    const state = reducer(undefined, multiSwapStepFailed({ index: 0, errorMessage: 'x' }))
    expect(state).toEqual({ inFlight: null, transitioning: false })
  })
})
