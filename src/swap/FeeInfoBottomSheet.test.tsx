import { render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import React from 'react'
import { Provider } from 'react-redux'
import FeeInfoBottomSheet from 'src/swap/FeeInfoBottomSheet'
import { createMockStore } from 'test/utils'
import {
  mockCeloTokenBalance,
  mockCeloTokenId,
  mockCusdTokenBalance,
  mockCusdTokenId,
  mockTokenBalances,
} from 'test/values'

const mockNetworkFee = {
  amount: new BigNumber(0.01),
  token: mockCusdTokenBalance,
  maxAmount: new BigNumber(0.02),
}
const mockCrossChainFee = {
  amount: new BigNumber(1.3),
  token: mockCeloTokenBalance,
  maxAmount: new BigNumber(1.7),
}
const mockAppFee = {
  amount: new BigNumber(0.07),
  token: mockCeloTokenBalance,
  percentage: new BigNumber(0.6),
}

// the fee components are calculated from the mock fee objects. the
// calculation is amount * token price usd * local currency exchange rate
// (1.33).
// expectedNetworkFeeInLocalCurrency = 0.01 * 1.001 * 1.33 = 0.0133133
// expectedCrossChainFeeInLocalCurrency = 1.3 * 0.5 * 1.33 = 0.8645
// expectedAppFeeInLocalCurrency = 0.07 * 0.5 * 1.33 = 0.04655

describe('FeeInfoBottomSheet', () => {
  it('should display the expected fees information in both fiat and token units', () => {
    const { getByText, getByTestId } = render(
      <Provider
        store={createMockStore({
          tokens: {
            tokenBalances: {
              [mockCusdTokenId]: {
                ...mockTokenBalances[mockCusdTokenId],
                priceUsd: '1.001',
              },
              [mockCeloTokenId]: {
                ...mockTokenBalances[mockCeloTokenId],
                priceUsd: '0.5',
              },
            },
          },
        })}
      >
        <FeeInfoBottomSheet
          fetchingSwapQuote={false}
          forwardedRef={{ current: null }}
          appFee={mockAppFee}
          crossChainFee={mockCrossChainFee}
          networkFee={mockNetworkFee}
        />
      </Provider>
    )

    expect(getByText('swapScreen.transactionDetails.fees')).toBeTruthy()
    expect(getByText('swapScreen.transactionDetails.feesBreakdown')).toBeTruthy()
    expect(getByText('swapScreen.transactionDetails.feesMoreInfoLabel')).toBeTruthy()
    expect(
      getByText(
        'swapScreen.transactionDetails.feesInfo, {"context":"crossChainWithAppFee","appFeePercentage":"0.6"}'
      )
    ).toBeTruthy()

    // Post FeeSummary refactor (2026-08-22): row renders inline via
    // FeeSummary as `{amt} {sym} ≈ COP$X`. Symbol resolved via canonical
    // getTokenSymbol so USDm surfaces as "Dolares" (via assets.dollars
    // i18n key), CELO stays raw. No more parenthetical token / fiat-first
    // format from the old Trans component.
    expect(getByText('swapScreen.transactionDetails.estimatedNetworkFee')).toBeTruthy()
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/EstimatedNetworkFee')).toHaveTextContent(
      '0.01 assets.dollars ≈ COP$0.013'
    )

    expect(getByText('swapScreen.transactionDetails.maxNetworkFee')).toBeTruthy()
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/MaxNetworkFee')).toHaveTextContent(
      '0.02 assets.dollars ≈ COP$0.027'
    )

    expect(getByText('swapScreen.transactionDetails.appFee')).toBeTruthy()
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/AppFee')).toHaveTextContent(
      '0.07 CELO ≈ COP$0.047'
    )

    expect(getByText('swapScreen.transactionDetails.estimatedCrossChainFee')).toBeTruthy()
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/EstimatedCrossChainFee')).toHaveTextContent(
      '1.30 CELO ≈ COP$0.86'
    )

    expect(getByText('swapScreen.transactionDetails.maxCrossChainFee')).toBeTruthy()
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/MaxCrossChainFee')).toHaveTextContent(
      '1.70 CELO ≈ COP$1.13'
    )
  })

  it('should display the expected fees information in token units if priceUsd is unavailable', () => {
    const { getByTestId } = render(
      <Provider
        store={createMockStore({
          tokens: {
            tokenBalances: {
              [mockCusdTokenId]: {
                ...mockTokenBalances[mockCusdTokenId],
                priceUsd: undefined,
              },
            },
          },
        })}
      >
        <FeeInfoBottomSheet
          fetchingSwapQuote={false}
          forwardedRef={{ current: null }}
          appFee={mockAppFee}
          crossChainFee={mockCrossChainFee}
          networkFee={{
            ...mockNetworkFee,
            token: {
              ...mockNetworkFee.token,
              priceUsd: null,
            },
          }}
        />
      </Provider>
    )

    // priceUsd=null on the fee token means FeeSummary drops the "≈ COP$X"
    // tail entirely (nothing to sum in local currency) but keeps the
    // token amount + symbol.
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/EstimatedNetworkFee')).toHaveTextContent(
      '0.01 assets.dollars'
    )
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/MaxNetworkFee')).toHaveTextContent(
      '0.02 assets.dollars'
    )
  })

  it('should display a message if the app fee is 0', () => {
    const { getByText, getByTestId } = render(
      <Provider
        store={createMockStore({
          tokens: {
            tokenBalances: {
              [mockCusdTokenId]: {
                ...mockTokenBalances[mockCusdTokenId],
                priceUsd: undefined,
              },
            },
          },
        })}
      >
        <FeeInfoBottomSheet
          fetchingSwapQuote={false}
          forwardedRef={{ current: null }}
          appFee={{ ...mockAppFee, amount: new BigNumber(0) }}
          crossChainFee={mockCrossChainFee}
          networkFee={mockNetworkFee}
        />
      </Provider>
    )
    expect(getByText('swapScreen.transactionDetails.appFee')).toBeTruthy()
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/AppFee')).toHaveTextContent(
      'swapScreen.transactionDetails.swapFeeWaived'
    )
  })

  it('should display unknown values if the token info is missing', () => {
    const { getByTestId } = render(
      <Provider
        store={createMockStore({
          tokens: {
            tokenBalances: {
              [mockCusdTokenId]: undefined,
            },
          },
        })}
      >
        <FeeInfoBottomSheet
          fetchingSwapQuote={false}
          forwardedRef={{ current: null }}
          appFee={mockAppFee}
          crossChainFee={mockCrossChainFee}
          networkFee={{ ...mockNetworkFee, token: undefined }}
        />
      </Provider>
    )

    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/EstimatedNetworkFee')).toHaveTextContent(
      'unknown'
    )
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/MaxNetworkFee')).toHaveTextContent('unknown')
  })

  it('should display correctly during quote refresh', () => {
    const { getByTestId } = render(
      <Provider
        store={createMockStore({
          tokens: {
            tokenBalances: {
              [mockCusdTokenId]: {
                ...mockTokenBalances[mockCusdTokenId],
                priceUsd: '1.001',
              },
              [mockCeloTokenId]: {
                ...mockTokenBalances[mockCeloTokenId],
                priceUsd: '0.5',
              },
            },
          },
        })}
      >
        <FeeInfoBottomSheet
          fetchingSwapQuote={true}
          forwardedRef={{ current: null }}
          appFee={mockAppFee}
          crossChainFee={mockCrossChainFee}
          networkFee={mockNetworkFee}
        />
      </Provider>
    )

    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/EstimatedNetworkFee')).toHaveTextContent(
      'loading'
    )
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/MaxNetworkFee')).toHaveTextContent('loading')
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/AppFee')).toHaveTextContent('loading')
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/EstimatedCrossChainFee')).toHaveTextContent(
      'loading'
    )
    expect(getByTestId('SwapScreen/FeeInfoBottomSheet/MaxCrossChainFee')).toHaveTextContent(
      'loading'
    )
  })
})
