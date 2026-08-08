import BigNumber from 'bignumber.js'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native'
import SkeletonPlaceholder from 'react-native-skeleton-placeholder'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { SwapEvents } from 'src/analytics/Events'
import { SwapShowInfoType } from 'src/analytics/Properties'
import { BottomSheetModalRefType } from 'src/components/BottomSheet'
import { formatValueToDisplay, getTokenSymbol } from 'src/components/TokenDisplay'
import { getDollarTokenTicker } from 'src/tokens/dollarGroup'
import { convertTokenToLocalAmount, getTokenDisplayName } from 'src/tokens/utils'
import Touchable from 'src/components/Touchable'
import InfoIcon from 'src/icons/status/InfoIcon'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { useSelector } from 'src/redux/hooks'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { SpendStep } from 'src/dollarsSpend/types'
import { AppFeeAmount, SwapFeeAmount } from 'src/swap/types'
import { TokenBalance } from 'src/tokens/slice'

interface Props {
  exchangeRateInfoBottomSheetRef: React.RefObject<BottomSheetModalRefType>
  feeInfoBottomSheetRef: React.RefObject<BottomSheetModalRefType>
  slippageInfoBottomSheetRef: React.RefObject<BottomSheetModalRefType>
  estimatedDurationBottomSheetRef: React.RefObject<BottomSheetModalRefType>
  slippagePercentage: string
  fromToken?: TokenBalance
  toToken?: TokenBalance
  // Concrete settlement token the swap router will actually deliver into
  // when `toToken` is the synthetic virtual "Dolares". When set, a row is
  // rendered so the user can see which specific brand they will receive
  // (mirrors the per-step breakdown the spending direction already shows).
  settlementToken?: TokenBalance
  // Per-token spend allocation when `fromToken` is the synthetic virtual
  // "Dolares". Renders an expandable "Detalle por token" row inside this
  // same panel so the consolidated transaction-details surface is the same
  // shape regardless of swap direction.
  spendSteps?: SpendStep[]
  exchangeRatePrice?: string
  swapAmount?: BigNumber
  fetchingSwapQuote: boolean
  estimatedDurationInSeconds?: number
  // Widened from SwapFeeAmount to AppFeeAmount so the details panel can
  // render a dedicated "Tarifa de operacion (X%)" row using the percentage
  // echo from the swap quote. Still passed through to getEstimatedTotalFees
  // via the shared SwapFeeAmount fields.
  appFee?: AppFeeAmount
  crossChainFee?: SwapFeeAmount
  networkFee?: SwapFeeAmount
  // Multi-swap (virtual Dolares) surfaces a USDm-denominated placeholder
  // token so the fee estimate can render in local currency; the actual fee
  // currency is picked per step at execution time. Hide the "Pagada en" row
  // in that case since the placeholder token would mislead the user.
  hideFeePaidInRow?: boolean
}

function getEstimatedTotalFees({
  usdToLocalCurrencyRate,
  localCurrencySymbol,
  feeComponents,
  errorFallback,
}: {
  usdToLocalCurrencyRate: string | null
  localCurrencySymbol: string | null
  feeComponents: (SwapFeeAmount | undefined)[]
  errorFallback: string
}) {
  let estimatedFeeInLocalCurrency = new BigNumber(0)
  const estimatedFeeWithoutFiatPrice: { [tokenId: string]: { amount: BigNumber; symbol: string } } =
    {}

  for (const feeComponent of feeComponents) {
    if (feeComponent) {
      if (!feeComponent.token) {
        // if any fee component is missing token info, we cannot display the
        // token symbol or fiat value. In this case it's better to return an
        // error, rather than showing a total fee that is cheaper due to missing
        // components.
        return errorFallback
      }

      // Route through convertTokenToLocalAmount so COPm fees render 1:1 with
      // COP instead of drifting through priceUsd * usdToLocalRate.
      const feeInLocal =
        localCurrencySymbol &&
        convertTokenToLocalAmount({
          tokenAmount: feeComponent.amount,
          tokenInfo: feeComponent.token,
          usdToLocalRate: usdToLocalCurrencyRate,
        })
      if (feeInLocal) {
        estimatedFeeInLocalCurrency = estimatedFeeInLocalCurrency.plus(feeInLocal)
      } else {
        const existingFeeComponentForToken =
          estimatedFeeWithoutFiatPrice[feeComponent.token.tokenId]
        if (existingFeeComponentForToken) {
          const existingFeeAmount = existingFeeComponentForToken.amount
          estimatedFeeWithoutFiatPrice[feeComponent.token.tokenId].amount =
            feeComponent.amount.plus(existingFeeAmount)
        } else {
          estimatedFeeWithoutFiatPrice[feeComponent.token.tokenId] = {
            amount: feeComponent.amount,
            symbol: feeComponent.token.symbol,
          }
        }
      }
    }
  }

  const fiatFeeString = estimatedFeeInLocalCurrency.gt(0)
    ? `${localCurrencySymbol}${formatValueToDisplay(estimatedFeeInLocalCurrency)}`
    : ''
  const tokenFeeString = Object.values(estimatedFeeWithoutFiatPrice)
    .map((fee) => `${formatValueToDisplay(fee.amount)} ${fee.symbol}`)
    .join(' + ')
  return fiatFeeString || tokenFeeString
    ? `≈ ${fiatFeeString}${fiatFeeString && tokenFeeString ? ' + ' : ''}${tokenFeeString}`
    : undefined
}

