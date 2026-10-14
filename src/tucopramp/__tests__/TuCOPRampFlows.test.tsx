import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import { Screens } from 'src/navigator/Screens'
import { RootState } from 'src/redux/reducers'
import { getFeatureGate } from 'src/statsig'
import { NetworkId } from 'src/transactions/types'
import TuCOPRampOfframpFlow from 'src/tucopramp/TuCOPRampOfframpFlow'
import TuCOPRampOnrampFlow from 'src/tucopramp/TuCOPRampOnrampFlow'
import { stopOfframpPolling, stopOnrampPolling } from 'src/tucopramp/saga'
import reducer, { State, offrampReset, onrampReset } from 'src/tucopramp/slice'
import { OfframpOrderResponse, OnrampOrderResponse, OrderDetail } from 'src/tucopramp/types'
import { COPM_TOKEN_ID_MAINNET } from 'src/web3/networkConfig'
import { createMockStore, getMockStackScreenProps } from 'test/utils'
import { mockCeloTokenId, mockTokenBalances } from 'test/values'

jest.mock('src/statsig')
jest.mock('src/send/usePrepareSendTransactions', () => ({
  usePrepareSendTransactions: () => ({
    prepareTransactionsResult: undefined,
    refreshPreparedTransactions: jest.fn(() => Promise.resolve()),
    clearPreparedTransactions: jest.fn(),
    prepareTransactionError: undefined,
    prepareTransactionLoading: false,
  }),
}))

const USER = '0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856'

const offrampOrder: OfframpOrderResponse = {
  order_id: 'off-1',
  status: 'AWAITING_DEPOSIT',
  multisig_address: '0x1111111111111111111111111111111111111111',
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
  instructions: '',
}

const processingDetail: OrderDetail = {
  id: 'off-9',
  order_type: 'offramp',
  status: 'PROCESSING',
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
}

const quote = {
  quote_id: 'q-1',
  gross_amount_cop: 200_000,
  gross_amount_copm: 200_000,
  fee_percent: 0,
  fee_amount_cop: 0,
  fee_absorbed_by: 'tucop' as const,
  net_amount_to_user_cop: 200_000,
  display_text: '',
  remaining_daily_cop: 800_000,
  remaining_monthly_cop: 2_800_000,
  expires_at: '2026-10-14T00:00:00Z',
}

function tucopramp(mutate: (s: State) => void = () => undefined): RootState['tucopramp'] {
  const state: State = JSON.parse(JSON.stringify(reducer(undefined, { type: 'init' })))
  mutate(state)
  return state
}

function makeStore(state: RootState['tucopramp']) {
  return createMockStore({
    web3: { account: USER },
    tucopramp: state,
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
}

function renderOfframp(state: RootState['tucopramp']) {
  const store = makeStore(state)
  const utils = render(
    <Provider store={store}>
      <TuCOPRampOfframpFlow {...getMockStackScreenProps(Screens.TuCOPRampOfframpFlow)} />
    </Provider>
  )
  return { ...utils, store }
}

function renderOnramp(state: RootState['tucopramp']) {
  const store = makeStore(state)
  const utils = render(
    <Provider store={store}>
      <TuCOPRampOnrampFlow {...getMockStackScreenProps(Screens.TuCOPRampOnrampFlow)} />
    </Provider>
  )
  return { ...utils, store }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getFeatureGate).mockReturnValue(true)
})

