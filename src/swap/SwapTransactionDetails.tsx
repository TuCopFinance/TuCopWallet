import BigNumber from 'bignumber.js'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native'
import SkeletonPlaceholder from 'react-native-skeleton-placeholder'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { SwapEvents } from 'src/analytics/Events'
import { SwapShowInfoType } from 'src/analytics/Properties'
import { BottomSheetModalRefType } from 'src/components/BottomSheet'
import FeeSummary, { FeeComponent } from 'src/components/FeeSummary'
import { formatSwapProvider } from 'src/swap/formatSwapProvider'
import { getTokenSymbol } from 'src/components/TokenDisplay'
import { getDollarTokenTicker } from 'src/tokens/dollarGroup'
import Touchable from 'src/components/Touchable'
import InfoIcon from 'src/icons/status/InfoIcon'
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
  // Backend swapProvider slug (e.g. "squid", "uniswap-v4"). Rendered inside
  // the expandable "Detalle" section so users who want to know which venue
  // executed the swap can see it, without pushing tech names into the
  // primary confirm screen copy.
  swapProvider?: string
  // True when the wallet WILL wrap the (possibly multi-leg) swap into an
  // atomic EIP-7702 batch at submit time. Read by formatSwapProvider to
  // surface "Squid (7702)" in the preview instead of plain "Squid", matching
  // the label the saga persists post-tx. Optional; defaults to false so
  // legacy callers keep the old rendering. Only meaningful for the Squid
  // provider (formatSwapProvider ignores this flag for non-Squid slugs).
  isBatched7702?: boolean
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
  swapProvider,
  isBatched7702 = false,
}: Props) {
  const { t } = useTranslation()
  const [spendDetailExpanded, setSpendDetailExpanded] = useState(false)
  const [routeDetailExpanded, setRouteDetailExpanded] = useState(false)
  const hasSpendSteps = !!spendSteps && spendSteps.length > 0

  // Assemble fee components for the unified summary row: swap fee
  // (app-fee, integrator's cut) + cross-chain fee (only present on
  // cross-chain routes) + network fee (gas). Each entry stays in its
  // paying token so the user sees exactly which balance covers what;
  // FeeSummary sums them into COP for the aggregate ≈ figure.
  const feeSummaryComponents: FeeComponent[] = [appFee, crossChainFee, networkFee]
    .filter((c): c is SwapFeeAmount | AppFeeAmount => !!c && !!c.token && c.amount.gt(0))
    .map((c) => ({ amount: c.amount, token: c.token as TokenBalance }))

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
      {hasSpendSteps && spendSteps!.length === 1 && (
        // Single-leg Dolares aggregate: show the concrete stablecoin
        // inline (no toggle) so the user sees WHICH dollar we picked
        // without having to expand anything. Aggregate swaps silently
        // pick USAT -> USDm -> USDC -> USDT depending on balances; hiding
        // that choice behind a toggle turned into "no sabia cuál gasté"
        // in dogfooding. Reuses the SpendBreakdown testID so tests that
        // assert the presence of the breakdown pass in both single- and
        // multi-leg fixtures.
        <View style={styles.row} testID="SwapTransactionDetails/SpendBreakdown">
          <Text style={styles.label}>{t('swapScreen.transactionDetails.paidWith')}</Text>
          <Text style={styles.value}>
            {`${spendSteps![0].symbol} ($${spendSteps![0].amountUsd.toFormat(2)})`}
          </Text>
        </View>
      )}
      {hasSpendSteps && spendSteps!.length > 1 && (
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
        <View style={styles.valueContainer}>
          <View style={{ opacity: fetchingSwapQuote ? 0 : 1 }}>
            <FeeSummary
              layout="stacked"
              components={feeSummaryComponents}
              fallbackText={placeholder}
              // Fees are complementary info (not primary content like Rate /
              // Recibiras), so drop a tier: primary line uses bodySmall/gray4
              // (mutes the token breakdown) and the ≈ COP conversion goes
              // even smaller (bodyXSmall/gray4). Matches the design-system
              // pattern where explanatory info lives at the smaller scale.
              primaryStyle={styles.feeValuePrimary}
              secondaryStyle={styles.feeValueSecondary}
              testID="SwapTransactionDetails/Fees/Summary"
            />
          </View>
          {fetchingSwapQuote && (
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

      {!!swapProvider && (
        // Route reveal — hidden behind a toggle so the main confirm copy
        // stays banking-language (no "Uniswap" / "Squid" upfront). Users
        // who want to know which venue executed the swap can expand it.
        // Kept as a leaf row (no nested BottomSheet) to avoid a modal
        // stack on a screen that already has 4+ info sheets attached.
        <View testID="SwapTransactionDetails/RouteReveal">
          <Touchable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
              setRouteDetailExpanded((v) => !v)
            }}
            testID="SwapTransactionDetails/RouteReveal/Toggle"
          >
            <View style={styles.row}>
              <Text style={styles.label}>{t('swapScreen.transactionDetails.routeDetail')}</Text>
              <Text style={styles.value}>
                {routeDetailExpanded
                  ? t('swapScreen.transactionDetails.routeDetailCollapse')
                  : t('swapScreen.transactionDetails.routeDetailExpand')}
              </Text>
            </View>
          </Touchable>
          {routeDetailExpanded && (
            <View style={[styles.row, styles.subRow]}>
              <Text style={styles.subLabel}>{t('swapScreen.transactionDetails.routeLabel')}</Text>
              <Text style={styles.value}>
                {formatSwapProvider(swapProvider, { isBatched: isBatched7702 })}
              </Text>
            </View>
          )}
        </View>
      )}
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
  feeValuePrimary: {
    ...typeScale.bodySmall,
    color: colors.gray4,
    textAlign: 'right',
  },
  feeValueSecondary: {
    ...typeScale.bodyXSmall,
    color: colors.gray4,
    textAlign: 'right',
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
