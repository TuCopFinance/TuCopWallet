import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import BackButton from 'src/components/BackButton'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import TokenDisplay from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import CustomHeader from 'src/components/header/CustomHeader'
import { goldBuyStatusSelector, goldErrorSelector } from 'src/gold/selectors'
import { buyGoldStart, resetGoldFlow } from 'src/gold/slice'
import { XAUT0_DECIMALS } from 'src/gold/types'
import GoldIcon from 'src/icons/GoldIcon'
import { LocalCurrencyCode, LocalCurrencySymbol } from 'src/localCurrency/consts'
import {
  getLocalCurrencyCode,
  getLocalCurrencySymbol,
  usdToLocalCurrencyRateSelector,
} from 'src/localCurrency/selectors'
import { headerWithBackButton } from 'src/navigator/Headers'
import { navigate, navigateHome } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTokenInfo } from 'src/tokens/hooks'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldBuyConfirmation>

export default function GoldBuyConfirmation({ route }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const insets = useSafeAreaInsets()
  const {
    fromTokenId,
    fromAmount,
    xautAmount,
    pricePerOz,
    estimatedGasFee,
    gasFeeTokenId,
    preparedTransactions,
    toTokenId,
  } = route.params

  const buyStatus = useSelector(goldBuyStatusSelector)
  const goldError = useSelector(goldErrorSelector)

  const fromToken = useTokenInfo(fromTokenId)
  const gasFeeToken = useTokenInfo(gasFeeTokenId ?? '')
  const localCurrencyCode = useSelector(getLocalCurrencyCode)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)

  const isSubmitting = buyStatus === 'loading'
  const error = goldError

  // Navigate home on success
  useEffect(() => {
    if (buyStatus === 'success') {
      dispatch(resetGoldFlow())
      navigateHome()
      navigate(Screens.GoldHome)
    }
  }, [buyStatus, dispatch])

  // COP doesn't use decimals
  const isLocalCurrencyCop = localCurrencyCode === LocalCurrencyCode.COP
  const localPriceDecimals = isLocalCurrencyCop ? 0 : 2

  const parsedFromAmount = useMemo(() => new BigNumber(fromAmount), [fromAmount])
  const parsedXautAmount = useMemo(() => new BigNumber(xautAmount), [xautAmount])
  const parsedPricePerOz = useMemo(() => new BigNumber(pricePerOz), [pricePerOz])

  // Tokens always show 2 decimals for readability
  const tokenDisplayDecimals = 2

  // Display symbol override: cCOP -> COPm (Mento rebranding)
  const displaySymbol = fromToken?.symbol === 'cCOP' ? 'COPm' : fromToken?.symbol

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

  // Format gas fee display
  const gasFeeDisplaySymbol = gasFeeToken?.symbol === 'cCOP' ? 'COPm' : gasFeeToken?.symbol

  const onPressConfirm = () => {
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

  if (!fromToken) {
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
        {/* Swap Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardLabel}>{t('goldFlow.buy.youPay')}</Text>
          <View style={styles.tokenRow}>
            <TokenIcon token={fromToken} size={IconSize.MEDIUM} />
            <View style={styles.tokenInfo}>
              <Text style={styles.tokenAmount}>
                {parsedFromAmount.toFormat(tokenDisplayDecimals)} {displaySymbol}
              </Text>
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

        <View style={styles.summaryCard}>
          <Text style={styles.cardLabel}>{t('goldFlow.buy.youReceive')}</Text>
          <View style={styles.tokenRow}>
            <GoldIcon size={40} />
            <View style={styles.tokenInfo}>
              <Text style={styles.tokenAmount}>
                {parsedXautAmount.toFormat(XAUT0_DECIMALS)} XAUt0
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

        {/* Transaction Details */}
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
            <Text style={styles.detailLabel}>{t('goldFlow.buy.networkFee')}</Text>
            <Text style={styles.detailValue}>
              {parsedGasFee && gasFeeDisplaySymbol
                ? `${parsedGasFee.toFormat(6)} ${gasFeeDisplaySymbol}`
                : t('goldFlow.buy.estimatingFee')}
            </Text>
          </View>
        </View>

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
            disabled={isSubmitting || !preparedTransactions || !toTokenId}
            showLoading={isSubmitting}
            testID="GoldBuyConfirmation/ConfirmButton"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

GoldBuyConfirmation.navigationOptions = () => ({
  ...headerWithBackButton,
})

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
    ...typeScale.titleLarge,
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
