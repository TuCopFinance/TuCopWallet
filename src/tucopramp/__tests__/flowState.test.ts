import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { throwError } from 'redux-saga-test-plan/providers'
import * as api from 'src/tucopramp/api'
import {
  checkActiveOfframpOrderSaga,
  checkActiveOnrampOrderSaga,
  orderRequestFingerprint,
  POLL_GIVE_UP_AFTER_MS,
  pollDelayMs,
  pollOfframpOrderSaga,
  pollOnrampOrderSaga,
  sendOfframpDepositSaga,
  submitOfframpOrderSaga,
  uploadOnrampProofSaga,
} from 'src/tucopramp/saga'
import reducer, {
  offrampActiveCheckFailed,
  offrampActiveResumed,
  offrampAdvance,
  offrampDepositBroadcast,
  offrampDepositFailed,
  offrampError,
  offrampNoActiveFound,
  offrampPendingIdempotencyKeyCleared,
  offrampPollTimedOut,
  offrampReset,
  offrampRetryAfterError,
  onrampActiveResumed,
  onrampAdvance,
  onrampError,
  onrampNoActiveFound,
  onrampProofRejectedForRetry,
  onrampProofUploadFailed,
  onrampReset,
  OfframpFlowStatus,
  OnrampFlowStatus,
  SavedPayoutProfile,
  State,
} from 'src/tucopramp/slice'
import {
  OfframpOrderRequest,
  OfframpOrderResponse,
  OnrampOrderResponse,
  OrderDetail,
  QuoteResponse,
  TucopRampError,
} from 'src/tucopramp/types'
import { sendPreparedTransactions } from 'src/viem/saga'
import { getKeychainAccounts } from 'src/web3/contracts'
import type { KeychainAccounts } from 'src/web3/KeychainAccounts'
import { createMockStore } from 'test/utils'
import { mockAccount } from 'test/values'

jest.mock('src/utils/Logger')
jest.mock('src/sentry/captureBusinessError', () => ({
  captureBusinessError: jest.fn(),
}))
jest.mock('src/web3/contracts', () => ({
  getKeychainAccounts: jest.fn(),
}))
jest.mock('src/viem/saga', () => ({
  sendPreparedTransactions: jest.fn(),
}))
jest.mock('src/viem', () => ({
  publicClient: { celo: { waitForTransactionReceipt: jest.fn() } },
}))

const { captureBusinessError } = jest.requireMock('src/sentry/captureBusinessError') as {
  captureBusinessError: jest.Mock
}
const { publicClient } = jest.requireMock('src/viem') as {
  publicClient: { celo: { waitForTransactionReceipt: jest.Mock } }
}

const mockKeychainAccounts = {
  getAccounts: () => [mockAccount],
  isUnlocked: () => true,
  unlock: async () => true,
} as unknown as KeychainAccounts

// redux-saga's delay() resolves through the internal delayP; skip the waits.
const skipDelays = {
  call: ({ fn }: any, next: () => unknown) => (fn.name === 'delayP' ? null : next()),
}

const offrampOrder: OfframpOrderResponse = {
  order_id: 'off-1',
  status: 'AWAITING_DEPOSIT',
  multisig_address: '0xmultisig',
  chain_id: 42220,
  gross_amount_copm: 150_000,
  expires_at: '2026-10-14T00:00:00Z',
}

const onrampOrder: OnrampOrderResponse = {
  order_id: 'on-1',
  status: 'AWAITING_PROOF',
  receiving_account: { kind: 'bre_b_key', bre_b_key: '@tucop', display_name: 'TuCOP' },
  gross_amount_cop: 200_000,
  expires_at: '2026-10-14T00:00:00Z',
  proof_upload_required: true,
  instructions: 'Transfer exactly 200.000',
}

function makeDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'off-1',
    order_type: 'offramp',
    status: 'AWAITING_DEPOSIT',
    gross_amount_cop: 150_000,
    gross_amount_copm: 150_000,
    fee_percent: 0,
    fee_amount_cop: 0,
    fee_absorbed_by: 'tucop',
    net_amount_to_user_cop: 150_000,
    proofs_available: [],
    created_at: '2026-10-13T10:00:00Z',
    updated_at: '2026-10-13T10:00:00Z',
    expires_at: '2026-10-14T10:00:00Z',
    ...overrides,
  }
}

function makeQuote(overrides: Partial<QuoteResponse> = {}): QuoteResponse {
  return {
    quote_id: 'q-1',
    gross_amount_cop: 150_000,
    gross_amount_copm: 150_000,
    fee_percent: 0,
    fee_amount_cop: 0,
    fee_absorbed_by: 'tucop',
    net_amount_to_user_cop: 150_000,
    display_text: '',
    remaining_daily_cop: 850_000,
    remaining_monthly_cop: 2_850_000,
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    ...overrides,
  }
}

const savedProfile: SavedPayoutProfile = {
  method: 'bre_b_key',
  bre_b_key: '@ana',
  bank_code: null,
  bank_account_type: null,
  bank_account_number: null,
  full_name: 'Ana Perez',
  cedula: '1017123456',
  email: 'ana@example.com',
  lastUsedAt: 1,
}

// Deep copy: the reducer returns a frozen state, and tests mutate it.
function baseSliceState(): State {
  return JSON.parse(JSON.stringify(reducer(undefined, { type: 'init' })))
}

function rootState(mutate: (s: State) => void = () => undefined) {
  const base = createMockStore({}).getState()
  const tucopramp = baseSliceState()
  mutate(tucopramp)
  return { ...base, web3: { ...base.web3, account: mockAccount }, tucopramp }
}

function rampError(code: string, httpStatus = 400, envelope: Record<string, unknown> = {}) {
  return new TucopRampError({
    httpStatus,
    code,
    message: code,
    envelope: { code, ...envelope },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getKeychainAccounts as jest.Mock).mockResolvedValue(mockKeychainAccounts)
})

describe('offrampReset', () => {
  it('keeps saved profiles, the pending key and an open order with its deposit tx', () => {
    let state = baseSliceState()
    state.offramp.savedPayoutProfiles = [savedProfile]
    state.offramp.pendingIdempotencyKey = 'key-1'
    state.offramp.pendingRequestFingerprint = 'fp-1'
    state.offramp.currentOrder = offrampOrder
    state.offramp.status = 'awaiting-deposit'
    state = reducer(state, offrampDepositBroadcast({ txHash: '0xhash' }))
    state = reducer(state, offrampError({ code: 'internal_error' }))

    const next = reducer(state, offrampReset())

    expect(next.offramp.status).toBe('idle')
    expect(next.offramp.errorCode).toBeNull()
    expect(next.offramp.savedPayoutProfiles).toEqual([savedProfile])
    expect(next.offramp.pendingIdempotencyKey).toBe('key-1')
    expect(next.offramp.pendingRequestFingerprint).toBe('fp-1')
    expect(next.offramp.currentOrder).toEqual(offrampOrder)
    expect(next.offramp.depositTxHash).toBe('0xhash')
    expect(next.offramp.depositTxStatus).toBe('submitted')
  })

  it.each<OfframpFlowStatus>(['completed', 'cancelled', 'expired', 'refunded'])(
    'drops the order once it is %s, but still keeps the saved profiles',
    (status) => {
      const state = baseSliceState()
      state.offramp.savedPayoutProfiles = [savedProfile]
      state.offramp.currentOrder = offrampOrder
      state.offramp.depositTxHash = '0xhash'
      state.offramp.status = status

      const next = reducer(state, offrampReset())

      expect(next.offramp.currentOrder).toBeNull()
      expect(next.offramp.depositTxHash).toBeNull()
      expect(next.offramp.savedPayoutProfiles).toEqual([savedProfile])
    }
  )
})

