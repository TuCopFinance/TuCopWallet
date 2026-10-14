import { combineReducers } from '@reduxjs/toolkit'
import { runSaga, stdChannel } from 'redux-saga'
import { call as rawCall, takeLeading as rawTakeLeading } from 'redux-saga/effects'
import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { dynamic, throwError } from 'redux-saga-test-plan/providers'
import * as api from 'src/bridgeramp/api'
import { MentoOracleUnavailableError, MentoQuote, quoteMentoSwap } from 'src/bridgeramp/mentoRouter'
import { prepareBridgeRampCalls } from 'src/bridgeramp/prepare'
import { openWalletPartySession, revokePartySession } from 'src/bridgeramp/platformClient'
import {
  DEPOSIT_WINDOW_MS,
  SETTLE_GUARD_MS,
  checkBridgeRampDeposit,
  depositWorkerSaga,
  checkDepositSaga,
  fetchUsdcBalanceOnChain,
  retryBridgeRampDepositConversion,
  convertBridgeDeposit,
  convertBridgeDepositSaga,
  retryDepositConversionSaga,
  startDepositSaga,
  createBridgeRampParty,
  createPartySaga,
  ensurePartySession,
  fetchPartySaga,
  onSwapConfirmedSaga,
  pollBridgeRampWithdrawal,
  pollWithdrawalSaga,
  registerBridgeRampDestination,
  registerDestinationSaga,
  startBridgeRampWithdraw,
  startWithdrawSaga,
} from 'src/bridgeramp/saga'
import { revokeBridgeRampSessionSaga } from 'src/bridgeramp/revokeSession'
import reducer, {
  depositConverting,
  destinationRegisterFailed,
  destinationRegistering,
  destinationUpdated,
  initialState,
  onboardingFailed,
  onboardingSubmitting,
  partyLoaded,
  partyNeedsOnboarding,
  sessionCleared,
  sessionOpened,
  swapFailed,
  withdrawAwaitingPayout,
  withdrawCreating,
  withdrawFailed,
  withdrawPollTimedOut,
  withdrawReady,
  withdrawPayoutUpdated,
} from 'src/bridgeramp/slice'
import { TucopRampError } from 'src/tucopramp/types'
import { sentTransactionLogReducer } from 'src/viem/sentTransactionLog'
import { getKeychainAccounts } from 'src/web3/contracts'
import { walletAddressSelector } from 'src/web3/selectors'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import networkConfig from 'src/web3/networkConfig'
import { mockCeloTokenBalance, mockCusdTokenBalance } from 'test/values'
import BigNumber from 'bignumber.js'
import { executeBridgeRampSwapSaga, executeBridgeRampSwap } from 'src/bridgeramp/saga'

jest.mock('src/utils/Logger')
jest.mock('src/sentry/captureBusinessError', () => ({ captureBusinessError: jest.fn() }))
jest.mock('src/bridgeramp/api')
jest.mock('src/bridgeramp/platformClient')
jest.mock('src/bridgeramp/mentoRouter', () => ({
  ...jest.requireActual('src/bridgeramp/mentoRouter'),
  quoteMentoSwap: jest.fn(),
}))
jest.mock('src/bridgeramp/prepare', () => ({
  ...jest.requireActual('src/bridgeramp/prepare'),
  prepareBridgeRampCalls: jest.fn(),
}))
jest.mock('src/web3/contracts', () => ({ getKeychainAccounts: jest.fn() }))

const mockedApi = api as jest.Mocked<typeof api>
const mockedOpenSession = openWalletPartySession as jest.MockedFunction<
  typeof openWalletPartySession
>

const USER = '0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856'
const LIQUIDATION = '0xe2d21f9bd38d4555c340395d31af39ee3b11a995'
const NOW = 1_791_600_000

const freshSession = { token: 'tps_live', expiresAt: NOW + 3000, partyId: 'pty_1' }
const party: api.Party = {
  id: 'pty_1',
  type: 'individual',
  status: { kyc: 'approved', tos: 'accepted', endorsements: [{ name: 'cop', status: 'approved' }] },
  restricted: false,
  created_at: '',
  updated_at: '',
}
const pendingDestination: api.Destination = {
  id: 'dst_1',
  ownership: 'first_party',
  rail: 'bre_b',
  status: 'pending',
  key_masked: '****4567',
  owner_name: null,
  holder: null,
  rejection_reason: null,
  verified_at: null,
  confirmed_at: null,
  created_at: '',
  updated_at: '',
}
const quote = {
  id: 'qte_1',
  product: 'withdraw',
  rate: { value: '3800.5', base: 'USDC', quote: 'COP', source: 'bridge', observed_at: '' },
} as api.WithdrawQuote
const oldPayout: api.WithdrawalPayout = {
  id: 'drn_old',
  status: 'payment_processed',
  amount: { amount: '10.000000', asset: 'USDC' },
  destination_amount: { amount: '37000.00', asset: 'COP' },
  created_at: '',
  updated_at: '',
}
const withdrawal = {
  id: 'wd_1',
  product: 'withdraw',
  status: 'active',
  destination_id: 'dst_1',
  deposit: {
    address: LIQUIDATION,
    chain: 'eip155:42220',
    asset: 'USDC',
    token_contract: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
    minimum_destination_amount: { amount: '4000.00', asset: 'COP' },
  },
  fee_bps: 150,
  return_address: USER,
  payouts: [oldPayout],
  created_at: '',
} as unknown as api.Withdrawal
function payout(id: string, status: string): api.WithdrawalPayout {
  return { ...oldPayout, id, status, destination_amount: { amount: '925000.00', asset: 'COP' } }
}

function rampError(code: string, httpStatus = 400) {
  return new TucopRampError({ httpStatus, code, message: code, envelope: { code } })
}

