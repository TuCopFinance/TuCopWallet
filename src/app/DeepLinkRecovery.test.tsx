import { render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import DeepLinkRecovery from 'src/app/DeepLinkRecovery'
import { NetworkId } from 'src/transactions/types'
import { createMockStore } from 'test/utils'

describe('DeepLinkRecovery', () => {
  function stateWithFlow(startedAt: number) {
    return {
      transactionInFlight: {
        byFlow: {
          'flow-1': {
            flowId: 'flow-1',
            flowKind: 'dollarsSpend' as const,
            steps: 3,
            currentStep: 1,
            status: 'progress' as const,
            preparedTransactions: [],
            networkId: NetworkId['celo-mainnet'],
            retryCount: 0,
            startedAt,
          },
        },
      },
    }
  }

  it('renders nothing when no in-flight', () => {
    const { queryByTestId } = render(
      <Provider store={createMockStore({ transactionInFlight: { byFlow: {} } })}>
        <DeepLinkRecovery />
      </Provider>
    )
    expect(queryByTestId('DeepLinkRecovery')).toBeNull()
  })

  it('renders standard banner for in-flight under 24h', () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    const { getByText, getByTestId } = render(
      <Provider store={createMockStore(stateWithFlow(tenMinutesAgo))}>
        <DeepLinkRecovery />
      </Provider>
    )
    expect(getByTestId('DeepLinkRecovery')).toBeTruthy()
    expect(getByText('recovery.banner')).toBeTruthy()
  })

  it('renders stale banner for in-flight older than 24h', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000
    const { getByText, getByTestId } = render(
      <Provider store={createMockStore(stateWithFlow(twoDaysAgo))}>
        <DeepLinkRecovery />
      </Provider>
    )
    expect(getByTestId('DeepLinkRecovery')).toBeTruthy()
    expect(getByText('recovery.staleBanner')).toBeTruthy()
  })

  it('does not render when in-flight is less than 60s old', () => {
    const tenSecondsAgo = Date.now() - 10 * 1000
    const { queryByTestId } = render(
      <Provider store={createMockStore(stateWithFlow(tenSecondsAgo))}>
        <DeepLinkRecovery />
      </Provider>
    )
    expect(queryByTestId('DeepLinkRecovery')).toBeNull()
  })

  it('ignores succeeded and failed flows', () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    const state = {
      transactionInFlight: {
        byFlow: {
          'done-flow': {
            flowId: 'done-flow',
            flowKind: 'send' as const,
            steps: 1,
            currentStep: 1,
            status: 'succeeded' as const,
            preparedTransactions: [],
            networkId: NetworkId['celo-mainnet'],
            retryCount: 0,
            startedAt: tenMinutesAgo,
          },
          'failed-flow': {
            flowId: 'failed-flow',
            flowKind: 'send' as const,
            steps: 1,
            currentStep: 1,
            status: 'failed' as const,
            preparedTransactions: [],
            networkId: NetworkId['celo-mainnet'],
            retryCount: 0,
            startedAt: tenMinutesAgo,
          },
        },
      },
    }
    const { queryByTestId } = render(
      <Provider store={createMockStore(state)}>
        <DeepLinkRecovery />
      </Provider>
    )
    expect(queryByTestId('DeepLinkRecovery')).toBeNull()
  })
})