describe('offrampRetryAfterError', () => {
  it('goes back to the confirm step after a failed create (same quote, same key)', () => {
    const state = baseSliceState()
    state.offramp.lastQuote = makeQuote()
    state.offramp.pendingIdempotencyKey = 'key-1'
    state.offramp.status = 'error'
    state.offramp.errorCode = 'http_504'

    const next = reducer(state, offrampRetryAfterError())

    expect(next.offramp.status).toBe('quote-ready')
    expect(next.offramp.errorCode).toBeNull()
    expect(next.offramp.pendingIdempotencyKey).toBe('key-1')
  })

  it('goes back to the form for any other error', () => {
    const state = baseSliceState()
    state.offramp.status = 'error'
    state.offramp.errorCode = 'amount_limit_exceeded'

    expect(reducer(state, offrampRetryAfterError()).offramp.status).toBe('idle')
  })
})

describe('offrampActiveResumed / offrampNoActiveFound', () => {
  it('resumes PROCESSING without a local order and without the cancel-only flag', () => {
    const next = reducer(
      baseSliceState(),
      offrampActiveResumed({
        detail: makeDetail({ status: 'PROCESSING' }),
        currentOrder: null,
        status: 'processing',
      })
    )
    expect(next.offramp.status).toBe('processing')
    expect(next.offramp.activeOrderId).toBe('off-1')
    expect(next.offramp.activeOrderMissingMultisig).toBe(false)
  })

  it('flags the cancel-only view for AWAITING_DEPOSIT without the multisig', () => {
    const next = reducer(
      baseSliceState(),
      offrampActiveResumed({ detail: makeDetail(), currentOrder: null, status: 'awaiting-deposit' })
    )
    expect(next.offramp.activeOrderMissingMultisig).toBe(true)
  })

  it('drops a kept local order when the server has no open order anymore', () => {
    const state = baseSliceState()
    state.offramp.currentOrder = offrampOrder
    state.offramp.depositTxHash = '0xhash'
    const next = reducer(state, offrampNoActiveFound({ lastPayout: null }))
    expect(next.offramp.currentOrder).toBeNull()
    expect(next.offramp.depositTxHash).toBeNull()
  })
})

describe('active check failure', () => {
  it('resumes a kept off-ramp order with a sent deposit when the server check fails', () => {
    const state = baseSliceState()
    state.offramp.currentOrder = offrampOrder
    state.offramp.depositTxHash = '0xhash'
    state.offramp.depositTxStatus = 'submitted'
    const next = reducer(state, offrampActiveCheckFailed())
    expect(next.offramp.status).toBe('awaiting-deposit')
  })

  it('does not resume (and so never auto-sends to) an unconfirmed order without a deposit', () => {
    const state = baseSliceState()
    state.offramp.currentOrder = offrampOrder
    expect(reducer(state, offrampActiveCheckFailed()).offramp.status).toBe('idle')
  })
})

describe('onrampReset', () => {
  it('keeps the pending key and an open order', () => {
    const state = baseSliceState()
    state.onramp.pendingIdempotencyKey = 'key-on'
    state.onramp.currentOrder = onrampOrder
    state.onramp.status = 'awaiting-review'

    const next = reducer(state, onrampReset())

    expect(next.onramp.status).toBe('idle')
    expect(next.onramp.pendingIdempotencyKey).toBe('key-on')
    expect(next.onramp.currentOrder).toEqual(onrampOrder)
  })

  it.each<OnrampFlowStatus>(['completed', 'rejected', 'cancelled', 'expired'])(
    'drops the order once it is %s',
    (status) => {
      const state = baseSliceState()
      state.onramp.currentOrder = onrampOrder
      state.onramp.status = status
      expect(reducer(state, onrampReset()).onramp.currentOrder).toBeNull()
    }
  )
})