const rootReducer = combineReducers({
  bridgeramp: reducer,
  sentTransactionLog: sentTransactionLogReducer,
})
type SliceState = typeof initialState

function root(state: SliceState) {
  return { bridgeramp: state, sentTransactionLog: { byFlow: {} } }
}

function withSession(state = initialState) {
  return { ...state, session: freshSession }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000)
  mockedOpenSession.mockResolvedValue({
    token: 'tps_new',
    method: 'wallet',
    expires_at: new Date((NOW + 3600) * 1000).toISOString(),
    party_id: null,
  })
})

describe('ensurePartySession', () => {
  it('reuses a session with time left', async () => {
    const { returnValue } = await expectSaga(ensurePartySession)
      .withReducer(rootReducer, root(withSession()))
      .run()
    expect(returnValue).toBe('tps_live')
    expect(mockedOpenSession).not.toHaveBeenCalled()
  })

  it('opens a new session when the old one is about to expire', async () => {
    const { returnValue } = await expectSaga(ensurePartySession)
      .withReducer(
        rootReducer,
        root({ ...initialState, session: { ...freshSession, expiresAt: NOW + 30 } })
      )
      .provide([
        [matchers.select(walletAddressSelector), USER],
        [matchers.call.fn(getKeychainAccounts), {}],
      ])
      .put(sessionOpened({ token: 'tps_new', expiresAt: NOW + 3600, partyId: null }))
      .run()
    expect(returnValue).toBe('tps_new')
    expect(mockedOpenSession).toHaveBeenCalledWith(USER, {})
  })

  it('throws without a wallet', async () => {
    await expect(
      expectSaga(ensurePartySession)
        .withReducer(rootReducer, root(initialState))
        .provide([[matchers.select(walletAddressSelector), null]])
        .run()
    ).rejects.toThrow('no_wallet')
  })
})

describe('revokeBridgeRampSessionSaga', () => {
  it('drops the session and revokes it on TuCOPRamp', async () => {
    const { storeState } = await expectSaga(revokeBridgeRampSessionSaga)
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.call.fn(revokePartySession), undefined]])
      .call(revokePartySession, freshSession.token)
      .run()
    expect(storeState.bridgeramp.session).toBeNull()
  })

  it('does not fail when the revoke call fails', async () => {
    const { storeState } = await expectSaga(revokeBridgeRampSessionSaga)
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.call.fn(revokePartySession), throwError(new Error('offline'))]])
      .run()
    expect(storeState.bridgeramp.session).toBeNull()
  })

  it('does nothing without a session', async () => {
    await expectSaga(revokeBridgeRampSessionSaga)
      .withReducer(rootReducer, root(initialState))
      .not.call.fn(revokePartySession)
      .run()
  })
})

describe('fetchPartySaga', () => {
  it('loads the party', async () => {
    mockedApi.getParty.mockResolvedValue(party)
    await expectSaga(fetchPartySaga)
      .withReducer(rootReducer, root(withSession()))
      .put(partyLoaded(party))
      .run()
    expect(mockedApi.getParty).toHaveBeenCalledWith('tps_live')
  })

  it('maps party_required to onboarding', async () => {
    mockedApi.getParty.mockRejectedValue(rampError('party_required', 403))
    await expectSaga(fetchPartySaga)
      .withReducer(rootReducer, root(withSession()))
      .put(partyNeedsOnboarding())
      .run()
  })

  it('reopens the session once on party_session_invalid and retries', async () => {
    mockedApi.getParty
      .mockRejectedValueOnce(rampError('party_session_invalid', 401))
      .mockResolvedValueOnce(party)
    await expectSaga(fetchPartySaga)
      .withReducer(rootReducer, root(withSession()))
      .provide([
        [matchers.select(walletAddressSelector), USER],
        [matchers.call.fn(getKeychainAccounts), {}],
      ])
      .put(sessionCleared())
      .put(sessionOpened({ token: 'tps_new', expiresAt: NOW + 3600, partyId: null }))
      .put(partyLoaded(party))
      .run()
    expect(mockedApi.getParty).toHaveBeenNthCalledWith(1, 'tps_live')
    expect(mockedApi.getParty).toHaveBeenNthCalledWith(2, 'tps_new')
  })
})

describe('createPartySaga', () => {
  const request: api.CreatePartyRequest = {
    type: 'individual',
    first_names: 'Ana Maria',
    last_names: 'Perez Gomez',
    nationality: 'COL',
    document_type: 'CC',
    document_number: '1017123456',
    email: 'ana@example.com',
    consent: { version: '2026-10-10', accepted_at: '2026-10-10T18:00:00Z' },
    redirect_url: 'https://tucop.xyz/ramp/verificacion-lista',
  }

  it('creates the party and stores it with its verification links', async () => {
    const created = { ...party, links: { kyc: 'https://verify/kyc', tos: 'https://verify/tos' } }
    mockedApi.createParty.mockResolvedValue({ party: created })
    await expectSaga(createPartySaga, createBridgeRampParty({ request, idempotencyKey: 'idem' }))
      .withReducer(rootReducer, root(withSession()))
      .put(onboardingSubmitting())
      .put(partyLoaded(created))
      .run()
    expect(mockedApi.createParty).toHaveBeenCalledWith('tps_live', request, 'idem')
  })

  it('keeps the form with the server code when refused', async () => {
    mockedApi.createParty.mockRejectedValue(rampError('email_required', 422))
    const { storeState } = await expectSaga(
      createPartySaga,
      createBridgeRampParty({ request, idempotencyKey: 'idem' })
    )
      .withReducer(
        rootReducer,
        root({
          ...withSession(),
          party: { ...initialState.party, needsOnboarding: true, status: 'loaded' },
        })
      )
      .put(onboardingFailed({ code: 'email_required', requestId: undefined }))
      .run()
    expect(storeState.bridgeramp.party.needsOnboarding).toBe(true)
    expect(storeState.bridgeramp.party.value).toBeNull()
  })

  it('keeps the request id so support can trace a refused identity proof', async () => {
    mockedApi.createParty.mockRejectedValue(
      new TucopRampError({
        httpStatus: 403,
        code: 'party_identity_not_proven',
        message: 'party_identity_not_proven',
        request_id: 'req_123',
        envelope: { code: 'party_identity_not_proven' },
      } as any)
    )
    const { storeState } = await expectSaga(
      createPartySaga,
      createBridgeRampParty({ request, idempotencyKey: 'idem' })
    )
      .withReducer(rootReducer, root(withSession()))
      .run()
    expect(storeState.bridgeramp.party.onboarding).toEqual({
      status: 'error',
      errorCode: 'party_identity_not_proven',
      errorRequestId: 'req_123',
    })
  })
})

