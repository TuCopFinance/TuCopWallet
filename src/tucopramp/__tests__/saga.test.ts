import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { throwError } from 'redux-saga-test-plan/providers'
import * as api from 'src/tucopramp/api'
import {
  fetchLimitsSaga,
  fetchOfframpProofUrlSaga,
  submitCedulaUpdateSaga,
  submitOfframpOrderSaga,
  submitOnrampOrderSaga,
} from 'src/tucopramp/saga'
import {
  cedulaUpdateFailed,
  cedulaUpdateSucceeded,
  cedulaUpdating,
  limitsFetched,
  offrampCreatingOrder,
  offrampError,
  offrampOrderCreated,
  offrampProofUrlFailed,
  offrampProofUrlLoaded,
  offrampProofUrlLoading,
  offrampQuoteReady,
  offrampQuoting,
  onrampCreatingOrder,
  onrampError,
  onrampOrderCreated,
  onrampQuoteReady,
  onrampQuoting,
} from 'src/tucopramp/slice'
import type {
  OfframpOrderRequest,
  OnrampOrderRequest,
  QuoteResponse,
  TucopRampLimits,
} from 'src/tucopramp/types'
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

const { captureBusinessError } = jest.requireMock('src/sentry/captureBusinessError') as {
  captureBusinessError: jest.Mock
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
const LIMITS: TucopRampLimits = {
  min_order_cop: 100_000,
  max_order_cop: 500_000,
  max_daily_cop: 1_000_000,
  max_monthly_cop: 3_000_000,
}

const mockKeychainAccounts = {
  getAccounts: () => [mockAccount],
  isUnlocked: () => true,
  unlock: async () => true,
} as unknown as KeychainAccounts

function buildState(
  overrides: {
    fetchedAt?: number | null
    offrampLastQuote?: QuoteResponse | null
    onrampLastQuote?: QuoteResponse | null
  } = {}
) {
  const base = createMockStore({}).getState()
  return {
    ...base,
    web3: {
      ...base.web3,
      account: mockAccount,
    },
    tucopramp: {
      ...base.tucopramp,
      limits: { value: null, fetchedAt: overrides.fetchedAt ?? null },
      offramp: {
        ...base.tucopramp.offramp,
        lastQuote: overrides.offrampLastQuote ?? null,
      },
      onramp: {
        ...base.tucopramp.onramp,
        lastQuote: overrides.onrampLastQuote ?? null,
      },
    },
  }
}

describe('fetchLimitsSaga', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches + persists on cold cache (fetchedAt=null)', async () => {
    // Assert on action type + value shape; the fetchedAt field is Date.now()
    // at dispatch time and cannot be mocked cleanly across the saga boundary.
    // .put.like ignores unspecified payload fields (fetchedAt).
    await expectSaga(fetchLimitsSaga)
      .withState(buildState({ fetchedAt: null }))
      .provide([[matchers.call.fn(api.getLimitsWithMeta), { value: LIMITS, serverMaxAgeMs: null }]])
      .put.like({
        action: { type: limitsFetched.type, payload: { value: LIMITS } },
      })
      .run()
  })

  it('skips fetch on fresh cache (within server max-age)', async () => {
    const getLimitsSpy = jest.spyOn(api, 'getLimitsWithMeta')
    // fetchedAt seconds ago -> well within the default max-age (300s).
    // Stale-while-revalidate should NOT fire; put must not happen either.
    const nowIsh = Date.now()
    await expectSaga(fetchLimitsSaga)
      .withState(buildState({ fetchedAt: nowIsh - 10_000 }))
      .not.put.actionType(limitsFetched.type)
      .run()
    expect(getLimitsSpy).not.toHaveBeenCalled()
  })

  it('re-fetches when the previous fetch is older than the 12h TTL', async () => {
    // fetchedAt more than 12h in the past relative to real Date.now
    const nowIsh = Date.now()
    await expectSaga(fetchLimitsSaga)
      .withState(buildState({ fetchedAt: nowIsh - TWELVE_HOURS_MS - 60_000 }))
      .provide([[matchers.call.fn(api.getLimitsWithMeta), { value: LIMITS, serverMaxAgeMs: null }]])
      .put.actionType(limitsFetched.type)
      .run()
  })

  it('on fetch failure keeps hardcoded fallback + reports via captureBusinessError', async () => {
    const err = new Error('network down')
    await expectSaga(fetchLimitsSaga)
      .withState(buildState({ fetchedAt: null }))
      .provide([[matchers.call.fn(api.getLimitsWithMeta), throwError(err)]])
      .not.put.actionType(limitsFetched.type)
      .run()
    expect(captureBusinessError).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        feature: 'tucopramp',
        provider: 'ramp',
        action: 'get_limits',
      })
    )
  })
})