function LabelWithInfo({
  label,
  onPress,
  testID,
}: {
  label: string
  onPress: () => void
  testID: string
}) {
  return (
    <Touchable style={styles.touchableRow} onPress={onPress} testID={testID}>
      <>
        <Text style={styles.label}>{label}</Text>
        <InfoIcon size={14} color={colors.gray4} testID={`${testID}/Icon`} />
      </>
    </Touchable>
  )
}

function ValueWithLoading({ value, isLoading }: { value: React.ReactNode; isLoading: boolean }) {
  return (
    <View style={styles.valueContainer}>
      <View>
        <Text style={[styles.value, { opacity: isLoading ? 0 : 1 }]}>{value}</Text>
        {isLoading && (
          <View style={styles.loaderContainer}>
            <SkeletonPlaceholder
              borderRadius={100}
              backgroundColor={colors.gray2}
              highlightColor={colors.white}
            >
              <View style={styles.loader} />
            </SkeletonPlaceholder>
          </View>
        )}
      </View>
    </View>
  )
}

export function SwapTransactionDetails({
  feeInfoBottomSheetRef,
  slippageInfoBottomSheetRef,
  estimatedDurationBottomSheetRef,
  slippagePercentage,
  fromToken,
  toToken,
  settlementToken,
  spendSteps,
  exchangeRatePrice,
  exchangeRateInfoBottomSheetRef,
  fetchingSwapQuote,
  appFee,
  estimatedDurationInSeconds,
  crossChainFee,
  networkFee,
  hideFeePaidInRow,
}: Props) {
  const { t } = useTranslation()
  const [spendDetailExpanded, setSpendDetailExpanded] = useState(false)
  const hasSpendSteps = !!spendSteps && spendSteps.length > 0
  const usdToLocalCurrencyRate = useSelector(usdToLocalCurrencyRateSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const estimatedFeesString = getEstimatedTotalFees({
    usdToLocalCurrencyRate,
    localCurrencySymbol,
    feeComponents: [appFee, crossChainFee, networkFee],
    errorFallback: t('swapScreen.transactionDetails.feesCalculationError'),
  })

  const placeholder = '-'

  if (!toToken || !fromToken) {
    return null
  }

  return (
    <View style={styles.container} testID="SwapTransactionDetails">
      {!!exchangeRatePrice && (
        <View style={styles.row} testID="SwapTransactionDetails/ExchangeRate">
          <LabelWithInfo
            onPress={() => {
              AppAnalytics.track(SwapEvents.swap_show_info, {
                type: SwapShowInfoType.EXCHANGE_RATE,
              })
              exchangeRateInfoBottomSheetRef.current?.snapToIndex(0)
            }}
            label={t('swapScreen.transactionDetails.exchangeRate')}
            testID="SwapTransactionDetails/ExchangeRate/MoreInfo"
          />
          <ValueWithLoading
            isLoading={fetchingSwapQuote}
            // Display symbols via getTokenSymbol so legacy on-chain names
            // (cCOP) render as user-facing labels (Pesos). Without this the
            // exchange-rate row reads e.g. "1 cCOP ≈ 0.00028 Dolares".
            value={`1 ${getTokenSymbol(t, fromToken.symbol, fromToken.tokenId)} ≈ ${new BigNumber(
              exchangeRatePrice
            ).toFormat(
              5,
              BigNumber.ROUND_DOWN
            )} ${getTokenSymbol(t, toToken.symbol, toToken.tokenId)}`}
          />
        </View>
      )}
      {settlementToken && (
        <View style={styles.row} testID="SwapTransactionDetails/SettlementToken">
          <Text style={styles.label}>{t('swapScreen.transactionDetails.receivingIn')}</Text>
          <Text style={styles.value} testID="SwapTransactionDetails/SettlementToken/Value">
            {(() => {
              const ticker = getDollarTokenTicker(settlementToken.tokenId)
              return ticker ?? settlementToken.name ?? settlementToken.symbol
            })()}
          </Text>
        </View>
      )}
      {hasSpendSteps && (
        <View testID="SwapTransactionDetails/SpendBreakdown">
          <Touchable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
              setSpendDetailExpanded((v) => !v)
            }}
            testID="SwapTransactionDetails/SpendBreakdown/Toggle"
          >
            <View style={styles.row}>
              <Text style={styles.label}>{t('swapScreen.transactionDetails.perTokenDetail')}</Text>
              <Text style={styles.value}>
                {spendDetailExpanded
                  ? t('swapScreen.transactionDetails.perTokenDetailCollapse')
                  : t('swapScreen.transactionDetails.perTokenDetailExpand', {
                      count: spendSteps!.length,
                    })}
              </Text>
            </View>
          </Touchable>
          {spendDetailExpanded &&
            spendSteps!.map((step) => (
              <View key={step.tokenId} style={[styles.row, styles.subRow]}>
                <Text style={styles.subLabel}>{step.symbol}</Text>
                <Text style={styles.value}>{`$${step.amountUsd.toFormat(2)}`}</Text>
              </View>
            ))}
        </View>
      )}
      <View style={styles.row} testID="SwapTransactionDetails/Fees">
        <LabelWithInfo
          onPress={() => {
            AppAnalytics.track(SwapEvents.swap_show_info, {
              type: SwapShowInfoType.FEES,
            })
            feeInfoBottomSheetRef.current?.snapToIndex(0)
          }}
          label={t('swapScreen.transactionDetails.fees')}
          testID="SwapTransactionDetails/Fees/MoreInfo"
        />
        <ValueWithLoading
          isLoading={fetchingSwapQuote}
          value={estimatedFeesString ?? placeholder}
        />
      </View>
      {!!appFee && appFee.percentage.gt(0) && !!appFee.token && !fetchingSwapQuote && (
        // Integrator fee already discounted from the effective price by the
        // backend proxy. Rendered as a separate line so the user sees it
        // explicitly instead of only inside the aggregated "Tarifas" total.
        // Matches the copy used on the gold buy/sell confirmation screens so
        // the user reads the same "Tarifa de operacion" label across surfaces.
        <View style={styles.row} testID="SwapTransactionDetails/ServiceFee">
          <Text style={styles.label}>
            {t('swapScreen.transactionDetails.serviceFee', {
              percentage: appFee.percentage.toFormat(),
            })}
          </Text>
          <Text style={styles.value}>
            {`${formatValueToDisplay(appFee.amount)} ${getTokenDisplayName(appFee.token.symbol)}`}
          </Text>
        </View>
      )}
      {!!networkFee?.token?.symbol && !fetchingSwapQuote && !hideFeePaidInRow && (
        // Bug E UX surface: the user can see which of their visible balances
        // covers the network fee. Was added so a tx paid in Pesos / Dólares no
        // longer looks like an unexplained CELO debit. Uses getTokenDisplayName
        // so the user reads "Pesos" / "Dólares" / "Oro" instead of the chain
        // symbols (COPm, USDm, XAUt0). CELO falls through to its raw symbol so
        // the user still sees something if the last-resort fallback fires.
        <View style={styles.row} testID="SwapTransactionDetails/FeePaidIn">
          <Text style={styles.label}>{t('swapScreen.transactionDetails.feePaidIn')}</Text>
          <Text style={styles.value}>{getTokenDisplayName(networkFee.token.symbol)}</Text>
        </View>
      )}
      {!!estimatedDurationInSeconds && (
        <View style={styles.row} testID="SwapTransactionDetails/EstimatedDuration">
          <LabelWithInfo
            onPress={() => {
              AppAnalytics.track(SwapEvents.swap_show_info, {
                type: SwapShowInfoType.ESTIMATED_DURATION,
              })
              estimatedDurationBottomSheetRef.current?.snapToIndex(0)
            }}
            label={t('swapScreen.transactionDetails.estimatedTransactionTime')}
            testID="SwapTransactionDetails/EstimatedDuration/MoreInfo"
          />
          <ValueWithLoading
            isLoading={fetchingSwapQuote}
            value={t('swapScreen.transactionDetails.estimatedTransactionTimeInMinutes', {
              minutes: Math.ceil(estimatedDurationInSeconds / 60),
            })}
          />
        </View>
      )}

      <View style={styles.row} testID="SwapTransactionDetails/Slippage">
        <LabelWithInfo
          onPress={() => {
            AppAnalytics.track(SwapEvents.swap_show_info, {
              type: SwapShowInfoType.SLIPPAGE,
            })
            slippageInfoBottomSheetRef.current?.snapToIndex(0)
          }}
          label={t('swapScreen.transactionDetails.slippagePercentage')}
          testID="SwapTransactionDetails/Slippage/MoreInfo"
        />
        <Text style={styles.value}>{`${slippagePercentage}%`}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.Regular16,
    borderWidth: 1,
    borderColor: colors.gray2,
    borderRadius: 12,
    gap: Spacing.Regular16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.Small12,
  },
  touchableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  value: {
    ...typeScale.bodySmall,
    color: colors.black,
    textAlign: 'right',
  },
  label: {
    ...typeScale.bodySmall,
    color: colors.gray4,
    marginRight: Spacing.Tiny4,
  },
  subRow: {
    paddingLeft: Spacing.Regular16,
    marginTop: Spacing.Smallest8,
  },
  subLabel: {
    ...typeScale.bodySmall,
    color: colors.gray4,
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  loader: {
    height: '100%',
    width: '100%',
  },
})

export default SwapTransactionDetails