describe('registerDestinationSaga', () => {
  it('registers the key and polls until the directory answers', async () => {
    mockedApi.createFirstPartyDestination.mockResolvedValue(pendingDestination)
    const verified = { ...pendingDestination, status: 'verified' as const }
    mockedApi.getDestination
      .mockResolvedValueOnce(pendingDestination)
      .mockResolvedValueOnce(verified)
    await expectSaga(
      registerDestinationSaga,
      registerBridgeRampDestination({ breBKey: '3001234567', idempotencyKey: 'idem' })
    )
      .withReducer(rootReducer, root(withSession()))
      .provide({ call: provideDelays })
      .put(destinationRegistering())
      .put(destinationUpdated(pendingDestination))
      .put(destinationUpdated(verified))
      .run()
    expect(mockedApi.createFirstPartyDestination).toHaveBeenCalledWith(
      'tps_live',
      '3001234567',
      'idem'
    )
    expect(mockedApi.getDestination).toHaveBeenCalledTimes(2)
  })

  it('surfaces the server code when registration is refused', async () => {
    mockedApi.createFirstPartyDestination.mockRejectedValue(rampError('invalid_bre_b_key'))
    await expectSaga(
      registerDestinationSaga,
      registerBridgeRampDestination({ breBKey: 'x', idempotencyKey: 'idem' })
    )
      .withReducer(rootReducer, root(withSession()))
      .put(destinationRegisterFailed({ code: 'invalid_bre_b_key' }))
      .run()
    expect(mockedApi.getDestination).not.toHaveBeenCalled()
  })
})

describe('startWithdrawSaga', () => {
  const action = startBridgeRampWithdraw({
    destinationId: 'dst_1',
    copmAmountIn: '800000000000000000000000',
    usdcMinOut: '246.101626',
    idempotencyKey: 'idem',
  })

  it('gets the address, notes its payouts and estimates the COP for the swap', async () => {
    mockedApi.createWithdrawal.mockResolvedValue({ ...withdrawal, payouts: undefined })
    mockedApi.getWithdrawal.mockResolvedValue(withdrawal)
    mockedApi.createWithdrawQuote.mockResolvedValue(quote)
    await expectSaga(startWithdrawSaga, action)
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.select(walletAddressSelector), USER]])
      .put(withdrawCreating({ copmAmountIn: '800000000000000000000000' }))
      .put(
        withdrawReady({
          quote,
          withdrawal,
          // 246.101626 USDC x 3800.5 x 0.985, rounded down.
          estimatedCop: '921279',
          knownPayoutIds: ['drn_old'],
          attemptId: 'idem',
        })
      )
      .run()
    expect(mockedApi.createWithdrawal).toHaveBeenCalledWith(
      'tps_live',
      { destination_id: 'dst_1' },
      'idem-address'
    )
    expect(mockedApi.createWithdrawQuote).toHaveBeenCalledWith(
      'tps_live',
      { destination_id: 'dst_1', amount_cop: { amount: '4000.00', asset: 'COP' } },
      'idem-quote'
    )
  })

  it('refuses a swap that would pay out below the floor', async () => {
    mockedApi.createWithdrawal.mockResolvedValue(withdrawal)
    mockedApi.getWithdrawal.mockResolvedValue(withdrawal)
    mockedApi.createWithdrawQuote.mockResolvedValue(quote)
    await expectSaga(
      startWithdrawSaga,
      startBridgeRampWithdraw({
        destinationId: 'dst_1',
        copmAmountIn: '1',
        usdcMinOut: '1.000000',
        idempotencyKey: 'idem',
      })
    )
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.select(walletAddressSelector), USER]])
      .put(withdrawFailed({ code: 'amount_below_minimum' }))
      .run()
  })

  it('fails with the server code when the address is refused', async () => {
    mockedApi.createWithdrawal.mockRejectedValue(rampError('destination_not_verified', 409))
    await expectSaga(startWithdrawSaga, action)
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.select(walletAddressSelector), USER]])
      .put(withdrawFailed({ code: 'destination_not_verified', requestId: undefined }))
      .run()
    expect(mockedApi.createWithdrawQuote).not.toHaveBeenCalled()
  })

  it('fails without a wallet before calling TuCOPRamp', async () => {
    await expectSaga(startWithdrawSaga, action)
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.select(walletAddressSelector), null]])
      .put(withdrawFailed({ code: 'no_wallet' }))
      .run()
    expect(mockedApi.createWithdrawal).not.toHaveBeenCalled()
  })
})

