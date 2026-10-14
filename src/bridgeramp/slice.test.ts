import { REHYDRATE } from 'redux-persist'
import reducer, {
  depositBaselineUpdated,
  depositConvertAmountAdjusted,
  depositDetected,
  depositReady,
  depositRebaselined,
  depositSettled,
  initialState,
  onboardingFailed,
  swapBroadcast,
  swapConfirmed,
  swapFailed,
  swapSubmitting,
  withdrawCreating,
  withdrawFailed,
  withdrawReady,
  withdrawReset,
} from 'src/bridgeramp/slice'

const submitting = swapSubmitting({
  flowId: 'flow-1',
  direction: 'copmToUsdc',
  amountIn: '800000000000000000000000',
  quotedAmountOut: '247338318',
  recipient: '0xe2d21f9bd38d4555c340395d31af39ee3b11a995',
})

describe('bridgeramp slice', () => {
  it('walks submitting -> broadcast -> confirmed', () => {
    let state = reducer(initialState, submitting)
    expect(state.swap.status).toBe('submitting')
    expect(state.swap.flowId).toBe('flow-1')

    state = reducer(state, swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
    expect(state.swap.status).toBe('broadcast')
    expect(state.swap.swapTxHash).toBe('0x2')

    state = reducer(state, swapConfirmed({ confirmedAt: 1_791_600_000 }))
    expect(state.swap.status).toBe('confirmed')
    expect(state.swap.swapTxHash).toBe('0x2')
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

  it('tags a failure before signing with its flow', () => {
    const state = reducer(initialState, swapFailed({ code: 'market_closed', flowId: 'dep-1' }))
    expect(state.swap).toMatchObject({
      status: 'failed',
      errorCode: 'market_closed',
      flowId: 'dep-1',
    })
  })

  it('does not rehydrate the in-flight swap', () => {
    const persisted = {
      swap: { ...initialState.swap, status: 'broadcast', swapTxHash: '0x2' },
    }
    const state = reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: { bridgeramp: persisted },
    } as any)
    expect(state.swap).toEqual(initialState.swap)
    expect(state).not.toHaveProperty('lastCompletedSwap')
  })

  it('keeps the onboarding request id for support', () => {
    const state = reducer(
      initialState,
      onboardingFailed({ code: 'party_identity_not_proven', requestId: 'req_1' })
    )
    expect(state.party.onboarding).toEqual({
      status: 'error',
      errorCode: 'party_identity_not_proven',
      errorRequestId: 'req_1',
    })
  })
})

describe('bridgeramp withdraw', () => {
  const withdrawal = { id: 'wdr_1', deposit: { address: '0xabc' } } as any
  const quote = { id: 'qte_1' } as any

  function inReview() {
    let state = reducer(initialState, withdrawCreating({ copmAmountIn: '1' }))
    state = reducer(
      state,
      withdrawReady({
        quote,
        withdrawal,
        estimatedCop: '5000',
        knownPayoutIds: [],
        attemptId: 'a1',
      })
    )
    return state
  }

  it('keeps a failed start apart from a failed payout', () => {
    let state = reducer(initialState, withdrawCreating({ copmAmountIn: '1' }))
    state = reducer(state, withdrawFailed({ code: 'quote_failed', requestId: 'req_9' }))
    expect(state.withdraw).toMatchObject({
      status: 'start_failed',
      errorCode: 'quote_failed',
      errorRequestId: 'req_9',
    })
  })

  it('stores the attempt id and the hash of the swap that funds the withdrawal', () => {
    let state = inReview()
    expect(state.withdraw.attemptId).toBe('a1')
    state = reducer(state, submitting)
    state = reducer(state, swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
    expect(state.withdraw.swapTxHash).toBe('0x2')
  })

  it('does not take the hash of a deposit conversion', () => {
    let state = inReview()
    state = reducer(
      state,
      swapSubmitting({
        flowId: 'dep-1',
        direction: 'usdcToCopm',
        amountIn: '1',
        quotedAmountOut: '1',
        recipient: '0xuser',
      })
    )
    state = reducer(state, swapBroadcast({ approveTxHash: null, swapTxHash: '0x9' }))
    expect(state.withdraw.swapTxHash).toBeNull()
  })

  it('forgets the hash of a reverted withdraw swap so the next Confirm signs again', () => {
    let state = inReview()
    state = reducer(state, submitting)
    state = reducer(state, swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
    state = reducer(state, swapFailed({ code: 'receipt_unknown' }))
    expect(state.withdraw.swapTxHash).toBe('0x2')
    state = reducer(state, submitting)
    state = reducer(state, swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
    state = reducer(state, swapFailed({ code: 'reverted' }))
    expect(state.withdraw.swapTxHash).toBeNull()
  })

  it('starts over on reset', () => {
    let state = inReview()
    state = reducer(state, submitting)
    state = reducer(state, withdrawReset())
    expect(state.withdraw).toEqual(initialState.withdraw)
    expect(state.swap).toEqual(initialState.swap)
  })
})

describe('bridgeramp deposit', () => {
  const account = { id: 'dep_1', deposit_instructions: { bre_b_key: '@K' } } as any

  it('keeps the first baseline across account refreshes', () => {
    let state = reducer(initialState, depositReady({ account, usdcBaseline: '5', at: 1 }))
    state = reducer(state, depositReady({ account, usdcBaseline: '105', at: 2 }))
    expect(state.deposit.usdcBaseline).toBe('5')
  })

  it('waits for a known balance before setting the baseline', () => {
    let state = reducer(initialState, depositReady({ account, usdcBaseline: null, at: 1 }))
    expect(state.deposit.usdcBaseline).toBeNull()
    state = reducer(state, depositReady({ account, usdcBaseline: '7', at: 2 }))
    expect(state.deposit.usdcBaseline).toBe('7')
    state = reducer(state, depositBaselineUpdated({ usdcBaseline: '3' }))
    expect(state.deposit.usdcBaseline).toBe('3')
  })

  it('tracks a detected deposit until it settles', () => {
    let state = reducer(initialState, depositReady({ account, usdcBaseline: '5', at: 1 }))
    state = reducer(state, depositDetected({ usdcAmount: '100', flowId: 'f' }))
    expect(state.deposit.pending).toEqual({ usdcAmount: '100', flowId: 'f' })
    state = reducer(state, depositSettled({ usdcBaseline: '6', at: 9 }))
    expect(state.deposit.pending).toBeNull()
    expect(state.deposit.usdcBaseline).toBe('6')
    expect(state.deposit.settledAt).toBe(9)
    expect(state.deposit.instructionsShownAt).toBe(9)
  })

  it('records when the baseline was taken and moves it on a re-baseline', () => {
    let state = reducer(initialState, depositReady({ account, usdcBaseline: '5', at: 1 }))
    expect(state.deposit.instructionsShownAt).toBe(1)
    state = reducer(state, depositSettled({ usdcBaseline: '5', at: 2 }))
    state = reducer(state, depositRebaselined({ usdcBaseline: '50', at: 3 }))
    expect(state.deposit).toMatchObject({
      usdcBaseline: '50',
      instructionsShownAt: 3,
      settledAt: null,
    })
  })

  it('records a reduced conversion only for the pending deposit', () => {
    let state = reducer(initialState, depositDetected({ usdcAmount: '100', flowId: 'f' }))
    state = reducer(state, depositConvertAmountAdjusted({ flowId: 'other', usdcAmount: '90' }))
    expect(state.deposit.pending?.convertAmount).toBeUndefined()
    state = reducer(state, depositConvertAmountAdjusted({ flowId: 'f', usdcAmount: '90' }))
    expect(state.deposit.pending).toEqual({ usdcAmount: '100', flowId: 'f', convertAmount: '90' })
  })

  it('does not rehydrate a running conversion', () => {
    const state = reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: {
        bridgeramp: {
          deposit: {
            ...initialState.deposit,
            account,
            usdcBaseline: '5',
            instructionsShownAt: 7,
            settledAt: 8,
            converting: true,
          },
        },
      },
    } as any)
    expect(state.deposit).toMatchObject({
      instructionsShownAt: 7,
      settledAt: 8,
      converting: false,
    })
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
      instructionsShownAt: null,
      settledAt: null,
      pending: { usdcAmount: '100', flowId: 'f' },
      converting: false,
    })
  })

  it('drops an account stored before deposit_instructions but keeps the pending conversion', () => {
    const state = reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: {
        bridgeramp: {
          deposit: {
            status: 'ready',
            account: { id: 'dep_1', instructions: { bre_b_key: '@K' } },
            errorCode: null,
            errorRequestId: null,
            usdcBaseline: '5',
            pending: { usdcAmount: '100', flowId: 'f' },
          },
        },
      },
    } as any)
    expect(state.deposit.account).toBeNull()
    expect(state.deposit.status).toBe(initialState.deposit.status)
    expect(state.deposit.usdcBaseline).toBe('5')
    expect(state.deposit.pending).toEqual({ usdcAmount: '100', flowId: 'f' })
  })
})

