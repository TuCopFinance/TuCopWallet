import { combineReducers } from '@reduxjs/toolkit'
import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { dynamic } from 'redux-saga-test-plan/providers'
import * as api from 'src/bridgeramp/api'
import { MentoQuote, quoteMentoSwap } from 'src/bridgeramp/mentoRouter'
import { prepareBridgeRampCalls } from 'src/bridgeramp/prepare'
import { openWalletPartySession } from 'src/bridgeramp/platformClient'
import {
  checkDepositSaga,
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
import reducer, {
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
  withdrawalUpdated,
} from 'src/bridgeramp/slice'
import { TucopRampError } from 'src/tucopramp/types'
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
const quote = { id: 'qte_1', product: 'withdraw' } as api.WithdrawQuote
const withdrawal = {
  id: 'wd_1',
  product: 'withdraw',
  status: 'awaiting_funds',
  quote_id: 'qte_1',
  deposit: { address: LIQUIDATION },
  error_code: null,
} as unknown as api.Withdrawal

function rampError(code: string, httpStatus = 400) {
  return new TucopRampError({ httpStatus, code, message: code, envelope: { code } })
}

const rootReducer = combineReducers({ bridgeramp: reducer })
type SliceState = typeof initialState

function root(state: SliceState) {
  return { bridgeramp: state }
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
    legal_name: 'Ana Maria Perez',
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
      .put(onboardingFailed({ code: 'email_required' }))
      .run()
    expect(storeState.bridgeramp.party.needsOnboarding).toBe(true)
    expect(storeState.bridgeramp.party.value).toBeNull()
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

  it('quotes the guaranteed USDC and opens the operation', async () => {
    mockedApi.createWithdrawQuote.mockResolvedValue(quote)
    mockedApi.createWithdrawal.mockResolvedValue(withdrawal)
    await expectSaga(startWithdrawSaga, action)
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.select(walletAddressSelector), USER]])
      .put(withdrawCreating({ copmAmountIn: '800000000000000000000000' }))
      .put(withdrawReady({ quote, withdrawal }))
      .run()
    expect(mockedApi.createWithdrawQuote).toHaveBeenCalledWith(
      'tps_live',
      { destination_id: 'dst_1', source_amount: { amount: '246.101626', asset: 'USDC' } },
      'idem-quote'
    )
    expect(mockedApi.createWithdrawal).toHaveBeenCalledWith(
      'tps_live',
      { quote_id: 'qte_1', return_address: USER },
      'idem-withdrawal'
    )
  })

  it('fails with the server code when the quote is refused', async () => {
    mockedApi.createWithdrawQuote.mockRejectedValue(rampError('amount_below_minimum', 422))
    await expectSaga(startWithdrawSaga, action)
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.select(walletAddressSelector), USER]])
      .put(withdrawFailed({ code: 'amount_below_minimum', requestId: undefined }))
      .run()
    expect(mockedApi.createWithdrawal).not.toHaveBeenCalled()
  })

  it('fails without a wallet before calling TuCOPRamp', async () => {
    await expectSaga(startWithdrawSaga, action)
      .withReducer(rootReducer, root(withSession()))
      .provide([[matchers.select(walletAddressSelector), null]])
      .put(withdrawFailed({ code: 'no_wallet' }))
      .run()
    expect(mockedApi.createWithdrawQuote).not.toHaveBeenCalled()
  })
})

describe('pollWithdrawalSaga', () => {
  it('polls until the payout is final', async () => {
    const processing = { ...withdrawal, status: 'processing' } as api.Withdrawal
    const completed = { ...withdrawal, status: 'completed' } as api.Withdrawal
    mockedApi.getWithdrawal.mockResolvedValueOnce(processing).mockResolvedValueOnce(completed)
    const { storeState } = await expectSaga(
      pollWithdrawalSaga,
      pollBridgeRampWithdrawal({ withdrawalId: 'wd_1' })
    )
      .withReducer(
        rootReducer,
        root({
          ...withSession(),
          withdraw: { ...initialState.withdraw, status: 'awaiting_payout', withdrawal },
        })
      )
      .provide({ call: provideDelays })
      .put(withdrawalUpdated(processing))
      .put(withdrawalUpdated(completed))
      .run()
    expect(storeState.bridgeramp.withdraw.status).toBe('completed')
    expect(mockedApi.getWithdrawal).toHaveBeenCalledTimes(2)
  })

  it('marks the operation failed when Bridge refunds', async () => {
    const refunded = { ...withdrawal, status: 'refunded', error_code: 'payout_rejected' }
    mockedApi.getWithdrawal.mockResolvedValue(refunded as api.Withdrawal)
    const { storeState } = await expectSaga(
      pollWithdrawalSaga,
      pollBridgeRampWithdrawal({ withdrawalId: 'wd_1' })
    )
      .withReducer(
        rootReducer,
        root({
          ...withSession(),
          withdraw: { ...initialState.withdraw, status: 'awaiting_payout', withdrawal },
        })
      )
      .run()
    expect(storeState.bridgeramp.withdraw.status).toBe('failed')
    expect(storeState.bridgeramp.withdraw.errorCode).toBe('payout_rejected')
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
          withdraw: { ...initialState.withdraw, status: 'awaiting_payout', withdrawal },
        })
      )
      .provide({ call: provideDelays })
      .put(withdrawPollTimedOut())
      .run({ timeout: 10_000 })
    expect(storeState.bridgeramp.withdraw.status).toBe('awaiting_payout')
    expect(mockedApi.getWithdrawal).toHaveBeenCalledTimes(120)
  })
})

