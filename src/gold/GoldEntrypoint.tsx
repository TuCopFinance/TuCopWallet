import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { Shadow } from 'react-native-shadow-2'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import { hideWalletBalancesSelector } from 'src/app/selectors'
import Touchable from 'src/components/Touchable'
import {
  goldPriceUsdSelector,
  goldPrice24hChangeSelector,
  hasSeenGoldInfoSelector,
} from 'src/gold/selectors'
import { fetchGoldPrice } from 'src/gold/slice'
import { useXaut0Balance } from 'src/gold/useXaut0Balance'
import GoldIconSelector from 'src/gold/GoldIconSelector'
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

  // Get XAUt0 balance to determine if user has gold
  const { balance: xaut0Balance } = useXaut0Balance()
  const hasSeenGoldInfo = useSelector(hasSeenGoldInfoSelector)

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
    // Skip intro screen if user already has gold balance or has seen the info screen before
    if (xaut0Balance.isGreaterThan(0) || hasSeenGoldInfo) {
      navigate(Screens.GoldHome)
    } else {
      navigate(Screens.GoldInfoScreen)
    }
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
    <Shadow style={styles.shadow} offset={[0, 4]} startColor="rgba(190, 201, 255, 0.28)">
      <Touchable
        style={styles.container}
        borderRadius={Spacing.Small12}
        onPress={onPress}
        testID="GoldEntrypoint"
      >
        <View style={[styles.row, { paddingVertical: 8 }]}>
          <View style={styles.iconContainer}>
            <GoldIconSelector size={36} />
          </View>
          <View style={styles.textColumn}>
            <Text style={styles.title}>{t('goldFlow.entrypoint.title')}</Text>
            <Text style={styles.subtitle} numberOfLines={1} adjustsFontSizeToFit>
              {!hideWalletBalances && localCurrencySymbol}
              {priceDisplay}
              <Text style={styles.unit}> / oz</Text>
              {changeDisplay && (
                <Text style={[styles.change, { color: changeDisplay.color }]}>
                  {'   '}
                  {changeDisplay.text}
                </Text>
              )}
            </Text>
          </View>
        </View>
      </Touchable>
    </Shadow>
  )
}

const styles = StyleSheet.create({
  shadow: {
    width: '100%',
    borderRadius: 15,
  },
  container: {
    backgroundColor: 'white',
    padding: Platform.select({ ios: 16, android: 13 }),
    width: '100%',
    borderRadius: Spacing.Small12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  title: {
    ...typeScale.bodySmall,
    color: Colors.gray6,
    letterSpacing: -0.16,
    fontWeight: '600',
  },
  subtitle: {
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