describe('bridgeramp withdraw rehydration', () => {
  it('drops a withdraw stored before the reusable address', () => {
    const state = reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: {
        bridgeramp: {
          withdraw: {
            status: 'awaiting_payout',
            copmAmountIn: '1',
            quote: null,
            withdrawal: { id: 'wd_1' },
            errorCode: null,
            errorRequestId: null,
          },
        },
      },
    } as any)
    expect(state.withdraw).toEqual(initialState.withdraw)
  })

  function rehydrateWithdraw(withdraw: object) {
    return reducer(initialState, {
      type: REHYDRATE,
      key: 'root',
      payload: { bridgeramp: { withdraw } },
    } as any)
  }

  it('keeps a funded withdraw so the payout is still followed', () => {
    const persisted = {
      ...initialState.withdraw,
      status: 'awaiting_payout',
      withdrawal: { id: 'wdr_1' },
      knownPayoutIds: ['drn_old'],
      estimatedCop: '778136',
      attemptId: 'a1',
      swapTxHash: '0x2',
    }
    expect(rehydrateWithdraw(persisted).withdraw).toEqual(persisted)
  })

  it('keeps a review whose swap was broadcast so its status can be checked again', () => {
    const persisted = {
      ...initialState.withdraw,
      status: 'review',
      withdrawal: { id: 'wdr_1' },
      knownPayoutIds: [],
      attemptId: 'a1',
      swapTxHash: '0x2',
    }
    expect(rehydrateWithdraw(persisted).withdraw).toEqual(persisted)
  })

  it.each(['completed', 'failed', 'start_failed', 'review'])(
    'drops a %s withdraw so reopening the screen starts fresh',
    (status) => {
      const state = rehydrateWithdraw({
        ...initialState.withdraw,
        status,
        withdrawal: { id: 'wdr_1' },
        knownPayoutIds: ['drn_old'],
        errorCode: status === 'failed' ? 'payout_returned' : null,
      })
      expect(state.withdraw).toEqual(initialState.withdraw)
    }
  )
})
