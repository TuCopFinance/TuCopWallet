import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from 'src/components/BackButton'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import FeeSummary, { FeeComponent } from 'src/components/FeeSummary'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import TokenDisplay from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import CustomHeader from 'src/components/header/CustomHeader'
import {
  DOLARES_VIRTUAL_TOKEN_ID,
  DolaresMultiStepSummary,
  executeMultiSwap,
  multiSwapCleared,
  planSpend,
  useDollarBalanceSnapshots,
} from 'src/dollarsSpend'
import TransactionFlowShell from 'src/dollarsSpend/TransactionFlowShell'
import { goldBuyStatusSelector, goldErrorSelector, xaut0TokenSelector } from 'src/gold/selectors'
import { buyGoldStart } from 'src/gold/slice'
import { XAUT0_DECIMALS } from 'src/gold/types'
import { describeGoldQuoteError } from 'src/gold/errorDisplay'
import { useGoldQuote } from 'src/gold/useGoldQuote'
import GoldIconSelector from 'src/gold/GoldIconSelector'
import { LocalCurrencyCode, LocalCurrencySymbol } from 'src/localCurrency/consts'
import {
  getLocalCurrencyCode,
  getLocalCurrencySymbol,
  usdToLocalCurrencyRateSelector,
} from 'src/localCurrency/selectors'
import { StackParamList } from 'src/navigator/types'
import { Screens } from 'src/navigator/Screens'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTokenInfo } from 'src/tokens/hooks'
import { TokenBalance } from 'src/tokens/slice'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldBuyConfirmation>

/**
 * Build the fee components array shared by Gold Buy + Sell confirmation
 * screens. Skips a component when its amount or token is missing so the
 * summary shows only what backend actually returned (e.g. some routes have
 * no app fee).
 */
export function buildGoldFeeComponents({
  appFee,
  appFeeToken,
  networkFee,
  networkFeeToken,
}: {
  appFee: BigNumber | null | undefined
  appFeeToken: TokenBalance | null | undefined
  networkFee: BigNumber | null | undefined
  networkFeeToken: TokenBalance | null | undefined
}): FeeComponent[] {
  const components: FeeComponent[] = []
  if (appFee && appFeeToken && appFee.gt(0)) {
    components.push({ amount: appFee, token: appFeeToken })
  }
  if (networkFee && networkFeeToken && networkFee.gt(0)) {
    components.push({ amount: networkFee, token: networkFeeToken })
  }
  return components
}

