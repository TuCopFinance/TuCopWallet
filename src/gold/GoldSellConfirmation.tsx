import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import BackButton from 'src/components/BackButton'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import TokenDisplay from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import CustomHeader from 'src/components/header/CustomHeader'
import { XAUT0_DECIMALS } from 'src/gold/types'
import GoldIcon from 'src/icons/GoldIcon'
import { LocalCurrencySymbol } from 'src/localCurrency/consts'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { headerWithBackButton } from 'src/navigator/Headers'
import { navigate, navigateHome } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTokenInfo } from 'src/tokens/hooks'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldSellConfirmation>

export default function GoldSellConfirmation({ route }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { toTokenId, xautAmount, toAmount, pricePerOz } = route.params

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toToken = useTokenInfo(toTokenId)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)

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

  const onPressConfirm = async () => {
    if (!toToken) return

    setIsSubmitting(true)
    setError(null)

    try {
      AppAnalytics.track(GoldEvents.gold_sell_submit_start, {
        amount: xautAmount,
      })

      // TODO: Execute the actual swap transaction via Squid Router
      // For now, simulate a delay and show success
      await new Promise((resolve) => setTimeout(resolve, 2000))

      AppAnalytics.track(GoldEvents.gold_sell_submit_success, {
        amount: xautAmount,
        txHash: '', // TODO: Add actual txHash when swap is implemented
      })

      // Navigate back to gold home with success message
      navigateHome()
      navigate(Screens.GoldHome)
    } catch (err: any) {
      AppAnalytics.track(GoldEvents.gold_sell_submit_error, {
        amount: xautAmount,
        error: err.message || 'Unknown error',
      })
      setError(err.message || t('goldFlow.sell.error'))
    } finally {
      setIsSubmitting(false)
    }
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
            <GoldIcon size={40} />
            <View style={styles.tokenInfo}>
              <Text style={styles.tokenAmount}>
                {parsedXautAmount.toFormat(XAUT0_DECIMALS)} XAUt0
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
                {parsedToAmount.toFormat(toToken.decimals)} {toToken.symbol}
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
            <Text style={styles.detailValue}>{t('goldFlow.sell.estimatingFee')}</Text>
          </View>
        </View>

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
            disabled={isSubmitting}
            showLoading={isSubmitting}
            testID="GoldSellConfirmation/ConfirmButton"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

GoldSellConfirmation.navigationOptions = () => ({
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