describe('orderRequestFingerprint', () => {
  const body: OfframpOrderRequest = {
    gross_amount_cop: 150_000,
    cedula: '1017123456',
    full_name: 'Ana Perez',
    email: 'ana@example.com',
    payout_method: 'bre_b_key',
    bre_b_key: '@ana',
    consent_accepted: true,
    quote_id: 'q-1',
  }

  it('ignores quote_id and key order', () => {
    const reordered = { quote_id: 'q-2', ...body } as OfframpOrderRequest
    expect(orderRequestFingerprint({ ...reordered, quote_id: 'q-2' })).toBe(
      orderRequestFingerprint(body)
    )
  })

  it('changes when the request changes', () => {
    expect(orderRequestFingerprint({ ...body, gross_amount_cop: 160_000 })).not.toBe(
      orderRequestFingerprint(body)
    )
  })
})

describe('submitOfframpOrderSaga idempotency', () => {
  const body: OfframpOrderRequest = {
    gross_amount_cop: 150_000,
    cedula: '1017123456',
    full_name: 'Ana Perez',
    email: 'ana@example.com',
    payout_method: 'bre_b_key',
    bre_b_key: '@ana',
    consent_accepted: true,
    quote_id: 'q-1',
  }

  async function submittedKey(state: ReturnType<typeof rootState>) {
    const { effects } = await expectSaga(submitOfframpOrderSaga, {
      type: 'x',
      payload: { body },
    })
      .withState(state)
      .provide([[matchers.call.fn(api.createOfframpOrder), offrampOrder]])
      .run()
    const createCall = (effects.call ?? []).find(
      (e: any) => e.payload.fn === api.createOfframpOrder
    )
    return createCall?.payload.args[2]
  }

  it('reuses the pending key for a retry of the same request (new quote_id)', async () => {
    const state = rootState((s) => {
      s.offramp.pendingIdempotencyKey = 'key-1'
      s.offramp.pendingRequestFingerprint = orderRequestFingerprint({ ...body, quote_id: 'old' })
    })
    expect(await submittedKey(state)).toBe('key-1')
  })

  it('uses a new key once the user changed the request', async () => {
    const state = rootState((s) => {
      s.offramp.pendingIdempotencyKey = 'key-1'
      s.offramp.pendingRequestFingerprint = orderRequestFingerprint({
        ...body,
        gross_amount_cop: 999_000,
      })
    })
    const key = await submittedKey(state)
    expect(key).not.toBe('key-1')
    expect(key).toMatch(/^[0-9a-f]{8}-/)
  })

  it('on idempotency_key_reuse drops the key and resumes the order an earlier attempt created', async () => {
    const detail = makeDetail()
    await expectSaga(submitOfframpOrderSaga, { type: 'x', payload: { body } })
      .withReducer(
        (state: any, action: any) => ({ ...state, tucopramp: reducer(state.tucopramp, action) }),
        rootState((st) => (st.offramp.pendingIdempotencyKey = 'key-1'))
      )
      .provide([
        [matchers.call.fn(api.createOfframpOrder), throwError(rampError('idempotency_key_reuse'))],
        [
          matchers.call.fn(api.listOrders),
          { orders: [{ ...detail, order_type: 'offramp' }], next_cursor: null },
        ],
        [matchers.call.fn(api.getOrder), detail],
      ])
      .put(offrampPendingIdempotencyKeyCleared())
      .put.actionType(offrampActiveResumed.type)
      .not.put.actionType(offrampError.type)
      .run()
    expect(captureBusinessError).not.toHaveBeenCalled()
  })

  it('carries the remaining limits of an amount_limit_exceeded error', async () => {
    await expectSaga(submitOfframpOrderSaga, { type: 'x', payload: { body } })
      .withState(rootState())
      .provide([
        [
          matchers.call.fn(api.createOfframpOrder),
          throwError(
            rampError('amount_limit_exceeded', 409, {
              details: { remaining_daily_cop: 50_000, remaining_monthly_cop: 1_200_000 },
            })
          ),
        ],
      ])
      .put(
        offrampError({
          code: 'amount_limit_exceeded',
          retryAfterSeconds: null,
          request_id: null,
          remainingDailyCop: 50_000,
          remainingMonthlyCop: 1_200_000,
        })
      )
      .run()
  })
})