export default function GoldBuyConfirmation({ route }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const insets = useSafeAreaInsets()
  const {
    fromTokenId,
    fromAmount,
    xautAmount,
    pricePerOz,
    estimatedGasFee: initialGasFee,
    gasFeeTokenId: initialGasFeeTokenId,
    preparedTransactions: initialPreparedTransactions,
    toTokenId,
    appFeePercentageIncludedInPrice: initialAppFeePercentageIncludedInPrice,
  } = route.params

  const buyStatus = useSelector(goldBuyStatusSelector)
  const goldError = useSelector(goldErrorSelector)
  const xaut0Token = useSelector(xaut0TokenSelector)

  const fromToken = useTokenInfo(fromTokenId)

  const localCurrencyCode = useSelector(getLocalCurrencyCode)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)

  // State for quote that may be fetched on this screen
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | undefined>(initialGasFee)
  const [gasFeeTokenId, setGasFeeTokenId] = useState<string | undefined>(initialGasFeeTokenId)
  const [preparedTransactions, setPreparedTransactions] = useState<any>(initialPreparedTransactions)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [appFeePercentageIncludedInPrice, setAppFeePercentageIncludedInPrice] = useState<
    string | undefined
  >(initialAppFeePercentageIncludedInPrice)

  const gasFeeToken = useTokenInfo(gasFeeTokenId ?? '')

  // Use the gold quote hook to fetch quote if not provided
  const { getQuote, loading: isGettingQuote } = useGoldQuote()

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Fetch quote if preparedTransactions not provided
  useEffect(() => {
    const fetchQuoteIfNeeded = async () => {
      if (initialPreparedTransactions || !fromToken || !xaut0Token) {
        return
      }

      Logger.debug(
        'GoldBuyConfirmation',
        'Fetching quote because preparedTransactions not provided'
      )

      try {
        const quoteResult = await getQuote({
          fromToken,
          toToken: xaut0Token,
          amount: new BigNumber(fromAmount),
          direction: 'buy',
        })

        // Check if component is still mounted before updating state
        if (!isMountedRef.current) {
          return
        }

        if (quoteResult) {
          Logger.debug('GoldBuyConfirmation', 'Got quote result', {
            gasFee: quoteResult.quote.estimatedGasFee,
            swapProvider: quoteResult.quote.swapProvider,
          })
          setEstimatedGasFee(quoteResult.quote.estimatedGasFee)
          if (quoteResult.preparedTransactions.type === 'possible') {
            setGasFeeTokenId(quoteResult.preparedTransactions.feeCurrency.tokenId)
          }
          setPreparedTransactions(quoteResult.quote.preparedTransactions)
          setAppFeePercentageIncludedInPrice(quoteResult.quote.appFeePercentageIncludedInPrice)
          setQuoteError(null)
        } else {
          setQuoteError(t('goldFlow.buy.quoteErrorDescription'))
        }
      } catch (error: unknown) {
        // Check if component is still mounted before updating state
        if (!isMountedRef.current) {
          return
        }
        Logger.warn('GoldBuyConfirmation', 'Failed to fetch quote')
        // Never surface raw error.message: it may carry the enriched
        // squid_unavailable / squid_rate_limited envelope JSON body.
        // describeGoldQuoteError yields safe i18n copy (envelope-aware or
        // generic fallback) that the InLineNotification can render.
        setQuoteError(describeGoldQuoteError(error, t, 'buy').body)
      }
    }

    void fetchQuoteIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPreparedTransactions, fromToken, xaut0Token, fromAmount])

  const isVirtualDolares = fromTokenId === DOLARES_VIRTUAL_TOKEN_ID

  const dollarSnapshots = useDollarBalanceSnapshots()

  const requestedUsd = useMemo(() => {
    if (!isVirtualDolares) return new BigNumber(0)
    return new BigNumber(fromAmount ?? 0)
  }, [isVirtualDolares, fromAmount])

  const multiSwapPlan = useMemo(() => {
    if (!isVirtualDolares || requestedUsd.lte(0)) return null
    return planSpend({ requestedUsd, balances: dollarSnapshots })
  }, [isVirtualDolares, requestedUsd, dollarSnapshots])

  const isSubmitting = buyStatus === 'loading'
  const error = goldError || quoteError

  // Note: Success navigation and message are handled by the saga

  // COP doesn't use decimals
  const isLocalCurrencyCop = localCurrencyCode === LocalCurrencyCode.COP
  const localPriceDecimals = isLocalCurrencyCop ? 0 : 2

  const parsedFromAmount = useMemo(() => new BigNumber(fromAmount), [fromAmount])
  const parsedXautAmount = useMemo(() => new BigNumber(xautAmount), [xautAmount])
  const parsedPricePerOz = useMemo(() => new BigNumber(pricePerOz), [pricePerOz])

  // Calculate local currency values
  const localPricePerOz = useMemo(() => {
    if (!usdToLocalRate) return null
    return parsedPricePerOz.multipliedBy(usdToLocalRate)
  }, [parsedPricePerOz, usdToLocalRate])

  const totalValueUsd = useMemo(
    () => parsedXautAmount.multipliedBy(parsedPricePerOz),
    [parsedXautAmount, parsedPricePerOz]
  )

  const totalValueLocal = useMemo(() => {
    if (!usdToLocalRate) return null
    return totalValueUsd.multipliedBy(usdToLocalRate)
  }, [totalValueUsd, usdToLocalRate])

  // Parse gas fee if available
  const parsedGasFee = useMemo(() => {
    if (!estimatedGasFee || !gasFeeToken) return null
    return new BigNumber(estimatedGasFee).shiftedBy(-gasFeeToken.decimals)
  }, [estimatedGasFee, gasFeeToken])

  // Integrator fee already discounted from the effective price by the backend
  // proxy. Rendered as a separate line so the user sees it explicitly. Only
  // meaningful on the single-token buy path (virtual-Dolares aggregates legs
  // and is handled by DolaresMultiStepSummary elsewhere).
  const parsedAppFee = useMemo(() => {
    if (!appFeePercentageIncludedInPrice || !fromToken) return null
    const percentage = new BigNumber(appFeePercentageIncludedInPrice)
    if (percentage.lte(0)) return null
    return {
      amount: parsedFromAmount.multipliedBy(percentage).dividedBy(100),
      percentage,
    }
  }, [appFeePercentageIncludedInPrice, fromToken, parsedFromAmount])

  // getProviderDisplayName removed 2026-08-09 (zero-tech-leak policy in
  // feedback_no_tech_leak_in_user_copy.md). The old function exposed
  // "Squid Router" / "Uniswap" / "0x Protocol" verbatim under the visible
  // "Proveedor" row of the confirmation screen. The row itself is removed
  // below. `swapProvider` state and its analytics logging are intentionally
  // kept so a later iteration can surface the source inside a collapsable
  // "detalles" panel (see Uniswap V4 fallback wallet plan) without leaking
  // vendor names into the default view.

  const onPressConfirm = () => {
    if (isVirtualDolares) {
      if (!multiSwapPlan || multiSwapPlan.shortfall.gt(0)) return
      dispatch(
        executeMultiSwap({
          steps: multiSwapPlan.steps,
          toTokenId: networkConfig.xaut0TokenId,
        })
      )
      return
    }

    if (!fromToken || !preparedTransactions || !toTokenId) return

    // Dispatch the buy action - saga will handle the transaction
    dispatch(
      buyGoldStart({
        fromTokenId,
        fromAmount,
        quote: {
          fromTokenId,
          toTokenId,
          fromAmount: parsedFromAmount.shiftedBy(fromToken.decimals).toFixed(0),
          toAmount: parsedXautAmount.shiftedBy(XAUT0_DECIMALS).toFixed(0),
          pricePerOz,
          estimatedGasFee: estimatedGasFee ?? '0',
          estimatedGasFeeUsd: '0',
          allowanceTarget: '',
          preparedTransactions,
        },
      })
    )
  }

  const insetsStyle = {
    paddingBottom: Math.max(insets.bottom, Spacing.Regular16),
  }

  if (!isVirtualDolares && !fromToken) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <CustomHeader style={{ paddingHorizontal: Spacing.Thick24 }} left={<BackButton />} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TransactionFlowShell
        onRetry={() => {
          const remaining = planSpend({ requestedUsd, balances: dollarSnapshots })
          if (remaining.shortfall.gt(0)) return
          dispatch(
            executeMultiSwap({ steps: remaining.steps, toTokenId: networkConfig.xaut0TokenId })
          )
        }}
        onCancel={() => dispatch(multiSwapCleared())}
      />
      <CustomHeader
        style={{ paddingHorizontal: Spacing.Thick24 }}
        left={<BackButton />}
        title={t('goldFlow.buy.confirmTitle')}
      />
      <ScrollView contentContainerStyle={[styles.scrollContent, insetsStyle]}>
        {/* Virtual Dolares multi-step summary */}
        {isVirtualDolares && multiSwapPlan && multiSwapPlan.shortfall.lte(0) && (
          <DolaresMultiStepSummary steps={multiSwapPlan.steps} />
        )}
        {isVirtualDolares && multiSwapPlan && multiSwapPlan.shortfall.gt(0) && (
          <InLineNotification
            variant={NotificationVariant.Warning}
            title={t('dollarsSpend.shortfall.title')}
            description={t('dollarsSpend.shortfall.body', {
              availableUsd: `$${dollarSnapshots
                .reduce((sum, s) => sum.plus(s.balance.multipliedBy(s.priceUsd)), new BigNumber(0))
                .toFormat(2)}`,
            })}
            style={styles.warning}
            testID="GoldBuyConfirmation/Shortfall"
          />
        )}
        {/* Swap Summary (single-token path) */}
        {!isVirtualDolares && (
          <View style={styles.summaryCard}>
            <Text style={styles.cardLabel}>{t('goldFlow.buy.youPay')}</Text>
            <View style={styles.tokenRow}>
              <TokenIcon token={fromToken!} size={IconSize.MEDIUM} />
              <View style={styles.tokenInfo}>
                <TokenDisplay
                  tokenId={fromTokenId}
                  amount={parsedFromAmount}
                  showLocalAmount={false}
                  style={styles.tokenAmount}
                />
                <TokenDisplay
                  tokenId={fromTokenId}
                  amount={parsedFromAmount}
                  showLocalAmount
                  style={styles.tokenLocalValue}
                />
              </View>
            </View>
          </View>
        )}

        {!isVirtualDolares && (
          <View style={styles.arrowContainer}>
            <Text style={styles.arrowText}>↓</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.cardLabel}>{t('goldFlow.buy.youReceive')}</Text>
          <View style={styles.tokenRow}>
            <GoldIconSelector size={40} />
            <View style={styles.tokenInfo}>
              <Text style={styles.tokenAmount}>
                {parsedXautAmount.toFormat(XAUT0_DECIMALS)} {t('goldFlow.gold')}
              </Text>
              {totalValueLocal && (
                <Text style={styles.tokenLocalValue}>
                  ≈ {localCurrencySymbol}
                  {totalValueLocal.toFormat(localPriceDecimals)}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Transaction Details (single-token path only) */}
        {!isVirtualDolares && (
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('goldFlow.buy.goldPrice')}</Text>
              <Text style={styles.detailValue}>
                {localCurrencySymbol}
                {localPricePerOz?.toFormat(localPriceDecimals) ??
                  parsedPricePerOz.toFormat(localPriceDecimals)}{' '}
                / oz
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('goldFlow.buy.fees')}</Text>
              {isGettingQuote ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <FeeSummary
                  layout="stacked"
                  components={buildGoldFeeComponents({
                    appFee: parsedAppFee?.amount,
                    appFeeToken: fromToken ?? undefined,
                    networkFee: parsedGasFee,
                    networkFeeToken: gasFeeToken ?? undefined,
                  })}
                  fallbackText={t('goldFlow.buy.estimatingFee')}
                  primaryStyle={styles.detailValue}
                  secondaryStyle={styles.detailValueSecondary}
                  testID="GoldBuyConfirmation/Fees"
                />
              )}
            </View>
          </View>
        )}

        {/* Info Notice */}
        <InLineNotification
          variant={NotificationVariant.Info}
          title={t('goldFlow.buy.infoTitle')}
          description={t('goldFlow.buy.infoDescription')}
          style={styles.infoNotice}
          testID="GoldBuyConfirmation/Info"
        />

        {/* Error Notice */}
        {!!error && (
          <InLineNotification
            variant={NotificationVariant.Error}
            title={t('goldFlow.buy.errorTitle')}
            description={error}
            style={styles.errorNotice}
            testID="GoldBuyConfirmation/Error"
          />
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Button
            onPress={onPressConfirm}
            text={t('goldFlow.buy.confirm')}
            size={BtnSizes.FULL}
            type={BtnTypes.PRIMARY}
            disabled={
              isSubmitting ||
              (isVirtualDolares
                ? !multiSwapPlan || multiSwapPlan.shortfall.gt(0)
                : isGettingQuote ||
                  !Array.isArray(preparedTransactions) ||
                  preparedTransactions.length === 0 ||
                  !estimatedGasFee ||
                  estimatedGasFee === '0' ||
                  !!quoteError ||
                  !toTokenId)
            }
            showLoading={isSubmitting || isGettingQuote}
            testID="GoldBuyConfirmation/ConfirmButton"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// Using inline CustomHeader with BackButton, so no navigationOptions needed
GoldBuyConfirmation.navigationOptions = {
  headerShown: false,
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.Thick24,
    paddingTop: Spacing.Regular16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryCard: {
    backgroundColor: Colors.gray1,
    borderRadius: Spacing.Small12,
    padding: Spacing.Regular16,
  },
  cardLabel: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Small12,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenAmount: {
    ...typeScale.titleMedium,
    color: Colors.black,
  },
  tokenLocalValue: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Tiny4,
  },
  arrowContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.Smallest8,
  },
  arrowText: {
    ...typeScale.titleMedium,
    color: Colors.gray3,
  },
  detailsCard: {
    marginTop: Spacing.Regular16,
    padding: Spacing.Regular16,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: Spacing.Small12,
    gap: Spacing.Smallest8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
  detailValue: {
    ...typeScale.bodyMedium,
    color: Colors.black,
  },
  detailValueSecondary: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  infoNotice: {
    marginTop: Spacing.Regular16,
  },
  errorNotice: {
    marginTop: Spacing.Regular16,
  },
  warning: {
    marginTop: Spacing.Regular16,
  },
  buttonContainer: {
    marginTop: 'auto',
    paddingTop: Spacing.Thick24,
  },
})
