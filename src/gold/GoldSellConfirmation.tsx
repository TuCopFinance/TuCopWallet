import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from 'src/components/BackButton'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import TokenDisplay from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import CustomHeader from 'src/components/header/CustomHeader'
import { goldSellStatusSelector, xaut0TokenSelector } from 'src/gold/selectors'
import { sellGoldStart } from 'src/gold/slice'
import { XAUT0_DECIMALS } from 'src/gold/types'
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
import { TokenBalance } from 'src/tokens/slice'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'

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

  // Get user-friendly display name for tokens
  const getTokenName = (token: TokenBalance | null) => {
    if (!token) return ''
    if (token.tokenId === networkConfig.copmTokenId) {
      return t('assets.pesos')
    }
    if (token.tokenId === networkConfig.usdtTokenId) {
      return t('assets.dollars')
    }
    const symbol = token.symbol?.toLowerCase() || ''
    if (symbol === 'ccop' || symbol === 'copm') {
      return t('assets.pesos')
    }
    if (symbol === 'usdt' || symbol === 'usdt0' || symbol === 'usd₮') {
      return t('assets.dollars')
    }
    return token.name
  }

  // State for quote
  const [estimatedGasFee, setEstimatedGasFee] = useState<string | undefined>(undefined)
  const [gasFeeTokenId, setGasFeeTokenId] = useState<string | undefined>(undefined)
  const [preparedTransactions, setPreparedTransactions] = useState<any>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
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
          setSwapProvider(quoteResult.quote.swapProvider)
          setQuoteError(null)
        } else {
          setQuoteError(t('goldFlow.sell.quoteErrorDescription'))
        }
      } catch (err: any) {
        // Check if component is still mounted before updating state
        if (!isMountedRef.current) {
          return
        }
        Logger.error('GoldSellConfirmation', 'Failed to get quote', err)
        setQuoteError(err.message || t('goldFlow.sell.quoteErrorDescription'))
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

  // Format swap provider name for display
  const getProviderDisplayName = (provider: string | undefined) => {
    if (!provider) return null
    const providerLower = provider.toLowerCase()
    if (providerLower.includes('squid')) return 'Squid Router'
    if (providerLower.includes('uniswap')) return 'Uniswap'
    if (providerLower.includes('0x')) return '0x Protocol'
    // Capitalize first letter
    return provider.charAt(0).toUpperCase() + provider.slice(1)
  }

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
              <Text style={styles.tokenAmount}>
                {parsedToAmount.toFormat(toToken.decimals)} {getTokenName(toToken)}
              </Text>
              <TokenDisplay
                tokenId={toTokenId}
                amount={parsedToAmount}
                showLocalAmount
                style={styles.tokenLocalValue}
              />
            </View>
          </View>
        </View>

        {/* Transaction Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('goldFlow.sell.goldPrice')}</Text>
            <Text style={styles.detailValue}>
              {localCurrencySymbol}
              {localPricePerOz?.toFormat(2) ?? parsedPricePerOz.toFormat(2)} / oz
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('goldFlow.sell.networkFee')}</Text>
            <Text style={styles.detailValue}>
              {isGettingQuote
                ? t('goldFlow.sell.estimatingFee')
                : parsedGasFee && gasFeeToken
                  ? `${parsedGasFee.toFormat(6)} ${getTokenName(gasFeeToken)}`
                  : t('goldFlow.sell.estimatingFee')}
            </Text>
          </View>
          {!!swapProvider && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('goldFlow.sell.swapProvider')}</Text>
              <Text style={styles.detailValue}>{getProviderDisplayName(swapProvider)}</Text>
            </View>
          )}
        </View>

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
            disabled={isSubmitting || isGettingQuote || !preparedTransactions}
            showLoading={isSubmitting || isGettingQuote}
            testID="GoldSellConfirmation/ConfirmButton"
          />
        </View>
      </ScrollView>
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