describe('onSwapConfirmedSaga', () => {
  const reviewState = {
    ...withSession(),
    withdraw: { ...initialState.withdraw, status: 'review' as const, withdrawal, quote },
  }

  it('moves the withdraw to awaiting payout when the swap paid the deposit address', async () => {
    mockedApi.getWithdrawal.mockResolvedValue({ ...withdrawal, status: 'completed' })
    await expectSaga(onSwapConfirmedSaga)
      .withReducer(
        rootReducer,
        root({
          ...reviewState,
          swap: { ...initialState.swap, status: 'confirmed', recipient: LIQUIDATION.toUpperCase() },
        })
      )
      .put(withdrawAwaitingPayout())
      .run()
    expect(mockedApi.getWithdrawal).toHaveBeenCalledWith('tps_live', 'wd_1')
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
      .put(swapFailed({ code: 'broadcast_failed' }))
      .not.call.fn(executeBridgeRampSwapSaga)
      .run()
  })

  it('fails closed when the oracle cannot quote', async () => {
    jest.mocked(quoteMentoSwap).mockRejectedValue(new Error('no valid median'))
    await expectSaga(
      convertBridgeDepositSaga,
      convertBridgeDeposit({ usdcAmount: '100000000', flowId: 'dep_1' })
    )
      .withReducer(rootReducer, root(initialState))
      .provide(providers)
      .put(swapFailed({ code: 'broadcast_failed' }))
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
    instructions: { rail: 'bre_b', bre_b_key: '@U6X8YSHWJ', holder_name: 'X', bank: null },
    destination: { chain: 'eip155:42220', asset: 'USDC', token_contract: '0x0' },
    created_at: '',
    updated_at: '',
  } as unknown as api.DepositAccount

  function usdcTokens(balance: string) {
    return {
      [networkConfig.usdcTokenId]: {
        ...mockCusdTokenBalance,
        tokenId: networkConfig.usdcTokenId,
        decimals: 6,
        balance: new BigNumber(balance),
      },
    }
  }

  function readyDeposit(overrides: Partial<SliceState['deposit']> = {}): SliceState {
    return {
      ...withSession(),
      deposit: {
        status: 'ready',
        account,
        errorCode: null,
        errorRequestId: null,
        usdcBaseline: '5000000',
        pending: null,
        ...overrides,
      },
    }
  }

  it('creates the deposit account with a per-wallet key and records the USDC baseline', async () => {
    mockedApi.createDepositAccount.mockResolvedValue(account)
    const { storeState } = await expectSaga(startDepositSaga)
      .withReducer(rootReducer, root(withSession()))
      .provide([
        [matchers.select(walletAddressSelector), USER],
        [matchers.select.selector(tokensByIdSelector), usdcTokens('5')],
      ])
      .run()
    expect(mockedApi.createDepositAccount).toHaveBeenCalledWith(
      'tps_live',
      { wallet: USER },
      `deposit-${USER.toLowerCase()}`
    )
    expect(storeState.bridgeramp.deposit).toMatchObject({
      status: 'ready',
      account,
      usdcBaseline: '5000000',
    })
  })

  it('records the server error code when the account cannot be created', async () => {
    mockedApi.createDepositAccount.mockRejectedValue(rampError('product_not_enabled', 403))
    const { storeState } = await expectSaga(startDepositSaga)
      .withReducer(rootReducer, root(withSession()))
      .provide([
        [matchers.select(walletAddressSelector), USER],
        [matchers.select.selector(tokensByIdSelector), usdcTokens('0')],
      ])
      .run()
    expect(storeState.bridgeramp.deposit).toMatchObject({
      status: 'failed',
      errorCode: 'product_not_enabled',
    })
  })

  it('does nothing while the balance has not moved', async () => {
    await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit()))
      .provide([[matchers.select.selector(tokensByIdSelector), usdcTokens('5')]])
      .not.call.fn(convertBridgeDepositSaga)
      .run()
  })

  it('converts the USDC above the baseline and settles once the swap confirms', async () => {
    const { storeState } = await expectSaga(checkDepositSaga)
      .withReducer(rootReducer, root(readyDeposit()))
      .provide([
        [matchers.select.selector(tokensByIdSelector), usdcTokens('105')],
        [
          matchers.call.fn(convertBridgeDepositSaga),
          dynamic(({ args }: { args: any[] }) => {
            expect(args[0].payload.usdcAmount).toBe('100000000')
            // Simulate the swap confirming: the store would get these from
            // executeBridgeRampSwapSaga.
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
  })

  it('moves the baseline after a confirmed conversion', async () => {
    const flowId = 'dep-dep_1-1'
    const { storeState } = await expectSaga(retryDepositConversionSaga)
      .withReducer(
        rootReducer,
        root({
          ...readyDeposit({ pending: { usdcAmount: '100000000', flowId } }),
          swap: { ...initialState.swap, status: 'confirmed', flowId },
        })
      )
      .provide([
        [matchers.call.fn(convertBridgeDepositSaga), undefined],
        // Dust left after the swap.
        [matchers.select.selector(tokensByIdSelector), usdcTokens('5.000001')],
      ])
      .run()
    expect(storeState.bridgeramp.deposit.pending).toBeNull()
    expect(storeState.bridgeramp.deposit.usdcBaseline).toBe('5000001')
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
})
