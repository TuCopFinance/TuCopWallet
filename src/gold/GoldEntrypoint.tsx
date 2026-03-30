import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { Shadow } from 'react-native-shadow-2'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import Touchable from 'src/components/Touchable'
import { goldPriceUsdSelector, hasSeenGoldInfoSelector } from 'src/gold/selectors'
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

  const goldPriceUsd = useSelector(goldPriceUsdSelector)
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

  // Gold price is public market data, should NOT be hidden when user hides balances
  const priceDisplay = React.useMemo(() => {
    if (!localPrice) return '--'
    return localPrice.toFormat(2)
  }, [localPrice])

  return (
    <Shadow style={styles.shadow} offset={[0, 4]} startColor="rgba(190, 201, 255, 0.28)">
      <Touchable
        style={styles.container}
        borderRadius={Spacing.Small12}
        onPress={onPress}
        testID="GoldEntrypoint"
      >
        <View style={[styles.cardContentRow, { paddingVertical: 8 }]}>
          <View style={styles.cardInnerContent}>
            <View style={styles.cardIconContainer}>
              <GoldIconSelector size={25} />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.title}>{t('goldFlow.entrypoint.investTitle')}</Text>
              <Text style={styles.brandText}>{t('goldFlow.entrypoint.subtitle')}</Text>
              <Text style={styles.subtitle} numberOfLines={1} adjustsFontSizeToFit>
                {localCurrencySymbol}
                {priceDisplay}
                <Text style={styles.unit}> / oz</Text>
              </Text>
            </View>
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
  cardContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingLeft: 40,
    paddingRight: 40,
  },
  cardInnerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 0,
  },
  cardIconContainer: {
    width: 57,
    height: 57,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#EEEFFF',
    borderRadius: 12,
  },
  cardTextContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.gray6,
    letterSpacing: -0.16,
  },
  brandText: {
    ...typeScale.bodyXSmall,
    color: Colors.gray5,
    marginBottom: 2,
  },
  subtitle: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
  },
  unit: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
  },
})
