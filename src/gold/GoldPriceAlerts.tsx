import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Keyboard, StyleSheet, Switch, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import BackButton from 'src/components/BackButton'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import TextInput from 'src/components/TextInput'
import Touchable from 'src/components/Touchable'
import CustomHeader from 'src/components/header/CustomHeader'
import { goldPriceUsdSelector, priceAlertsSelector } from 'src/gold/selectors'
import { addPriceAlert, removePriceAlert, updatePriceAlert } from 'src/gold/slice'
import { PriceAlert } from 'src/gold/types'
import GoldIcon from 'src/icons/GoldIcon'
import { LocalCurrencySymbol } from 'src/localCurrency/consts'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { headerWithBackButton } from 'src/navigator/Headers'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { parseInputAmount } from 'src/utils/parsing'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldPriceAlerts>

export default function GoldPriceAlerts(_props: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const insets = useSafeAreaInsets()
  const { decimalSeparator } = getNumberFormatSettings()

  const goldPriceUsd = useSelector(goldPriceUsdSelector)
  const priceAlerts = useSelector(priceAlertsSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)

  const [priceInput, setPriceInput] = useState<string>('')
  const [direction, setDirection] = useState<'above' | 'below'>('above')

  // Convert current gold price to local currency
  const currentLocalPrice =
    goldPriceUsd && usdToLocalRate ? new BigNumber(goldPriceUsd).multipliedBy(usdToLocalRate) : null

  const priceRegex = new RegExp(
    `^(?:\\d+[${decimalSeparator}]?\\d*|[${decimalSeparator}]\\d*|[${decimalSeparator}])$`
  )

  const onPriceInputChange = (value: string) => {
    if (!value) {
      setPriceInput('')
    } else {
      if (value.startsWith(decimalSeparator)) {
        value = `0${value}`
      }
      if (value.match(priceRegex)) {
        setPriceInput(value)
      }
    }
  }

  const parsedPrice = parseInputAmount(priceInput, decimalSeparator)
  const isValidPrice = parsedPrice && parsedPrice.gt(0)

  const onCreateAlert = () => {
    if (!isValidPrice || !usdToLocalRate) return

    // Convert local price back to USD for storage
    const priceUsd = parsedPrice.dividedBy(usdToLocalRate).toNumber()

    // addPriceAlert expects Omit<PriceAlert, 'id' | 'createdAt'> - the slice adds id and createdAt
    dispatch(
      addPriceAlert({
        targetPrice: priceUsd,
        direction,
        enabled: true,
      })
    )
    AppAnalytics.track(GoldEvents.gold_price_alert_create, {
      targetPrice: priceUsd,
      direction,
    })

    // Reset form
    setPriceInput('')
    Keyboard.dismiss()
  }

  const onToggleAlert = (alertId: string, enabled: boolean) => {
    dispatch(updatePriceAlert({ id: alertId, updates: { enabled } }))
    AppAnalytics.track(GoldEvents.gold_price_alert_toggle, {
      alertId,
      enabled,
    })
  }

  const onDeleteAlert = (alertId: string) => {
    dispatch(removePriceAlert(alertId))
    AppAnalytics.track(GoldEvents.gold_price_alert_delete, {
      alertId,
    })
  }

  const renderAlert = ({ item }: { item: PriceAlert }) => {
    const localTargetPrice = usdToLocalRate
      ? new BigNumber(item.targetPrice).multipliedBy(usdToLocalRate)
      : new BigNumber(item.targetPrice)

    return (
      <View style={styles.alertItem}>
        <View style={styles.alertInfo}>
          <Text style={styles.alertDirection}>
            {item.direction === 'above'
              ? t('goldFlow.priceAlerts.priceAbove')
              : t('goldFlow.priceAlerts.priceBelow')}
          </Text>
          <Text style={styles.alertPrice}>
            {localCurrencySymbol}
            {localTargetPrice.toFormat(2)} / oz
          </Text>
        </View>
        <View style={styles.alertActions}>
          <Switch
            value={item.enabled}
            onValueChange={(enabled) => onToggleAlert(item.id, enabled)}
            trackColor={{ false: Colors.gray2, true: Colors.accent }}
            thumbColor={Colors.white}
          />
          <Touchable
            onPress={() => onDeleteAlert(item.id)}
            style={styles.deleteButton}
            testID={`PriceAlert/Delete/${item.id}`}
          >
            <Text style={styles.deleteText}>{t('goldFlow.priceAlerts.delete')}</Text>
          </Touchable>
        </View>
      </View>
    )
  }

  const insetsStyle = {
    paddingBottom: Math.max(insets.bottom, Spacing.Regular16),
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CustomHeader
        style={{ paddingHorizontal: Spacing.Thick24 }}
        left={<BackButton />}
        title={t('goldFlow.priceAlerts.title')}
      />
      <View style={[styles.content, insetsStyle]}>
        {/* Current Price Display */}
        {currentLocalPrice && (
          <View style={styles.currentPriceCard}>
            <GoldIcon size={32} />
            <View style={styles.priceInfo}>
              <Text style={styles.currentPriceLabel}>{t('goldFlow.priceAlerts.currentPrice')}</Text>
              <Text style={styles.currentPriceValue}>
                {localCurrencySymbol}
                {currentLocalPrice.toFormat(2)} / oz
              </Text>
            </View>
          </View>
        )}

        {/* Create Alert Form */}
        <View style={styles.createAlertCard}>
          <Text style={styles.sectionTitle}>{t('goldFlow.priceAlerts.createAlert')}</Text>

          <View style={styles.directionRow}>
            <Touchable
              onPress={() => setDirection('above')}
              style={[
                styles.directionButton,
                direction === 'above' && styles.directionButtonActive,
              ]}
              testID="PriceAlerts/DirectionAbove"
            >
              <Text
                style={[styles.directionText, direction === 'above' && styles.directionTextActive]}
              >
                {t('goldFlow.priceAlerts.above')}
              </Text>
            </Touchable>
            <Touchable
              onPress={() => setDirection('below')}
              style={[
                styles.directionButton,
                direction === 'below' && styles.directionButtonActive,
              ]}
              testID="PriceAlerts/DirectionBelow"
            >
              <Text
                style={[styles.directionText, direction === 'below' && styles.directionTextActive]}
              >
                {t('goldFlow.priceAlerts.below')}
              </Text>
            </Touchable>
          </View>

          <View style={styles.priceInputRow}>
            <Text style={styles.currencyPrefix}>{localCurrencySymbol}</Text>
            <TextInput
              value={priceInput}
              onChangeText={onPriceInputChange}
              placeholder="0.00"
              keyboardType="decimal-pad"
              style={styles.priceInput}
              testID="PriceAlerts/PriceInput"
            />
            <Text style={styles.priceSuffix}>/ oz</Text>
          </View>

          <Button
            onPress={onCreateAlert}
            text={t('goldFlow.priceAlerts.createButton')}
            size={BtnSizes.FULL}
            type={BtnTypes.PRIMARY}
            disabled={!isValidPrice}
            testID="PriceAlerts/CreateButton"
          />
        </View>

        {/* Alert List */}
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>{t('goldFlow.priceAlerts.yourAlerts')}</Text>
          {priceAlerts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('goldFlow.priceAlerts.noAlerts')}</Text>
            </View>
          ) : (
            <FlatList
              data={priceAlerts}
              renderItem={renderAlert}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.alertsList}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

GoldPriceAlerts.navigationOptions = () => ({
  ...headerWithBackButton,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.Thick24,
    paddingTop: Spacing.Regular16,
  },
  currentPriceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray1,
    borderRadius: Spacing.Small12,
    padding: Spacing.Regular16,
    gap: Spacing.Small12,
    marginBottom: Spacing.Regular16,
  },
  priceInfo: {
    flex: 1,
  },
  currentPriceLabel: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
  },
  currentPriceValue: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginTop: Spacing.Tiny4,
  },
  createAlertCard: {
    backgroundColor: Colors.gray1,
    borderRadius: Spacing.Small12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    gap: Spacing.Regular16,
  },
  sectionTitle: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
  },
  directionRow: {
    flexDirection: 'row',
    gap: Spacing.Smallest8,
  },
  directionButton: {
    flex: 1,
    paddingVertical: Spacing.Small12,
    paddingHorizontal: Spacing.Regular16,
    borderRadius: Spacing.Smallest8,
    borderWidth: 1,
    borderColor: Colors.gray2,
    alignItems: 'center',
  },
  directionButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  directionText: {
    ...typeScale.labelMedium,
    color: Colors.gray4,
  },
  directionTextActive: {
    color: Colors.white,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Spacing.Smallest8,
    borderWidth: 1,
    borderColor: Colors.gray2,
    paddingHorizontal: Spacing.Regular16,
  },
  currencyPrefix: {
    ...typeScale.titleMedium,
    color: Colors.black,
  },
  priceInput: {
    flex: 1,
    ...typeScale.titleMedium,
    color: Colors.black,
    paddingVertical: Spacing.Small12,
    paddingHorizontal: Spacing.Smallest8,
  },
  priceSuffix: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
  alertsSection: {
    flex: 1,
  },
  alertsList: {
    paddingTop: Spacing.Small12,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.Small12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray2,
  },
  alertInfo: {
    flex: 1,
  },
  alertDirection: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
  },
  alertPrice: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    marginTop: Spacing.Tiny4,
  },
  alertActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Small12,
  },
  deleteButton: {
    padding: Spacing.Smallest8,
  },
  deleteText: {
    ...typeScale.labelSmall,
    color: Colors.error,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.Thick24,
  },
  emptyText: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
})
