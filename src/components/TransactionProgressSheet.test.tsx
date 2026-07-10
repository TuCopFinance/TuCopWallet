import { configureStore } from '@reduxjs/toolkit'
import NetInfo from '@react-native-community/netinfo'
import { act, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import { TransactionProgressSheet } from 'src/components/TransactionProgressSheet'
import transactionInFlightReducer, {
  inFlightAdvance,
  inFlightStart,
} from 'src/lib/useTransactionInFlight/slice'
import type { InFlightDescriptor, InFlightStatus } from 'src/lib/useTransactionInFlight/types'
import { NetworkId } from 'src/transactions/types'

jest.mock('@react-native-community/netinfo')

function buildStore() {
  return configureStore({
    reducer: { transactionInFlight: transactionInFlightReducer },
  })
}

type TestStore = ReturnType<typeof buildStore>

function makeDescriptor(overrides: Partial<InFlightDescriptor> = {}): InFlightDescriptor {
  return {
    flowId: 'swap-test-1',
    flowKind: 'swap',
    steps: 1,
    currentStep: 0,
    status: 'preparing',
    preparedTransactions: [],
    networkId: NetworkId['celo-mainnet'],
    retryCount: 0,
    startedAt: Date.now(),
    ...overrides,
  }
}

function renderSheet(store: TestStore) {
  return render(
    <Provider store={store as any}>
      <TransactionProgressSheet scopeToFlowKind="swap" noun="cambio" />
    </Provider>
  )
}

describe('TransactionProgressSheet', () => {
  let listeners: Array<(s: any) => void> = []

  beforeEach(() => {
    listeners = []
    ;(NetInfo as any).addEventListener = jest.fn((cb) => {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((l) => l !== cb)
      }
    })
    ;(NetInfo as any).fetch = jest.fn().mockResolvedValue({ isConnected: true, type: 'wifi' })
  })

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('returns null when there is no current in-flight', () => {
    const store = buildStore()
    const { queryByTestId } = renderSheet(store)
    expect(queryByTestId('TransactionProgressSheet')).toBeNull()
  })

  it('renders preparing message for status preparing', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'preparing' })))
    const { getByTestId, getByText } = renderSheet(store)
    await flush()
    expect(getByTestId('TransactionProgressSheet')).toBeTruthy()
    expect(getByText(/progress\.preparing/)).toBeTruthy()
  })

  it('renders multi-step "Paso N de M" for status progress with steps>1', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'progress', steps: 3, currentStep: 1 })))
    const { getByText } = renderSheet(store)
    await flush()
    const node = getByText(/progress\.multiStep/)
    expect(node).toBeTruthy()
    // params are serialized by the react-i18next mock as JSON
    expect(node.props.children).toEqual(expect.stringContaining('"currentStep":2'))
    expect(node.props.children).toEqual(expect.stringContaining('"total":3'))
  })

  it('renders submitting message for status submitting', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'submitting' })))
    const { getByText } = renderSheet(store)
    await flush()
    expect(getByText(/progress\.submitting/)).toBeTruthy()
  })

  it('renders pending-confirmation message for status pending-confirmation', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'pending-confirmation' })))
    const { getByText } = renderSheet(store)
    await flush()
    expect(getByText(/progress\.pendingConfirmation/)).toBeTruthy()
  })

  it('returns null for partial-failure status (handled by another component)', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'preparing' })))
    store.dispatch(
      inFlightAdvance({
        flowId: 'swap-test-1',
        toStatus: 'partial-failure' as InFlightStatus,
      })
    )
    const { queryByTestId } = renderSheet(store)
    await flush()
    expect(queryByTestId('TransactionProgressSheet')).toBeNull()
  })

  it('returns null for failed status', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'preparing' })))
    store.dispatch(inFlightAdvance({ flowId: 'swap-test-1', toStatus: 'failed' as InFlightStatus }))
    const { queryByTestId } = renderSheet(store)
    await flush()
    expect(queryByTestId('TransactionProgressSheet')).toBeNull()
  })

  it('shows connectivity banner when isConnected becomes false during submitting', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'submitting' })))
    const { getByTestId, queryByTestId } = renderSheet(store)
    await flush()
    expect(queryByTestId('TransactionProgressSheet/ConnectivityBanner')).toBeNull()

    await act(async () => {
      listeners.forEach((cb) => cb({ isConnected: false, type: 'none' }))
    })
    expect(getByTestId('TransactionProgressSheet/ConnectivityBanner')).toBeTruthy()
  })

  it('hides connectivity banner when connectivity returns', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'submitting' })))
    const { queryByTestId } = renderSheet(store)
    await flush()
    await act(async () => {
      listeners.forEach((cb) => cb({ isConnected: false, type: 'none' }))
    })
    expect(queryByTestId('TransactionProgressSheet/ConnectivityBanner')).toBeTruthy()

    await act(async () => {
      listeners.forEach((cb) => cb({ isConnected: true, type: 'wifi' }))
    })
    expect(queryByTestId('TransactionProgressSheet/ConnectivityBanner')).toBeNull()
  })

  it('does not show connectivity banner when disconnected during awaiting-pin', async () => {
    const store = buildStore()
    store.dispatch(inFlightStart(makeDescriptor({ status: 'awaiting-pin' })))
    const { queryByTestId } = renderSheet(store)
    await flush()
    await act(async () => {
      listeners.forEach((cb) => cb({ isConnected: false, type: 'none' }))
    })
    expect(queryByTestId('TransactionProgressSheet/ConnectivityBanner')).toBeNull()
  })
})