describe('checkActiveOfframpOrderSaga', () => {
  it('resumes a PROCESSING order without a local copy from the server detail', async () => {
    const detail = makeDetail({ status: 'PROCESSING' })
    await expectSaga(checkActiveOfframpOrderSaga)
      .withState(rootState())
      .provide([
        [
          matchers.call.fn(api.listOrders),
          { orders: [{ ...detail, order_type: 'offramp' }], next_cursor: null },
        ],
        [matchers.call.fn(api.getOrder), detail],
      ])
      .put(offrampActiveResumed({ detail, currentOrder: null, status: 'processing' }))
      .run()
  })

  it('reattaches the kept local order (multisig + tx hash) when it is the open one', async () => {
    const detail = makeDetail()
    await expectSaga(checkActiveOfframpOrderSaga)
      .withState(rootState((s) => (s.offramp.currentOrder = offrampOrder)))
      .provide([
        [
          matchers.call.fn(api.listOrders),
          { orders: [{ ...detail, order_type: 'offramp' }], next_cursor: null },
        ],
        [matchers.call.fn(api.getOrder), detail],
      ])
      .put(offrampActiveResumed({ detail, currentOrder: offrampOrder, status: 'awaiting-deposit' }))
      .run()
  })
})

describe('pollDelayMs', () => {
  it('backs off from 15 s to a 5 min cap', () => {
    expect(pollDelayMs(0, false)).toBe(15_000)
    expect(pollDelayMs(3 * 60_000, false)).toBe(30_000)
    expect(pollDelayMs(15 * 60_000, false)).toBe(60_000)
    expect(pollDelayMs(2 * 60 * 60_000, false)).toBe(5 * 60_000)
  })

  it('never polls faster than 30 s once the operator has the order', () => {
    expect(pollDelayMs(0, true)).toBe(30_000)
  })
})

describe('pollOfframpOrderSaga', () => {
  it('stops without writing when the order is no longer tracked (screen reset)', async () => {
    await expectSaga(pollOfframpOrderSaga, { type: 'x', payload: { orderId: 'off-1' } })
      .withState(rootState())
      .provide([[matchers.call.fn(api.getOrder), makeDetail({ status: 'PROCESSING' })]])
      .not.put.actionType(offrampAdvance.type)
      .run()
  })

  it('does not overwrite a cancel in flight with a stale AWAITING_DEPOSIT', async () => {
    let calls = 0
    await expectSaga(pollOfframpOrderSaga, { type: 'x', payload: { orderId: 'off-1' } })
      .withState(
        rootState((s) => {
          s.offramp.currentOrder = offrampOrder
          s.offramp.status = 'cancelling'
        })
      )
      .provide([
        skipDelays,
        {
          call: ({ fn }: any, next: any) =>
            fn === api.getOrder
              ? makeDetail({ status: calls++ === 0 ? 'AWAITING_DEPOSIT' : 'CANCELLED' })
              : next(),
        },
      ])
      .not.put(offrampAdvance({ status: 'awaiting-deposit' }))
      .put(offrampAdvance({ status: 'cancelled' }))
      .run()
  })

  it('moves to poll-timeout after 24 h of backoff instead of spinning forever', async () => {
    const result = await expectSaga(pollOfframpOrderSaga, {
      type: 'x',
      payload: { orderId: 'off-1' },
    })
      .withState(rootState((s) => (s.offramp.currentOrder = offrampOrder)))
      .provide([[matchers.call.fn(api.getOrder), makeDetail({ status: 'PROCESSING' })], skipDelays])
      .put(offrampPollTimedOut())
      .run()
    const getOrderCalls = (result.effects.call ?? []).filter(
      (e: any) => e.payload.fn === api.getOrder
    )
    // 15 s / 30 s / 60 s ramp, then every 5 min for the rest of the 24 h.
    expect(getOrderCalls.length).toBeGreaterThan(250)
    expect(getOrderCalls.length).toBeLessThan(POLL_GIVE_UP_AFTER_MS / 30_000)
  })
})