describe('pollWithdrawalSaga', () => {
  const awaiting = {
    ...withSession(),
    withdraw: {
      ...initialState.withdraw,
      status: 'awaiting_payout' as const,
      withdrawal,
      knownPayoutIds: ['drn_old'],
    },
  }

  it('follows the new payout until Bridge processes it, ignoring older ones', async () => {
    const submitted = payout('drn_new', 'payment_submitted')
    const processed = payout('drn_new', 'payment_processed')
    mockedApi.getWithdrawal
      .mockResolvedValueOnce(withdrawal)
      .mockResolvedValueOnce({ ...withdrawal, payouts: [submitted, oldPayout] })
      .mockResolvedValueOnce({ ...withdrawal, payouts: [processed, oldPayout] })
    const { storeState } = await expectSaga(
      pollWithdrawalSaga,
      pollBridgeRampWithdrawal({ withdrawalId: 'wd_1' })
    )
      .withReducer(rootReducer, root(awaiting))
      .provide({ call: provideDelays })
      .put(withdrawPayoutUpdated(submitted))
      .put(withdrawPayoutUpdated(processed))
      .run()
    expect(storeState.bridgeramp.withdraw.status).toBe('completed')
    expect(storeState.bridgeramp.withdraw.payout?.destination_amount?.amount).toBe('925000.00')
    expect(mockedApi.getWithdrawal).toHaveBeenCalledTimes(3)
  })

  it('marks the withdraw failed when Bridge cannot deliver', async () => {
    mockedApi.getWithdrawal.mockResolvedValue({
      ...withdrawal,
      payouts: [payout('drn_new', 'undeliverable'), oldPayout],
    })
    const { storeState } = await expectSaga(
      pollWithdrawalSaga,
      pollBridgeRampWithdrawal({ withdrawalId: 'wd_1' })
    )
      .withReducer(rootReducer, root(awaiting))
      .run()
    expect(storeState.bridgeramp.withdraw.status).toBe('failed')
    expect(storeState.bridgeramp.withdraw.errorCode).toBe('payout_undeliverable')
  })

  it('gives up without failing the operation', async () => {
    mockedApi.getWithdrawal.mockResolvedValue(withdrawal)
    const { storeState } = await expectSaga(
      pollWithdrawalSaga,
      pollBridgeRampWithdrawal({ withdrawalId: 'wd_1' })
    )
      .withReducer(
        rootReducer,
        root({
          ...withSession(),
          withdraw: {
            ...initialState.withdraw,
            status: 'awaiting_payout',
            withdrawal,
            knownPayoutIds: ['drn_old'],
          },
        })
      )
      .provide({ call: provideDelays })
      .put(withdrawPollTimedOut())
      .run({ timeout: 10_000 })
    expect(storeState.bridgeramp.withdraw.status).toBe('awaiting_payout')
    expect(mockedApi.getWithdrawal).toHaveBeenCalledTimes(120)
    // 120 polls through the saga runner; the saga's own run timeout is 10 s,
    // so the test needs more than jest's 5 s default when the suite runs in
    // parallel with the rest of the repo.
  }, 15_000)
})

describe('onSwapConfirmedSaga', () => {
  const reviewState = {
    ...withSession(),
    withdraw: { ...initialState.withdraw, status: 'review' as const, withdrawal, quote },
  }

  it('moves the withdraw to awaiting payout when the swap paid the deposit address', async () => {
    await expectSaga(onSwapConfirmedSaga)
      .withReducer(
        rootReducer,
        root({
          ...reviewState,
          swap: { ...initialState.swap, status: 'confirmed', recipient: LIQUIDATION.toUpperCase() },
        })
      )
      .put(withdrawAwaitingPayout())
      // Through the action, so takeLatest keeps one poll (the screen also
      // dispatches it on mount after a restart).
      .put(pollBridgeRampWithdrawal({ withdrawalId: 'wd_1' }))
      .run()
  })

  it('ignores swaps that went elsewhere', async () => {
    await expectSaga(onSwapConfirmedSaga)
      .withReducer(
        rootReducer,
        root({
          ...reviewState,
          swap: { ...initialState.swap, status: 'confirmed', recipient: USER },
        })
      )
      .not.put(withdrawAwaitingPayout())
      .run()
    expect(mockedApi.getWithdrawal).not.toHaveBeenCalled()
  })
})

// Skip real delays so polling loops run instantly.
function provideDelays(effect: any, next: () => any) {
  if (effect.fn && effect.fn.name === 'delayP') {
    return undefined
  }
  return next()
}

