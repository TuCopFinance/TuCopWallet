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
  createBridgeRampParty,
  executeBridgeRampSwap,
  fetchBridgeRampDestinations,
  fetchBridgeRampParty,
  startBridgeRampWithdraw,
} from 'src/bridgeramp/saga'
import { initialState as bridgerampInitialState } from 'src/bridgeramp/slice'
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
  id: 'wd_1',
  product: 'withdraw' as const,
  status: 'awaiting_funds' as const,
  quote_id: 'qte_1',
  destination_id: 'dst_1',
  destination_amount: tucopQuote.destination_amount,
  source_amount: tucopQuote.source_amount,
  fees: tucopQuote.fees,
  deposit: {
    address: LIQUIDATION as `0x${string}`,
    chain: 'eip155:42220' as const,
    asset: 'USDC' as const,
    token_contract: USDC_ADDRESS_CELO,
    amount: tucopQuote.source_amount,
  },
  return_address: USER as `0x${string}`,
  error_code: null,
  created_at: '',
  updated_at: '',
}

function readyState(overrides: RecursivePartial<RootState['bridgeramp']> = {}) {
  return {
    ...bridgerampInitialState,
    party: {
      status: 'loaded',
      value: verifiedParty,
      needsOnboarding: false,
      errorCode: null,
      onboarding: { status: 'idle', errorCode: null },
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

  describe('deposit preview', () => {
    it('quotes USDC -> COPm for a deposit and keeps continue disabled', async () => {
      mockQuote.mockResolvedValue({
        direction: 'usdcToCopm',
        amountIn: BigInt(100_000_000),
        amountOut: BigInt('319000000000000000000000'),
        amountInWhole: new BigNumber('100'),
        amountOutWhole: new BigNumber('319000'),
        copPerUsd: new BigNumber('3190'),
        quotedAt: 0,
      })

      const { getByTestId } = renderFlow('onramp')
      await typeAmount(getByTestId, '320000')

      await waitFor(() => expect(getByTestId('bridgeramp-quote')).toBeTruthy())
      expect(mockQuote).toHaveBeenCalledWith('usdcToCopm', expect.any(BigInt))
      expect(getByTestId('bridgeramp-quote')).toHaveTextContent('319,000 pesos digitales')
      expect(getByTestId('bridgeramp-continue')).toBeDisabled()
    })

    it('shows the banking-hours notice when the oracle has no valid median', async () => {
      mockQuote.mockRejectedValue(new MentoOracleUnavailableError())

      const { getByTestId, queryByTestId } = renderFlow('onramp')
      await typeAmount(getByTestId, '100000')

      await waitFor(() => expect(getByTestId('bridgeramp-oracle-stale')).toBeTruthy())
      expect(queryByTestId('bridgeramp-quote')).toBeNull()
    })
  })

  describe('withdraw: amount step', () => {
    it('loads the party and destinations on mount', () => {
      const { store } = renderFlow('offramp')
      expect(store.getActions()).toEqual(
        expect.arrayContaining([fetchBridgeRampParty(), fetchBridgeRampDestinations()])
      )
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
            onboarding: { status: 'idle', errorCode: null },
          },
        })
      )
      expect(getByTestId('bridgeramp-party-onboarding')).toBeTruthy()
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
            onboarding: { status: 'idle', errorCode: null },
          },
        })
      )
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-name'), 'Ana Maria Perez')
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-document'), '1.017.123.456')
      fireEvent.changeText(getByTestId('bridgeramp-onboarding-email'), 'ana@example.com')
      expect(getByTestId('bridgeramp-onboarding-submit')).toBeDisabled()
      fireEvent.press(getByTestId('bridgeramp-onboarding-consent'))
      expect(getByTestId('bridgeramp-onboarding-submit')).toBeEnabled()

      fireEvent.press(getByTestId('bridgeramp-onboarding-submit'))
      const create = store
        .getActions()
        .find((a) => a.type === createBridgeRampParty.type) as ReturnType<
        typeof createBridgeRampParty
      >
      expect(create.payload.request).toMatchObject({
        type: 'individual',
        legal_name: 'Ana Maria Perez',
        document_type: 'CC',
        document_number: '1017123456',
        email: 'ana@example.com',
        consent: { version: '2026-10-10', accepted_at: expect.any(String) },
        redirect_url: 'https://tucop.xyz/ramp/verificacion-lista',
      })
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
            onboarding: { status: 'idle', errorCode: null },
          },
        })
      )
      expect(getByTestId('bridgeramp-party-pending')).toBeTruthy()
      fireEvent.press(getByTestId('bridgeramp-party-pending/bridgeramp.party.openKyc'))
      expect(store.getActions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'APP/OPEN_URL', url: 'https://verify.example/kyc/1' }),
        ])
      )
      expect(getByTestId('bridgeramp-continue')).toBeDisabled()
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
            onboarding: { status: 'idle', errorCode: null },
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
      expect(getByTestId('bridgeramp-quote')).toHaveTextContent('247.34 USDC')
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
      expect(getByText('bridgeramp.amountBelowMin, {"min":"4.000"}')).toBeTruthy()
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
          errorCode: null,
          errorRequestId: null,
        },
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

      expect(getByTestId('bridgeramp-review')).toHaveTextContent('790,000 pesos')
      expect(getByTestId('bridgeramp-review')).toHaveTextContent('2.46 USDC')
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
        flowId: 'wd_1',
        direction: 'copmToUsdc',
        amountIn: '800000000000000000000000',
        quotedAmountOut: '247338318',
        recipient: LIQUIDATION,
      })
      expect(exec.payload.serializablePreparedTransactions).toHaveLength(2)
    })

    it('refuses to sign when the fresh quote no longer reaches the required USDC', async () => {
      mockQuote.mockResolvedValue({
        ...withdrawQuote,
        amountOut: BigInt(246_000_000),
        amountOutWhole: new BigNumber('246'),
      })
      const { getByTestId } = renderFlow('offramp', reviewState())
      await act(async () => {
        jest.advanceTimersByTime(500)
      })
      await waitFor(() => expect(getByTestId('bridgeramp-rate-moved')).toBeTruthy())
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
    it('shows the payout result with the full swap hash', () => {
      const { getByTestId } = renderFlow(
        'offramp',
        readyState({
          withdraw: {
            status: 'completed',
            copmAmountIn: '800000000000000000000000',
            quote: tucopQuote,
            withdrawal: { ...withdrawal, status: 'completed' },
            errorCode: null,
            errorRequestId: null,
          },
          swap: {
            ...bridgerampInitialState.swap,
            status: 'confirmed',
            swapTxHash: '0x4f6b7608c83f8de10f4fabbb4c4708efa55fdf73f599de6c4d8f9d995710d16a',
          },
        })
      )
      expect(getByTestId('bridgeramp-progress')).toHaveTextContent('790,000')
      expect(getByTestId('bridgeramp-swap-hash')).toHaveTextContent(
        '0x4f6b7608c83f8de10f4fabbb4c4708efa55fdf73f599de6c4d8f9d995710d16a'
      )
      expect(getByTestId('bridgeramp-done')).toBeTruthy()
    })
  })
})