describe('pollOnrampOrderSaga', () => {
  it('treats REJECTED as final', async () => {
    await expectSaga(pollOnrampOrderSaga, { type: 'x', payload: { orderId: 'on-1' } })
      .withState(
        rootState((s) => {
          s.onramp.currentOrder = onrampOrder
          s.onramp.status = 'awaiting-review'
          s.onramp.proofUploaded = true
        })
      )
      .provide([
        [matchers.call.fn(api.getOrder), makeDetail({ id: 'on-1', status: 'REJECTED' })],
        skipDelays,
      ])
      .put(onrampAdvance({ status: 'rejected' }))
      .run()
  })

  it('ignores a stale AWAITING_PROOF while the upload is in flight', async () => {
    const statuses = ['AWAITING_PROOF', 'AWAITING_REVIEW', 'COMPLETED']
    await expectSaga(pollOnrampOrderSaga, { type: 'x', payload: { orderId: 'on-1' } })
      .withState(
        rootState((s) => {
          s.onramp.currentOrder = onrampOrder
          s.onramp.status = 'uploading-proof'
        })
      )
      .provide([
        skipDelays,
        {
          call: ({ fn }: any, next: any) =>
            fn === api.getOrder
              ? makeDetail({ id: 'on-1', status: statuses.shift() ?? 'COMPLETED' })
              : next(),
        },
      ])
      .not.put(onrampAdvance({ status: 'awaiting-proof-upload' }))
      .put(onrampAdvance({ status: 'awaiting-review' }))
      .put(onrampAdvance({ status: 'completed' }))
      .run()
  })

  it('flags a rejection when a restarted poll sees AWAITING_PROOF after the upload', async () => {
    const statuses = ['AWAITING_PROOF', 'CANCELLED']
    await expectSaga(pollOnrampOrderSaga, { type: 'x', payload: { orderId: 'on-1' } })
      .withState(
        rootState((s) => {
          s.onramp.currentOrder = onrampOrder
          s.onramp.status = 'awaiting-review'
          s.onramp.proofUploaded = true
        })
      )
      .provide([
        skipDelays,
        {
          call: ({ fn }: any, next: any) =>
            fn === api.getOrder
              ? makeDetail({ id: 'on-1', status: statuses.shift() ?? 'CANCELLED' })
              : next(),
        },
      ])
      .put(onrampProofRejectedForRetry())
      .run()
  })
})

describe('checkActiveOnrampOrderSaga', () => {
  it('rebuilds an AWAITING_PROOF order with the receiving account and exact amount', async () => {
    const detail = makeDetail({
      id: 'on-9',
      order_type: 'onramp',
      status: 'AWAITING_PROOF',
      gross_amount_cop: 250_000,
    })
    const account = { kind: 'bre_b_key' as const, bre_b_key: '@tucop', display_name: 'TuCOP' }
    await expectSaga(checkActiveOnrampOrderSaga)
      .withState(rootState((s) => (s.receivingAccount = account)))
      .provide([
        [
          matchers.call.fn(api.listOrders),
          { orders: [{ ...detail, order_type: 'onramp' }], next_cursor: null },
        ],
        [matchers.call.fn(api.getOrder), detail],
      ])
      .put(
        onrampActiveResumed({
          currentOrder: {
            order_id: 'on-9',
            status: 'AWAITING_PROOF',
            receiving_account: account,
            gross_amount_cop: 250_000,
            expires_at: detail.expires_at,
            proof_upload_required: true,
            instructions: '',
          },
          status: 'awaiting-proof-upload',
        })
      )
      .run()
  })

  it('reports no open order', async () => {
    await expectSaga(checkActiveOnrampOrderSaga)
      .withState(rootState())
      .provide([
        [
          matchers.call.fn(api.listOrders),
          {
            orders: [{ ...makeDetail({ status: 'COMPLETED' }), order_type: 'onramp' }],
            next_cursor: null,
          },
        ],
      ])
      .put(onrampNoActiveFound())
      .run()
  })
})

