import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import { FetchMock } from 'jest-fetch-mock/types'
import React from 'react'
import { DeviceEventEmitter } from 'react-native'
import { Provider } from 'react-redux'
import { ReactTestInstance } from 'react-test-renderer'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { SwapEvents } from 'src/analytics/Events'
import { APPROX_SYMBOL } from 'src/components/TokenEnterAmount'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import {
  getDynamicConfigParams,
  getExperimentParams,
  getFeatureGate,
  getMultichainFeatures,
} from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { DOLARES_VIRTUAL_TOKEN_ID } from 'src/dollarsSpend'
import SwapScreen from 'src/swap/SwapScreen'
import { swapStart } from 'src/swap/slice'
import { FetchQuoteResponse, Field } from 'src/swap/types'
import { NO_QUOTE_ERROR_MESSAGE } from 'src/swap/useSwapQuote'
import { NetworkId } from 'src/transactions/types'
import { publicClient } from 'src/viem'
import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'
import networkConfig from 'src/web3/networkConfig'
import MockedNavigator from 'test/MockedNavigator'
import { createMockStore } from 'test/utils'
import {
  mockAccount,
  mockCeloAddress,
  mockCeloTokenId,
  mockCeurTokenId,
  mockCusdAddress,
  mockCusdTokenId,
  mockEthTokenId,
  mockPoofTokenId,
  mockTestTokenTokenId,
  mockTokenBalances,
  mockUSDCTokenId,
} from 'test/values'

const mockFetch = fetch as FetchMock
const mockGetNumberFormatSettings = jest.fn()

// Use comma as decimal separator for all tests here
// Input with "." will still work, but it will also work with ",".
jest.mock('src/components/ErrorMessage', () => ({
  showErrorMessage: jest.fn(),
}))

jest.mock('src/utils/errors', () => ({
  classifyError: jest.fn(() => ({
    publicMessageKey: 'errors.public.generic',
    publicMessageFallback: 'Something went wrong',
    severity: 'error',
    technical: {},
  })),
}))

jest.mock('react-native-localize', () => ({
  getNumberFormatSettings: () => mockGetNumberFormatSettings(),
}))

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

jest.mock('src/statsig')

jest.mock('viem/actions', () => ({
  ...jest.requireActual('viem/actions'),
  estimateGas: jest.fn(async () => BigInt(21_000)),
}))

jest.mock('src/viem/estimateFeesPerGas', () => ({
  estimateFeesPerGas: jest.fn(async () => ({
    maxFeePerGas: BigInt(12_000_000_000),
    maxPriorityFeePerGas: BigInt(2_000_000_000),
    baseFeePerGas: BigInt(6_000_000_000),
  })),
}))

const mockStoreTokenBalances = {
  [mockCeurTokenId]: {
    ...mockTokenBalances[mockCeurTokenId],
    isSwappable: true,
    balance: '0',
    priceUsd: '5.03655958698530226301',
  },
  [mockCusdTokenId]: {
    ...mockTokenBalances[mockCusdTokenId],
    isSwappable: true,
    priceUsd: '1',
  },
  [mockCeloTokenId]: {
    ...mockTokenBalances[mockCeloTokenId],
    isSwappable: true,
    priceUsd: '13.05584965485329753569',
  },
  [mockTestTokenTokenId]: {
    tokenId: mockTestTokenTokenId,
    networkId: NetworkId['celo-mainnet'],
    symbol: 'TT',
    name: 'Test Token',
    isSwappable: false,
    balance: '100',
    // no priceUsd
    priceUsd: undefined,
  },
  [mockPoofTokenId]: {
    ...mockTokenBalances[mockPoofTokenId],
    isSwappable: true,
    balance: '100',
    // no priceUsd
    priceUsd: undefined,
  },
  [mockEthTokenId]: {
    ...mockTokenBalances[mockEthTokenId],
    isSwappable: true,
    priceUsd: '2000',
    balance: '10',
  },
  [mockUSDCTokenId]: {
    ...mockTokenBalances[mockUSDCTokenId],
    isSwappable: true,
    balance: '10',
    priceUsd: '1',
    imageUrl: 'https://example.com/usdc.png',
  },
}

const renderScreen = ({
  celoBalance = '10',
  cUSDBalance = '20.456',
  fromTokenId = undefined,
  isPoofSwappable = true,
  poofBalance = '100',
  lastSwapped = [],
  toTokenNetworkId = undefined,
}: {
  celoBalance?: string
  cUSDBalance?: string
  fromTokenId?: string
  isPoofSwappable?: boolean
  poofBalance?: string
  lastSwapped?: string[]
  toTokenNetworkId?: NetworkId
}) => {
  const store = createMockStore({
    tokens: {
      tokenBalances: {
        ...mockStoreTokenBalances,
        [mockCusdTokenId]: {
          ...mockStoreTokenBalances[mockCusdTokenId],
          balance: cUSDBalance,
        },
        [mockCeloTokenId]: {
          ...mockStoreTokenBalances[mockCeloTokenId],
          balance: celoBalance,
        },
        [mockPoofTokenId]: {
          ...mockStoreTokenBalances[mockPoofTokenId],
          isSwappable: isPoofSwappable,
          balance: poofBalance,
        },
      },
    },
    swap: {
      lastSwapped,
    },
  })

  const tree = render(
    <Provider store={store}>
      <MockedNavigator component={SwapScreen} params={{ fromTokenId, toTokenNetworkId }} />
    </Provider>
  )
  const [swapFromContainer, swapToContainer] = tree.getAllByTestId('SwapAmountInput')
  const tokenBottomSheets = tree.getAllByTestId('TokenBottomSheet')
  const swapScreen = tree.getByTestId('SwapScreen')

  return {
    ...tree,
    store,
    swapFromContainer,
    swapToContainer,
    tokenBottomSheets,
    swapScreen,
  }
}

const defaultQuote: FetchQuoteResponse = {
  unvalidatedSwapTransaction: {
    swapType: 'same-chain',
    chainId: 42220,
    price: '1.2345678',
    guaranteedPrice: '1.1234567',
    appFeePercentageIncludedInPrice: undefined,
    sellTokenAddress: mockCeloAddress,
    buyTokenAddress: mockCusdAddress,
    sellAmount: '1234000000000000000',
    buyAmount: '1523456665200000000',
    allowanceTarget: '0x0000000000000000000000000000000000000123',
    from: mockAccount,
    to: '0x0000000000000000000000000000000000000123',
    value: '0',
    data: '0x0',
    gas: '1800000',
    estimatedGasUse: undefined,
    estimatedPriceImpact: '0.1',
  },
  details: {
    swapProvider: 'someProvider',
  },
}
const defaultQuoteResponse = JSON.stringify(defaultQuote)

// Per Bug E fix (pickFeeCurrency in useSwapQuote): when the user swaps CELO,
// the picker promotes any visible stable above CELO. In these fixtures cUSD is
// available with a non-zero balance, so the prepared swap tx is built with
// feeCurrency = cUSD address (CIP-64 type 0x7b) instead of native CELO. Gas is
// 50000 higher than the eip1559-native path because CIP-64 adds a small
// pre-tx-fee debit overhead.
const preparedTransactions: SerializableTransactionRequest[] = [
  {
    data: '0x095ea7b3000000000000000000000000000000000000000000000000000000000000012300000000000000000000000000000000000000000000000011200c7644d50000',
    feeCurrency: mockCusdAddress as `0x${string}`,
    from: '0x0000000000000000000000000000000000007E57',
    gas: '21000',
    // 21000 * 60 / 100 = 12600 (matches the calibration added in
    // src/viem/prepareTransactions.ts:tryEstimateTransaction to make
    // getEstimatedGasFee reflect realistic on-chain usage instead of LIMIT)
    _estimatedGasUse: '12600',
    maxFeePerGas: '12000000000',
    maxPriorityFeePerGas: '2000000000',
    _baseFeePerGas: '6000000000',
    to: '0xf194afdf50b03e69bd7d057c1aa9e10c9954e4c9',
  },
  {
    data: '0x0',
    feeCurrency: mockCusdAddress as `0x${string}`,
    from: '0x0000000000000000000000000000000000007E57',
    // Swap tx base gas = 1_800_000. On CIP-64 (non-native fee currency) the
    // wallet adds STATIC_GAS_PADDING (50_000) + SHORTCUT_NON_NATIVE_BUFFER_BPS
    // (25% of 1_800_000 = 450_000) = 2_300_000 total. The buffer landed with
    // the fix for the 2026-07-14 Neeru OOG so shortcut-supplied gas retains
    // real headroom over CIP-64 overhead + real-world variance.
    gas: '2300000',
    // The swap (second) tx has no fresh estimateGas call in this fixture so
    // _estimatedGasUse stays undefined, matching the actual saga output.
    _estimatedGasUse: undefined,
    maxFeePerGas: '12000000000',
    maxPriorityFeePerGas: '2000000000',
    _baseFeePerGas: '6000000000',
    to: '0x0000000000000000000000000000000000000123',
    value: '0',
  },
]

