import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import { hideWalletBalancesSelector } from 'src/app/selectors'
import Touchable from 'src/components/Touchable'
import { goldPriceUsdSelector, goldPrice24hChangeSelector } from 'src/gold/selectors'
import { fetchGoldPrice } from 'src/gold/slice'
import GoldIcon from 'src/icons/GoldIcon'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import BigNumber from 'bignumber.js'

const PRICE_REFRESH_INTERVAL = 60000 // 60 seconds

export default function GoldEntrypoint() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const { decimalSeparator } = getNumberFormatSettings()

  const goldPriceUsd = useSelector(goldPriceUsdSelector)
  const goldPrice24hChange = useSelector(goldPrice24hChangeSelector)
  const hideWalletBalances = useSelector(hideWalletBalancesSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)

  useEffect(() => {
    // Fetch gold price on mount
    dispatch(fetchGoldPrice())

    // Set up periodic refresh
    const interval = setInterval(() => {
      dispatch(fetchGoldPrice())
    }, PRICE_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [dispatch])

  const onPress = () => {
    AppAnalytics.track(GoldEvents.gold_entrypoint_press)
    navigate(Screens.GoldInfoScreen)
  }

  // Convert USD price to local currency
  const localPrice = React.useMemo(() => {
    if (!goldPriceUsd || !usdToLocalRate) return null
    return new BigNumber(goldPriceUsd).multipliedBy(usdToLocalRate)
  }, [goldPriceUsd, usdToLocalRate])

  const priceDisplay = React.useMemo(() => {
    if (hideWalletBalances) return `XX${decimalSeparator}XX`
    if (!localPrice) return '--'
    return localPrice.toFormat(2)
  }, [hideWalletBalances, localPrice, decimalSeparator])

  const changeDisplay = React.useMemo(() => {
    if (!goldPrice24hChange) return null
    const isPositive = goldPrice24hChange >= 0
    const sign = isPositive ? '+' : ''
    return {
      text: `${sign}${goldPrice24hChange.toFixed(2)}%`,
      color: isPositive ? Colors.accent : Colors.error,
    }
  }, [goldPrice24hChange])

  return (
    <Touchable
      style={styles.container}
      borderRadius={Spacing.Small12}
      onPress={onPress}
      testID="GoldEntrypoint"
    >
      <View style={styles.row}>
        <GoldIcon size={36} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>{t('goldFlow.entrypoint.title')}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {!hideWalletBalances && localCurrencySymbol}
              {priceDisplay}
              <Text style={styles.unit}> / oz</Text>
            </Text>
            {changeDisplay && (
              <Text style={[styles.change, { color: changeDisplay.color }]}>
                {changeDisplay.text}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Touchable>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    padding: 16,
    width: '100%',
    borderRadius: Spacing.Small12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typeScale.bodySmall,
    color: Colors.gray6,
    letterSpacing: -0.16,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
    marginTop: 2,
  },
  price: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  unit: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
  },
  change: {
    ...typeScale.bodyXSmall,
    fontWeight: '600',
  },
})
