import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { AppState } from 'react-native'
import { Provider } from 'react-redux'
import BridgeRampFlow from 'src/bridgeramp/BridgeRampFlow'
import { getCopmOracleStatus } from 'src/bridgeramp/mentoOracle'
import {
  MentoOracleUnavailableError,
  MentoQuote,
  USDC_ADDRESS_CELO,
  quoteMentoSwap,
} from 'src/bridgeramp/mentoRouter'
import { prepareBridgeRampCalls } from 'src/bridgeramp/prepare'
import {
  checkBridgeRampDeposit,
  createBridgeRampParty,
  checkBridgeRampWithdrawSwap,
  executeBridgeRampSwap,
  fetchBridgeRampDestinations,
  fetchBridgeRampParty,
  pollBridgeRampWithdrawal,
  retryBridgeRampDepositConversion,
  startBridgeRampDeposit,
  startBridgeRampWithdraw,
} from 'src/bridgeramp/saga'
import {
  depositReset,
  initialState as bridgerampInitialState,
  withdrawReset,
} from 'src/bridgeramp/slice'
import { refreshAllBalances } from 'src/home/actions'
import { Screens } from 'src/navigator/Screens'
import { RootState } from 'src/redux/reducers'
import { NetworkId } from 'src/transactions/types'
import { COPM_TOKEN_ID_MAINNET } from 'src/web3/networkConfig'
import { RecursivePartial, createMockStore, getMockStackScreenProps } from 'test/utils'
import { mockCeloTokenId, mockTokenBalances } from 'test/values'

jest.mock('src/bridgeramp/mentoOracle')
jest.mock('src/bridgeramp/mentoRouter', () => ({
  ...jest.requireActual('src/bridgeramp/mentoRouter'),
  quoteMentoSwap: jest.fn(),
}))
jest.mock('src/bridgeramp/prepare', () => ({
  ...jest.requireActual('src/bridgeramp/prepare'),
  prepareBridgeRampCalls: jest.fn(),
}))

const mockOracle = jest.mocked(getCopmOracleStatus)
const mockQuote = jest.mocked(quoteMentoSwap)
const mockPrepare = jest.mocked(prepareBridgeRampCalls)

const USER = '0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856'
const LIQUIDATION = '0xe2d21f9bd38d4555c340395d31af39ee3b11a995'

const freshOracle = {
  fresh: true,
  lastReportAt: 1_791_579_364,
  ageSeconds: 60,
  expirySeconds: 360,
  copPerUsd: 3195,
}

const withdrawQuote: MentoQuote = {
  direction: 'copmToUsdc',
  amountIn: BigInt('800000000000000000000000'),
  amountOut: BigInt(247_338_318),
  amountInWhole: new BigNumber('800000'),
  amountOutWhole: new BigNumber('247.338318'),
  copPerUsd: new BigNumber('3234.44'),
  quotedAt: Math.floor(Date.now() / 1000),
}

const verifiedParty = {
  id: 'pty_1',
  type: 'individual' as const,
  status: { kyc: 'approved', tos: 'accepted', endorsements: [{ name: 'cop', status: 'approved' }] },
  restricted: false,
  created_at: '',
  updated_at: '',
}

const destination = {
  id: 'dst_1',
  ownership: 'first_party' as const,
  rail: 'bre_b' as const,
  status: 'verified' as const,
  key_masked: '****4567',
  owner_name: null,
  holder: { name: 'ANA PEREZ', bank: 'Bancolombia', document_last4: '4821' },
  rejection_reason: null,
  verified_at: '',
  confirmed_at: null,
  created_at: '',
  updated_at: '',
}

const tucopQuote = {
  id: 'qte_1',
  product: 'withdraw' as const,
  destination_id: 'dst_1',
  destination_amount: { amount: '790000.00', asset: 'COP' },
  source_amount: { amount: '246.101626', asset: 'USDC' },
  fees: { tucop: { amount: '2.461016', asset: 'USDC' } },
  rate: {
    value: '3210',
    base: 'USDC' as const,
    quote: 'COP' as const,
    source: 'bridge',
    observed_at: '',
  },
  rounding_mode: 'ceil' as const,
  expires_at: '',
  created_at: '',
}

const withdrawal = {
  id: 'wdr_1',
  product: 'withdraw' as const,
  status: 'active' as const,
  destination_id: 'dst_1',
  deposit: {
    address: LIQUIDATION as `0x${string}`,
    chain: 'eip155:42220' as const,
    asset: 'USDC' as const,
    token_contract: USDC_ADDRESS_CELO,
    minimum_destination_amount: { amount: '4000.00', asset: 'COP' },
  },
  fee_bps: 150,
  return_address: USER as `0x${string}`,
  payouts: [],
  created_at: '',
}

function readyState(overrides: RecursivePartial<RootState['bridgeramp']> = {}) {
  return {
    ...bridgerampInitialState,
    party: {
      status: 'loaded',
      value: verifiedParty,
      needsOnboarding: false,
      errorCode: null,
      onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
    },
    destinations: {
      status: 'loaded',
      items: [destination],
      errorCode: null,
      registering: { destinationId: null, status: 'idle' },
    },
    ...overrides,
  } as RootState['bridgeramp']
}