const mockTxFeesLearnMoreUrl = 'https://example.com/tx-fees-learn-more'

const selectSingleSwapToken = (
  swapAmountContainer: ReactTestInstance,
  tokenSymbol: string,
  swapScreen: ReactTestInstance,
  swapFieldType: Field
) => {
  const token = Object.values(mockStoreTokenBalances).find((token) => token.symbol === tokenSymbol)
  expect(token).toBeTruthy()

  const [fromTokenBottomSheet, toTokenBottomSheet] =
    within(swapScreen).getAllByTestId('TokenBottomSheet')
  const tokenBottomSheet = swapFieldType === Field.FROM ? fromTokenBottomSheet : toTokenBottomSheet

  fireEvent.press(within(swapAmountContainer).getByTestId('SwapAmountInput/TokenSelect'))
  fireEvent.press(within(tokenBottomSheet).getByText(token!.name))

  if (swapFieldType === Field.TO && !token!.priceUsd) {
    fireEvent.press(within(swapScreen).getByText('swapScreen.noUsdPriceWarning.ctaConfirm'))
  }

  // Some symbols are remapped by getTokenSymbol (e.g. USDC -> assets.dollars in test env).
  const displayedSymbols: Record<string, string> = {
    USDC: 'assets.dollars',
    USDm: 'assets.dollars',
    USAT: 'assets.dollars',
    USDT: 'assets.dollars',
  }
  const expectedDisplaySymbol = displayedSymbols[tokenSymbol] ?? tokenSymbol
  expect(within(swapAmountContainer).getByText(expectedDisplaySymbol)).toBeTruthy()

  if (swapFieldType === Field.TO && !token!.priceUsd) {
    expect(
      within(swapScreen).getByText(
        `swapScreen.noUsdPriceWarning.description, {"localCurrency":"COP","tokenSymbol":"${tokenSymbol}"}`
      )
    ).toBeTruthy()
  }
}

const selectSwapTokens = (
  fromTokenSymbol: string,
  toTokenSymbol: string,
  swapScreen: ReactTestInstance
) => {
  const tokenSymbols = [fromTokenSymbol, toTokenSymbol]
  const swapInputContainers = within(swapScreen).getAllByTestId('SwapAmountInput')

  for (let i = 0; i < 2; i++) {
    const tokenSymbol = tokenSymbols[i]
    const swapInputContainer = swapInputContainers[i]

    selectSingleSwapToken(
      swapInputContainer,
      tokenSymbol,
      swapScreen,
      i === 0 ? Field.FROM : Field.TO
    )
  }
}

const selectMaxFromAmount = async (swapScreen: ReactTestInstance) => {
  await act(() => {
    DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { height: 100 } })
  })

  const amountPercentageComponent = within(swapScreen).getByTestId('SwapEnterAmount/AmountOptions')
  fireEvent.press(within(amountPercentageComponent).getByText('maxSymbol'))
}