describe('TuCOPRampOfframpFlow', () => {
  it('formats the amount with es-CO dots and accepts a pasted "100.000"', () => {
    const { getByTestId } = renderOfframp(tucopramp((s) => (s.offramp.activeCheckStatus = 'done')))
    const input = getByTestId('tucopramp-offramp-amount')
    fireEvent.changeText(input, '100.000')
    expect(input.props.value).toBe('100.000')
    fireEvent.changeText(input, '1500000')
    expect(input.props.value).toBe('1.500.000')
    fireEvent.changeText(input, '100,000')
    expect(input.props.value).toBe('100.000')
  })

  it('does not preselect a bank', () => {
    const { getByTestId } = renderOfframp(
      tucopramp((s) => {
        s.offramp.activeCheckStatus = 'done'
        s.banks = [
          {
            code: 'bancolombia',
            display_name: 'Bancolombia',
            supported_account_types: ['savings', 'checking'],
          },
        ] as any
      })
    )
    expect(getByTestId('tucopramp-offramp-bank')).toHaveTextContent('tucopramp.bankPickerDefault')
  })

  it('renders a resumed PROCESSING order without a local order and polls it', () => {
    const { getByTestId, store } = renderOfframp(
      tucopramp((s) => {
        s.offramp.status = 'processing'
        s.offramp.activeCheckStatus = 'done'
        s.offramp.activeOrderId = processingDetail.id
        s.offramp.activeOrderDetail = processingDetail
      })
    )
    expect(getByTestId('tucopramp-offramp-status-heading')).toHaveTextContent(
      'tucopramp.processingHeading'
    )
    expect(store.getActions()).toContainEqual(
      expect.objectContaining({
        type: 'tucopramp/pollOfframpOrder',
        payload: { orderId: 'off-9' },
      })
    )
  })

  it('shows "en camino" and no cancel once the deposit tx was broadcast', () => {
    const { getByTestId, queryByTestId } = renderOfframp(
      tucopramp((s) => {
        s.offramp.status = 'awaiting-deposit'
        s.offramp.activeCheckStatus = 'done'
        s.offramp.currentOrder = offrampOrder
        s.offramp.depositTxHash = '0xabc'
        s.offramp.depositTxStatus = 'submitted'
      })
    )
    expect(getByTestId('tucopramp-offramp-status-heading')).toHaveTextContent(
      'tucopramp.depositSubmittedHeading'
    )
    expect(queryByTestId('tucopramp-offramp-cancel-order-button')).toBeNull()
  })

  it('offers a resend (primary) and keeps cancel secondary after a failed deposit', () => {
    const { getByTestId, store } = renderOfframp(
      tucopramp((s) => {
        s.offramp.status = 'awaiting-deposit'
        s.offramp.activeCheckStatus = 'done'
        s.offramp.currentOrder = offrampOrder
        s.offramp.depositTxStatus = 'failed'
        s.offramp.depositTxErrorCode = 'broadcast_failed'
      })
    )
    expect(getByTestId('tucopramp-offramp-status-heading')).toHaveTextContent(
      'tucopramp.depositFailedHeading'
    )
    expect(getByTestId('tucopramp-offramp-cancel-order-button')).toBeTruthy()
    fireEvent.press(getByTestId('tucopramp-offramp-retry-deposit'))
    expect(store.getActions()).toContainEqual({ type: 'tucopramp/offrampDepositRetry' })
  })

  it('shows the remaining limits on an amount_limit_exceeded error', () => {
    const { getByTestId } = renderOfframp(
      tucopramp((s) => {
        s.offramp.status = 'error'
        s.offramp.activeCheckStatus = 'done'
        s.offramp.errorCode = 'amount_limit_exceeded'
        s.offramp.errorRemainingDailyCop = 50_000
        s.offramp.errorRemainingMonthlyCop = 1_200_000
      })
    )
    expect(getByTestId('tucopramp-offramp-error-limits')).toHaveTextContent(
      /tucopramp.remainingLimits.*"daily":"50.000".*"monthly":"1.200.000"/
    )
  })

  it('shows a refresh action when the poller gave up', () => {
    const { getByTestId, store } = renderOfframp(
      tucopramp((s) => {
        s.offramp.status = 'poll-timeout'
        s.offramp.activeCheckStatus = 'done'
        s.offramp.currentOrder = offrampOrder
      })
    )
    fireEvent.press(getByTestId('tucopramp-offramp-poll-refresh'))
    expect(store.getActions()).toContainEqual(
      expect.objectContaining({ type: 'tucopramp/pollOfframpOrder', payload: { orderId: 'off-1' } })
    )
  })

  it('stops polling and resets on unmount', () => {
    const { unmount, store } = renderOfframp(tucopramp())
    unmount()
    const types = store.getActions().map((a: { type: string }) => a.type)
    expect(types).toContain(stopOfframpPolling.type)
    expect(types).toContain(offrampReset.type)
  })
})

describe('TuCOPRampOnrampFlow', () => {
  it('shows the quote in pesos digitales, without COPm and with "Sin comisión"', () => {
    const { getByTestId, queryByText } = renderOnramp(
      tucopramp((s) => {
        s.onramp.status = 'quote-ready'
        s.onramp.activeCheckStatus = 'done'
        s.onramp.lastQuote = quote
      })
    )
    expect(getByTestId('tucopramp-onramp-quote-amount')).toHaveTextContent(
      /tucopramp.amountDigitalPesos.*200.000/
    )
    expect(getByTestId('tucopramp-onramp-no-fee')).toBeTruthy()
    expect(queryByText(/COPm/)).toBeNull()
    expect(getByTestId('tucopramp-onramp-edit')).toBeTruthy()
  })

  it('keeps the order on the upload step with an inline upload error', () => {
    const { getByTestId } = renderOnramp(
      tucopramp((s) => {
        s.onramp.status = 'awaiting-proof-upload'
        s.onramp.activeCheckStatus = 'done'
        s.onramp.currentOrder = onrampOrder
        s.onramp.proofUploadErrorCode = 'proof_too_large'
      })
    )
    expect(getByTestId('tucopramp-onramp-upload-error')).toBeTruthy()
    expect(getByTestId('tucopramp-onramp-transfer-to')).toHaveTextContent('@tucop')
    expect(getByTestId('tucopramp-onramp-transfer-amount')).toHaveTextContent(
      /tucopramp.amountPesos.*200.000/
    )
  })

  it('polls during the upload step', () => {
    const { store } = renderOnramp(
      tucopramp((s) => {
        s.onramp.status = 'awaiting-proof-upload'
        s.onramp.activeCheckStatus = 'done'
        s.onramp.currentOrder = onrampOrder
      })
    )
    expect(store.getActions()).toContainEqual(
      expect.objectContaining({ type: 'tucopramp/pollOnrampOrder', payload: { orderId: 'on-1' } })
    )
  })

  it('renders the REJECTED final state', () => {
    const { getByTestId } = renderOnramp(
      tucopramp((s) => {
        s.onramp.status = 'rejected'
        s.onramp.currentOrder = onrampOrder
      })
    )
    expect(getByTestId('tucopramp-onramp-final-heading')).toHaveTextContent('tucopramp.rejected')
    expect(getByTestId('tucopramp-onramp-reference')).toHaveTextContent(/on-1/)
  })

  it('checks for an open order on mount and stops polling on unmount', () => {
    const { unmount, store } = renderOnramp(tucopramp())
    expect(store.getActions()).toContainEqual({ type: 'tucopramp/checkActiveOnrampOrder' })
    unmount()
    const types = store.getActions().map((a: { type: string }) => a.type)
    expect(types).toContain(stopOnrampPolling.type)
    expect(types).toContain(onrampReset.type)
  })
})