describe('convertBridgeDepositSaga', () => {
  const depositQuote: MentoQuote = {
    direction: 'usdcToCopm',
    amountIn: BigInt(100_000_000),
    amountOut: BigInt('319000000000000000000000'),
    amountInWhole: new BigNumber('100'),
    amountOutWhole: new BigNumber('319000'),
    copPerUsd: new BigNumber('3190'),
    quotedAt: NOW,
  }
  const usdcToken = { ...mockCusdTokenBalance, tokenId: networkConfig.usdcTokenId }
  const prepared = {
    type: 'possible' as const,
    transactions: [
      { from: USER, to: '0x1', data: '0x01', gas: BigInt(1), maxFeePerGas: BigInt(1) },
      { from: USER, to: '0x2', data: '0x02', gas: BigInt(2), maxFeePerGas: BigInt(1) },
    ] as any[],
    feeCurrency: mockCeloTokenBalance,
  }
  const providers = [
    [matchers.select(walletAddressSelector), USER],
    [matchers.select.selector(tokensByIdSelector), { [networkConfig.usdcTokenId]: usdcToken }],
    [matchers.select.selector(feeCurrenciesSelector), [mockCeloTokenBalance]],
  ] as any[]

  it('quotes, prices and executes the swap back into the wallet', async () => {
    jest.mocked(quoteMentoSwap).mockResolvedValue(depositQuote)
    jest.mocked(prepareBridgeRampCalls).mockResolvedValue(prepared)
    const executed = jest.fn()
    await expectSaga(
      convertBridgeDepositSaga,
      convertBridgeDeposit({ usdcAmount: '100000000', flowId: 'dep_1' })
    )
      .withReducer(rootReducer, root(initialState))
      .provide([
        ...providers,
        [
          matchers.call.fn(executeBridgeRampSwapSaga),
          dynamic(({ args }: { args: any[] }) => {
            executed(args[0])
          }),
        ],
      ])
      .run()

    expect(jest.mocked(quoteMentoSwap)).toHaveBeenCalledWith('usdcToCopm', BigInt(100_000_000))
    const prepareArgs = jest.mocked(prepareBridgeRampCalls).mock.calls[0][0]
    expect(prepareArgs.spendToken).toBe(usdcToken)
    expect(prepareArgs.spendTokenAmount).toBe(BigInt(100_000_000))
    expect(executed).toHaveBeenCalledWith(
      executeBridgeRampSwap({
        flowId: 'dep_1',
        direction: 'usdcToCopm',
        amountIn: '100000000',
        quotedAmountOut: '319000000000000000000000',
        quotedAt: NOW,
        recipient: USER,
        serializablePreparedTransactions: expect.any(Array),
      })
    )
  })

  it('fails closed when gas cannot be paid', async () => {
    jest.mocked(quoteMentoSwap).mockResolvedValue(depositQuote)
    jest.mocked(prepareBridgeRampCalls).mockResolvedValue({
      type: 'not-enough-balance-for-gas',
      feeCurrencies: [mockCeloTokenBalance],
    })
    await expectSaga(
      convertBridgeDepositSaga,
      convertBridgeDeposit({ usdcAmount: '100000000', flowId: 'dep_1' })
    )
      .withReducer(rootReducer, root(initialState))
      .provide(providers)
      .put(swapFailed({ code: 'insufficient_gas', flowId: 'dep_1' }))
      .not.call.fn(executeBridgeRampSwapSaga)
      .run()
  })

  it('converts what is left after gas when USDC is the only fee currency', async () => {
    jest
      .mocked(quoteMentoSwap)
      .mockImplementation(async (_d, amountIn) => ({ ...depositQuote, amountIn }))
    jest
      .mocked(prepareBridgeRampCalls)
      .mockResolvedValueOnce({
        type: 'need-decrease-spend-amount-for-gas',
        feeCurrency: usdcToken,
        maxGasFeeInDecimal: new BigNumber('0.05'),
        estimatedGasFeeInDecimal: new BigNumber('0.04'),
        // Whole USDC: the balance less the fee.
        decreasedSpendAmount: new BigNumber('99.95'),
      })
      .mockResolvedValueOnce(prepared)
    const executed = jest.fn()
    const { storeState } = await expectSaga(
      convertBridgeDepositSaga,
      convertBridgeDeposit({ usdcAmount: '100000000', flowId: 'dep_1' })
    )
      .withReducer(rootReducer, {
        ...root(initialState),
        bridgeramp: {
          ...initialState,
          deposit: {
            ...initialState.deposit,
            pending: { usdcAmount: '100000000', flowId: 'dep_1' },
          },
        },
      })
      .provide([
        ...providers,
        [
          matchers.call.fn(executeBridgeRampSwapSaga),
          dynamic(({ args }: { args: any[] }) => {
            executed(args[0])
          }),
        ],
      ])
      .run()
    expect(jest.mocked(quoteMentoSwap)).toHaveBeenLastCalledWith('usdcToCopm', BigInt(99_950_000))
    expect(jest.mocked(prepareBridgeRampCalls).mock.calls[1][0].spendTokenAmount).toBe(
      BigInt(99_950_000)
    )
    expect(executed.mock.calls[0][0].payload.amountIn).toBe('99950000')
    expect(storeState.bridgeramp.deposit.pending?.convertAmount).toBe('99950000')
  })

  it('says gas cannot be paid when even the smaller amount does not fit', async () => {
    const needDecrease = {
      type: 'need-decrease-spend-amount-for-gas' as const,
      feeCurrency: usdcToken,
      maxGasFeeInDecimal: new BigNumber('0.05'),
      estimatedGasFeeInDecimal: new BigNumber('0.04'),
      decreasedSpendAmount: new BigNumber('99.95'),
    }
    jest.mocked(quoteMentoSwap).mockResolvedValue(depositQuote)
    jest.mocked(prepareBridgeRampCalls).mockResolvedValue(needDecrease)
    await expectSaga(
      convertBridgeDepositSaga,
      convertBridgeDeposit({ usdcAmount: '100000000', flowId: 'dep_1' })
    )
      .withReducer(rootReducer, root(initialState))
      .provide(providers)
      .put(swapFailed({ code: 'insufficient_gas', flowId: 'dep_1' }))
      .not.call.fn(executeBridgeRampSwapSaga)
      .run()
    // One retry with the smaller amount, never a loop.
    expect(jest.mocked(prepareBridgeRampCalls)).toHaveBeenCalledTimes(2)
  })

  it('waits for the market when the oracle cannot quote', async () => {
    jest.mocked(quoteMentoSwap).mockRejectedValue(new MentoOracleUnavailableError())
    await expectSaga(
      convertBridgeDepositSaga,
      convertBridgeDeposit({ usdcAmount: '100000000', flowId: 'dep_1' })
    )
      .withReducer(rootReducer, root(initialState))
      .provide(providers)
      .put(swapFailed({ code: 'market_closed', flowId: 'dep_1' }))
      .run()
    expect(jest.mocked(prepareBridgeRampCalls)).not.toHaveBeenCalled()
  })

  it('only waits for a conversion that was already broadcast', async () => {
    const executed = jest.fn()
    await expectSaga(
      convertBridgeDepositSaga,
      convertBridgeDeposit({ usdcAmount: '100000000', flowId: 'dep_1' })
    )
      .withReducer(rootReducer, {
        ...root(initialState),
        sentTransactionLog: {
          byFlow: {
            'bridgeramp-dep_1': [
              {
                flowId: 'bridgeramp-dep_1',
                index: 1,
                nonce: 3,
                hash: '0xb',
                status: 'pending' as const,
              },
            ],
          },
        },
      })
      .provide([
        ...providers,
        [
          matchers.call.fn(executeBridgeRampSwapSaga),
          dynamic(({ args }: { args: any[] }) => {
            executed(args[0])
          }),
        ],
      ])
      .run()
    expect(jest.mocked(quoteMentoSwap)).not.toHaveBeenCalled()
    expect(executed).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ flowId: 'dep_1', direction: 'usdcToCopm' }),
      })
    )
  })

  it('fails closed when quoting throws for another reason', async () => {
    jest.mocked(quoteMentoSwap).mockRejectedValue(new Error('rpc down'))
    await expectSaga(
      convertBridgeDepositSaga,
      convertBridgeDeposit({ usdcAmount: '100000000', flowId: 'dep_1' })
    )
      .withReducer(rootReducer, root(initialState))
      .provide(providers)
      .put(swapFailed({ code: 'broadcast_failed', flowId: 'dep_1' }))
      .run()
    expect(jest.mocked(prepareBridgeRampCalls)).not.toHaveBeenCalled()
  })
})

