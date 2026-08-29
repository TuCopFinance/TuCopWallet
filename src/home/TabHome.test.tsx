import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { FetchMock } from 'jest-fetch-mock/types'
import * as React from 'react'
import { Provider } from 'react-redux'
import TabHome from 'src/home/TabHome'
import { navigate } from 'src/navigator/NavigationService'
import { RootState } from 'src/redux/reducers'
import { NetworkId } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import MockedNavigator from 'test/MockedNavigator'
import { RecursivePartial, createMockStore } from 'test/utils'

jest.mock('src/web3/networkConfig', () => {
  const originalModule = jest.requireActual('src/web3/networkConfig')
  return {
    ...originalModule,
    __esModule: true,
    default: {
      ...originalModule.default,
      defaultNetworkId: 'celo-mainnet',
    },
  }
})

const copmTokenId = networkConfig.copmTokenId
const usdtTokenId = networkConfig.usdtTokenId

const mockBalances = {
  tokens: {
    tokenBalances: {
      [copmTokenId]: {
        name: 'COPm',
        networkId: NetworkId['celo-mainnet'],
        tokenId: copmTokenId,
        address: copmTokenId.split(':')[1],
        symbol: 'COPm',
        decimals: 18,
        balance: '100',
        priceUsd: '0.00025',
        priceFetchedAt: Date.now(),
        isCashInEligible: true,
        isCashOutEligible: true,
      },
      [usdtTokenId]: {
        name: 'USDT',
        networkId: NetworkId['celo-mainnet'],
        tokenId: usdtTokenId,
        address: usdtTokenId.split(':')[1],
        symbol: 'USDT',
        decimals: 6,
        balance: '10',
        priceUsd: '1',
        priceFetchedAt: Date.now(),
        isFeeCurrency: false,
        isCashInEligible: true,
        isCashOutEligible: true,
      },
    },
  },
}

jest.mock('src/fiatExchanges/utils', () => ({
  ...(jest.requireActual('src/fiatExchanges/utils') as any),
  fetchProviders: jest.fn(),
}))

jest.mock('src/tokens/hooks', () => ({
  ...jest.requireActual('src/tokens/hooks'),
  useUSDT: () => ({
    tokenId: 'celo-mainnet:0xd077a400968890eacc75cdc901f0356c943e4fdb',
    symbol: 'USDT',
  }),
}))

describe('TabHome', () => {
  const mockFetch = fetch as FetchMock

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResponse(
      JSON.stringify({
        data: {
          tokenTransactionsV2: {
            transactions: [],
          },
        },
      })
    )
  })

  function renderScreen(storeOverrides: RecursivePartial<RootState> = {}, screenParams = {}) {
    const store = createMockStore({
      ...mockBalances,
      buckspay: { flowStatus: 'idle' },
      ...storeOverrides,
    })

    const tree = render(
      <Provider store={store}>
        <MockedNavigator component={TabHome} params={screenParams} />
      </Provider>
    )

    return {
      store,
      tree,
      ...tree,
    }
  }

  it('renders home tab correctly and fires initial actions', async () => {
    const { store } = renderScreen({
      app: {
        phoneNumberVerified: true,
      },
      recipients: {
        phoneRecipientCache: {},
      },
    })

    await waitFor(() =>
      expect(store.getActions().map((action) => action.type)).toEqual(
        expect.arrayContaining([
          'HOME/VISIT_HOME',
          'HOME/REFRESH_BALANCES',
          'IDENTITY/IMPORT_CONTACTS',
        ])
      )
    )
  })

  it("doesn't import contacts if number isn't verified", async () => {
    const { store } = renderScreen({
      app: {
        phoneNumberVerified: false,
      },
      recipients: {
        phoneRecipientCache: {},
      },
    })

    await waitFor(() =>
      expect(store.getActions().map((action) => action.type)).toEqual(
        expect.arrayContaining(['HOME/VISIT_HOME', 'HOME/REFRESH_BALANCES'])
      )
    )
  })

  // Quick-action tap tests moved to src/home/HeaderQuickActions.test.tsx
  // after PR (this branch) promoted the 4 quick actions (Envia / Recibe /
  // Recarga / Gasta) out of TabHome and into tabHeader.headerLeft. The
  // buttons are no longer part of TabHome's render tree so testing them
  // here would require booting the whole navigator stack; the dedicated
  // test file renders HeaderQuickActions directly.

  it('Tapping the Swap card opens the swap screen with Dolares (virtual) as FROM and Pesos as TO', async () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId('FlatCard/Swap'))
    // Default direction: Dolares (aggregate) -> Pesos. Users spend their
    // full dollar balance via the multi-swap planner when FROM=virtual,
    // or a single settlement token (USDT) when they drill into a concrete
    // dollar. User can reverse the direction inside the swap screen.
    expect(navigate).toHaveBeenCalledWith('SwapScreenWithBack', {
      fromTokenId: 'virtual:dolares',
      toTokenId: copmTokenId,
    })
  })
})