describe('submitOfframpOrderSaga quote expiry guard', () => {
  ;(getKeychainAccounts as jest.Mock).mockResolvedValue(mockKeychainAccounts)

  const baseBody: OfframpOrderRequest = {
    gross_amount_cop: 100_000,
    cedula: '1234567',
    full_name: 'Test User',
    email: 'test@example.com',
    payout_method: 'bank_account',
    bank_code: 'bancolombia',
    bank_account_type: 'savings',
    bank_account_number: '12345678',
    consent_accepted: true,
    quote_id: 'q-old',
  }

  const orderResponse = {
    order_id: 'o-1',
    status: 'AWAITING_DEPOSIT' as const,
    multisig_address: '0xaa',
    chain_id: 42220,
    gross_amount_copm: 100_000,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  }

  function makeQuote(quote_id: string, secondsFromNow: number): QuoteResponse {
    return {
      quote_id,
      gross_amount_cop: 100_000,
      gross_amount_copm: 100_000,
      fee_percent: 0,
      fee_amount_cop: 0,
      fee_absorbed_by: 'tucop',
      net_amount_to_user_cop: 100_000,
      display_text: '',
      remaining_daily_cop: 900_000,
      remaining_monthly_cop: 2_900_000,
      expires_at: new Date(Date.now() + secondsFromNow * 1000).toISOString(),
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('refetches the quote and swaps quote_id when the stored quote has expired', async () => {
    const expiredQuote = makeQuote('q-old', -60) // 60s in the past
    const freshQuote = makeQuote('q-new', 300) // 5min in the future

    const { effects } = await expectSaga(submitOfframpOrderSaga, {
      type: 'x',
      payload: { body: baseBody, idempotencyKey: 'idem-1' },
    })
      .withState(buildState({ offrampLastQuote: expiredQuote }))
      .provide([
        [matchers.call.fn(api.getOfframpQuote), freshQuote],
        [matchers.call.fn(api.createOfframpOrder), orderResponse],
      ])
      .put(offrampQuoting())
      .put(offrampQuoteReady(freshQuote))
      .put(offrampOrderCreated(orderResponse))
      .run()

    // The createOrder effect args prove the fresh quote_id was spliced into
    // the body before submit. redux-saga-test-plan's .call.like matcher does
    // not survive asymmetric matchers, so we inspect the effect log directly.
    const createOrderEffect = (effects.call ?? []).find(
      (e: any) => e.payload.fn === api.createOfframpOrder
    )
    expect(createOrderEffect?.payload.args[1]).toMatchObject({ quote_id: 'q-new' })
    expect(createOrderEffect?.payload.args[2]).toBe('idem-1')
  })

  it('proceeds without refetch when the stored quote is still valid', async () => {
    const validQuote = makeQuote('q-old', 300) // 5min in the future

    await expectSaga(submitOfframpOrderSaga, {
      type: 'x',
      payload: { body: baseBody, idempotencyKey: 'idem-2' },
    })
      .withState(buildState({ offrampLastQuote: validQuote }))
      .provide([[matchers.call.fn(api.createOfframpOrder), orderResponse]])
      .not.put(offrampQuoting())
      .not.call.fn(api.getOfframpQuote)
      .put(offrampCreatingOrder({ idempotencyKey: 'idem-2' }))
      .run()
  })

  it('skips the expiry check when expires_at is malformed (isFinite guard)', async () => {
    const badQuote: QuoteResponse = { ...makeQuote('q-old', 300), expires_at: 'not-a-date' }

    await expectSaga(submitOfframpOrderSaga, {
      type: 'x',
      payload: { body: baseBody, idempotencyKey: 'idem-3' },
    })
      .withState(buildState({ offrampLastQuote: badQuote }))
      .provide([[matchers.call.fn(api.createOfframpOrder), orderResponse]])
      .not.put(offrampQuoting())
      .put(offrampCreatingOrder({ idempotencyKey: 'idem-3' }))
      .run()
  })

  it('dispatches offrampError and aborts when the refetch itself fails', async () => {
    const expiredQuote = makeQuote('q-old', -60)

    await expectSaga(submitOfframpOrderSaga, {
      type: 'x',
      payload: { body: baseBody, idempotencyKey: 'idem-4' },
    })
      .withState(buildState({ offrampLastQuote: expiredQuote }))
      .provide([[matchers.call.fn(api.getOfframpQuote), throwError(new Error('boom'))]])
      .put(offrampQuoting())
      .not.call.fn(api.createOfframpOrder)
      .put.actionType(offrampError.type)
      .run()
  })
})

describe('submitOnrampOrderSaga quote expiry guard', () => {
  ;(getKeychainAccounts as jest.Mock).mockResolvedValue(mockKeychainAccounts)

  const baseBody: OnrampOrderRequest = {
    gross_amount_cop: 100_000,
    cedula: '1234567',
    full_name: 'Test User',
    email: 'test@example.com',
    consent_accepted: true,
    quote_id: 'q-old',
  }

  const orderResponse = {
    order_id: 'o-1',
    status: 'AWAITING_PROOF' as const,
    receiving_account: {
      kind: 'bre_b_key' as const,
      bre_b_key: '@tucop',
      display_name: 'TuCop',
    },
    gross_amount_cop: 100_000,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    proof_upload_required: true as const,
    instructions: 'transfer',
  }

  function makeQuote(quote_id: string, secondsFromNow: number): QuoteResponse {
    return {
      quote_id,
      gross_amount_cop: 100_000,
      gross_amount_copm: 100_000,
      fee_percent: 0,
      fee_amount_cop: 0,
      fee_absorbed_by: 'tucop',
      net_amount_to_user_cop: 100_000,
      display_text: '',
      remaining_daily_cop: 900_000,
      remaining_monthly_cop: 2_900_000,
      expires_at: new Date(Date.now() + secondsFromNow * 1000).toISOString(),
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('refetches the quote and swaps quote_id when the stored quote has expired', async () => {
    const expiredQuote = makeQuote('q-old', -60)
    const freshQuote = makeQuote('q-new', 300)

    const { effects } = await expectSaga(submitOnrampOrderSaga, {
      type: 'x',
      payload: { body: baseBody, idempotencyKey: 'idem-5' },
    })
      .withState(buildState({ onrampLastQuote: expiredQuote }))
      .provide([
        [matchers.call.fn(api.getOnrampQuote), freshQuote],
        [matchers.call.fn(api.createOnrampOrder), orderResponse],
      ])
      .put(onrampQuoting())
      .put(onrampQuoteReady(freshQuote))
      .put(onrampOrderCreated(orderResponse))
      .run()

    const createOrderEffect = (effects.call ?? []).find(
      (e: any) => e.payload.fn === api.createOnrampOrder
    )
    expect(createOrderEffect?.payload.args[1]).toMatchObject({ quote_id: 'q-new' })
    expect(createOrderEffect?.payload.args[2]).toBe('idem-5')
  })

  it('proceeds without refetch when the stored quote is still valid', async () => {
    const validQuote = makeQuote('q-old', 300)

    await expectSaga(submitOnrampOrderSaga, {
      type: 'x',
      payload: { body: baseBody, idempotencyKey: 'idem-6' },
    })
      .withState(buildState({ onrampLastQuote: validQuote }))
      .provide([[matchers.call.fn(api.createOnrampOrder), orderResponse]])
      .not.put(onrampQuoting())
      .not.call.fn(api.getOnrampQuote)
      .put(onrampCreatingOrder({ idempotencyKey: 'idem-6' }))
      .run()
  })

  it('dispatches onrampError and aborts when the refetch itself fails', async () => {
    const expiredQuote = makeQuote('q-old', -60)

    await expectSaga(submitOnrampOrderSaga, {
      type: 'x',
      payload: { body: baseBody, idempotencyKey: 'idem-7' },
    })
      .withState(buildState({ onrampLastQuote: expiredQuote }))
      .provide([[matchers.call.fn(api.getOnrampQuote), throwError(new Error('boom'))]])
      .put(onrampQuoting())
      .not.call.fn(api.createOnrampOrder)
      .put.actionType(onrampError.type)
      .run()
  })
})

describe('submitCedulaUpdateSaga', () => {
  ;(getKeychainAccounts as jest.Mock).mockResolvedValue(mockKeychainAccounts)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('dispatches updating -> succeeded on 200 and re-fetches user profile', async () => {
    const updated = { userId: 'u1', updated_at: '2026-09-03T10:00:00Z' }
    const meResponse = { user_id: 'u1', full_name: 'X', cedula_last_4: '4567' }

    await expectSaga(submitCedulaUpdateSaga, {
      type: 'x',
      payload: { new_cedula: '1234567', reason: 'first order had wrong id' },
    })
      .withState(buildState())
      .provide([
        [matchers.call.fn(api.updateCedula), updated],
        [matchers.call.fn(api.getMe), meResponse],
      ])
      .put(cedulaUpdating())
      .put(cedulaUpdateSucceeded())
      .run()
  })

  it('dispatches cedulaUpdateFailed with the specific code on 409 lock', async () => {
    const err = new (require('src/tucopramp/types').TucopRampError)({
      httpStatus: 409,
      code: 'cedula_locked_by_active_order',
      message: 'locked',
      envelope: { code: 'cedula_locked_by_active_order' },
    })

    await expectSaga(submitCedulaUpdateSaga, {
      type: 'x',
      payload: { new_cedula: '1234567', reason: 'x' },
    })
      .withState(buildState())
      .provide([[matchers.call.fn(api.updateCedula), throwError(err)]])
      .put(cedulaUpdating())
      .put(cedulaUpdateFailed({ code: 'cedula_locked_by_active_order' }))
      .not.put(cedulaUpdateSucceeded())
      .run()
  })
})

describe('fetchOfframpProofUrlSaga', () => {
  ;(getKeychainAccounts as jest.Mock).mockResolvedValue(mockKeychainAccounts)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('dispatches loading -> loaded on 200 with the {url, expires_at} shape', async () => {
    const proof = {
      url: 'https://api.ramp.tucop.xyz/v1/p2p/proofs/xyz?ts=1&sig=abc',
      expires_at: '2026-09-03T20:00:00Z',
    }
    await expectSaga(fetchOfframpProofUrlSaga, {
      type: 'x',
      payload: { orderId: 'o-1', kind: 'operator_outgoing' as const },
    })
      .withState(buildState())
      .provide([[matchers.call.fn(api.getProofUrl), proof]])
      .put(offrampProofUrlLoading())
      .put(offrampProofUrlLoaded(proof))
      .run()
  })

  it('dispatches failed with the code on error (e.g. 404 order_not_found)', async () => {
    const err = new (require('src/tucopramp/types').TucopRampError)({
      httpStatus: 404,
      code: 'order_not_found',
      message: 'not found',
      envelope: { code: 'order_not_found' },
    })
    await expectSaga(fetchOfframpProofUrlSaga, {
      type: 'x',
      payload: { orderId: 'o-1', kind: 'operator_outgoing' as const },
    })
      .withState(buildState())
      .provide([[matchers.call.fn(api.getProofUrl), throwError(err)]])
      .put(offrampProofUrlLoading())
      .put(offrampProofUrlFailed({ code: 'order_not_found' }))
      .not.put.actionType(offrampProofUrlLoaded.type)
      .run()
  })
})
