import { render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import FiatExchangeCurrencyBottomSheet from 'src/fiatExchanges/FiatExchangeCurrencyBottomSheet'
import { FiatExchangeFlow } from 'src/fiatExchanges/utils'
import { getDynamicConfigParams, getFeatureGate, getMultichainFeatures } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs, StatsigMultiNetworkDynamicConfig } from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'
import MockedNavigator from 'test/MockedNavigator'
import { createMockStore } from 'test/utils'
import {
  mockCeloTokenId,
  mockCeurTokenId,
  mockCrealTokenId,
  mockCusdTokenId,
  mockEthTokenId,
  mockTokenBalances,
} from 'test/values'

const MOCK_STORE_DATA = {
  tokens: {
    tokenBalances: {
      ...mockTokenBalances,
    },
  },
}

jest.mock('src/web3/networkConfig', () => {
  const originalModule = jest.requireActual('src/web3/networkConfig')
  return {
    ...originalModule,
    __esModule: true,
    default: {
      ...originalModule.default,
      defaultNetworkId: 'celo-alfajores',
      spendTokenIds: [
        'celo-alfajores:0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1'.toLowerCase(),
        'celo-alfajores:0x10c892A6EC43a53E45D0B916B4b7D383B1b78C0F'.toLowerCase(),
      ],
    },
  }
})

jest.mock('src/statsig')

describe(FiatExchangeCurrencyBottomSheet, () => {
  const mockStore = createMockStore(MOCK_STORE_DATA)
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getFeatureGate).mockReturnValue(false)
    jest.mocked(getMultichainFeatures).mockReturnValue({
      ...DynamicConfigs[StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES].defaultValues,
      showCico: [NetworkId['celo-alfajores'], NetworkId['ethereum-sepolia']],
    })
    jest.mocked(getDynamicConfigParams).mockImplementation(({ configName, defaultValues }) => {
      switch (configName) {
        case StatsigDynamicConfigs.CICO_TOKEN_INFO:
          return {
            tokenInfo: {
              [mockEthTokenId]: { cicoOrder: 1 },
              [mockCeloTokenId]: { cicoOrder: 2 },
              [mockCusdTokenId]: { cicoOrder: 3 },
              [mockCeurTokenId]: { cicoOrder: 4 },
              [mockCrealTokenId]: { cicoOrder: 5 },
            },
          }
        case StatsigDynamicConfigs.SWAP_CONFIG:
          return {
            popularTokenIds: [mockEthTokenId, mockCeloTokenId],
          }
        default:
          return defaultValues
      }
    })
  })
  it('shows the correct tokens for cash in', () => {
    const { getAllByTestId } = render(
      <Provider store={mockStore}>
        <MockedNavigator
          component={FiatExchangeCurrencyBottomSheet}
          params={{ flow: FiatExchangeFlow.CashIn }}
        />
      </Provider>
    )
    expect(getAllByTestId('TokenBalanceItem')).toHaveLength(6)
    ;['ETH', 'CELO', 'cUSD', 'cEUR', 'cREAL', 'USDC'].forEach((token, index) => {
      expect(getAllByTestId('TokenBalanceItem')[index]).toHaveTextContent(token)
    })
  })
  it('shows the correct tokens for cash out', () => {
    const { getAllByTestId } = render(
      <Provider store={mockStore}>
        <MockedNavigator
          component={FiatExchangeCurrencyBottomSheet}
          params={{ flow: FiatExchangeFlow.CashOut }}
        />
      </Provider>
    )
    expect(getAllByTestId('TokenBalanceItem')).toHaveLength(5)
  })
  it('shows the correct tokens for cash spend', () => {
    const { getAllByTestId } = render(
      <Provider store={mockStore}>
        <MockedNavigator
          component={FiatExchangeCurrencyBottomSheet}
          params={{ flow: FiatExchangeFlow.Spend }}
        />
      </Provider>
    )
    expect(getAllByTestId('TokenBalanceItem')).toHaveLength(2)
    ;['cUSD', 'cEUR'].forEach((token, index) => {
      expect(getAllByTestId('TokenBalanceItem')[index]).toHaveTextContent(token)
    })
  })
  it('shows the correct order when cicoOrder missing/same value', () => {
    jest.mocked(getDynamicConfigParams).mockImplementation(({ configName, defaultValues }) => {
      switch (configName) {
        case StatsigDynamicConfigs.CICO_TOKEN_INFO:
          return {
            tokenInfo: {
              [mockCusdTokenId]: { cicoOrder: 1 },
              [mockCrealTokenId]: { cicoOrder: 1 },
            },
          }
        default:
          return defaultValues
      }
    })
    const { getAllByTestId } = render(
      <Provider store={mockStore}>
        <MockedNavigator
          component={FiatExchangeCurrencyBottomSheet}
          params={{ flow: FiatExchangeFlow.CashIn }}
        />
      </Provider>
    )
    expect(getAllByTestId('TokenBalanceItem')).toHaveLength(6)
    ;['cUSD', 'cREAL', 'cEUR', 'CELO', 'ETH', 'USDC'].forEach((token, index) => {
      expect(getAllByTestId('TokenBalanceItem')[index]).toHaveTextContent(token)
    })
  })
})