function renderFlow(
  direction: 'offramp' | 'onramp',
  bridgeramp: RootState['bridgeramp'] = bridgerampInitialState
) {
  const store = createMockStore({
    web3: { account: USER },
    bridgeramp,
    tokens: {
      tokenBalances: {
        [mockCeloTokenId]: mockTokenBalances[mockCeloTokenId],
        [COPM_TOKEN_ID_MAINNET]: {
          tokenId: COPM_TOKEN_ID_MAINNET,
          networkId: NetworkId['celo-mainnet'],
          address: '0x8a567e2ae79ca692bd748ab832081c45de4041ea',
          symbol: 'COPm',
          name: 'Peso digital',
          decimals: 18,
          imageUrl: '',
          balance: '1000000',
          priceUsd: '0.00031',
          priceFetchedAt: Date.now(),
          isFeeCurrency: true,
        },
      },
    },
  })
  const utils = render(
    <Provider store={store}>
      <BridgeRampFlow {...getMockStackScreenProps(Screens.BridgeRampFlow, { direction })} />
    </Provider>
  )
  return { ...utils, store }
}

async function typeAmount(getByTestId: (id: string) => any, amount: string) {
  fireEvent.changeText(getByTestId('bridgeramp-amount'), amount)
  await act(async () => {
    jest.advanceTimersByTime(500)
  })
}