describe('uploadOnrampProofSaga', () => {
  it('keeps the order on the upload step with an inline error on failure', async () => {
    await expectSaga(uploadOnrampProofSaga, {
      type: 'x',
      payload: {
        orderId: 'on-1',
        file: { uri: 'file://r.jpg', name: 'r.jpg', type: 'image/jpeg' },
      },
    })
      .withState(rootState((s) => (s.onramp.currentOrder = onrampOrder)))
      .provide([[matchers.call.fn(api.uploadProof), throwError(rampError('proof_too_large'))]])
      .put(onrampProofUploadFailed({ code: 'proof_too_large' }))
      .not.put.actionType(onrampError.type)
      .run()
  })
})

describe('sendOfframpDepositSaga', () => {
  const payload = {
    orderId: 'off-1',
    multisigAddress: '0xmultisig',
    amountCopm: 150_000,
    serializablePreparedTransaction: {} as any,
  }

  it('keeps the deposit submitted when only the receipt wait fails', async () => {
    ;(sendPreparedTransactions as jest.Mock).mockReturnValue(['0xhash'])
    publicClient.celo.waitForTransactionReceipt.mockRejectedValue(new Error('rpc timeout'))
    await expectSaga(sendOfframpDepositSaga, { type: 'x', payload })
      .withState(rootState())
      .provide([[matchers.call.fn(sendPreparedTransactions), ['0xhash']]])
      .put(offrampDepositBroadcast({ txHash: '0xhash' }))
      .not.put.actionType(offrampDepositFailed.type)
      .run()
  })

  it('fails as broadcast_failed when the broadcast itself fails', async () => {
    await expectSaga(sendOfframpDepositSaga, { type: 'x', payload })
      .withState(rootState())
      .provide([[matchers.call.fn(sendPreparedTransactions), throwError(new Error('nonce'))]])
      .put(offrampDepositFailed({ code: 'broadcast_failed' }))
      .not.put.actionType(offrampDepositBroadcast.type)
      .run()
  })

  it('fails as reverted when the mined tx reverted', async () => {
    publicClient.celo.waitForTransactionReceipt.mockResolvedValue({ status: 'reverted' })
    await expectSaga(sendOfframpDepositSaga, { type: 'x', payload })
      .withState(rootState())
      .provide([[matchers.call.fn(sendPreparedTransactions), ['0xhash']]])
      .put(offrampDepositFailed({ code: 'reverted' }))
      .run()
  })
})

describe('error reporting', () => {
  it('does not report any rate_limited_* bucket to Sentry', async () => {
    await expectSaga(submitOfframpOrderSaga, {
      type: 'x',
      payload: {
        body: {
          gross_amount_cop: 150_000,
          cedula: '1',
          full_name: 'A B',
          payout_method: 'bre_b_key',
          bre_b_key: '@a',
          consent_accepted: true,
          quote_id: 'q',
        },
      },
    })
      .withState(rootState())
      .provide([
        [
          matchers.call.fn(api.createOfframpOrder),
          throwError(rampError('rate_limited_wallet', 429)),
        ],
      ])
      .put.actionType(offrampError.type)
      .run()
    expect(captureBusinessError).not.toHaveBeenCalled()
  })
})
