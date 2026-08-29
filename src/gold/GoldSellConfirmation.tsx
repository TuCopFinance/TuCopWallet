import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from 'src/components/BackButton'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import TokenDisplay from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import CustomHeader from 'src/components/header/CustomHeader'
import { goldSellStatusSelector, xaut0TokenSelector } from 'src/gold/selectors'
import { sellGoldStart } from 'src/gold/slice'
import { XAUT0_DECIMALS } from 'src/gold/types'
import { describeGoldQuoteError } from 'src/gold/errorDisplay'
import { useGoldQuote } from 'src/gold/useGoldQuote'
import GoldIconSelector from 'src/gold/GoldIconSelector'
import { LocalCurrencySymbol } from 'src/localCurrency/consts'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { StackParamList } from 'src/navigator/types'
import { Screens } from 'src/navigator/Screens'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTokenInfo } from 'src/tokens/hooks'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'
import FeeInfoBottomSheet from 'src/swap/FeeInfoBottomSheet'
import SwapTransactionDetails from 'src/swap/SwapTransactionDetails'
import { AppFeeAmount, SwapFeeAmount } from 'src/swap/types'
import { NETWORK_NAMES } from 'src/shared/conts'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldSellConfirmation>

export default function GoldSellConfirmation({ route }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const insets = useSafeAreaInsets()
  const { toTokenId, xautAmount, toAmount, pricePerOz } = route.params

  const [error, setError] = useState<string | null>(null)

  const toToken = useTokenInfo(toTokenId)
  const xaut0Token = useSelector(xaut0TokenSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const sellStatus = useSelector(goldSellStatusSelector)

  // State for quote
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | undefined>(undefined)
  const [gasFeeTokenId, setGasFeeTokenId] = useState<string | undefined>(undefined)
  const [preparedTransactions, setPreparedTransactions] = useState<any>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [appFeePercentageIncludedInPrice, setAppFeePercentageIncludedInPrice] = useState<
    string | undefined
  >(undefined)
  const [swapProvider, setSwapProvider] = useState<string | undefined>(undefined)

  const gasFeeToken = useTokenInfo(gasFeeTokenId ?? '')

  // Use the gold quote hook to fetch quote
  const { getQuote, loading: isGettingQuote } = useGoldQuote()

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Fetch quote on mount
  useEffect(() => {
    const fetchQuote = async () => {
      if (!toToken || !xaut0Token) {
        return
      }

      Logger.debug('GoldSellConfirmation', 'Fetching sell quote')

      try {
        const quoteResult = await getQuote({
          fromToken: xaut0Token,
          toToken,
          amount: new BigNumber(xautAmount),
          direction: 'sell',
        })

        // Check if component is still mounted before updating state
        if (!isMountedRef.current) {
          return
        }

        if (quoteResult) {
          Logger.debug('GoldSellConfirmation', 'Got quote result', {
            gasFee: quoteResult.quote.estimatedGasFee,
            swapProvider: quoteResult.quote.swapProvider,
          })
          setEstimatedGasFee(quoteResult.quote.estimatedGasFee)
          if (quoteResult.preparedTransactions.type === 'possible') {
            setGasFeeTokenId(quoteResult.preparedTransactions.feeCurrency.tokenId)
          }
          setPreparedTransactions(quoteResult.quote.preparedTransactions)
          setAppFeePercentageIncludedInPrice(quoteResult.quote.appFeePercentageIncludedInPrice)
          setSwapProvider(quoteResult.quote.swapProvider)
          setQuoteError(null)
        } else {
          setQuoteError(t('goldFlow.sell.quoteErrorDescription'))
        }
      } catch (err: unknown) {
        // Check if component is still mounted before updating state
        if (!isMountedRef.current) {
          return
        }
        Logger.warn('GoldSellConfirmation', 'Failed to get quote')
        // Never surface raw err.message: it may carry the enriched squid
        // envelope JSON. describeGoldQuoteError returns safe i18n copy.
        setQuoteError(describeGoldQuoteError(err, t, 'sell').body)
      }
    }

    void fetchQuote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toToken, xaut0Token, xautAmount])

  // Note: Success navigation and message are handled by the saga

  const parsedXautAmount = useMemo(() => new BigNumber(xautAmount), [xautAmount])
  const parsedToAmount = useMemo(() => new BigNumber(toAmount), [toAmount])
  const parsedPricePerOz = useMemo(() => new BigNumber(pricePerOz), [pricePerOz])

  // Calculate local currency values
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
  // proxy. Rendered as a separate line so the user sees it explicitly. On the
  // sell path the fee is charged on the XAUt0 side (the "from" token).
  const parsedAppFee = useMemo(() => {
    if (!appFeePercentageIncludedInPrice) return null
    const percentage = new BigNumber(appFeePercentageIncludedInPrice)
    if (percentage.lte(0)) return null
    return {
      amount: parsedXautAmount.multipliedBy(percentage).dividedBy(100),
      percentage,
    }
  }, [appFeePercentageIncludedInPrice, parsedXautAmount])

  // Details panel shape matches GoldBuyConfirmation + SwapScreen so the sell
  // preview reads identically to the other flows: exchangeRate + fees (with
  // info sheet breakdown) + slippage + route reveal with provider label.
  const detailsNetworkFee: SwapFeeAmount | undefined = useMemo(() => {
    if (!parsedGasFee || !gasFeeToken) return undefined
    return { token: gasFeeToken, amount: parsedGasFee, maxAmount: parsedGasFee }
  }, [parsedGasFee, gasFeeToken])

  const detailsAppFee: AppFeeAmount | undefined = useMemo(() => {
    if (!parsedAppFee || !xaut0Token) return undefined
    return {
      amount: parsedAppFee.amount,
      token: xaut0Token,
      percentage: parsedAppFee.percentage,
    }
  }, [parsedAppFee, xaut0Token])

  // Exchange rate: 1 Oro ≈ N Pesos (sell direction — inverse of buy).
  // parsedToAmount / parsedXautAmount, guarded against div by zero.
  const detailsExchangeRate: string | undefined = useMemo(() => {
    if (parsedXautAmount.lte(0) || parsedToAmount.lte(0)) return undefined
    return parsedToAmount.dividedBy(parsedXautAmount).toString()
  }, [parsedXautAmount, parsedToAmount])

  const exchangeRateInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const feeInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const slippageInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const estimatedDurationBottomSheetRef = useRef<BottomSheetModalRefType>(null)

  // getProviderDisplayName removed 2026-08-09 (zero-tech-leak policy in
  // feedback_no_tech_leak_in_user_copy.md). See identical removal in
  // GoldBuyConfirmation.tsx for the rationale.

  const isSubmitting = sellStatus === 'loading'

  const onPressConfirm = () => {
    if (!toToken || !preparedTransactions) return

    setError(null)

    // Dispatch the sell action - saga will handle the transaction
    dispatch(
      sellGoldStart({
        toTokenId,
        xautAmount,
        quote: {
          fromTokenId: networkConfig.xaut0TokenId,
          toTokenId,
          fromAmount: parsedXautAmount.shiftedBy(XAUT0_DECIMALS).toFixed(0),
          toAmount: parsedToAmount.shiftedBy(toToken.decimals).toFixed(0),
          pricePerOz,
          estimatedGasFee: estimatedGasFee ?? '0',
          estimatedGasFeeUsd: '0',
          allowanceTarget: '',
          preparedTransactions,
          // Forward integrator pct + provider slug so sellGoldSaga's
          // recordSwapFeeMetadata surfaces 'Tarifa del proveedor' row in
          // success + tx-details. Without these the saga sees undefined and
          // defaults appFeeUsd='0' → row hides. See src/gold/saga.ts
          // sellGoldSaga + buy path fix in GoldBuyConfirmation.
          appFeePercentageIncludedInPrice,
          swapProvider,
        },
      })
    )
  }

  const insetsStyle = {
    paddingBottom: Math.max(insets.bottom, Spacing.Regular16),
  }

  if (!toToken) {
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
      <CustomHeader
        style={{ paddingHorizontal: Spacing.Thick24 }}
        left={<BackButton />}
        title={t('goldFlow.sell.confirmTitle')}
      />
      <ScrollView contentContainerStyle={[styles.scrollContent, insetsStyle]}>
        {/* Swap Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardLabel}>{t('goldFlow.sell.youSell')}</Text>
          <View style={styles.tokenRow}>
            <GoldIconSelector size={40} />
            <View style={styles.tokenInfo}>
              <Text style={styles.tokenAmount}>
                {parsedXautAmount.toFormat(XAUT0_DECIMALS)} {t('goldFlow.gold')}
              </Text>
              {totalValueLocal && (
                <Text style={styles.tokenLocalValue}>
                  ≈ {localCurrencySymbol}
                  {totalValueLocal.toFormat(2)}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.arrowContainer}>
          <Text style={styles.arrowText}>↓</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.cardLabel}>{t('goldFlow.sell.youReceive')}</Text>
          <View style={styles.tokenRow}>
            <TokenIcon token={toToken} size={IconSize.MEDIUM} />
            <View style={styles.tokenInfo}>
              <TokenDisplay
                tokenId={toTokenId}
                amount={parsedToAmount}
                showLocalAmount={false}
                style={styles.tokenAmount}
              />
              <TokenDisplay
                tokenId={toTokenId}
                amount={parsedToAmount}
                showLocalAmount
                style={styles.tokenLocalValue}
              />
            </View>
          </View>
        </View>

        {/* Consolidated details panel: exchangeRate + fees (with info sheet
            breakdown) + slippage + route reveal. Same component the buy path
            + regular swap use, so all 3 previews read identically per the
            unification standard. Previous bespoke detailsCard (goldPrice +
            fees only) was inconsistent — missing tarifa breakdown, no route
            row, hand-rolled styles. */}
        {xaut0Token && toToken && (
          <View style={styles.detailsWrapper}>
            <SwapTransactionDetails
              feeInfoBottomSheetRef={feeInfoBottomSheetRef}
              slippageInfoBottomSheetRef={slippageInfoBottomSheetRef}
              estimatedDurationBottomSheetRef={estimatedDurationBottomSheetRef}
              exchangeRateInfoBottomSheetRef={exchangeRateInfoBottomSheetRef}
              slippagePercentage="1"
              fromToken={xaut0Token}
              toToken={toToken}
              exchangeRatePrice={detailsExchangeRate}
              fetchingSwapQuote={isGettingQuote}
              appFee={detailsAppFee}
              networkFee={detailsNetworkFee}
              swapProvider={swapProvider}
              isBatched7702={false}
            />
          </View>
        )}

        {/* Quote Error */}
        {!!quoteError && (
          <InLineNotification
            variant={NotificationVariant.Warning}
            title={t('goldFlow.sell.quoteErrorTitle')}
            description={quoteError}
            style={styles.errorNotice}
            testID="GoldSellConfirmation/QuoteError"
          />
        )}

        {/* Info Notice */}
        <InLineNotification
          variant={NotificationVariant.Info}
          title={t('goldFlow.sell.infoTitle')}
          description={t('goldFlow.sell.infoDescription')}
          style={styles.infoNotice}
          testID="GoldSellConfirmation/Info"
        />

        {/* Error Notice */}
        {!!error && (
          <InLineNotification
            variant={NotificationVariant.Error}
            title={t('goldFlow.sell.errorTitle')}
            description={error}
            style={styles.errorNotice}
            testID="GoldSellConfirmation/Error"
          />
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Button
            onPress={onPressConfirm}
            text={t('goldFlow.sell.confirm')}
            size={BtnSizes.FULL}
            type={BtnTypes.PRIMARY}
            disabled={
              isSubmitting ||
              isGettingQuote ||
              !Array.isArray(preparedTransactions) ||
              preparedTransactions.length === 0 ||
              !estimatedGasFee ||
              estimatedGasFee === '0' ||
              !!quoteError ||
              !toTokenId
            }
            showLoading={isSubmitting || isGettingQuote}
            testID="GoldSellConfirmation/ConfirmButton"
          />
        </View>
      </ScrollView>

      {/* Info bottom sheets for the details panel rows. Same content the
          GoldBuyConfirmation + SwapScreen render so the copy is uniform. */}
      <BottomSheet
        forwardedRef={exchangeRateInfoBottomSheetRef}
        title={t('swapScreen.transactionDetails.exchangeRate')}
        description={t('swapScreen.transactionDetails.exchangeRateInfoV1_90', {
          context: detailsAppFee?.percentage?.isGreaterThan(0) ? 'withAppFee' : '',
          networkName: NETWORK_NAMES[xaut0Token?.networkId || networkConfig.defaultNetworkId],
          slippagePercentage: '1',
          appFeePercentage: detailsAppFee?.percentage?.toFormat(),
        })}
        testId="ExchangeRateInfoBottomSheet"
      >
        <Button
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
          style={styles.bottomSheetButton}
          onPress={() => exchangeRateInfoBottomSheetRef.current?.close()}
          text={t('swapScreen.transactionDetails.infoDismissButton')}
        />
      </BottomSheet>
      <BottomSheet
        forwardedRef={slippageInfoBottomSheetRef}
        title={t('swapScreen.transactionDetails.slippagePercentage')}
        description={t('swapScreen.transactionDetails.slippageToleranceInfoV1_90')}
        testId="SlippageInfoBottomSheet"
      >
        <Button
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
          style={styles.bottomSheetButton}
          onPress={() => slippageInfoBottomSheetRef.current?.close()}
          text={t('swapScreen.transactionDetails.infoDismissButton')}
        />
      </BottomSheet>
      <FeeInfoBottomSheet
        forwardedRef={feeInfoBottomSheetRef}
        networkFee={detailsNetworkFee}
        appFee={detailsAppFee}
        fetchingSwapQuote={isGettingQuote}
      />
    </SafeAreaView>
  )
}

// Using inline CustomHeader with BackButton, so no navigationOptions needed
GoldSellConfirmation.navigationOptions = {
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
  // Wrapper around the shared SwapTransactionDetails panel; keeps the same
  // spacing + border treatment the previous bespoke detailsCard had so the
  // sell screen still matches the buy screen visually.
  detailsWrapper: {
    marginTop: Spacing.Regular16,
    padding: Spacing.Regular16,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: Spacing.Small12,
  },
  bottomSheetButton: {
    marginTop: Spacing.Regular16,
  },
  infoNotice: {
    marginTop: Spacing.Regular16,
  },
  errorNotice: {
    marginTop: Spacing.Regular16,
  },
  buttonContainer: {
    marginTop: 'auto',
    paddingTop: Spacing.Thick24,
  },
})
