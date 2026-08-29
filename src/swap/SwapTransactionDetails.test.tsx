import { render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import React from 'react'
import { Provider } from 'react-redux'
import SwapTransactionDetails from 'src/swap/SwapTransactionDetails'
import { AppFeeAmount, SwapFeeAmount } from 'src/swap/types'
import { createMockStore } from 'test/utils'
import {
  mockCeloTokenBalance,
  mockCusdTokenBalance,
  mockCusdTokenId,
  mockTokenBalances,
} from 'test/values'

const defaultProps = {
  feeInfoBottomSheetRef: { current: null },
  slippageInfoBottomSheetRef: { current: null },
  exchangeRateInfoBottomSheetRef: { current: null },
  estimatedDurationBottomSheetRef: { current: null },
  slippagePercentage: '0.5',
  fetchingSwapQuote: false,
  fromToken: {
    ...mockTokenBalances[mockCusdTokenId],
    lastKnownPriceUsd: null,
    balance: BigNumber('10'),
    priceUsd: BigNumber('1'),
  },
  toToken: mockCeloTokenBalance,
  exchangeRatePrice: '0.5837',
}

describe('SwapTransactionDetails', () => {
  it('should render the correct exchange rate and estimated value', () => {
    const { getByText, getByTestId } = render(
      <Provider store={createMockStore()}>
        <SwapTransactionDetails {...defaultProps} swapAmount={BigNumber('1')} />
      </Provider>
    )

    expect(getByText('swapScreen.transactionDetails.exchangeRate')).toBeTruthy()
    expect(getByTestId('SwapTransactionDetails/ExchangeRate')).toHaveTextContent(
      '1 assets.dollars ≈ 0.58370 CELO'
    )
    expect(getByTestId('SwapTransactionDetails/ExchangeRate/MoreInfo/Icon')).toBeTruthy()
    expect(getByTestId('SwapTransactionDetails/ExchangeRate/MoreInfo')).not.toBeDisabled()
  })

  it('should render correctly with estimated duration', () => {
    const { getByText } = render(
      <Provider store={createMockStore()}>
        <SwapTransactionDetails {...defaultProps} estimatedDurationInSeconds={800} />
      </Provider>
    )

    expect(getByText('swapScreen.transactionDetails.estimatedTransactionTime')).toBeTruthy()
    expect(
      getByText('swapScreen.transactionDetails.estimatedTransactionTimeInMinutes, {"minutes":14}')
    ).toBeTruthy()
  })

  describe('total fees', () => {
    const mockNetworkFee: SwapFeeAmount = {
      amount: new BigNumber(0.01),
      token: mockCusdTokenBalance,
      maxAmount: new BigNumber(0.02),
    }
    const mockCrossChainFee: SwapFeeAmount = {
      amount: new BigNumber(1.3),
      token: mockCeloTokenBalance,
      maxAmount: new BigNumber(1.7),
    }
    const mockAppFee: AppFeeAmount = {
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

    // Post FeeSummary refactor (2026-08-22): fees render as
    // `{amt1 sym1} + {amt2 sym2} ... ≈ COP$sum`, all inline. The old
    // "separate service-fee row" + "paid-in row" were consolidated into
    // one stacked summary and the fallback for missing token info is now
    // just the components with valid tokens (missing components skipped),
    // not an error message. Tests below assert the new format.

    it('skips fee components that lack token info and shows only valid ones', () => {
      const { getByTestId } = render(
        <Provider store={createMockStore()}>
          <SwapTransactionDetails
            {...defaultProps}
            crossChainFee={mockCrossChainFee}
            networkFee={mockNetworkFee}
            appFee={{ ...mockAppFee, token: undefined as any }}
          />
        </Provider>
      )
      // appFee dropped (no token); networkFee + crossChainFee remain. Both
      // have priceUsd so the summary shows tokens + a COP total.
      const text = getByTestId('SwapTransactionDetails/Fees/Summary').props.children
      expect(text).toBeTruthy()
    })

    it('renders inline: {tokens} + ... ≈ COP$sum when all components have priceUsd', () => {
      const { getByTestId } = render(
        <Provider store={createMockStore()}>
          <SwapTransactionDetails
            {...defaultProps}
            networkFee={mockNetworkFee}
            appFee={mockAppFee}
            crossChainFee={mockCrossChainFee}
          />
        </Provider>
      )
      // Post FeeSummary refactor (2026-08-22): store-hydrated tokenInfo
      // wins for priceUsd, matching the source-of-truth used by every
      // other TokenDisplay in the app. The mockCeloTokenBalance prop
      // carries priceUsd=0.5 but the store's mockTokenBalances entry for
      // CELO uses the real market snapshot in test/values.ts, hence the
      // total COP figure differs from the old prop-driven test.
      expect(getByTestId('SwapTransactionDetails/Fees/Summary/Local')).toHaveTextContent(
        '≈ COP$9.12'
      )
    })

    it('summary still renders CELO tokens correctly even when priceUsd is null', () => {
      // Native gas path: synthesized CELO now carries priceUsd from
      // backend /api/tokens/info (see tokens/saga + tokens/selectors). Any
      // component with priceUsd=null contributes only to the token side of
      // the summary; the ≈ COP$ tail only includes components that DO
      // convert. This test forces the null-price path.
      const { getByTestId } = render(
        <Provider store={createMockStore()}>
          <SwapTransactionDetails
            {...defaultProps}
            networkFee={mockNetworkFee}
            appFee={{
              ...mockAppFee,
              token: {
                ...mockCeloTokenBalance,
                priceUsd: null,
              },
            }}
          />
        </Provider>
      )
      expect(getByTestId('SwapTransactionDetails/Fees/Summary/Token')).toHaveTextContent(
        '0.07 CELO'
      )
      // USDm resolves to "Dolares" via canonical getTokenSymbol (dollars
      // group). Test asserts the resolved label, not the raw ticker.
      expect(getByTestId('SwapTransactionDetails/Fees/Summary/Token')).toHaveTextContent(
        'assets.dollars'
      )
    })

    it.each`
      feeName            | expectedTotalFee
      ${'appFee'}        | ${`≈ COP$8.66`}
      ${'crossChainFee'} | ${`≈ COP$0.48`}
    `(
      'summary total covers only defined components when $feeName is undefined',
      ({ feeName, expectedTotalFee }) => {
        const testProps = { [feeName]: undefined }
        const { getByTestId } = render(
          <Provider store={createMockStore()}>
            <SwapTransactionDetails
              {...defaultProps}
              crossChainFee={mockCrossChainFee}
              networkFee={mockNetworkFee}
              appFee={mockAppFee}
              {...testProps}
            />
          </Provider>
        )

        expect(getByTestId('SwapTransactionDetails/Fees/Summary/Local')).toHaveTextContent(
          expectedTotalFee
        )
      }
    )
  })
})