describe('SwapScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.resetMocks()

    mockGetNumberFormatSettings.mockReturnValue({ decimalSeparator: '.' })
    BigNumber.config({
      FORMAT: {
        decimalSeparator: '.',
      },
    })

    jest.mocked(getFeatureGate).mockReset()
    jest.mocked(getExperimentParams).mockReturnValue({
      swapBuyAmountEnabled: true,
    })
    jest.mocked(getMultichainFeatures).mockReturnValue({
      showSwap: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
      showBalances: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
    })
    jest.mocked(getDynamicConfigParams).mockReturnValue({
      maxSlippagePercentage: '0.3',
      popularTokenIds: [],
      links: {
        transactionFeesLearnMore: mockTxFeesLearnMoreUrl,
      },
    })

    const originalReadContract = publicClient.celo.readContract
    jest.spyOn(publicClient.celo, 'readContract').mockImplementation(async (args) => {
      if (args.functionName === 'allowance') {
        return 0
      }
      return originalReadContract(args)
    })
  })

  it('should display the correct elements on load', () => {
    const { getByText, swapFromContainer, swapToContainer } = renderScreen({})

    expect(getByText('swapScreen.title')).toBeTruthy()
    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()

    expect(within(swapFromContainer).getByText('swapScreen.selectTokenLabel')).toBeTruthy()
    expect(within(swapFromContainer).getByTestId('SwapAmountInput/TokenSelect')).toBeTruthy()

    expect(within(swapToContainer).getByText('swapScreen.selectTokenLabel')).toBeTruthy()
    expect(within(swapToContainer).getByTestId('SwapAmountInput/TokenSelect')).toBeTruthy()
  })

  it('should display the UK compliant variants', () => {
    const mockedPopularTokens = [mockUSDCTokenId, mockPoofTokenId]
    jest.mocked(getDynamicConfigParams).mockReturnValue({
      popularTokenIds: mockedPopularTokens,
      maxSlippagePercentage: '0.3',
    })
    jest
      .mocked(getFeatureGate)
      .mockImplementation((gate) => gate === StatsigFeatureGates.SHOW_UK_COMPLIANT_VARIANT)

    const { getByText, tokenBottomSheets } = renderScreen({})

    expect(getByText('swapScreen.confirmSwap, {"context":"UK"}')).toBeTruthy()
    expect(getByText('swapScreen.disclaimer, {"context":"UK"}')).toBeTruthy()
    // popular token filter chip is not shown
    expect(within(tokenBottomSheets[0]).queryByText('tokenBottomSheet.filters.popular')).toBeFalsy()
    expect(within(tokenBottomSheets[1]).queryByText('tokenBottomSheet.filters.popular')).toBeFalsy()
  })

  it('should display the token set via fromTokenId prop', () => {
    const { swapFromContainer, swapToContainer } = renderScreen({ fromTokenId: mockCeurTokenId })

    expect(within(swapFromContainer).getByText('cEUR')).toBeTruthy()
    expect(within(swapToContainer).getByText('swapScreen.selectTokenLabel')).toBeTruthy()
  })

  it('should allow selecting tokens', async () => {
    const { swapFromContainer, swapToContainer, swapScreen } = renderScreen({})

    expect(within(swapFromContainer).getByText('swapScreen.selectTokenLabel')).toBeTruthy()
    expect(within(swapToContainer).getByText('swapScreen.selectTokenLabel')).toBeTruthy()

    selectSwapTokens('CELO', 'cUSD', swapScreen)

    const commonAnalyticsProps = {
      areSwapTokensShuffled: false,
      fromTokenId: 'celo-mainnet:native',
      fromTokenNetworkId: 'celo-mainnet',
      fromTokenSymbol: 'CELO',
      switchedNetworkId: false,
      tokenNetworkId: 'celo-mainnet',
    }
    expect(AppAnalytics.track).toHaveBeenCalledWith(SwapEvents.swap_screen_confirm_token, {
      ...commonAnalyticsProps,
      fieldType: 'FROM',
      tokenId: 'celo-mainnet:native',
      tokenPositionInList: 1,
      tokenSymbol: 'CELO',
    })
    expect(AppAnalytics.track).toHaveBeenCalledWith(SwapEvents.swap_screen_confirm_token, {
      ...commonAnalyticsProps,
      fieldType: 'TO',
      tokenId: 'celo-mainnet:0x874069fa1eb16d44d622f2e0ca25eea172369bc1',
      tokenPositionInList: 2,
      tokenSymbol: 'cUSD',
      toTokenId: 'celo-mainnet:0x874069fa1eb16d44d622f2e0ca25eea172369bc1',
      toTokenNetworkId: 'celo-mainnet',
      toTokenSymbol: 'cUSD',
    })
  })

  it('should show only the allowed to and from tokens', async () => {
    const { swapFromContainer, swapToContainer, tokenBottomSheets } = renderScreen({
      isPoofSwappable: false,
      poofBalance: '0',
    })
    const [fromTokenBottomSheet, toTokenBottomSheet] = tokenBottomSheets

    fireEvent.press(within(swapFromContainer).getByTestId('SwapAmountInput/TokenSelect'))

    expect(within(fromTokenBottomSheet).getByText('Celo Dollar')).toBeTruthy()
    // should see TT even though it is marked as not swappable, because there is a balance
    expect(within(fromTokenBottomSheet).getByText('Test Token')).toBeTruthy()
    // should see not see POOF because it is marked as not swappable and there is no balance
    expect(within(fromTokenBottomSheet).queryByText('Poof Governance Token')).toBeFalsy()

    // finish the token selection
    fireEvent.press(within(fromTokenBottomSheet).getByText('Celo Dollar'))
    expect(within(swapFromContainer).getByText('cUSD')).toBeTruthy()

    fireEvent.press(within(swapToContainer).getByTestId('SwapAmountInput/TokenSelect'))

    expect(within(toTokenBottomSheet).getByText('Celo Dollar')).toBeTruthy()
    expect(within(toTokenBottomSheet).queryByText('Test Token')).toBeFalsy()
    expect(within(toTokenBottomSheet).queryByText('Poof Governance Token')).toBeFalsy()
  })

  it('should not select a token without usd price if the user dismisses the warning', async () => {
    const { swapToContainer, queryByText, getByText, tokenBottomSheets } = renderScreen({})
    const tokenBottomSheet = tokenBottomSheets[1] // "from" token selection

    fireEvent.press(within(swapToContainer).getByTestId('SwapAmountInput/TokenSelect'))
    fireEvent.press(
      within(tokenBottomSheet).getByText(mockStoreTokenBalances[mockPoofTokenId].name)
    )

    expect(
      getByText(
        'swapScreen.noUsdPriceWarning.description, {"localCurrency":"COP","tokenSymbol":"POOF"}'
      )
    ).toBeTruthy()

    fireEvent.press(getByText('swapScreen.noUsdPriceWarning.ctaDismiss'))

    expect(
      queryByText(
        'swapScreen.noUsdPriceWarning.description, {"localCurrency":"COP","tokenSymbol":"POOF"}'
      )
    ).toBeFalsy()
    expect(tokenBottomSheet).toBeVisible()
    expect(within(swapToContainer).getByText('swapScreen.selectTokenLabel')).toBeTruthy()
    expect(AppAnalytics.track).not.toHaveBeenCalledWith(
      SwapEvents.swap_screen_confirm_token,
      expect.anything()
    )
  })

  it('should swap the to/from tokens if the same token is selected', async () => {
    const { swapFromContainer, swapToContainer, swapScreen } = renderScreen({})

    selectSingleSwapToken(swapFromContainer, 'CELO', swapScreen, Field.FROM)
    selectSingleSwapToken(swapToContainer, 'cUSD', swapScreen, Field.TO)
    selectSingleSwapToken(swapFromContainer, 'cUSD', swapScreen, Field.FROM)

    expect(within(swapFromContainer).getByText('cUSD')).toBeTruthy()
    expect(within(swapToContainer).getByText('CELO')).toBeTruthy()
  })

  it('should swap the to/from tokens even if the to token was not selected', async () => {
    const { swapFromContainer, swapToContainer, swapScreen } = renderScreen({})

    selectSwapTokens('CELO', 'CELO', swapScreen)

    expect(within(swapFromContainer).getByText('swapScreen.selectTokenLabel')).toBeTruthy()
    expect(within(swapToContainer).getByText('CELO')).toBeTruthy()
  })

  it('should keep the to amount in sync with the exchange rate', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { swapFromContainer, swapToContainer, swapScreen, getByText, getByTestId } = renderScreen(
      {}
    )

    selectSwapTokens('CELO', 'cUSD', swapScreen)

    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1.234')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 1.23456 cUSD'
    )
    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe('1.234')
    expect(within(swapFromContainer).getByTestId('SwapAmountInput/FiatValue')).toHaveTextContent(
      `${APPROX_SYMBOL} COP$21.43`
    )
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '1.523456'
    )
    expect(within(swapToContainer).getByTestId('SwapAmountInput/FiatValue')).toHaveTextContent(
      `${APPROX_SYMBOL} COP$2.03`
    )
    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
  })

  it('should display a loader when initially fetching exchange rate', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { swapScreen, swapFromContainer, swapToContainer, getByText, getByTestId } = renderScreen(
      {}
    )

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1.234')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(mockFetch.mock.calls.length).toEqual(1)
    expect(mockFetch.mock.calls[0][0]).toEqual(
      `${
        networkConfig.getSwapQuoteUrl
      }?buyToken=${mockCusdAddress}&buyIsNative=false&buyNetworkId=${
        NetworkId['celo-mainnet']
      }&sellToken=${mockCeloAddress}&sellIsNative=true&sellNetworkId=${
        NetworkId['celo-mainnet']
      }&sellAmount=1234000000000000000&userAddress=${mockAccount.toLowerCase()}&slippagePercentage=0.3`
    )

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 1.23456 cUSD'
    )
    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe('1.234')
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '1.523456'
    )
    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
  })

  it('should allow selecting cross-chain tokens and show cross-chain message', async () => {
    jest
      .mocked(getFeatureGate)
      .mockImplementation((gate) => gate === StatsigFeatureGates.ALLOW_CROSS_CHAIN_SWAPS)

    const { getByText, queryByText, swapScreen } = renderScreen({})

    selectSwapTokens('CELO', 'USDC', swapScreen)
    expect(
      queryByText('swapScreen.switchedToNetworkWarning.title, {"networkName":"Ethereum"}')
    ).toBeFalsy()

    expect(getByText('swapScreen.crossChainNotification')).toBeTruthy()
  })

  it("should show warning on cross-chain swap when user can't afford cross-chain fees and swapping fee currency", async () => {
    jest
      .mocked(getFeatureGate)
      .mockImplementation((gate) => gate === StatsigFeatureGates.ALLOW_CROSS_CHAIN_SWAPS)
    mockFetch.mockResponseOnce(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          swapType: 'cross-chain',
          sellAmount: new BigNumber(10).times(new BigNumber(10).pow(18)).toString(),
          maxCrossChainFee: new BigNumber(10).pow(18).toString(),
        },
      })
    )

    const { getByText, swapScreen, swapFromContainer } = renderScreen({
      celoBalance: '10',
    })
    selectSwapTokens('CELO', 'USDC', swapScreen)

    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '10')
    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()
    expect(
      getByText(
        'swapScreen.crossChainFeeWarning.body, {"networkName":"Celo","tokenSymbol":"CELO","tokenAmount":"1"}'
      )
    ).toBeTruthy()
  })

  it("should show warning on cross-chain swap when user can't afford cross-chain fees and swapping non-fee currency", async () => {
    jest
      .mocked(getFeatureGate)
      .mockImplementation((gate) => gate === StatsigFeatureGates.ALLOW_CROSS_CHAIN_SWAPS)
    mockFetch.mockResponseOnce(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          swapType: 'cross-chain',
          sellAmount: new BigNumber(10).times(new BigNumber(10).pow(18)).toString(),
          maxCrossChainFee: new BigNumber(10).pow(18).toString(),
        },
      })
    )

    const { getByText, swapScreen, swapFromContainer } = renderScreen({
      celoBalance: '0',
      cUSDBalance: '10',
    })
    selectSwapTokens('cUSD', 'USDC', swapScreen)

    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '10')
    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()
    expect(
      getByText(
        'swapScreen.crossChainFeeWarning.body, {"networkName":"Celo","tokenSymbol":"CELO","tokenAmount":"1"}'
      )
    ).toBeTruthy()
  })

  it('should allow cross-chain swap when user can pay for cross-chain fee', async () => {
    jest
      .mocked(getFeatureGate)
      .mockImplementation((gate) => gate === StatsigFeatureGates.ALLOW_CROSS_CHAIN_SWAPS)
    mockFetch.mockResponseOnce(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          swapType: 'cross-chain',
          sellAmount: new BigNumber(10).times(new BigNumber(10).pow(18)).toString(),
          maxCrossChainFee: new BigNumber(10).pow(18).toString(),
        },
      })
    )

    const { getByText, queryByText, swapScreen, swapFromContainer } = renderScreen({
      celoBalance: '10',
    })
    selectSwapTokens('CELO', 'USDC', swapScreen)

    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '5')
    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()
    expect(queryByText('swapScreen.crossChainFeeWarning.title')).toBeFalsy()
  })

  it('should show and hide the price impact warning', async () => {
    // mock priceUsd data: CELO price ~$13, cUSD price = US$1
    const lowPriceImpactPrice = '13.12345' // within 4% price impact
    const highPriceImpactPrice = '12.44445' // more than 4% price impact

    const lowPriceImpact = '1.88' // within 4% price impact
    const highPriceImpact = '5.2' // more than 4% price impact

    mockFetch.mockResponseOnce(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          price: highPriceImpactPrice,
          estimatedPriceImpact: highPriceImpact,
        },
      })
    )
    mockFetch.mockResponseOnce(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          price: lowPriceImpactPrice,
          estimatedPriceImpact: lowPriceImpact,
        },
      })
    )

    const { swapFromContainer, swapScreen, getByText, queryByText, getByTestId } = renderScreen({
      celoBalance: '1000000',
    })

    // select 100000 CELO to cUSD swap
    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '100000')
    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 12.44445 cUSD'
    )
    expect(getByText('swapScreen.priceImpactWarning.title')).toBeTruthy()
    expect(AppAnalytics.track).toHaveBeenCalledWith(
      SwapEvents.swap_price_impact_warning_displayed,
      {
        toToken: mockCusdAddress,
        toTokenId: mockCusdTokenId,
        toTokenNetworkId: NetworkId['celo-mainnet'],
        toTokenIsImported: false,
        fromToken: mockCeloAddress,
        fromTokenId: mockCeloTokenId,
        fromTokenNetworkId: NetworkId['celo-mainnet'],
        fromTokenIsImported: false,
        amount: '100000',
        amountType: 'sellAmount',
        priceImpact: '5.2',
        provider: 'someProvider',
      }
    )

    // select 100 CELO to cUSD swap
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '100')
    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 13.12345 cUSD'
    )
    expect(queryByText('swapScreen.priceImpactWarning.title')).toBeFalsy()
  })

  it('should show and hide the missing price impact warning', async () => {
    const lowPriceImpactPrice = '13.12345'
    const highPriceImpactPrice = '12.44445'

    mockFetch.mockResponseOnce(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          price: highPriceImpactPrice,
          estimatedPriceImpact: null,
        },
      })
    )
    mockFetch.mockResponseOnce(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          price: lowPriceImpactPrice,
          estimatedPriceImpact: '2.3',
        },
      })
    )

    const { swapFromContainer, swapScreen, getByText, queryByText, getByTestId } = renderScreen({
      celoBalance: '1000000',
    })

    // select 100000 CELO to cUSD swap
    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '100000')
    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 12.44445 cUSD'
    )
    expect(getByText('swapScreen.missingSwapImpactWarning.title')).toBeTruthy()
    expect(AppAnalytics.track).toHaveBeenCalledWith(
      SwapEvents.swap_price_impact_warning_displayed,
      {
        toToken: mockCusdAddress,
        toTokenId: mockCusdTokenId,
        toTokenNetworkId: NetworkId['celo-mainnet'],
        toTokenIsImported: false,
        fromToken: mockCeloAddress,
        fromTokenId: mockCeloTokenId,
        fromTokenNetworkId: NetworkId['celo-mainnet'],
        fromTokenIsImported: false,
        amount: '100000',
        amountType: 'sellAmount',
        priceImpact: null,
        provider: 'someProvider',
      }
    )

    // select 100 CELO to cUSD swap
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '100')
    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 13.12345 cUSD'
    )
    expect(queryByText('swapScreen.missingSwapImpactWarning.title')).toBeFalsy()
  })

  it('should prioritise showing the no priceUsd warning when there is also a high price impact', async () => {
    mockFetch.mockResponseOnce(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          estimatedPriceImpact: 5, // above warning threshold
        },
      })
    )

    const { swapFromContainer, swapScreen, getByText, queryByText, getByTestId } = renderScreen({
      celoBalance: '100000',
    })

    selectSwapTokens('CELO', 'POOF', swapScreen) // no priceUsd
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '100')
    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 1.23456 POOF'
    )

    expect(getByText('swapScreen.noUsdPriceWarning.title, {"localCurrency":"COP"}')).toBeTruthy()
    expect(queryByText('swapScreen.priceImpactWarning.title')).toBeFalsy()
    expect(queryByText('swapScreen.missingSwapImpactWarning.title')).toBeFalsy()
  })

  it('should support from amount with comma as the decimal separator', async () => {
    // This only changes the display format, the input is parsed with getNumberFormatSettings
    BigNumber.config({
      FORMAT: {
        decimalSeparator: ',',
      },
    })
    mockGetNumberFormatSettings.mockReturnValue({ decimalSeparator: ',' })
    mockFetch.mockResponse(defaultQuoteResponse)
    const { swapScreen, swapFromContainer, swapToContainer, getByText, getByTestId } = renderScreen(
      {}
    )

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1,234')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(mockFetch.mock.calls.length).toEqual(1)
    expect(mockFetch.mock.calls[0][0]).toEqual(
      `${
        networkConfig.getSwapQuoteUrl
      }?buyToken=${mockCusdAddress}&buyIsNative=false&buyNetworkId=${
        NetworkId['celo-mainnet']
      }&sellToken=${mockCeloAddress}&sellIsNative=true&sellNetworkId=${
        NetworkId['celo-mainnet']
      }&sellAmount=1234000000000000000&userAddress=${mockAccount.toLowerCase()}&slippagePercentage=0.3`
    )

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 1,23456 cUSD'
    )
    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe('1,234')
    expect(within(swapFromContainer).getByTestId('SwapAmountInput/FiatValue')).toHaveTextContent(
      `${APPROX_SYMBOL} COP$21,43`
    )
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '1,523456'
    )
    expect(within(swapToContainer).getByTestId('SwapAmountInput/FiatValue')).toHaveTextContent(
      `${APPROX_SYMBOL} COP$2,03`
    )
    expect(getByTestId('SwapTransactionDetails/Slippage')).toHaveTextContent('0,3%')
    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
  })

  it.each([
    // mock store has 10 CELO balance
    // mock CELO -> cUSD exchange rate is 1.2345678
    {
      amountLabel: 'percentage, {"percentage":25}',
      percentage: 25,
      expectedFromAmount: '2.5', // 25% of 10
      expectedToAmount: '3.086419', // expectedFromAmount * exchange rate = 2.5 * 1.2345678
    },
    {
      amountLabel: 'percentage, {"percentage":50}',
      percentage: 50,
      expectedFromAmount: '5',
      expectedToAmount: '6.172839',
    },
    {
      amountLabel: 'percentage, {"percentage":75}',
      percentage: 75,
      expectedFromAmount: '7.5',
      expectedToAmount: '9.259258',
    },
    {
      amountLabel: 'maxSymbol',
      percentage: 100,
      expectedFromAmount: '10',
      expectedToAmount: '12.345678',
    },
  ])(
    'sets the expected amount when the $amountLabel chip is selected',
    async ({ amountLabel, percentage, expectedToAmount, expectedFromAmount }) => {
      mockFetch.mockResponse(defaultQuoteResponse)
      const { swapFromContainer, swapToContainer, getByText, getByTestId, swapScreen } =
        renderScreen({})

      selectSwapTokens('CELO', 'cUSD', swapScreen)

      await act(() => {
        DeviceEventEmitter.emit('keyboardDidShow', { endCoordinates: { height: 100 } })
      })

      fireEvent.press(within(getByTestId('SwapEnterAmount/AmountOptions')).getByText(amountLabel))

      await waitFor(() =>
        expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
          '1 CELO ≈ 1.23456 cUSD'
        )
      )
      expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
        expectedFromAmount
      )
      expect(within(swapToContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
        expectedToAmount
      )
      expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    }
  )

  it('should show and hide the max warning for fee currencies', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { swapFromContainer, getByText, queryByTestId, swapScreen } = renderScreen({
      celoBalance: '0',
      cUSDBalance: '10',
    }) // so that cUSD is the only feeCurrency with a balance

    selectSingleSwapToken(swapFromContainer, 'cUSD', swapScreen, Field.FROM)
    await selectMaxFromAmount(swapScreen)
    await waitFor(() =>
      expect(
        getByText('swapScreen.maxSwapAmountWarning.bodyV1_74, {"tokenSymbol":"cUSD"}')
      ).toBeTruthy()
    )

    fireEvent.press(getByText('swapScreen.maxSwapAmountWarning.learnMore'))
    expect(navigate).toHaveBeenCalledWith(Screens.WebViewScreen, {
      uri: mockTxFeesLearnMoreUrl,
    })

    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1.234')
    await waitFor(() => expect(queryByTestId('MaxSwapAmountWarning')).toBeFalsy())
  })

  it("shouldn't show the max warning when there's balance for more than 1 fee currency", async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { swapFromContainer, queryByTestId, swapScreen } = renderScreen({
      celoBalance: '10',
      cUSDBalance: '20',
    })

    selectSingleSwapToken(swapFromContainer, 'CELO', swapScreen, Field.FROM)
    await selectMaxFromAmount(swapScreen)
    await waitFor(() => expect(queryByTestId('MaxSwapAmountWarning')).toBeFalsy())
  })

  it('should fetch the quote if the amount is cleared and re-entered', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { swapFromContainer, swapToContainer, getByText, getByTestId, swapScreen } = renderScreen(
      {}
    )

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(mockFetch.mock.calls.length).toEqual(1)
    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()

    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '')

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe('')
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input').props.value).toBe('')
    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()
    expect(mockFetch.mock.calls.length).toEqual(1)

    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 1.23456 cUSD'
    )
    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '10' // matching the value inside the mocked store
    )
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '12.345678'
    )
    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    expect(mockFetch.mock.calls.length).toEqual(2)
  })

  it('should set max value if it is zero', async () => {
    const { swapFromContainer, swapToContainer, getByText, swapScreen } = renderScreen({
      celoBalance: '0',
      cUSDBalance: '0',
    })

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe('0')
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input').props.value).toBe('')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()
  })

  it('should display an error banner if api request fails', async () => {
    mockFetch.mockReject(new Error('Failed to fetch'))
    const { showErrorMessage } = jest.requireMock('src/components/ErrorMessage')

    const { swapFromContainer, getByText, swapScreen } = renderScreen({})

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1.234')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()
    expect(showErrorMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { screen: 'SwapScreen', action: 'fetchSwapQuote' },
        variant: 'sheet',
      })
    )
  })

  it('should display an unsupported notification if quote is not available', async () => {
    mockFetch.mockReject(new Error(NO_QUOTE_ERROR_MESSAGE))

    const { swapFromContainer, getByText, swapScreen } = renderScreen({})

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1.234')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()
    expect(getByText('swapScreen.unsupportedTokensWarning.title')).toBeTruthy()
  })

  it('should be able to start a swap', async () => {
    const quoteReceivedTimestamp = 1000
    jest.spyOn(Date, 'now').mockReturnValue(quoteReceivedTimestamp) // quote received timestamp

    mockFetch.mockResponse(defaultQuoteResponse)
    const { getByText, store, swapScreen } = renderScreen({})

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    fireEvent.press(getByText('swapScreen.confirmSwap'))

    expect(store.getActions()).toEqual(
      expect.arrayContaining([
        swapStart({
          swapId: expect.any(String),
          quote: {
            preparedTransactions,
            receivedAt: quoteReceivedTimestamp,
            price: defaultQuote.unvalidatedSwapTransaction.price,
            appFeePercentageIncludedInPrice:
              defaultQuote.unvalidatedSwapTransaction.appFeePercentageIncludedInPrice,
            provider: defaultQuote.details.swapProvider,
            estimatedPriceImpact: defaultQuote.unvalidatedSwapTransaction.estimatedPriceImpact,
            allowanceTarget: defaultQuote.unvalidatedSwapTransaction.allowanceTarget,
            swapType: 'same-chain',
          },
          userInput: {
            toTokenId: mockCusdTokenId,
            fromTokenId: mockCeloTokenId,
            swapAmount: {
              [Field.FROM]: '10',
              [Field.TO]: '12.345678', // 10 * 1.2345678
            },
            updatedField: Field.FROM,
          },
          areSwapTokensShuffled: false,
        }),
      ])
    )
  })

  it('should start the swap without an approval transaction if the allowance is high enough', async () => {
    jest.spyOn(publicClient.celo, 'readContract').mockResolvedValueOnce(BigInt(11 * 1e18)) // greater than swap amount of 10
    mockFetch.mockResponse(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          buyTokenAddress: mockCeloAddress,
          sellTokenAddress: mockCusdAddress,
        },
      })
    )
    const { getByText, store, swapScreen, swapFromContainer } = renderScreen({})

    selectSwapTokens('cUSD', 'CELO', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '10')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    fireEvent.press(getByText('swapScreen.confirmSwap'))

    expect(store.getActions()).toEqual(
      expect.arrayContaining([
        swapStart({
          swapId: expect.any(String),
          quote: {
            preparedTransactions: [preparedTransactions[1]], // no approval transaction
            receivedAt: expect.any(Number),
            price: defaultQuote.unvalidatedSwapTransaction.price,
            appFeePercentageIncludedInPrice:
              defaultQuote.unvalidatedSwapTransaction.appFeePercentageIncludedInPrice,
            provider: defaultQuote.details.swapProvider,
            estimatedPriceImpact: defaultQuote.unvalidatedSwapTransaction.estimatedPriceImpact,
            allowanceTarget: defaultQuote.unvalidatedSwapTransaction.allowanceTarget,
            swapType: 'same-chain',
          },
          userInput: {
            toTokenId: mockCeloTokenId,
            fromTokenId: mockCusdTokenId,
            swapAmount: {
              [Field.FROM]: '10',
              [Field.TO]: '12.345678', // 10 * 1.2345678
            },
            updatedField: Field.FROM,
          },
          areSwapTokensShuffled: false,
        }),
      ])
    )
  })

  it('should be able to start a swap when the entered value uses comma as the decimal separator', async () => {
    const quoteReceivedTimestamp = 1000
    jest.spyOn(Date, 'now').mockReturnValue(quoteReceivedTimestamp) // quote received timestamp

    mockGetNumberFormatSettings.mockReturnValue({ decimalSeparator: ',' })
    mockFetch.mockResponse(defaultQuoteResponse)
    const { swapScreen, swapFromContainer, getByText, store } = renderScreen({})

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1.5')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    fireEvent.press(getByText('swapScreen.confirmSwap'))

    expect(store.getActions()).toEqual(
      expect.arrayContaining([
        swapStart({
          swapId: expect.any(String),
          quote: {
            preparedTransactions,
            receivedAt: quoteReceivedTimestamp,
            price: defaultQuote.unvalidatedSwapTransaction.price,
            appFeePercentageIncludedInPrice:
              defaultQuote.unvalidatedSwapTransaction.appFeePercentageIncludedInPrice,
            provider: defaultQuote.details.swapProvider,
            estimatedPriceImpact: defaultQuote.unvalidatedSwapTransaction.estimatedPriceImpact,
            allowanceTarget: defaultQuote.unvalidatedSwapTransaction.allowanceTarget,
            swapType: 'same-chain',
          },
          userInput: {
            toTokenId: mockCusdTokenId,
            fromTokenId: mockCeloTokenId,
            swapAmount: {
              [Field.FROM]: '1.5',
              [Field.TO]: '1.851851', // 1.5 * 1.2345678
            },
            updatedField: Field.FROM,
          },
          areSwapTokensShuffled: false,
        }),
      ])
    )
  })

  it('should have correct analytics on swap submission', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { getByText, swapScreen } = renderScreen({})

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()

    // Clear any previous events
    jest.mocked(AppAnalytics.track).mockClear()

    fireEvent.press(getByText('swapScreen.confirmSwap'))
    expect(AppAnalytics.track).toHaveBeenCalledWith(SwapEvents.swap_review_submit, {
      toToken: mockCusdAddress,
      toTokenId: mockCusdTokenId,
      toTokenNetworkId: NetworkId['celo-mainnet'],
      toTokenIsImported: false,
      fromToken: mockCeloAddress,
      fromTokenId: mockCeloTokenId,
      fromTokenNetworkId: NetworkId['celo-mainnet'],
      fromTokenIsImported: false,
      amount: '10',
      amountType: 'sellAmount',
      allowanceTarget: defaultQuote.unvalidatedSwapTransaction.allowanceTarget,
      estimatedPriceImpact: defaultQuote.unvalidatedSwapTransaction.estimatedPriceImpact,
      price: defaultQuote.unvalidatedSwapTransaction.price,
      provider: defaultQuote.details.swapProvider,
      web3Library: 'viem',
      // Per Bug E fix: pickFeeCurrency promotes cUSD ahead of CELO whenever
      // the user has any cUSD balance. The fixture token mock has cUSD
      // priceUsd = 1 and uses 18 decimals (same as CELO), so the gas math is:
      //   swap base gas:   1_800_000
      //   CIP-64 overhead: STATIC_GAS_PADDING (50_000) + 25% shortcut buffer
      //                    (450_000) = 500_000  -> total swap gas 2_300_000
      //   gas:             21_000 (approval) + 2_300_000 (swap) = 2_321_000
      //   maxGasFee:       2_321_000 * 12 Gwei = 0.027852 cUSD
      //   estimatedGasFee: (12_600 calibrated approval + 2_300_000 swap) * 8 Gwei
      //                                                              = 0.0185008 cUSD
      //   ...USD = same numeric value since cUSD priceUsd = 1.
      gas: 2321000,
      maxGasFee: 0.027852,
      maxGasFeeUsd: 0.027852,
      estimatedGasFee: 0.0185008,
      estimatedGasFeeUsd: 0.0185008,
      appFeePercentageIncludedInPrice: undefined,
      feeCurrency: mockCusdAddress,
      feeCurrencySymbol: 'cUSD',
      txCount: 2,
      swapType: 'same-chain',
    })
  })

  it('should show swappable tokens and search box', async () => {
    const { swapToContainer, swapFromContainer, swapScreen, tokenBottomSheets } = renderScreen({})
    const tokenBottomSheet = tokenBottomSheets[1] // "to" token selection

    selectSingleSwapToken(swapFromContainer, 'CELO', swapScreen, Field.FROM)
    fireEvent.press(within(swapToContainer).getByTestId('SwapAmountInput/TokenSelect'))

    expect(
      within(tokenBottomSheet).getByPlaceholderText('tokenBottomSheet.searchAssets')
    ).toBeTruthy()

    expect(within(tokenBottomSheet).getByText('Celo Dollar')).toBeTruthy()
    expect(within(tokenBottomSheet).getByText('Celo Euro')).toBeTruthy()
    expect(within(tokenBottomSheet).getByText('Celo native asset')).toBeTruthy()
    expect(within(tokenBottomSheet).getByText('Poof Governance Token')).toBeTruthy()
    expect(within(tokenBottomSheet).queryByText('Test Token')).toBeFalsy()
  })

  it('should not show input sections if tokens are not selected', () => {
    jest.mocked(getExperimentParams).mockReturnValue({
      swapBuyAmountEnabled: false,
    })
    const { swapFromContainer, swapToContainer } = renderScreen({})

    expect(within(swapFromContainer).queryByTestId('SwapAmountInput/Input')).toBeFalsy()
    expect(within(swapToContainer).queryByTestId('SwapAmountInput/Input')).toBeFalsy()
  })

  it('should be able to switch tokens by pressing arrow button', async () => {
    jest.mocked(getExperimentParams).mockReturnValue({
      swapBuyAmountEnabled: false,
    })
    const { swapFromContainer, swapToContainer, swapScreen, getByTestId } = renderScreen({})

    selectSwapTokens('CELO', 'cUSD', swapScreen)

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input')).toBeTruthy()
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input')).toBeTruthy()

    fireEvent.press(getByTestId('SwapScreen/SwitchTokens'))

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input')).toBeTruthy()
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input')).toBeTruthy()
  })

  it('should disable editing of the buy token amount', () => {
    const { swapFromContainer, swapToContainer, swapScreen } = renderScreen({})

    selectSwapTokens('CELO', 'cUSD', swapScreen)

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.editable).toBe(true)
    expect(within(swapToContainer).getByTestId('SwapAmountInput/Input').props.editable).toBe(false)
  })

  it('should display the correct transaction details', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { getByTestId, swapFromContainer, swapScreen } = renderScreen({
      celoBalance: '10',
      cUSDBalance: '10',
    })

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '2')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    const transactionDetails = getByTestId('SwapTransactionDetails')
    expect(transactionDetails).toHaveTextContent('swapScreen.transactionDetails.fee')
    // Per Bug E fix, useSwapQuote now picks cUSD over CELO when both have
    // balance, so the displayed fee is 0.0149 cUSD ≈ COP$0.02 (cUSD priceUsd=1
    // and mock COP rate is 1.3x) instead of 0.0145 CELO ≈ COP$0.25 (CELO
    // priceUsd ≈ 13).
    expect(getByTestId('SwapTransactionDetails/Fees')).toHaveTextContent('≈ COP$0.02')
    expect(transactionDetails).toHaveTextContent('swapScreen.transactionDetails.slippagePercentage')
    expect(getByTestId('SwapTransactionDetails/Slippage')).toHaveTextContent('0.3%')
  })

  it('should disable the confirm button after a swap has been submitted', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { update, getByText, getByTestId, swapScreen, store } = renderScreen({})

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    fireEvent.press(getByText('swapScreen.confirmSwap'))

    const swapAction = store.getActions().find((action) => action.type === swapStart.type)
    const swapId = swapAction.payload.swapId
    expect(swapId).toBeTruthy()

    // Simulate swap in progress
    const state = store.getState()
    const updatedStore = createMockStore({
      ...state,
      swap: {
        ...state.swap,
        currentSwap: {
          id: swapId,
          status: 'started',
        },
      },

      // as per test/utils.ts, line 105
      transactionFeedV2Api: undefined,
    } as any)

    update(
      <Provider store={updatedStore}>
        <MockedNavigator component={SwapScreen} />
      </Provider>
    )

    // Using testID because the button is in loading state, not showing the text
    expect(getByTestId('ConfirmSwapButton')).toBeDisabled()
  })

  it('should show and hide the error warning', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    const { update, getByText, queryByText, swapFromContainer, swapScreen, store } = renderScreen(
      {}
    )

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    fireEvent.press(getByText('swapScreen.confirmSwap'))

    const swapAction = store.getActions().find((action) => action.type === swapStart.type)
    const swapId = swapAction.payload.swapId
    expect(swapId).toBeTruthy()

    expect(queryByText('swapScreen.confirmSwapFailedWarning.title')).toBeFalsy()
    expect(queryByText('swapScreen.confirmSwapFailedWarning.body')).toBeFalsy()

    // Simulate swap error
    const state = store.getState()
    const updatedStore = createMockStore({
      ...state,
      swap: {
        ...state.swap,
        currentSwap: {
          id: swapId,
          status: 'error',
        },
      },

      // as per test/utils.ts, line 105
      transactionFeedV2Api: undefined,
    } as any)

    update(
      <Provider store={updatedStore}>
        <MockedNavigator component={SwapScreen} />
      </Provider>
    )

    expect(getByText('swapScreen.confirmSwapFailedWarning.title')).toBeTruthy()
    expect(getByText('swapScreen.confirmSwapFailedWarning.body')).toBeTruthy()
    // NOT disabled, so users can retry
    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()

    // Now change some input, and the warning should disappear
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '2')

    expect(queryByText('swapScreen.confirmSwapFailedWarning.title')).toBeFalsy()
    expect(queryByText('swapScreen.confirmSwapFailedWarning.body')).toBeFalsy()
  })

  it('should show and hide the switched network warning if cross chain swaps disabled', async () => {
    mockFetch.mockResponse(defaultQuoteResponse)
    jest.mocked(getFeatureGate).mockImplementation(() => false)
    const {
      getByText,
      getByTestId,
      queryByTestId,
      swapToContainer,
      swapFromContainer,
      swapScreen,
    } = renderScreen({ cUSDBalance: '0' })

    // First get a quote for a network
    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 CELO ≈ 1.23456 cUSD'
    )
    expect(queryByTestId('SwitchedToNetworkWarning')).toBeFalsy()
    expect(getByTestId('MaxSwapAmountWarning')).toBeTruthy()

    // Now select a "to" token from a different network, the warning should appear
    selectSingleSwapToken(swapToContainer, 'USDC', swapScreen, Field.TO)

    expect(
      getByText('swapScreen.switchedToNetworkWarning.title, {"networkName":"Ethereum"}')
    ).toBeTruthy()
    expect(
      getByText(
        'swapScreen.switchedToNetworkWarning.body, {"networkName":"Ethereum","context":"swapFrom"}'
      )
    ).toBeTruthy()

    // Make sure the max warning is not shown
    expect(queryByTestId('MaxSwapAmountWarning')).toBeFalsy()

    // Check the quote is cleared
    expect(queryByTestId('SwapTransactionDetails/ExchangeRate')).toBeFalsy()

    // Disabled, until the user selects a token from the same network
    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()

    // Now select a "from" token from the same network, the warning should disappear
    selectSingleSwapToken(swapFromContainer, 'ETH', swapScreen, Field.FROM)

    expect(queryByTestId('SwitchedToNetworkWarning')).toBeFalsy()
    // Max warning is shown again, because both ETH and CELO have the same balance
    // and we previously selected the max value for CELO
    expect(queryByTestId('MaxSwapAmountWarning')).toBeTruthy()

    // Now select a "from" token from a different network again, the warning should reappear
    selectSingleSwapToken(swapFromContainer, 'cUSD', swapScreen, Field.FROM)

    expect(
      getByText('swapScreen.switchedToNetworkWarning.title, {"networkName":"Celo"}')
    ).toBeTruthy()
    expect(
      getByText(
        'swapScreen.switchedToNetworkWarning.body, {"networkName":"Celo","context":"swapTo"}'
      )
    ).toBeTruthy()
  })

  it("should warn when the balances for feeCurrencies are 0 and can't cover the fee", async () => {
    // Swap from POOF to CELO, when no feeCurrency has any balance
    mockFetch.mockResponse(defaultQuoteResponse)
    const { getByText, swapScreen } = renderScreen({
      celoBalance: '0',
      cUSDBalance: '0',
    })

    selectSwapTokens('POOF', 'CELO', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()

    expect(
      getByText(
        'swapScreen.notEnoughBalanceForGas.description, {"feeCurrencies":"cUSD, cEUR, CELO"}'
      )
    ).toBeTruthy()
  })

  it('should warn when the balances for feeCurrencies are too low to cover the fee', async () => {
    // Swap from POOF to CELO, when no feeCurrency has any balance
    mockFetch.mockResponse(defaultQuoteResponse)
    const { getByText, swapScreen } = renderScreen({
      celoBalance: '0.001',
      cUSDBalance: '0.001',
    })

    selectSwapTokens('POOF', 'CELO', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()

    // Per Bug E fix, useSwapQuote calls reorderForBugE which only pushes
    // CELO to the end (no filtering). cEUR stays in the warning even with 0
    // balance because the warning enumerates every currency the user could
    // top up. Order: stables (selector priority) first, CELO last.
    expect(
      getByText(
        'swapScreen.notEnoughBalanceForGas.description, {"feeCurrencies":"cUSD, cEUR, CELO"}'
      )
    ).toBeTruthy()
  })

  it('should prompt the user to decrease the swap amount when swapping the max amount of a feeCurrency, and no other feeCurrency has enough balance to pay for the fee', async () => {
    // Swap CELO to cUSD, when only CELO has balance
    mockFetch.mockResponse(defaultQuoteResponse)
    const { getByText, queryByText, swapScreen, swapFromContainer } = renderScreen({
      celoBalance: '1.234',
      cUSDBalance: '0',
    })

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '1.234' // matching the value inside the mocked store
    )

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()

    const confirmDecrease = getByText('swapScreen.decreaseSwapAmountForGasWarning.cta')
    expect(confirmDecrease).toBeTruthy()

    // Mock next call with the decreased amount
    mockFetch.mockResponse(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          sellAmount: '1207057600000000000',
        },
      })
    )

    // Now, decrease the swap amount
    fireEvent.press(confirmDecrease)

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '1.21659904' // 1.234 minus the max fee calculated for the swap (uses calibrated _estimatedGasUse = gas * 0.6)
    )

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(queryByText('swapScreen.decreaseSwapAmountForGasWarning.cta')).toBeFalsy()
  })

  it('should prompt the user to decrease the swap amount when swapping close to the max amount of a feeCurrency, and no other feeCurrency has enough balance to pay for the fee', async () => {
    // Swap CELO to cUSD, when only CELO has balance
    mockFetch.mockResponse(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          sellAmount: '1233000000000000000', // 1.233
        },
      })
    )
    const { getByText, queryByText, swapScreen, swapFromContainer } = renderScreen({
      celoBalance: '1.234',
      cUSDBalance: '0',
    })

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1.233')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).toBeDisabled()

    const confirmDecrease = getByText('swapScreen.decreaseSwapAmountForGasWarning.cta')
    expect(confirmDecrease).toBeTruthy()

    // Mock next call with the decreased amount
    mockFetch.mockResponse(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          sellAmount: '1207057600000000000',
        },
      })
    )

    // Now, decrease the swap amount
    fireEvent.press(confirmDecrease)

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '1.21659904' // 1.234 (max balance) minus the max fee calculated for the swap (calibrated _estimatedGasUse = gas * 0.6)
    )

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(queryByText('swapScreen.decreaseSwapAmountForGasWarning.cta')).toBeFalsy()
  })

  it("should allow swapping the entered amount of a feeCurrency when there's enough balance to cover for the fee, while no other feeCurrency can pay for the fee", async () => {
    // Swap CELO to cUSD, when only CELO has balance
    mockFetch.mockResponse(
      JSON.stringify({
        ...defaultQuote,
        unvalidatedSwapTransaction: {
          ...defaultQuote.unvalidatedSwapTransaction,
          sellAmount: '1000000000000000000', // 1
        },
      })
    )
    const { getByText, queryByTestId, swapFromContainer, swapScreen } = renderScreen({
      celoBalance: '1.234',
      cUSDBalance: '0',
    })

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '1')

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    fireEvent.press(getByText('swapScreen.confirmSwap'))

    expect(queryByTestId('QuoteResultNotEnoughBalanceForGasBottomSheet')).toBeFalsy()
    expect(queryByTestId('QuoteResultNeedDecreaseSwapAmountForGasBottomSheet')).toBeFalsy()
  })

  it("should allow swapping the max balance of a feeCurrency when there's another feeCurrency to pay for the fee", async () => {
    // Swap full CELO balance to cUSD
    mockFetch.mockResponse(defaultQuoteResponse)
    const { getByText, queryByTestId, swapScreen, swapFromContainer } = renderScreen({
      celoBalance: '1.234',
      cUSDBalance: '10',
    })

    selectSwapTokens('CELO', 'cUSD', swapScreen)
    await selectMaxFromAmount(swapScreen)

    await act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(within(swapFromContainer).getByTestId('SwapAmountInput/Input').props.value).toBe(
      '1.234' // matching the value inside the mocked store
    )

    expect(getByText('swapScreen.confirmSwap')).not.toBeDisabled()
    fireEvent.press(getByText('swapScreen.confirmSwap'))

    expect(queryByTestId('QuoteResultNotEnoughBalanceForGasBottomSheet')).toBeFalsy()
    expect(queryByTestId('QuoteResultNeedDecreaseSwapAmountForGasBottomSheet')).toBeFalsy()
  })

  describe('filter tokens', () => {
    beforeEach(() => {
      jest
        .mocked(getFeatureGate)
        .mockImplementation((gate) => gate === StatsigFeatureGates.SHOW_SWAP_TOKEN_FILTERS)
    })

    const expectedAllFromTokens = Object.values(mockStoreTokenBalances).filter(
      (token) => token.isSwappable !== false || token.balance !== '0' // include unswappable tokens with balance because it is the "from" token
    )
    const expectedAllToTokens = Object.values(mockStoreTokenBalances).filter(
      (token) => token.isSwappable !== false
    )

    it('should show "my tokens" for the "from" token selection by default', () => {
      const mockedZeroBalanceTokens = [mockCeurTokenId, mockCusdTokenId, mockPoofTokenId]
      const expectedTokensWithBalance = expectedAllFromTokens.filter(
        (token) => !mockedZeroBalanceTokens.includes(token.tokenId)
      )

      const { swapFromContainer, tokenBottomSheets } = renderScreen({
        cUSDBalance: '0',
        poofBalance: '0', // cEUR also has 0 balance in the global mock
      })
      const tokenBottomSheet = tokenBottomSheets[0] // "from" token selection

      fireEvent.press(within(swapFromContainer).getByTestId('SwapAmountInput/TokenSelect'))

      expectedTokensWithBalance.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
      const displayedTokens = within(tokenBottomSheet).getAllByTestId('TokenBalanceItem')
      expect(displayedTokens.length).toBe(expectedTokensWithBalance.length)

      // deselect pre-selected filters to show all tokens
      fireEvent.press(within(tokenBottomSheet).getByText('tokenBottomSheet.filters.myTokens'))

      expectedAllFromTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
    })

    it('should show "recently swapped" tokens', () => {
      const mockedLastSwapped = [mockCeurTokenId, mockCusdTokenId, mockPoofTokenId]
      const expectedLastSwapTokens = expectedAllFromTokens.filter((token) =>
        mockedLastSwapped.includes(token.tokenId)
      )

      const { swapFromContainer, tokenBottomSheets } = renderScreen({
        lastSwapped: mockedLastSwapped,
      })
      const tokenBottomSheet = tokenBottomSheets[0] // "from" token selection

      fireEvent.press(within(swapFromContainer).getByTestId('SwapAmountInput/TokenSelect'))
      // deselect pre-selected filters to show all tokens
      fireEvent.press(within(tokenBottomSheet).getByText('tokenBottomSheet.filters.myTokens'))
      // select last swapped filter
      fireEvent.press(
        within(tokenBottomSheet).getByText('tokenBottomSheet.filters.recentlySwapped')
      )

      expectedLastSwapTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
      const displayedTokens = within(tokenBottomSheet).getAllByTestId('TokenBalanceItem')
      expect(displayedTokens.length).toBe(expectedLastSwapTokens.length)

      // de-select last swapped filter
      fireEvent.press(
        within(tokenBottomSheet).getByText('tokenBottomSheet.filters.recentlySwapped')
      )

      expectedAllFromTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
    })

    it('should show "popular" tokens', () => {
      const mockedPopularTokens = [mockUSDCTokenId, mockPoofTokenId]
      jest.mocked(getMultichainFeatures).mockReturnValue({
        showSwap: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
        showBalances: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
      })
      jest.mocked(getDynamicConfigParams).mockReturnValue({
        popularTokenIds: mockedPopularTokens,
        maxSlippagePercentage: '0.3',
      })
      const expectedPopularTokens = expectedAllFromTokens.filter((token) =>
        mockedPopularTokens.includes(token.tokenId)
      )

      const { swapFromContainer, tokenBottomSheets } = renderScreen({})
      const tokenBottomSheet = tokenBottomSheets[0] // "from" token selection

      fireEvent.press(within(swapFromContainer).getByTestId('SwapAmountInput/TokenSelect'))
      // deselect pre-selected filters to show all tokens
      fireEvent.press(within(tokenBottomSheet).getByText('tokenBottomSheet.filters.myTokens'))
      // select popular filter
      fireEvent.press(within(tokenBottomSheet).getByText('tokenBottomSheet.filters.popular'))

      expectedPopularTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
      const displayedTokens = within(tokenBottomSheet).getAllByTestId('TokenBalanceItem')
      expect(displayedTokens.length).toBe(expectedPopularTokens.length)

      // de-select filter
      fireEvent.press(within(tokenBottomSheet).getByText('tokenBottomSheet.filters.popular'))

      expectedAllFromTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
    })

    it('should show the network filters when there are multiple supported networks', () => {
      const expectedEthTokens = expectedAllFromTokens.filter(
        (token) => token.networkId === NetworkId['ethereum-mainnet']
      )
      const expectedCeloTokens = expectedAllFromTokens.filter(
        (token) => token.networkId === NetworkId['celo-mainnet']
      )

      const { swapFromContainer, tokenBottomSheets, getAllByTestId } = renderScreen({})
      const tokenBottomSheet = tokenBottomSheets[0] // "from" token selection
      const networkMultiSelect = getAllByTestId('MultiSelectBottomSheet')[0]

      fireEvent.press(within(swapFromContainer).getByTestId('SwapAmountInput/TokenSelect'))
      // deselect pre-selected filters to show all tokens
      fireEvent.press(within(tokenBottomSheet).getByText('tokenBottomSheet.filters.myTokens'))

      // open network bottom sheet
      fireEvent.press(within(tokenBottomSheet).getByText('tokenBottomSheet.filters.selectNetwork'))

      // select celo filter
      fireEvent.press(within(networkMultiSelect).getByTestId('Celo-icon'))

      expectedCeloTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
      expect(within(tokenBottomSheet).getAllByTestId('TokenBalanceItem').length).toBe(
        expectedCeloTokens.length
      )

      // select eth filter
      fireEvent.press(within(networkMultiSelect).getByTestId('Ethereum-icon'))

      expectedEthTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
      expect(within(tokenBottomSheet).getAllByTestId('TokenBalanceItem').length).toBe(
        expectedEthTokens.length
      )

      // select all networks
      fireEvent.press(within(networkMultiSelect).getByText('multiSelect.allNetworks'))

      expectedCeloTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
      expectedEthTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
    })

    it('should show pre-selected network filter from route params', async () => {
      const expectedCeloTokens = expectedAllToTokens.filter(
        (token) => token.networkId === NetworkId['celo-mainnet']
      )
      const { tokenBottomSheets } = renderScreen({
        toTokenNetworkId: NetworkId['celo-mainnet'],
      })
      const tokenBottomSheet = tokenBottomSheets[1] // "to" token selection

      const filteredTokens = within(tokenBottomSheet).getAllByTestId('TokenBalanceItem')

      // only the celo network tokens are displayed
      expect(filteredTokens.length).toBe(expectedCeloTokens.length)
      expectedCeloTokens.forEach((token) => {
        expect(within(tokenBottomSheet).getByText(token.name)).toBeTruthy()
      })
    })
  })

  describe('SwapScreen virtual Dolares flow', () => {
    // Fixture token IDs used by useDollarBalanceSnapshots.
    const usdcMainnetTokenId = 'celo-mainnet:0xceba9300f2b948710d2653dd7b07f33a8b32118c'
    const usdtMainnetTokenId = 'celo-mainnet:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e'

    const dollarBalanceTokens = {
      [usdcMainnetTokenId]: {
        tokenId: usdcMainnetTokenId,
        networkId: NetworkId['celo-mainnet'],
        symbol: 'USDC',
        name: 'USDC',
        decimals: 6,
        isSwappable: true,
        balance: '50',
        priceUsd: '1',
        imageUrl: undefined,
      },
      [usdtMainnetTokenId]: {
        tokenId: usdtMainnetTokenId,
        networkId: NetworkId['celo-mainnet'],
        symbol: 'USDT',
        name: 'USDT',
        decimals: 6,
        isSwappable: true,
        balance: '30',
        priceUsd: '1',
        imageUrl: undefined,
      },
    }

    const renderWithDollarBalances = ({
      fromTokenId = DOLARES_VIRTUAL_TOKEN_ID,
      toTokenId,
      dollarTokens = dollarBalanceTokens,
    }: {
      fromTokenId?: string
      toTokenId?: string
      dollarTokens?: Record<string, object>
    } = {}) => {
      const store = createMockStore({
        tokens: {
          tokenBalances: {
            ...mockStoreTokenBalances,
            ...dollarTokens,
          },
        },
        swap: {
          lastSwapped: [],
        },
      })

      const tree = render(
        <Provider store={store}>
          <MockedNavigator
            component={SwapScreen}
            params={{ fromTokenId, toTokenId, toTokenNetworkId: undefined }}
          />
        </Provider>
      )

      return { ...tree, store }
    }

    it('renders the per-token spend breakdown inside the transaction-details panel when fromTokenId is virtual Dolares', async () => {
      const { getByTestId, queryByTestId, getAllByTestId } = renderWithDollarBalances({
        fromTokenId: DOLARES_VIRTUAL_TOKEN_ID,
        // SwapTransactionDetails needs a resolved toToken to render anything
        // (the panel hides its rows when fromToken or toToken is missing).
        toTokenId: mockCusdTokenId,
      })

      // With virtual Dolares selected, the from input should be present.
      const [swapFromContainer] = getAllByTestId('SwapAmountInput')

      // Type an amount within the total balance ($80 available, request $20).
      fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '20')

      // Shortfall banner should NOT appear (80 >= 20).
      expect(queryByTestId('ShortfallBanner')).toBeNull()

      // The standalone DolaresMultiStepSummary card is gone; the breakdown
      // now lives inside SwapTransactionDetails so both directions render in
      // the same panel.
      expect(queryByTestId('DolaresMultiStepSummary')).toBeNull()
      expect(getByTestId('SwapTransactionDetails/SpendBreakdown')).toBeTruthy()
    })

    it('shows shortfall banner when amount exceeds total dollar balance', async () => {
      const { getByTestId, getAllByTestId } = renderWithDollarBalances({
        fromTokenId: DOLARES_VIRTUAL_TOKEN_ID,
      })

      const [swapFromContainer] = getAllByTestId('SwapAmountInput')

      // Total balance = 80 USD; request 150 USD to trigger shortfall.
      fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '150')

      expect(getByTestId('ShortfallBanner')).toBeTruthy()
    })

    it('dispatches executeMultiSwap on confirm when plan is valid', async () => {
      const { store, getAllByTestId, getByText, getByTestId } = renderWithDollarBalances({
        fromTokenId: DOLARES_VIRTUAL_TOKEN_ID,
      })

      // Select a "to" token from the bottom sheet so the confirm button enables.
      const swapScreen = getByTestId('SwapScreen')
      const [, toTokenBottomSheet] = within(swapScreen).getAllByTestId('TokenBottomSheet')
      const [swapFromContainer] = getAllByTestId('SwapAmountInput')
      const [, swapToContainer] = getAllByTestId('SwapAmountInput')

      // Open to-token picker and pick CELO.
      fireEvent.press(within(swapToContainer).getByTestId('SwapAmountInput/TokenSelect'))
      fireEvent.press(within(toTokenBottomSheet).getByText('Celo native asset'))

      // Enter an amount within the dollar balance.
      fireEvent.changeText(within(swapFromContainer).getByTestId('SwapAmountInput/Input'), '20')

      // Confirm swap button.
      const confirmButton = getByText('swapScreen.confirmSwap')
      expect(confirmButton).not.toBeDisabled()
      fireEvent.press(confirmButton)

      const actions = store.getActions()
      expect(actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'dollarsSpend/executeMultiSwap',
            payload: expect.objectContaining({
              toTokenId: mockCeloTokenId,
            }),
          }),
        ])
      )
    })
  })
})
