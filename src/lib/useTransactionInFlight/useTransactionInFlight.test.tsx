import { configureStore } from '@reduxjs/toolkit'
import { act, renderHook } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import type { ErrorClass } from 'src/lib/errors'
import { useTransactionInFlight } from 'src/lib/useTransactionInFlight'
import transactionInFlightReducer from 'src/lib/useTransactionInFlight/slice'
import { NetworkId } from 'src/transactions/types'

// Build a minimal real store with just the transactionInFlight reducer.
// `createMockStore` from test/utils uses redux-mock-store which does NOT run
// reducers, so it can't observe state transitions produced by dispatched actions.
function buildStore() {
  return configureStore({
    reducer: { transactionInFlight: transactionInFlightReducer },
  })
}

type TestStore = ReturnType<typeof buildStore>

function makeWrapper(store: TestStore) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store as any}>{children}</Provider>
  }
}

const baseStartArgs = {
  flowKind: 'swap' as const,
  steps: 1,
  preparedTransactions: [],
  networkId: NetworkId['celo-mainnet'],
}

describe('useTransactionInFlight', () => {
  it('returns no current descriptor when scoped to a kind and store is empty', () => {
    const store = buildStore()
    const { result } = renderHook(() => useTransactionInFlight({ scopeToFlowKind: 'swap' }), {
      wrapper: makeWrapper(store),
    })
    expect(result.current.current).toBeNull()
  })

  it('start() returns a flowId and writes a descriptor in `preparing` status', () => {
    const store = buildStore()
    const { result } = renderHook(() => useTransactionInFlight({ scopeToFlowKind: 'swap' }), {
      wrapper: makeWrapper(store),
    })

    let flowId = ''
    void act(() => {
      flowId = result.current.start(baseStartArgs)
    })

    expect(flowId).toMatch(/^swap-/)
    const descriptor = store.getState().transactionInFlight.byFlow[flowId]
    expect(descriptor).toMatchObject({
      flowId,
      flowKind: 'swap',
      steps: 1,
      currentStep: 0,
      status: 'preparing',
      retryCount: 0,
      networkId: NetworkId['celo-mainnet'],
    })
    expect(typeof descriptor.startedAt).toBe('number')
  })

  it('advance() transitions status and applies a patch', () => {
    const store = buildStore()
    const { result } = renderHook(() => useTransactionInFlight({ scopeToFlowKind: 'swap' }), {
      wrapper: makeWrapper(store),
    })

    let flowId = ''
    void act(() => {
      flowId = result.current.start(baseStartArgs)
    })
    void act(() => {
      result.current.advance(flowId, 'submitting', { currentStep: 1 })
    })

    const descriptor = store.getState().transactionInFlight.byFlow[flowId]
    expect(descriptor.status).toBe('submitting')
    expect(descriptor.currentStep).toBe(1)
  })

  it('fail() sets status to `failed` and records the errorClass', () => {
    const store = buildStore()
    const { result } = renderHook(() => useTransactionInFlight({ scopeToFlowKind: 'swap' }), {
      wrapper: makeWrapper(store),
    })

    let flowId = ''
    void act(() => {
      flowId = result.current.start(baseStartArgs)
    })
    const errorClass: ErrorClass = {
      kind: 'slippage',
      message: 'price moved',
      retryable: true,
    }
    void act(() => {
      result.current.fail(flowId, errorClass)
    })

    const descriptor = store.getState().transactionInFlight.byFlow[flowId]
    expect(descriptor.status).toBe('failed')
    expect(descriptor.lastErrorClass).toEqual(errorClass)
  })

  it('retry() increments retryCount and resets status to `preparing`', () => {
    const store = buildStore()
    const { result } = renderHook(() => useTransactionInFlight({ scopeToFlowKind: 'swap' }), {
      wrapper: makeWrapper(store),
    })

    let flowId = ''
    void act(() => {
      flowId = result.current.start(baseStartArgs)
    })
    void act(() => {
      result.current.fail(flowId, { kind: 'rpc-timeout', message: 'oops', retryable: true })
    })
    void act(() => {
      result.current.retry(flowId, { pollContextPatch: { attempt: 2 } })
    })

    const descriptor = store.getState().transactionInFlight.byFlow[flowId]
    expect(descriptor.retryCount).toBe(1)
    expect(descriptor.status).toBe('preparing')
    expect(descriptor.lastErrorClass).toBeUndefined()
    expect(descriptor.pollContext).toEqual({ attempt: 2 })
  })

  it('abort() removes the flow from the store', () => {
    const store = buildStore()
    const { result } = renderHook(() => useTransactionInFlight({ scopeToFlowKind: 'swap' }), {
      wrapper: makeWrapper(store),
    })

    let flowId = ''
    void act(() => {
      flowId = result.current.start(baseStartArgs)
    })
    void act(() => {
      result.current.abort(flowId)
    })

    expect(store.getState().transactionInFlight.byFlow[flowId]).toBeUndefined()
  })

  it('classifyError() falls back to the default taxonomy when no retryClassifier is provided', () => {
    const store = buildStore()
    const { result } = renderHook(() => useTransactionInFlight(), {
      wrapper: makeWrapper(store),
    })

    const cls = result.current.classifyError(new Error('execution reverted: bad path'))
    expect(cls.kind).toBe('revert')
    expect(cls.retryable).toBe(false)
  })

  it('classifyError() uses the provided retryClassifier when given', () => {
    const store = buildStore()
    const customClassifier = jest.fn(
      (): ErrorClass => ({ kind: 'connectivity', message: 'no net', retryable: true })
    )
    const { result } = renderHook(
      () => useTransactionInFlight({ retryClassifier: customClassifier }),
      { wrapper: makeWrapper(store) }
    )

    const cls = result.current.classifyError(new Error('whatever'))
    expect(customClassifier).toHaveBeenCalledTimes(1)
    expect(cls).toEqual({ kind: 'connectivity', message: 'no net', retryable: true })
  })

  it('current is scoped to the requested flowKind and ignores other kinds', () => {
    const store = buildStore()
    const { result: swapHook } = renderHook(
      () => useTransactionInFlight({ scopeToFlowKind: 'swap' }),
      { wrapper: makeWrapper(store) }
    )
    const { result: buckspayHook } = renderHook(
      () => useTransactionInFlight({ scopeToFlowKind: 'buckspay' }),
      { wrapper: makeWrapper(store) }
    )

    void act(() => {
      swapHook.current.start({ ...baseStartArgs, flowKind: 'buckspay' })
    })

    expect(swapHook.current.current).toBeNull()
    expect(buckspayHook.current.current?.flowKind).toBe('buckspay')
  })
})
