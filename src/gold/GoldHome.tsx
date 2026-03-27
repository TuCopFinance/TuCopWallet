import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import { hideWalletBalancesSelector } from 'src/app/selectors'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import {
  goldPriceUsdSelector,
  goldPrice24hChangeSelector,
  goldPriceFetchStatusSelector,
} from 'src/gold/selectors'
import { fetchGoldPrice } from 'src/gold/slice'
import GoldIcon from 'src/icons/GoldIcon'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { headerWithBackButton } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { tokensByIdSelector } from 'src/tokens/selectors'
import { getSupportedNetworkIdsForTokenBalances } from 'src/tokens/utils'
import { XAUT0_TOKEN_ID_MAINNET, XAUT0_TOKEN_ID_STAGING } from 'src/web3/networkConfig'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldHome>

export default function GoldHome(_props: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const insets = useSafeAreaInsets()
  const { decimalSeparator } = getNumberFormatSettings()

  const goldPriceUsd = useSelector(goldPriceUsdSelector)
  const goldPrice24hChange = useSelector(goldPrice24hChangeSelector)
  const priceFetchStatus = useSelector(goldPriceFetchStatusSelector)
  const hideWalletBalances = useSelector(hideWalletBalancesSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)

  const tokensById = useSelector((state) =>
    tokensByIdSelector(state, getSupportedNetworkIdsForTokenBalances())
  )

  // Get XAUt0 token balance
  const xaut0Token =
    tokensById[XAUT0_TOKEN_ID_MAINNET] || tokensById[XAUT0_TOKEN_ID_STAGING] || null
  const xaut0Balance = xaut0Token?.balance ? new BigNumber(xaut0Token.balance) : new BigNumber(0)

  const [refreshing, setRefreshing] = React.useState(false)

  useEffect(() => {
    dispatch(fetchGoldPrice())
  }, [dispatch])

  const onRefresh = React.useCallback(() => {
    setRefreshing(true)
    dispatch(fetchGoldPrice())
    setTimeout(() => setRefreshing(false), 1000)
  }, [dispatch])

  // Convert USD price to local currency
  const localPrice = React.useMemo(() => {
    if (!goldPriceUsd || !usdToLocalRate) return null
    return new BigNumber(goldPriceUsd).multipliedBy(usdToLocalRate)
  }, [goldPriceUsd, usdToLocalRate])

  // Calculate holdings value in local currency
  const holdingsValueLocal = React.useMemo(() => {
    if (!localPrice || xaut0Balance.isZero()) return null
    return xaut0Balance.multipliedBy(localPrice)
  }, [localPrice, xaut0Balance])

  const priceDisplay = React.useMemo(() => {
    if (hideWalletBalances) return `XX${decimalSeparator}XX`
    if (!localPrice) return '--'
    return localPrice.toFormat(2)
  }, [hideWalletBalances, localPrice, decimalSeparator])

  const holdingsDisplay = React.useMemo(() => {
    if (hideWalletBalances) return `XX${decimalSeparator}XX`
    if (!holdingsValueLocal) return '0.00'
    return holdingsValueLocal.toFormat(2)
  }, [hideWalletBalances, holdingsValueLocal, decimalSeparator])

  const balanceDisplay = React.useMemo(() => {
    if (hideWalletBalances) return `X${decimalSeparator}XXXX`
    return xaut0Balance.toFormat(4)
  }, [hideWalletBalances, xaut0Balance, decimalSeparator])

  const changeDisplay = React.useMemo(() => {
    if (!goldPrice24hChange) return null
    const isPositive = goldPrice24hChange >= 0
    const sign = isPositive ? '+' : ''
    return {
      text: `${sign}${goldPrice24hChange.toFixed(2)}%`,
      color: isPositive ? Colors.accent : Colors.error,
    }
  }, [goldPrice24hChange])

  const onPressBuy = () => {
    AppAnalytics.track(GoldEvents.gold_buy_press)
    navigate(Screens.GoldBuyEnterAmount)
  }

  const onPressSell = () => {
    AppAnalytics.track(GoldEvents.gold_sell_press)
    navigate(Screens.GoldSellEnterAmount)
  }

  // TODO: Enable when price alerts feature is ready
  // const onPressPriceAlerts = () => {
  //   AppAnalytics.track(GoldEvents.gold_price_alerts_press)
  //   navigate(Screens.GoldPriceAlerts)
  // }

  const insetsStyle = {
    paddingBottom: Math.max(insets.bottom, Spacing.Regular16),
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || priceFetchStatus === 'loading'}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Gold Icon and Title */}
        <View style={styles.headerSection}>
          <GoldIcon size={64} />
          <Text style={styles.title}>{t('goldFlow.home.title')}</Text>
        </View>

        {/* Current Price Card */}
        <View style={styles.priceCard}>
          <Text style={styles.cardLabel}>{t('goldFlow.home.currentPrice')}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>
              {!hideWalletBalances && localCurrencySymbol}
              {priceDisplay}
            </Text>
            <Text style={styles.priceUnit}> / oz</Text>
          </View>
          {changeDisplay && (
            <Text style={[styles.changeText, { color: changeDisplay.color }]}>
              {changeDisplay.text} {t('goldFlow.home.last24h')}
            </Text>
          )}
        </View>

        {/* Holdings Card */}
        <View style={styles.holdingsCard}>
          <Text style={styles.cardLabel}>{t('goldFlow.home.yourHoldings')}</Text>
          <Text style={styles.holdingsValue}>
            {!hideWalletBalances && localCurrencySymbol}
            {holdingsDisplay}
          </Text>
          <Text style={styles.holdingsBalance}>{balanceDisplay} XAUt0</Text>
        </View>

        {/* Price Alerts Link - Coming Soon */}
        <Button
          onPress={() => {}}
          text={`${t('goldFlow.home.priceAlerts')} (Coming Soon)`}
          type={BtnTypes.TERTIARY}
          size={BtnSizes.MEDIUM}
          style={styles.alertsButton}
          disabled={true}
          testID="GoldHome/PriceAlertsButton"
        />
      </ScrollView>

      {/* Action Buttons */}
      <View style={[styles.buttonContainer, insetsStyle]}>
        <View style={styles.buttonWrapper}>
          <Button
            onPress={onPressSell}
            text={t('goldFlow.home.sell')}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.FULL}
            disabled={xaut0Balance.isZero()}
            testID="GoldHome/SellButton"
          />
        </View>
        <View style={styles.buttonWrapper}>
          <Button
            onPress={onPressBuy}
            text={t('goldFlow.home.buy')}
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            testID="GoldHome/BuyButton"
          />
        </View>
      </View>
    </View>
  )
}

GoldHome.navigationOptions = () => ({
  ...headerWithBackButton,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.Regular16,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: Spacing.Thick24,
    marginTop: Spacing.Regular16,
  },
  title: {
    ...typeScale.titleLarge,
    color: Colors.primary,
    marginTop: Spacing.Regular16,
  },
  priceCard: {
    backgroundColor: Colors.gray1,
    borderRadius: Spacing.Small12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
  },
  cardLabel: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceValue: {
    ...typeScale.titleLarge,
    color: Colors.black,
  },
  priceUnit: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
  changeText: {
    ...typeScale.bodySmall,
    marginTop: Spacing.Tiny4,
  },
  holdingsCard: {
    backgroundColor: Colors.gray1,
    borderRadius: Spacing.Small12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
  },
  holdingsValue: {
    ...typeScale.titleLarge,
    color: Colors.black,
  },
  holdingsBalance: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Tiny4,
  },
  alertsButton: {
    alignSelf: 'center',
    marginTop: Spacing.Smallest8,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.Smallest8,
    paddingHorizontal: Spacing.Regular16,
    paddingTop: Spacing.Regular16,
    borderTopWidth: 1,
    borderTopColor: Colors.gray2,
  },
  buttonWrapper: {
    flex: 1,
  },
})
