import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from 'src/components/BackButton'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { FeeComponent } from 'src/components/FeeSummary'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import TokenDisplay from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import CustomHeader from 'src/components/header/CustomHeader'
import {
  DOLARES_VIRTUAL_TOKEN_ID,
  buildDolaresVirtualToken,
  executeMultiSwap,
  MULTI_SWAP_SLIPPAGE_PERCENTAGE,
  multiSwapCleared,
  planSpend,
  useDollarBalanceSnapshots,
  useMultiSwapQuote,
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
import { NETWORK_NAMES } from 'src/shared/conts'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import FeeInfoBottomSheet from 'src/swap/FeeInfoBottomSheet'
import SwapTransactionDetails from 'src/swap/SwapTransactionDetails'
import { AppFeeAmount, SwapFeeAmount } from 'src/swap/types'
import { pickDisplayFeeCurrency } from 'src/swap/getDisplayFeeCurrency'
import { useTokenInfo } from 'src/tokens/hooks'
import { TokenBalance } from 'src/tokens/slice'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldBuyConfirmation>

// USD-per-leg estimate + max-buffer used to synthesize an aggregated network
// fee for the virtual-Dolares path (multi-swap has no upfront per-step gas
// number; we surface a coarse estimate rather than a "-" placeholder).
// Mirrors the SwapScreen constants so both flows agree on the same number.
const NETWORK_FEE_USD_PER_STEP_ESTIMATE = new BigNumber(0.02)
const NETWORK_FEE_MAX_MULTIPLIER = 1.5

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
  const tokensById = useSelector((state) =>
    tokensByIdSelector(state, [networkConfig.defaultNetworkId])
  )
  // Ordered CELO, COPm, USDm, USDC, USDT (see tokens/feeCurrencyPicker.ts)
  // so a plain `.find(balance>0)` walk mirrors what the on-chain picker
  // will pick when the swap actually runs.
  const availableFeeCurrencies = useSelector((state) =>
    feeCurrenciesSelector(state, networkConfig.defaultNetworkId)
  )
  const usdmTokenForFallback = useMemo(() => tokensById[networkConfig.usdmTokenId], [tokensById])

  // State for quote that may be fetched on this screen
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | undefined>(initialGasFee)
  const [gasFeeTokenId, setGasFeeTokenId] = useState<string | undefined>(initialGasFeeTokenId)
  const [preparedTransactions, setPreparedTransactions] = useState<any>(initialPreparedTransactions)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [appFeePercentageIncludedInPrice, setAppFeePercentageIncludedInPrice] = useState<
    string | undefined
  >(initialAppFeePercentageIncludedInPrice)
  const [swapProvider, setSwapProvider] = useState<string | undefined>(undefined)

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
          setSwapProvider(quoteResult.quote.swapProvider)
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

  // Virtual-Dolares aggregate quote: drives real fee + rate rows in the
  // consolidated details panel (matches SwapScreen's virtual path).
  const multiSwapQuote = useMultiSwapQuote(
    isVirtualDolares ? (multiSwapPlan?.steps ?? []) : [],
    xaut0Token?.tokenId ?? '',
    XAUT0_DECIMALS
  )

  const isSubmitting = buyStatus === 'loading'
  const error = goldError || quoteError

  // COP doesn't use decimals
  const isLocalCurrencyCop = localCurrencyCode === LocalCurrencyCode.COP
  const localPriceDecimals = isLocalCurrencyCop ? 0 : 2

  const parsedFromAmount = useMemo(() => new BigNumber(fromAmount), [fromAmount])
  const parsedXautAmount = useMemo(() => new BigNumber(xautAmount), [xautAmount])
  const parsedPricePerOz = useMemo(() => new BigNumber(pricePerOz), [pricePerOz])

  const totalValueUsd = useMemo(
    () => parsedXautAmount.multipliedBy(parsedPricePerOz),
    [parsedXautAmount, parsedPricePerOz]
  )

  const totalValueLocal = useMemo(() => {
    if (!usdToLocalRate) return null
    return totalValueUsd.multipliedBy(usdToLocalRate)
  }, [totalValueUsd, usdToLocalRate])

  // Parse gas fee if available (single-token path)
  const parsedGasFee = useMemo(() => {
    if (!estimatedGasFee || !gasFeeToken) return null
    return new BigNumber(estimatedGasFee).shiftedBy(-gasFeeToken.decimals)
  }, [estimatedGasFee, gasFeeToken])

  // Integrator fee already discounted from the effective price by the backend
  // proxy. Rendered as a separate line so the user sees it explicitly. Only
  // meaningful on the single-token buy path (virtual-Dolares aggregates legs
  // via useMultiSwapQuote below).
  const parsedAppFee = useMemo(() => {
    if (!appFeePercentageIncludedInPrice || !fromToken) return null
    const percentage = new BigNumber(appFeePercentageIncludedInPrice)
    if (percentage.lte(0)) return null
    return {
      amount: parsedFromAmount.multipliedBy(percentage).dividedBy(100),
      percentage,
    }
  }, [appFeePercentageIncludedInPrice, fromToken, parsedFromAmount])

  // Synthetic Dolares fromToken for the virtual path so SwapTransactionDetails
  // (which requires a fromToken) can render its rate and receiving-in rows.
  const virtualDolaresToken = useMemo(() => {
    if (!isVirtualDolares) return null
    return buildDolaresVirtualToken({
      snapshots: dollarSnapshots,
      networkId: NetworkId['celo-mainnet'],
    })
  }, [isVirtualDolares, dollarSnapshots])

  const fromTokenForDetails: TokenBalance | undefined = isVirtualDolares
    ? (virtualDolaresToken ?? undefined)
    : (fromToken ?? undefined)

  // Pre-confirm placeholder for the fee token in the virtual-Dolares path.
  // Mirrors the on-chain CIP-64 picker order (CELO, COPm, USDm, USDC, USDT)
  // + excludes tokens being spent so the display matches the actual outcome
  // in the common case. Previously hard-coded USDm produced misleading rows
  // like "0.025 USDm" when the tx actually paid 0.19 CELO of gas.
  const feeDisplayToken = useMemo(() => {
    if (!isVirtualDolares) return undefined
    const spendingIds = (multiSwapPlan?.steps ?? []).map((s) => s.tokenId)
    return pickDisplayFeeCurrency({
      availableFeeCurrencies,
      excludedTokenIds: spendingIds,
      fallbackToken: usdmTokenForFallback,
    })
  }, [isVirtualDolares, multiSwapPlan, availableFeeCurrencies, usdmTokenForFallback])

  // Aggregated network fee for the virtual-Dolares path. USD placeholder
  // (paid per-step from whatever CIP-64 fee currency ends up cheapest) so
  // the user sees a real number instead of "-". Hidden "Pagada en" row via
  // hideFeePaidInRow because the token here is a display stand-in.
  const detailsNetworkFee: SwapFeeAmount | undefined = useMemo(() => {
    if (isVirtualDolares) {
      if (!feeDisplayToken || multiSwapQuote.loading) return undefined
      const stepCount = multiSwapPlan?.steps.length ?? 0
      if (stepCount === 0) return undefined
      const estimateUsd = NETWORK_FEE_USD_PER_STEP_ESTIMATE.multipliedBy(stepCount)
      return {
        token: feeDisplayToken,
        amount: estimateUsd,
        maxAmount: estimateUsd.multipliedBy(NETWORK_FEE_MAX_MULTIPLIER),
      }
    }
    if (!parsedGasFee || !gasFeeToken) return undefined
    return {
      token: gasFeeToken,
      amount: parsedGasFee,
      maxAmount: parsedGasFee,
    }
  }, [
    isVirtualDolares,
    multiSwapQuote.loading,
    multiSwapPlan,
    feeDisplayToken,
    parsedGasFee,
    gasFeeToken,
  ])

  const detailsAppFee: AppFeeAmount | undefined = useMemo(() => {
    if (isVirtualDolares) {
      if (!feeDisplayToken || multiSwapQuote.loading) return undefined
      const fulfilledWithFee = multiSwapQuote.perStepQuotes.filter(
        (q) => q.appFeePercentageIncludedInPrice
      )
      const avgPercentage = fulfilledWithFee.length
        ? fulfilledWithFee
            .reduce((sum, q) => sum.plus(q.appFeePercentageIncludedInPrice ?? 0), new BigNumber(0))
            .dividedBy(fulfilledWithFee.length)
        : new BigNumber(0)
      return {
        amount: multiSwapQuote.aggregateAppFeeUsd,
        token: feeDisplayToken,
        percentage: avgPercentage,
      }
    }
    if (!parsedAppFee || !fromToken) return undefined
    return {
      amount: parsedAppFee.amount,
      token: fromToken,
      percentage: parsedAppFee.percentage,
    }
  }, [
    isVirtualDolares,
    multiSwapQuote.loading,
    multiSwapQuote.perStepQuotes,
    multiSwapQuote.aggregateAppFeeUsd,
    feeDisplayToken,
    parsedAppFee,
    fromToken,
  ])

  // Exchange rate row: 1 fromToken ≈ N Oro.
  // Virtual: derive from aggregate deliveredUsd (only successful legs).
  // Single: xautAmount / fromAmount.
  const detailsExchangeRate: string | undefined = useMemo(() => {
    if (isVirtualDolares) {
      const deliveredUsd = multiSwapQuote.totalInUsd.minus(multiSwapQuote.unquotedUsd)
      return deliveredUsd.gt(0) && multiSwapQuote.totalOutToken.gt(0)
        ? multiSwapQuote.totalOutToken.dividedBy(deliveredUsd).toString()
        : undefined
    }
    if (parsedFromAmount.lte(0) || parsedXautAmount.lte(0)) return undefined
    return parsedXautAmount.dividedBy(parsedFromAmount).toString()
  }, [
    isVirtualDolares,
    multiSwapQuote.totalInUsd,
    multiSwapQuote.unquotedUsd,
    multiSwapQuote.totalOutToken,
    parsedFromAmount,
    parsedXautAmount,
  ])

  // Bottom-sheet refs for the info modals on the details panel rows.
  const exchangeRateInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const feeInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const slippageInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const estimatedDurationBottomSheetRef = useRef<BottomSheetModalRefType>(null)

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
      <CustomHeader
        style={{ paddingHorizontal: Spacing.Thick24 }}
        left={<BackButton />}
        title={t('goldFlow.buy.confirmTitle')}
      />
      <ScrollView contentContainerStyle={[styles.scrollContent, insetsStyle]}>
        {/* You Pay card (single-token path only; virtual-Dolares shows the
            aggregate + per-token breakdown inside SwapTransactionDetails). */}
        {!isVirtualDolares && (
          <>
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
            <View style={styles.arrowContainer}>
              <Text style={styles.arrowText}>↓</Text>
            </View>
          </>
        )}

        {/* You Receive card (always shown) */}
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

        {/* Virtual-Dolares shortfall warning (rendered above the details
            panel so the user sees it before the fee/rate rows). */}
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

        {/* Consolidated details panel: rate, per-token breakdown, fees,
            slippage, route. Matches the shape used on SwapScreen so both
            flows read identically. */}
        {fromTokenForDetails && xaut0Token && (
          <View style={styles.detailsWrapper}>
            <SwapTransactionDetails
              feeInfoBottomSheetRef={feeInfoBottomSheetRef}
              slippageInfoBottomSheetRef={slippageInfoBottomSheetRef}
              estimatedDurationBottomSheetRef={estimatedDurationBottomSheetRef}
              exchangeRateInfoBottomSheetRef={exchangeRateInfoBottomSheetRef}
              slippagePercentage={MULTI_SWAP_SLIPPAGE_PERCENTAGE}
              fromToken={fromTokenForDetails}
              toToken={xaut0Token}
              spendSteps={isVirtualDolares ? multiSwapPlan?.steps : undefined}
              exchangeRatePrice={detailsExchangeRate}
              swapAmount={parsedFromAmount}
              fetchingSwapQuote={isVirtualDolares ? multiSwapQuote.loading : isGettingQuote}
              appFee={detailsAppFee}
              networkFee={detailsNetworkFee}
              hideFeePaidInRow={isVirtualDolares}
              swapProvider={
                isVirtualDolares ? multiSwapQuote.perStepQuotes[0]?.provider : swapProvider
              }
            />
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

      {/* Info bottom sheets for the details panel rows. Copy-parallel to
          SwapScreen so the same modal content shows in both flows. */}
      <BottomSheet
        forwardedRef={exchangeRateInfoBottomSheetRef}
        title={t('swapScreen.transactionDetails.exchangeRate')}
        description={t('swapScreen.transactionDetails.exchangeRateInfoV1_90', {
          context: detailsAppFee?.percentage?.isGreaterThan(0) ? 'withAppFee' : '',
          networkName:
            NETWORK_NAMES[fromTokenForDetails?.networkId || networkConfig.defaultNetworkId],
          slippagePercentage: MULTI_SWAP_SLIPPAGE_PERCENTAGE,
          appFeePercentage: detailsAppFee?.percentage?.toFormat(),
        })}
        testId="ExchangeRateInfoBottomSheet"
      >
        <Button
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
          style={styles.bottomSheetButton}
          onPress={() => {
            exchangeRateInfoBottomSheetRef.current?.close()
          }}
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
          onPress={() => {
            slippageInfoBottomSheetRef.current?.close()
          }}
          text={t('swapScreen.transactionDetails.infoDismissButton')}
        />
      </BottomSheet>
      <FeeInfoBottomSheet
        forwardedRef={feeInfoBottomSheetRef}
        networkFee={detailsNetworkFee}
        appFee={detailsAppFee}
        fetchingSwapQuote={isVirtualDolares ? multiSwapQuote.loading : isGettingQuote}
      />
      {/* In-flight / partial-success shell. Rendered at the bottom of the
          SafeAreaView (same slot as SwapScreen) so it stacks below the form
          when a multi-swap is running and never appears at the top. */}
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
  detailsWrapper: {
    marginTop: Spacing.Regular16,
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
  bottomSheetButton: {
    marginTop: Spacing.Thick24,
  },
  buttonContainer: {
    marginTop: 'auto',
    paddingTop: Spacing.Thick24,
  },
})