describe('deposit sagas', () => {
  const account = {
    id: 'dep_1',
    product: 'deposit',
    status: 'active',
    wallet: USER,
    deposit_instructions: {
      rail: 'bre_b',
      currency: 'COP',
      bre_b_key: '@U6X8YSHWJ',
      account_holder_name: 'X',
      bank_name: null,
    },
    destination: { address: USER, chain: 'eip155:42220', asset: 'USDC', token_contract: '0x0' },
    created_at: '',
    updated_at: '',
  } as unknown as api.DepositAccount

  // On-chain USDC balance in base units (6 decimals), or null when unknown.
  function usdcOnChain(whole: string | null) {
    return [
      matchers.call.fn(fetchUsdcBalanceOnChain),
      whole === null ? null : BigInt(new BigNumber(whole).shiftedBy(6).toFixed(0)),
    ] as any
  }
  const wallet = [matchers.select(walletAddressSelector), USER] as any

  function readyDeposit(overrides: Partial<SliceState['deposit']> = {}): SliceState {
    return {
      ...withSession(),
      deposit: {
        ...initialState.deposit,
        status: 'ready',
        account,
        usdcBaseline: '5000000',
        // The instructions were on screen a minute ago.
        instructionsShownAt: NOW * 1000 - 60_000,
        ...overrides,
      },
    }
  }

  function confirmedSwap(flowId: string, amountIn = '100000000') {
    return { ...initialState.swap, status: 'confirmed' as const, flowId, amountIn }
  }

  it('creates the deposit account with a per-wallet key and records the on-chain baseline', async () => {
    mockedApi.createDepositAccount.mockResolvedValue(account)
    const { storeState } = await expectSaga(startDepositSaga)
      .withReducer(rootReducer, root(withSession()))
      .provide([wallet, usdcOnChain('5')])
      .run()
    expect(mockedApi.createDepositAccount).toHaveBeenCalledWith(
      'tps_live',
      { wallet_address: USER },
      `deposit-${USER.toLowerCase()}`
    )
    expect(storeState.bridgeramp.deposit).toMatchObject({
      status: 'ready',
      account,
      usdcBaseline: '5000000',
      instructionsShownAt: NOW * 1000,
    })
  })

  it('records the server error code when the account cannot be created', async () => {
    mockedApi.createDepositAccount.mockRejectedValue(rampError('product_not_enabled', 403))
    const { storeState } = await expectSaga(startDepositSaga)
      .withReducer(rootReducer, root(withSession()))
      .provide([wallet, usdcOnChain('0')])
      .run()
    expect(storeState.bridgeramp.deposit).toMatchObject({
      status: 'failed',
      errorCode: 'product_not_enabled',
    })
  })

  it('reads the USDC balance on-chain, not from the token store', async () => {
    await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit()))
      .provide([wallet, usdcOnChain('5')])
      .call(fetchUsdcBalanceOnChain, USER)
      .not.select.selector(tokensByIdSelector)
      .run()
  })

  it('does nothing while the balance has not moved', async () => {
    await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit()))
      .provide([wallet, usdcOnChain('5')])
      .not.call.fn(convertBridgeDepositSaga)
      .run()
  })

  it('converts the USDC above the baseline', async () => {
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit()))
      .provide([
        wallet,
        usdcOnChain('105'),
        [
          matchers.call.fn(convertBridgeDepositSaga),
          dynamic(({ args }: { args: any[] }) => {
            expect(args[0].payload.usdcAmount).toBe('100000000')
            return undefined
          }),
        ],
      ])
      .run()
    // The provided convert does not touch the swap slice, so the deposit
    // stays pending (what a failed or unconfirmed swap looks like).
    expect(storeState.bridgeramp.deposit.pending).toEqual({
      usdcAmount: '100000000',
      flowId: `dep-dep_1-${NOW * 1000}`,
    })
    expect(storeState.bridgeramp.deposit.converting).toBe(false)
  })

  it('never converts the same deposit twice when a lagging read still shows the spent USDC', async () => {
    const flowId = 'dep-dep_1-1'
    // The conversion confirms; the node read right after still shows the
    // 100 USDC it spent.
    const settled = await expectSaga(retryDepositConversionSaga)
      .withReducer(
        rootReducer,
        root({
          ...readyDeposit({ pending: { usdcAmount: '100000000', flowId } }),
          swap: confirmedSwap(flowId),
        })
      )
      .provide([
        wallet,
        usdcOnChain('105'),
        [matchers.call.fn(convertBridgeDepositSaga), undefined],
      ])
      .run()
    const afterSettle = settled.storeState.bridgeramp
    expect(afterSettle.deposit).toMatchObject({
      pending: null,
      usdcBaseline: '5000000',
      settledAt: NOW * 1000,
    })

    // Next tick: still the stale 105. Nothing is detected or signed.
    const tick = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(afterSettle))
      .provide([wallet, usdcOnChain('105')])
      .not.call.fn(convertBridgeDepositSaga)
      .run()
    expect(tick.storeState.bridgeramp.deposit.pending).toBeNull()

    // The node catches up (5 USDC): the guard lifts...
    const caughtUp = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(tick.storeState.bridgeramp))
      .provide([wallet, usdcOnChain('5')])
      .run()
    expect(caughtUp.storeState.bridgeramp.deposit.settledAt).toBeNull()

    // ...and the next real deposit is detected again.
    const next = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(caughtUp.storeState.bridgeramp))
      .provide([wallet, usdcOnChain('25'), [matchers.call.fn(convertBridgeDepositSaga), undefined]])
      .run()
    expect(next.storeState.bridgeramp.deposit.pending?.usdcAmount).toBe('20000000')
  })

  it('stops ignoring increases once the settle guard times out', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000 + SETTLE_GUARD_MS + 1)
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(
        rootReducer,
        root(readyDeposit({ settledAt: NOW * 1000, instructionsShownAt: NOW * 1000 }))
      )
      .provide([wallet, usdcOnChain('25'), [matchers.call.fn(convertBridgeDepositSaga), undefined]])
      .run()
    expect(storeState.bridgeramp.deposit.pending?.usdcAmount).toBe('20000000')
  })

  it('moves the baseline after a confirmed conversion', async () => {
    const flowId = 'dep-dep_1-1'
    const { storeState } = await expectSaga(retryDepositConversionSaga)
      .withReducer(
        rootReducer,
        root({
          ...readyDeposit({ pending: { usdcAmount: '100000000', flowId } }),
          swap: confirmedSwap(flowId),
        })
      )
      .provide([
        wallet,
        [matchers.call.fn(convertBridgeDepositSaga), undefined],
        // Dust left after the swap.
        usdcOnChain('5.000001'),
      ])
      .run()
    // The swap spent exactly the pending USDC: the baseline stays where it
    // was, and the extra base unit is left for the next check to see.
    expect(storeState.bridgeramp.deposit.pending).toBeNull()
    expect(storeState.bridgeramp.deposit.usdcBaseline).toBe('5000000')
  })

  it('lowers the baseline after the conversion paid gas in USDC', async () => {
    const flowId = 'dep-dep_1-1'
    const { storeState } = await expectSaga(retryDepositConversionSaga)
      .withReducer(
        rootReducer,
        root({
          ...readyDeposit({ pending: { usdcAmount: '100000000', flowId } }),
          swap: confirmedSwap(flowId),
        })
      )
      .provide([
        wallet,
        [matchers.call.fn(convertBridgeDepositSaga), undefined],
        usdcOnChain('4.99'),
      ])
      .run()
    expect(storeState.bridgeramp.deposit.usdcBaseline).toBe('4990000')
  })

  it('keeps the part of a deposit that paid for gas in the baseline', async () => {
    const flowId = 'dep-dep_1-1'
    const { storeState } = await expectSaga(retryDepositConversionSaga)
      .withReducer(
        rootReducer,
        root({
          ...readyDeposit({
            pending: { usdcAmount: '100000000', flowId, convertAmount: '99950000' },
          }),
          swap: confirmedSwap(flowId, '99950000'),
        })
      )
      .provide([
        wallet,
        [matchers.call.fn(convertBridgeDepositSaga), undefined],
        // Lagging node: still the full deposit.
        usdcOnChain('105'),
      ])
      .run()
    expect(storeState.bridgeramp.deposit.usdcBaseline).toBe('5050000')
  })

  it('follows the balance down when USDC leaves the wallet', async () => {
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit()))
      .provide([wallet, usdcOnChain('2')])
      .not.call.fn(convertBridgeDepositSaga)
      .run()
    expect(storeState.bridgeramp.deposit.usdcBaseline).toBe('2000000')
  })

  it('then measures the next deposit from the lowered baseline', async () => {
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit({ usdcBaseline: '2000000' })))
      .provide([wallet, usdcOnChain('52'), [matchers.call.fn(convertBridgeDepositSaga), undefined]])
      .run()
    expect(storeState.bridgeramp.deposit.pending?.usdcAmount).toBe('50000000')
  })

  it('ignores dust above the baseline', async () => {
    await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit()))
      .provide([wallet, usdcOnChain('5.000001')])
      .not.call.fn(convertBridgeDepositSaga)
      .run()
  })

  it('does not set a baseline of 0 while the USDC balance is unknown', async () => {
    mockedApi.createDepositAccount.mockResolvedValue(account)
    const { storeState } = await expectSaga(startDepositSaga)
      .withReducer(rootReducer, root(withSession()))
      .provide([wallet, usdcOnChain(null)])
      .run()
    expect(storeState.bridgeramp.deposit).toMatchObject({ status: 'ready', usdcBaseline: null })
  })

  it('sets the baseline on the first check once the balance is known, without converting', async () => {
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit({ usdcBaseline: null })))
      .provide([wallet, usdcOnChain('42')])
      .not.call.fn(convertBridgeDepositSaga)
      .run()
    expect(storeState.bridgeramp.deposit.usdcBaseline).toBe('42000000')
    expect(storeState.bridgeramp.deposit.pending).toBeNull()
  })

  it('converts a payout that arrived while the app was closed, within the window', async () => {
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(
        rootReducer,
        root(readyDeposit({ instructionsShownAt: NOW * 1000 - DEPOSIT_WINDOW_MS + 60_000 }))
      )
      .provide([
        wallet,
        usdcOnChain('105'),
        [matchers.call.fn(convertBridgeDepositSaga), undefined],
      ])
      .call.fn(convertBridgeDepositSaga)
      .run()
    expect(storeState.bridgeramp.deposit.pending?.usdcAmount).toBe('100000000')
  })

  it('re-baselines instead of converting USDC that arrived long after the instructions', async () => {
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(
        rootReducer,
        root(readyDeposit({ instructionsShownAt: NOW * 1000 - DEPOSIT_WINDOW_MS - 1 }))
      )
      .provide([wallet, usdcOnChain('105')])
      .not.call.fn(convertBridgeDepositSaga)
      .run()
    expect(storeState.bridgeramp.deposit).toMatchObject({
      pending: null,
      usdcBaseline: '105000000',
      instructionsShownAt: NOW * 1000,
    })
  })

  it('keeps the window open while the instructions are on screen', async () => {
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit()))
      .provide([wallet, usdcOnChain('5')])
      .run()
    expect(storeState.bridgeramp.deposit.instructionsShownAt).toBe(NOW * 1000)
  })

  it('keeps retrying a conversion that waits for the market', async () => {
    const flowId = 'dep-dep_1-1'
    await expectSaga(checkDepositSaga)
      .withReducer(
        rootReducer,
        root({
          ...readyDeposit({ pending: { usdcAmount: '100000000', flowId } }),
          swap: { ...initialState.swap, status: 'failed', flowId, errorCode: 'market_closed' },
        })
      )
      .provide([[matchers.call.fn(convertBridgeDepositSaga), undefined]])
      .call.fn(convertBridgeDepositSaga)
      .run()
  })

  it('leaves a failed conversion for the user to retry', async () => {
    const flowId = 'dep-dep_1-1'
    await expectSaga(checkDepositSaga)
      .withReducer(
        rootReducer,
        root({
          ...readyDeposit({ pending: { usdcAmount: '100000000', flowId } }),
          swap: { ...initialState.swap, status: 'failed', flowId },
        })
      )
      .not.call.fn(convertBridgeDepositSaga)
      .run()
  })

  it('marks the conversion as running while it quotes, so retry cannot start a second one', async () => {
    const flowId = 'dep-dep_1-1'
    const seen: boolean[] = []
    await expectSaga(retryDepositConversionSaga)
      .withReducer(
        rootReducer,
        root({
          ...readyDeposit({ pending: { usdcAmount: '100000000', flowId } }),
          swap: { ...initialState.swap, status: 'failed', flowId, errorCode: 'market_closed' },
        })
      )
      .provide([
        [
          matchers.call.fn(convertBridgeDepositSaga),
          dynamic(() => {
            seen.push(true)
            return undefined
          }),
        ],
      ])
      .put(depositConverting({ converting: true }))
      .put(depositConverting({ converting: false }))
      .run()
    expect(seen).toHaveLength(1)
  })

  it('does not start a conversion while another one is running', async () => {
    const flowId = 'dep-dep_1-1'
    const running = readyDeposit({ pending: { usdcAmount: '100000000', flowId }, converting: true })
    await expectSaga(retryDepositConversionSaga)
      .withReducer(rootReducer, root(running))
      .not.call.fn(convertBridgeDepositSaga)
      .run()
    await expectSaga(checkDepositSaga)
      .withReducer(
        rootReducer,
        root({
          ...running,
          swap: { ...initialState.swap, status: 'failed', flowId, errorCode: 'market_closed' },
        })
      )
      .not.call.fn(convertBridgeDepositSaga)
      .run()
  })

  it('runs arrival checks and retries through one worker', async () => {
    // A real channel: an action that arrives while the worker is busy is
    // dropped, as on the device (expectSaga would queue it instead).
    const flowId = 'dep-dep_1-1'
    let state: any = root({
      ...readyDeposit({ pending: { usdcAmount: '100000000', flowId } }),
      swap: { ...initialState.swap, status: 'failed', flowId, errorCode: 'market_closed' },
    })
    const channel = stdChannel()
    let converts = 0
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const task = runSaga(
      {
        channel,
        dispatch: (action: any) => {
          state = rootReducer(state, action)
          channel.put(action)
        },
        getState: () => state,
        effectMiddlewares: [
          (next: (effect: any) => void) => (effect: any) => {
            if (effect?.type === 'CALL' && effect.payload.fn === convertBridgeDepositSaga) {
              converts++
              return next(rawCall(() => gate))
            }
            return next(effect)
          },
        ],
      },
      function* () {
        yield rawTakeLeading(
          [checkBridgeRampDeposit.type, retryBridgeRampDepositConversion.type],
          depositWorkerSaga
        )
      }
    )
    channel.put(checkBridgeRampDeposit())
    // The user taps retry and the next tick fires while the first conversion
    // is still quoting.
    channel.put(retryBridgeRampDepositConversion())
    channel.put(checkBridgeRampDeposit())
    expect(state.bridgeramp.deposit.converting).toBe(true)
    release()
    await gate
    await Promise.resolve()
    task.cancel()
    expect(converts).toBe(1)
  })
})