describe('BridgeRampFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockOracle.mockResolvedValue(freshOracle)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('deposit', () => {
    const depositAccount = {
      id: 'dep_1',
      product: 'deposit' as const,
      status: 'active',
      deposit_instructions: {
        rail: 'bre_b' as const,
        currency: 'COP' as const,
        bre_b_key: '@U6X8YSHWJ',
        account_holder_name: 'BRIDGE PARTNER BANK',
        bank_name: null,
      },
      destination: {
        address: USER as `0x${string}`,
        chain: 'eip155:42220' as const,
        asset: 'USDC' as const,
        token_contract: USDC_ADDRESS_CELO,
      },
      fee_bps: 150,
      created_at: '',
    }

    it('loads the party and asks for the deposit account once it can transact', () => {
      const { store } = renderFlow('onramp', readyState())
      expect(store.getActions()).toEqual(
        expect.arrayContaining([fetchBridgeRampParty(), startBridgeRampDeposit()])
      )
      expect(store.getActions()).not.toEqual(
        expect.arrayContaining([fetchBridgeRampDestinations()])
      )
    })

    it('shows the Bre-B key to pay and checks for arrivals while waiting', async () => {
      const { getByTestId, store } = renderFlow(
        'onramp',
        readyState({
          deposit: {
            status: 'ready',
            account: depositAccount,
            errorCode: null,
            errorRequestId: null,
            usdcBaseline: '0',
            pending: null,
          },
        })
      )
      expect(getByTestId('bridgeramp-deposit-instructions')).toBeTruthy()
      expect(getByTestId('bridgeramp-deposit-key/Value')).toHaveTextContent('@U6X8YSHWJ')
      expect(getByTestId('bridgeramp-deposit-waiting')).toBeTruthy()
      expect(store.getActions()).toEqual(expect.arrayContaining([checkBridgeRampDeposit()]))

      await act(async () => {
        jest.advanceTimersByTime(15_000)
      })
      expect(store.getActions()).toEqual(expect.arrayContaining([refreshAllBalances()]))
      expect(store.getActions().filter((a) => a.type === checkBridgeRampDeposit.type)).toHaveLength(
        2
      )
    })

    it('estimates the pesos less the TuCOP fee without a made-up exchange rate', async () => {
      const { getByTestId } = renderFlow(
        'onramp',
        readyState({
          deposit: {
            status: 'ready',
            account: depositAccount,
            errorCode: null,
            errorRequestId: null,
            usdcBaseline: '0',
            pending: null,
          },
        })
      )
      await typeAmount(getByTestId, '320000')
      // 320,000 less 1.5 percent; Bridge and Mento rates decide the rest.
      expect(getByTestId('bridgeramp-quote')).toHaveTextContent(/315,200/)
      expect(getByTestId('bridgeramp-quote')).toHaveTextContent('bridgeramp.deposit.estimateNote')
      expect(mockQuote).not.toHaveBeenCalled()
    })

    it('shows the conversion in progress once USDC arrived', () => {
      const { getByTestId, queryByTestId } = renderFlow(
        'onramp',
        readyState({
          deposit: {
            status: 'ready',
            account: depositAccount,
            errorCode: null,
            errorRequestId: null,
            usdcBaseline: '0',
            pending: { usdcAmount: '100000000', flowId: 'dep-1' },
          },
          swap: { ...bridgerampInitialState.swap, status: 'broadcast', swapTxHash: '0xabc' },
        })
      )
      expect(getByTestId('bridgeramp-deposit-converting')).toBeTruthy()
      expect(getByTestId('bridgeramp-deposit-converting')).toHaveTextContent(/100\.00/)
      expect(getByTestId('bridgeramp-deposit-converting')).not.toHaveTextContent(/USDC/)
      expect(getByTestId('bridgeramp-swap-hash')).toHaveTextContent('0xabc')
      expect(queryByTestId('bridgeramp-deposit-instructions')).toBeNull()
    })

    it('offers retry and keep-USDC when the conversion failed', () => {
      const { getByTestId, store } = renderFlow(
        'onramp',
        readyState({
          deposit: {
            status: 'ready',
            account: depositAccount,
            errorCode: null,
            errorRequestId: null,
            usdcBaseline: '0',
            pending: { usdcAmount: '100000000', flowId: 'dep-1' },
          },
          swap: {
            ...bridgerampInitialState.swap,
            status: 'failed',
            flowId: 'dep-1',
            errorCode: 'reverted',
          },
        })
      )
      fireEvent.press(getByTestId('bridgeramp-deposit-retry'))
      expect(store.getActions()).toEqual(
        expect.arrayContaining([retryBridgeRampDepositConversion()])
      )
      fireEvent.press(getByTestId('bridgeramp-deposit-keep'))
      expect(store.getActions()).toEqual(expect.arrayContaining([depositReset()]))
    })

    it('hides retry and keep while a conversion is running', () => {
      const { getByTestId, queryByTestId } = renderFlow(
        'onramp',
        readyState({
          deposit: {
            ...bridgerampInitialState.deposit,
            status: 'ready',
            account: depositAccount,
            usdcBaseline: '0',
            pending: { usdcAmount: '100000000', flowId: 'dep-1' },
            converting: true,
          },
          swap: {
            ...bridgerampInitialState.swap,
            status: 'failed',
            flowId: 'dep-1',
            errorCode: 'market_closed',
          },
        })
      )
      expect(getByTestId('bridgeramp-deposit-converting')).toBeTruthy()
      expect(queryByTestId('bridgeramp-deposit-retry')).toBeNull()
      expect(queryByTestId('bridgeramp-deposit-keep')).toBeNull()
    })

    it('does not offer to keep the dollars while a broadcast conversion may still land', () => {
      const { getByTestId, queryByTestId } = renderFlow(
        'onramp',
        readyState({
          deposit: {
            ...bridgerampInitialState.deposit,
            status: 'ready',
            account: depositAccount,
            usdcBaseline: '0',
            pending: { usdcAmount: '100000000', flowId: 'dep-1' },
          },
          swap: {
            ...bridgerampInitialState.swap,
            status: 'failed',
            flowId: 'dep-1',
            errorCode: 'receipt_unknown',
          },
        })
      )
      expect(getByTestId('bridgeramp-deposit-retry')).toBeTruthy()
      expect(queryByTestId('bridgeramp-deposit-keep')).toBeNull()
    })

    it('waits for the market instead of offering a failed conversion', () => {
      const { getByTestId } = renderFlow(
        'onramp',
        readyState({
          deposit: {
            status: 'ready',
            account: depositAccount,
            errorCode: null,
            errorRequestId: null,
            usdcBaseline: '0',
            pending: { usdcAmount: '100000000', flowId: 'dep-1' },
          },
          swap: {
            ...bridgerampInitialState.swap,
            status: 'failed',
            flowId: 'dep-1',
            errorCode: 'market_closed',
          },
        })
      )
      expect(getByTestId('bridgeramp-deposit-converting')).toHaveTextContent(
        'bridgeramp.deposit.marketClosedTitle'
      )
      expect(getByTestId('bridgeramp-deposit-converting')).toHaveTextContent(
        'bridgeramp.swapError.market_closed'
      )
    })

    it('re-checks the party when the app comes back after verifying in the browser', async () => {
      const listeners: Array<(status: string) => void> = []
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
        listeners.push(handler as (status: string) => void)
        return { remove: jest.fn() } as any
      })
      const { store } = renderFlow(
        'onramp',
        readyState({
          party: {
            status: 'loaded',
            value: {
              ...verifiedParty,
              status: { kyc: 'under_review', tos: 'pending', endorsements: [] },
            },
            needsOnboarding: false,
            errorCode: null,
            onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
          },
        })
      )
      const before = store.getActions().filter((a) => a.type === fetchBridgeRampParty.type).length
      expect(listeners).toHaveLength(1)
      await act(async () => {
        listeners[0]('active')
      })
      expect(store.getActions().filter((a) => a.type === fetchBridgeRampParty.type)).toHaveLength(
        before + 1
      )
    })

    it('shows the account error with a retry', () => {
      const { getByTestId, store } = renderFlow(
        'onramp',
        readyState({
          deposit: {
            status: 'failed',
            account: null,
            errorCode: 'provider_unavailable',
            errorRequestId: 'req_42',
            usdcBaseline: null,
            pending: null,
          },
        })
      )
      expect(getByTestId('bridgeramp-deposit-error')).toHaveTextContent(
        'bridgeramp.deposit.accountErrors.provider_unavailable'
      )
      expect(getByTestId('bridgeramp-deposit-error')).toHaveTextContent(/req_42/)
      const before = store.getActions().filter((a) => a.type === startBridgeRampDeposit.type).length
      fireEvent.press(getByTestId('bridgeramp-deposit-error/bridgeramp.retry'))
      expect(
        store.getActions().filter((a) => a.type === startBridgeRampDeposit.type).length
      ).toBeGreaterThan(before)
    })
  })

  describe('withdraw: amount step', () => {
    it('loads the party on mount and leaves destinations until the party is ready', () => {
      const { store } = renderFlow('offramp')
      expect(store.getActions()).toEqual(expect.arrayContaining([fetchBridgeRampParty()]))
      // Before onboarding TuCOPRamp answers party_required for destinations.
      expect(store.getActions()).not.toEqual(
        expect.arrayContaining([fetchBridgeRampDestinations()])
      )
    })

    it('loads the destinations once the party can transact', () => {
      const { store } = renderFlow('offramp', readyState())
      expect(store.getActions()).toEqual(
        expect.arrayContaining([fetchBridgeRampParty(), fetchBridgeRampDestinations()])
      )
    })

    it('offers a retry when the destinations could not be loaded', () => {
      const { getByTestId, store } = renderFlow(
        'offramp',
        readyState({
          destinations: {
            status: 'error',
            items: [],
            errorCode: 'provider_unavailable',
            registering: { destinationId: null, status: 'idle' },
          },
        })
      )
      const before = store
        .getActions()
        .filter((a) => a.type === fetchBridgeRampDestinations.type).length
      fireEvent.press(getByTestId('bridgeramp-destinations-error/bridgeramp.retry'))
      expect(
        store.getActions().filter((a) => a.type === fetchBridgeRampDestinations.type)
      ).toHaveLength(before + 1)
    })

    it('explains a destination error code instead of showing it raw', () => {
      const { getByTestId } = renderFlow(
        'offramp',
        readyState({
          destinations: {
            status: 'loaded',
            items: [destination],
            errorCode: 'verification_timeout',
            registering: { destinationId: null, status: 'error' },
          },
        })
      )
      expect(getByTestId('bridgeramp-destination-failed')).toHaveTextContent(
        'bridgeramp.destination.rejected.verification_timeout'
      )
    })

    it('marks the selected destination for accessibility', () => {
      const { getByTestId } = renderFlow('offramp', readyState())
      expect(getByTestId('bridgeramp-destination-dst_1')).toHaveAccessibilityState({
        selected: true,
      })
    })

    it('keeps a failed start on the amount step with its message and support code', () => {
      const { getByTestId, queryByTestId } = renderFlow(
        'offramp',
        readyState({
          withdraw: {
            ...bridgerampInitialState.withdraw,
            status: 'start_failed',
            errorCode: 'quote_failed',
            errorRequestId: 'req_7',
          },
        })
      )
      expect(queryByTestId('bridgeramp-progress')).toBeNull()
      expect(getByTestId('bridgeramp-amount')).toBeTruthy()
      expect(getByTestId('bridgeramp-start-failed')).toHaveTextContent(
        /bridgeramp.withdraw.startError.quote_failed/
      )
      expect(getByTestId('bridgeramp-start-failed')).toHaveTextContent(/req_7/)
    })

    it('shows the onboarding form when TuCOPRamp has no party for this wallet', () => {
      const { getByTestId } = renderFlow(
        'offramp',
        readyState({
          party: {
            status: 'loaded',
            value: null,
            needsOnboarding: true,
            errorCode: null,
            onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
          },
        })
      )
      expect(getByTestId('bridgeramp-party-onboarding')).toBeTruthy()
      expect(getByTestId('bridgeramp-onboarding-consent')).toHaveAccessibilityState({
        checked: false,
      })
      expect(getByTestId('bridgeramp-onboarding-submit')).toBeDisabled()
      expect(getByTestId('bridgeramp-continue')).toBeDisabled()
    })

    it('creates the party with the typed identity, email and consent', () => {
      const { getByTestId, store } = renderFlow(
        'offramp',
        readyState({
          party: {
            status: 'loaded',
            value: null,
            needsOnboarding: true,
            errorCode: null,
            onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
          },
        })
      )
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-first-names'), 'Ana  Maria ')
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-last-names'), 'Perez Gomez')
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-document'), '1.017.123.456')
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-email'), 'ana@example.com')
      expect(getByTestId('bridgeramp-onboarding-submit')).toBeDisabled()
      fireEvent.press(getByTestId('bridgeramp-onboarding-consent'))
      expect(getByTestId('bridgeramp-onboarding-consent')).toHaveAccessibilityState({
        checked: true,
      })
      expect(getByTestId('bridgeramp-onboarding-submit')).toBeEnabled()

      fireEvent.press(getByTestId('bridgeramp-onboarding-submit'))
      const create = store
        .getActions()
        .find((a) => a.type === createBridgeRampParty.type) as ReturnType<
        typeof createBridgeRampParty
      >
      expect(create.payload.request).toMatchObject({
        type: 'individual',
        first_names: 'Ana Maria',
        last_names: 'Perez Gomez',
        nationality: 'COL',
        document_type: 'CC',
        document_number: '1017123456',
        email: 'ana@example.com',
        consent: { version: '2026-10-10', accepted_at: expect.any(String) },
        redirect_url: 'https://tucop.xyz/ramp/verificacion-lista',
      })
    })

    it('leaves the nationality out for a foreigner document and never offers TI', () => {
      const { getByTestId, queryByTestId, store } = renderFlow(
        'offramp',
        readyState({
          party: {
            status: 'loaded',
            value: null,
            needsOnboarding: true,
            errorCode: null,
            onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
          },
        })
      )
      fireEvent.press(getByTestId('bridgeramp-onboarding-doctype'))
      expect(queryByTestId('bridgeramp-onboarding-doctype-option-TI')).toBeNull()
      fireEvent.press(getByTestId('bridgeramp-onboarding-doctype-option-PAS'))
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-first-names'), 'Maria')
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-last-names'), 'Rodriguez')
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-document'), 'AB123456')
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-email'), 'maria@example.com')
      fireEvent.press(getByTestId('bridgeramp-onboarding-consent'))
      fireEvent.press(getByTestId('bridgeramp-onboarding-submit'))
      const create = store
        .getActions()
        .find((a) => a.type === createBridgeRampParty.type) as ReturnType<
        typeof createBridgeRampParty
      >
      expect(create.payload.request).toMatchObject({
        document_type: 'PAS',
        last_names: 'Rodriguez',
      })
      expect(create.payload.request).not.toHaveProperty('nationality')
    })

    it('shows the pending verification with the KYC link once the party exists', () => {
      const { getByTestId, store } = renderFlow(
        'offramp',
        readyState({
          party: {
            status: 'loaded',
            value: {
              ...verifiedParty,
              status: { kyc: 'not_started', tos: 'pending', endorsements: [] },
              links: { kyc: 'https://verify.example/kyc/1', tos: 'https://verify.example/tos/1' },
            },
            needsOnboarding: false,
            errorCode: null,
            onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
          },
        })
      )
      expect(getByTestId('bridgeramp-party-pending')).toHaveTextContent(
        'bridgeramp.party.state.kyc_incomplete.title'
      )
      // No raw statuses in the copy.
      expect(getByTestId('bridgeramp-party-pending')).not.toHaveTextContent(/not_started/)
      fireEvent.press(getByTestId('bridgeramp-party-pending/bridgeramp.party.openKyc'))
      expect(store.getActions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'APP/OPEN_URL', url: 'https://verify.example/kyc/1' }),
        ])
      )
      expect(getByTestId('bridgeramp-continue')).toBeDisabled()
    })

    it('offers the terms link once KYC is approved and only the TOS is pending', () => {
      const { getByTestId, queryByTestId, store } = renderFlow(
        'offramp',
        readyState({
          party: {
            status: 'loaded',
            value: {
              ...verifiedParty,
              status: { kyc: 'approved', tos: 'pending', endorsements: [] },
              links: { kyc: 'https://verify.example/kyc/1', tos: 'https://verify.example/tos/1' },
            },
            needsOnboarding: false,
            errorCode: null,
            onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
          },
        })
      )
      expect(getByTestId('bridgeramp-party-pending')).toHaveTextContent(
        'bridgeramp.party.state.tos_pending.title'
      )
      expect(queryByTestId('bridgeramp-party-pending/bridgeramp.party.openKyc')).toBeNull()
      fireEvent.press(getByTestId('bridgeramp-party-pending/bridgeramp.party.openTos'))
      expect(store.getActions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'APP/OPEN_URL', url: 'https://verify.example/tos/1' }),
        ])
      )
    })

    it.each([
      ['rejected', { kyc: 'rejected', tos: 'accepted' }, false],
      ['suspended', { kyc: 'suspended', tos: 'accepted' }, false],
      ['restricted', { kyc: 'approved', tos: 'accepted' }, true],
      ['under_review', { kyc: 'under_review', tos: 'pending' }, false],
    ])('shows its own message for a %s party', (blocker, status, restricted) => {
      const { getByTestId, queryByTestId } = renderFlow(
        'offramp',
        readyState({
          party: {
            status: 'loaded',
            value: {
              ...verifiedParty,
              restricted,
              status: { ...status, endorsements: [] },
              links: { kyc: 'https://verify.example/kyc/1' },
            },
            needsOnboarding: false,
            errorCode: null,
            onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
          },
        })
      )
      expect(getByTestId('bridgeramp-party-pending')).toHaveTextContent(
        `bridgeramp.party.state.${blocker}.title`
      )
      expect(getByTestId('bridgeramp-party-pending')).toHaveTextContent(
        `bridgeramp.party.state.${blocker}.body`
      )
      expect(queryByTestId('bridgeramp-party-pending/bridgeramp.party.openKyc')).toBeNull()
    })

    it('re-checks the party when the app comes back to the foreground with verification pending', async () => {
      const listeners: Array<(status: string) => void> = []
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
        listeners.push(handler as (status: string) => void)
        return { remove: jest.fn() } as any
      })
      const { store } = renderFlow(
        'offramp',
        readyState({
          party: {
            status: 'loaded',
            value: {
              ...verifiedParty,
              status: { kyc: 'pending', tos: 'accepted', endorsements: [] },
            },
            needsOnboarding: false,
            errorCode: null,
            onboarding: { status: 'idle', errorCode: null, errorRequestId: null },
          },
        })
      )
      const before = store.getActions().filter((a) => a.type === fetchBridgeRampParty.type).length
      expect(listeners).toHaveLength(1)
      await act(async () => {
        listeners[0]('active')
      })
      const after = store.getActions().filter((a) => a.type === fetchBridgeRampParty.type).length
      expect(after).toBe(before + 1)
    })

    it('quotes the typed amount and starts the withdraw for the guaranteed USDC', async () => {
      mockQuote.mockResolvedValue(withdrawQuote)
      const { getByTestId, store } = renderFlow('offramp', readyState())
      expect(getByTestId('bridgeramp-destination-dst_1')).toHaveTextContent('****4567')

      await typeAmount(getByTestId, '800000')
      await waitFor(() => expect(getByTestId('bridgeramp-quote')).toBeTruthy())
      expect(mockQuote).toHaveBeenCalledWith('copmToUsdc', withdrawQuote.amountIn)
      expect(getByTestId('bridgeramp-quote')).toHaveTextContent(/247\.34/)
      expect(getByTestId('bridgeramp-quote')).not.toHaveTextContent(/USDC/)
      expect(getByTestId('bridgeramp-continue')).toBeEnabled()

      fireEvent.press(getByTestId('bridgeramp-continue'))
      const start = store
        .getActions()
        .find((a) => a.type === startBridgeRampWithdraw.type) as ReturnType<
        typeof startBridgeRampWithdraw
      >
      expect(start.payload).toMatchObject({
        destinationId: 'dst_1',
        copmAmountIn: '800000000000000000000000',
        // 247.338318 less 50 bps, floored to 6 decimals
        usdcMinOut: '246.101626',
      })
      expect(start.payload.idempotencyKey).toEqual(expect.any(String))
    })

    it('does not quote amounts under the Bridge minimum', async () => {
      const { getByTestId, getByText } = renderFlow('offramp', readyState())
      await typeAmount(getByTestId, '3999')
      expect(mockQuote).not.toHaveBeenCalled()
      // Same BigNumber formatter as every other amount on the screen.
      expect(getByText('bridgeramp.amountBelowMin, {"min":"4,000"}')).toBeTruthy()
    })

    it('blocks amounts above the COPm balance', async () => {
      mockQuote.mockResolvedValue(withdrawQuote)
      const { getByTestId } = renderFlow('offramp', readyState())
      await typeAmount(getByTestId, '2000000')
      await waitFor(() => expect(getByTestId('bridgeramp-insufficient')).toBeTruthy())
      expect(getByTestId('bridgeramp-continue')).toBeDisabled()
    })
  })

  describe('withdraw: review step', () => {
    const reviewState = () =>
      readyState({
        withdraw: {
          status: 'review',
          copmAmountIn: '800000000000000000000000',
          quote: tucopQuote,
          withdrawal,
          estimatedCop: '778136',
          attemptId: 'attempt-1',
          swapTxHash: null,
          knownPayoutIds: [],
          payout: null,
          errorCode: null,
          errorRequestId: null,
        },
      })

    const possiblePrepare = () => ({
      type: 'possible' as const,
      transactions: [
        {
          from: USER,
          to: '0x1',
          data: '0x01',
          gas: BigInt(50_000),
          maxFeePerGas: BigInt(10),
          _baseFeePerGas: BigInt(5),
        },
        {
          from: USER,
          to: '0x2',
          data: '0x02',
          gas: BigInt(900_000),
          maxFeePerGas: BigInt(10),
          _baseFeePerGas: BigInt(5),
          _estimatedGasUse: BigInt(650_000),
        },
      ] as any[],
      feeCurrency: { ...mockTokenBalances[mockCeloTokenId], balance: new BigNumber(1) } as any,
    })

    it('re-quotes, prices the calls and signs with the deposit address as recipient', async () => {
      mockQuote.mockResolvedValue(withdrawQuote)
      mockPrepare.mockResolvedValue({
        type: 'possible',
        transactions: [
          {
            from: USER,
            to: '0x1',
            data: '0x01',
            gas: BigInt(50_000),
            maxFeePerGas: BigInt(10),
            _baseFeePerGas: BigInt(5),
          },
          {
            from: USER,
            to: '0x2',
            data: '0x02',
            gas: BigInt(900_000),
            maxFeePerGas: BigInt(10),
            _baseFeePerGas: BigInt(5),
            _estimatedGasUse: BigInt(650_000),
          },
        ],
        feeCurrency: { ...mockTokenBalances[mockCeloTokenId], balance: new BigNumber(1) } as any,
      })
      const { getByTestId, store } = renderFlow('offramp', reviewState())
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      await waitFor(() => expect(getByTestId('bridgeramp-confirm')).toBeEnabled())

      // 246.101626 USDC guaranteed x 3210 COP/USDC, less 1.5 percent, floored
      expect(getByTestId('bridgeramp-review')).toHaveTextContent(/778,136/)
      expect(getByTestId('bridgeramp-review')).toHaveTextContent('bridgeramp.review.receive')
      expect(getByTestId('bridgeramp-review')).toHaveTextContent('1.5 %')
      const prepareArgs = mockPrepare.mock.calls[0][0]
      expect(prepareArgs.spendTokenAmount).toBe(withdrawQuote.amountIn)
      expect(prepareArgs.calls[1].to).toBe('0x4861840C2EfB2b98312B0aE34d86fD73E8f9B6f6')

      fireEvent.press(getByTestId('bridgeramp-confirm'))
      const exec = store
        .getActions()
        .find((a) => a.type === executeBridgeRampSwap.type) as ReturnType<
        typeof executeBridgeRampSwap
      >
      expect(exec.payload).toMatchObject({
        // Unique per attempt: the address id alone is reused by every
        // withdrawal to the same key.
        flowId: 'wdr_1:attempt-1',
        direction: 'copmToUsdc',
        amountIn: '800000000000000000000000',
        quotedAmountOut: '247338318',
        recipient: LIQUIDATION,
      })
      expect(exec.payload.serializablePreparedTransactions).toHaveLength(2)
    })

    it('offers to check the status instead of confirming again when the receipt was unknown', async () => {
      mockQuote.mockResolvedValue(withdrawQuote)
      mockPrepare.mockResolvedValue(possiblePrepare())
      const { getByTestId } = renderFlow(
        'offramp',
        readyState({
          ...reviewState(),
          swap: {
            ...bridgerampInitialState.swap,
            status: 'failed',
            flowId: 'wdr_1:attempt-1',
            errorCode: 'receipt_unknown',
          },
        })
      )
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      expect(getByTestId('bridgeramp-swap-failed')).toHaveTextContent(
        'bridgeramp.swapError.receipt_unknown'
      )
      expect(getByTestId('bridgeramp-confirm')).toHaveTextContent(
        'bridgeramp.review.checkStatusCta'
      )
    })

    it('checks the unconfirmed swap without a new quote and cannot be cancelled meanwhile', async () => {
      // The swap landed and the COPm left: pricing a new one fails.
      mockQuote.mockResolvedValue(withdrawQuote)
      mockPrepare.mockRejectedValue(new Error('insufficient balance'))
      const { getByTestId, store } = renderFlow(
        'offramp',
        readyState({
          ...reviewState(),
          withdraw: { ...reviewState().withdraw, swapTxHash: '0xswap' },
          swap: {
            ...bridgerampInitialState.swap,
            status: 'failed',
            flowId: 'wdr_1:attempt-1',
            errorCode: 'receipt_unknown',
          },
        })
      )
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      expect(getByTestId('bridgeramp-confirm')).toBeEnabled()
      expect(getByTestId('bridgeramp-cancel')).toBeDisabled()
      fireEvent.press(getByTestId('bridgeramp-confirm'))
      expect(store.getActions()).toEqual(expect.arrayContaining([checkBridgeRampWithdrawSwap()]))
      expect(store.getActions().some((a) => a.type === executeBridgeRampSwap.type)).toBe(false)
    })

    it('checks a broadcast swap again after a restart', async () => {
      mockQuote.mockResolvedValue(withdrawQuote)
      mockPrepare.mockResolvedValue(possiblePrepare())
      const { getByTestId, store } = renderFlow(
        'offramp',
        readyState({
          ...reviewState(),
          // Rehydrated: the swap slice is fresh, only the withdraw knows the hash.
          withdraw: { ...reviewState().withdraw, swapTxHash: '0xswap' },
        })
      )
      expect(store.getActions()).toEqual(expect.arrayContaining([checkBridgeRampWithdrawSwap()]))
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      expect(getByTestId('bridgeramp-swap-unconfirmed')).toHaveTextContent(
        'bridgeramp.swapError.receipt_unknown'
      )
      expect(getByTestId('bridgeramp-confirm')).toHaveTextContent(
        'bridgeramp.review.checkStatusCta'
      )
      expect(getByTestId('bridgeramp-cancel')).toBeDisabled()
    })

    it('does not confirm while a refresh is pricing new calldata', async () => {
      mockQuote.mockImplementation(async () => ({
        ...withdrawQuote,
        quotedAt: Math.floor(Date.now() / 1000),
      }))
      mockPrepare
        .mockResolvedValueOnce(possiblePrepare())
        .mockImplementation(() => new Promise(() => undefined))
      const { getByTestId } = renderFlow('offramp', reviewState())
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      await waitFor(() => expect(getByTestId('bridgeramp-confirm')).toBeEnabled())
      // The quote refreshes every minute; the new pricing never finishes here.
      await act(async () => {
        jest.advanceTimersByTime(60_000)
      })
      await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(2))
      expect(getByTestId('bridgeramp-confirm')).toBeDisabled()
    })

    it('shows a retry when Mento cannot quote the review', async () => {
      mockQuote.mockRejectedValueOnce(new MentoOracleUnavailableError())
      const { getByTestId } = renderFlow('offramp', reviewState())
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      await waitFor(() => expect(getByTestId('bridgeramp-review-market-closed')).toBeTruthy())
      mockQuote.mockResolvedValue(withdrawQuote)
      mockPrepare.mockResolvedValue(possiblePrepare())
      fireEvent.press(getByTestId('bridgeramp-review-market-closed/bridgeramp.retry'))
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      await waitFor(() => expect(getByTestId('bridgeramp-confirm')).toBeEnabled())
      expect(mockQuote).toHaveBeenCalledTimes(2)
    })

    it('shows a retry when pricing the transaction fails', async () => {
      mockQuote.mockResolvedValue(withdrawQuote)
      mockPrepare.mockRejectedValueOnce(new Error('estimateGas failed'))
      const { getByTestId } = renderFlow('offramp', reviewState())
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      await waitFor(() => expect(getByTestId('bridgeramp-review-prepare-error')).toBeTruthy())
      mockPrepare.mockResolvedValue(possiblePrepare())
      fireEvent.press(getByTestId('bridgeramp-review-prepare-error/bridgeramp.retry'))
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      await waitFor(() => expect(getByTestId('bridgeramp-confirm')).toBeEnabled())
    })

    it('refuses to sign when the fresh quote falls under the payout floor', async () => {
      mockQuote.mockResolvedValue({
        ...withdrawQuote,
        amountOut: BigInt(1_000_000),
        amountOutWhole: new BigNumber('1'),
      })
      const { getByTestId } = renderFlow('offramp', reviewState())
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      await waitFor(() => expect(getByTestId('bridgeramp-rate-moved')).toBeTruthy())
      expect(getByTestId('bridgeramp-rate-moved')).toHaveTextContent(/"min":"4,000"/)
      expect(mockPrepare).not.toHaveBeenCalled()
      expect(getByTestId('bridgeramp-confirm')).toBeDisabled()
    })

    it('refuses a deposit that is not USDC on Celo', async () => {
      mockQuote.mockResolvedValue(withdrawQuote)
      const { getByTestId } = renderFlow(
        'offramp',
        readyState({
          withdraw: {
            status: 'review',
            copmAmountIn: '800000000000000000000000',
            quote: tucopQuote,
            withdrawal: {
              ...withdrawal,
              deposit: { ...withdrawal.deposit, token_contract: USER as `0x${string}` },
            },
            estimatedCop: '778136',
            knownPayoutIds: [],
            payout: null,
            errorCode: null,
            errorRequestId: null,
          },
        })
      )
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      expect(getByTestId('bridgeramp-bad-deposit')).toBeTruthy()
      await waitFor(() => expect(getByTestId('bridgeramp-confirm')).toBeDisabled())
      expect(mockPrepare).not.toHaveBeenCalled()
    })
  })

  describe('withdraw: progress step', () => {
    const payoutProcessed = {
      id: 'drn_1',
      status: 'payment_processed',
      amount: { amount: '246.20', asset: 'USDC' },
      destination_amount: { amount: '790000.00', asset: 'COP' },
      created_at: '',
      updated_at: '',
    }
    const progressState = (overrides: Record<string, unknown> = {}) =>
      readyState({
        withdraw: {
          status: 'completed',
          copmAmountIn: '800000000000000000000000',
          quote: tucopQuote,
          withdrawal,
          estimatedCop: '778136',
          attemptId: 'attempt-1',
          swapTxHash: null,
          knownPayoutIds: [],
          payout: payoutProcessed,
          errorCode: null,
          errorRequestId: null,
          ...overrides,
        },
      })

    it('shows the payout result with the full swap hash and the payout id', () => {
      const { getByTestId } = renderFlow('offramp', {
        ...progressState(),
        swap: {
          ...bridgerampInitialState.swap,
          status: 'confirmed',
          swapTxHash: '0x4f6b7608c83f8de10f4fabbb4c4708efa55fdf73f599de6c4d8f9d995710d16a',
        },
      })
      expect(getByTestId('bridgeramp-progress')).toHaveTextContent('790,000')
      expect(getByTestId('bridgeramp-swap-hash')).toHaveTextContent(
        '0x4f6b7608c83f8de10f4fabbb4c4708efa55fdf73f599de6c4d8f9d995710d16a'
      )
      expect(getByTestId('bridgeramp-progress')).toHaveTextContent('drn_1')
      expect(getByTestId('bridgeramp-progress')).not.toHaveTextContent('wdr_1')
      expect(getByTestId('bridgeramp-done')).toBeTruthy()
    })

    it('quotes the settlement window TuCOPRamp reported for the address', () => {
      const { getByTestId } = renderFlow(
        'offramp',
        progressState({
          status: 'awaiting_payout',
          payout: null,
          withdrawal: { ...withdrawal, settlement_time: { min_minutes: 15, max_minutes: 30 } },
        })
      )
      expect(getByTestId('bridgeramp-progress')).toHaveTextContent(
        'bridgeramp.progress.payingBodyWindow'
      )
      expect(getByTestId('bridgeramp-progress')).toHaveTextContent('15')
      expect(getByTestId('bridgeramp-progress')).toHaveTextContent('30')
    })

    it('falls back to the vaguer line when the address carries no window', () => {
      const { getByTestId } = renderFlow(
        'offramp',
        progressState({ status: 'awaiting_payout', payout: null })
      )
      expect(getByTestId('bridgeramp-progress')).toHaveTextContent('bridgeramp.progress.payingBody')
    })

    it('restarts polling and shows the stored swap hash after a restart', () => {
      const hash = '0x9a1b7608c83f8de10f4fabbb4c4708efa55fdf73f599de6c4d8f9d995710d16a'
      const { getByTestId, store } = renderFlow(
        'offramp',
        // The swap slice resets on a cold start; the hash lives with the withdrawal.
        progressState({ status: 'awaiting_payout', payout: null, swapTxHash: hash })
      )
      expect(store.getActions()).toEqual(
        expect.arrayContaining([pollBridgeRampWithdrawal({ withdrawalId: 'wdr_1' })])
      )
      expect(getByTestId('bridgeramp-swap-hash')).toHaveTextContent(hash)
    })

    it('says the dollars went back to the wallet when Bridge returned the payout', () => {
      const { getByTestId } = renderFlow(
        'offramp',
        progressState({
          status: 'failed',
          errorCode: 'payout_returned',
          payout: { ...payoutProcessed, status: 'returned' },
        })
      )
      expect(getByTestId('bridgeramp-progress')).toHaveTextContent(
        'bridgeramp.payoutError.payout_returned'
      )
    })

    it('resets the withdrawal when the user is done or leaves the result', () => {
      const { getByTestId, store, unmount } = renderFlow('offramp', progressState())
      fireEvent.press(getByTestId('bridgeramp-done'))
      expect(store.getActions()).toEqual(expect.arrayContaining([withdrawReset()]))
      store.clearActions()
      unmount()
      expect(store.getActions()).toEqual([withdrawReset()])
    })
  })

  describe('availability', () => {
    it('says the check failed instead of "outside banking hours" when the oracle is unreachable', async () => {
      mockOracle.mockRejectedValue(new Error('offline'))
      const { getByTestId } = renderFlow('offramp')
      await waitFor(() =>
        expect(getByTestId('bridgeramp-oracle-stale')).toHaveTextContent(
          'rampProviders.bridgeramp.unreachable'
        )
      )
    })

    it('titles the screen TuCOP Ramp', () => {
      const { getByText } = renderFlow('onramp')
      expect(getByText('bridgeramp.onramp.title')).toBeTruthy()
    })
  })
})
