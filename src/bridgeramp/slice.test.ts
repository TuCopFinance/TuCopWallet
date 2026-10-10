import { REHYDRATE } from 'redux-persist'
import reducer, {
  depositDetected,
  depositReady,
  depositSettled,
  initialState,
  swapBroadcast,
  swapConfirmed,
  swapFailed,
  swapReset,
  swapSubmitting,
} from 'src/bridgeramp/slice'

const submitting = swapSubmitting({
  flowId: 'flow-1',
  direction: 'copmToUsdc',
  amountIn: '800000000000000000000000',
  quotedAmountOut: '247338318',
  recipient: '0xe2d21f9bd38d4555c340395d31af39ee3b11a995',
})

describe('bridgeramp slice', () => {
  it('walks submitting -> broadcast -> confirmed and keeps the completed swap', () => {
    let state = reducer(initialState, submitting)
    expect(state.swap.status).toBe('submitting')
    expect(state.swap.flowId).toBe('flow-1')

    state = reducer(state, swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
    expect(state.swap.status).toBe('broadcast')
    expect(state.swap.swapTxHash).toBe('0x2')

    state = reducer(state, swapConfirmed({ confirmedAt: 1_791_600_000 }))
    expect(state.swap.status).toBe('confirmed')
    expect(state.lastCompletedSwap).toEqual({
      flowId: 'flow-1',
      direction: 'copmToUsdc',
      amountIn: '800000000000000000000000',
      quotedAmountOut: '247338318',
      recipient: '0xe2d21f9bd38d4555c340395d31af39ee3b11a995',
      swapTxHash: '0x2',
      confirmedAt: 1_791_600_000,
    })

    state = reducer(state, swapReset())
    expect(state.swap).toEqual(initialState.swap)
    expect(state.lastCompletedSwap?.swapTxHash).toBe('0x2')
  })

  it('records the error code on failure and clears it on the next attempt', () => {
    let state = reducer(initialState, submitting)
    state = reducer(state, swapFailed({ code: 'reverted' }))
    expect(state.swap.status).toBe('failed')
    expect(state.swap.errorCode).toBe('reverted')

    state = reducer(state, submitting)
    expect(state.swap.status).toBe('submitting')
    expect(state.swap.errorCode).toBeNull()
  })

  it('does not record a completed swap without a broadcast hash', () => {
    let state = reducer(initialState, submitting)
    state = reducer(state, swapConfirmed({ confirmedAt: 1 }))
    expect(state.lastCompletedSwap).toBeNull()
  })

  it('only rehydrates the last completed swap', () => {
    const persisted = {
      swap: { ...initialState.swap, status: 'broadcast', swapTxHash: '0x2' },
      lastCompletedSwap: {
        flowId: 'old',
        direction: 'usdcToCopm',
        amountIn: '1',
        quotedAmountOut: '2',
        recipient: '0xabc',
        swapTxHash: '0x9',
        confirmedAt: 5,
      },
    }
    const state = reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: { bridgeramp: persisted },
    } as any)
    expect(state.swap).toEqual(initialState.swap)
    expect(state.lastCompletedSwap?.swapTxHash).toBe('0x9')
  })
})

describe('bridgeramp deposit', () => {
  const account = { id: 'dep_1' } as any

  it('keeps the first baseline across account refreshes', () => {
    let state = reducer(initialState, depositReady({ account, usdcBaseline: '5' }))
    state = reducer(state, depositReady({ account, usdcBaseline: '105' }))
    expect(state.deposit.usdcBaseline).toBe('5')
  })

  it('tracks a detected deposit until it settles', () => {
    let state = reducer(initialState, depositReady({ account, usdcBaseline: '5' }))
    state = reducer(state, depositDetected({ usdcAmount: '100', flowId: 'f' }))
    expect(state.deposit.pending).toEqual({ usdcAmount: '100', flowId: 'f' })
    state = reducer(state, depositSettled({ usdcBaseline: '6' }))
    expect(state.deposit.pending).toBeNull()
    expect(state.deposit.usdcBaseline).toBe('6')
  })

  it('rehydrates the account, baseline and pending conversion', () => {
    const state = reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: {
        bridgeramp: {
          deposit: {
            status: 'creating',
            account,
            errorCode: null,
            errorRequestId: null,
            usdcBaseline: '5',
            pending: { usdcAmount: '100', flowId: 'f' },
          },
        },
      },
    } as any)
    expect(state.deposit).toEqual({
      status: 'ready',
      account,
      errorCode: null,
      errorRequestId: null,
      usdcBaseline: '5',
      pending: { usdcAmount: '100', flowId: 'f' },
    })
  })
})
