import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import BridgeRampWithdraw from 'src/bridgeramp/BridgeRampWithdraw'
import { MentoQuote, USDC_DECIMALS } from 'src/bridgeramp/mentoRouter'
import { useBridgeRampAvailability } from 'src/bridgeramp/useBridgeRampAvailability'
import { useMentoQuote } from 'src/bridgeramp/useMentoQuote'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

// Bridge pays nothing below this (COP). Enforced here until TuCOPRamp returns
// limits for the wallet consumer.
const BRIDGE_MIN_COP = 4_000
// Rough USD estimate used only to size a USDC input from a COP amount for the
// on-ramp preview; the real number comes from the Mento quote itself.
const FALLBACK_COP_PER_USD = 3_200

type Props = NativeStackScreenProps<StackParamList, Screens.BridgeRampFlow>

// Bridge Ramp entry screen. The off-ramp is the full flow (BridgeRampWithdraw);
// the on-ramp shows the live USDC -> COPm conversion while TuCOPRamp's
// deposit side (virtual accounts for the wallet consumer) is built, with the
// continue button disabled so nothing moves funds yet. Gated by
// SHOW_BRIDGERAMP_*; the provider card only reaches this screen while the
// COPm oracle is fresh, and the notice below covers it going stale in-flow.
function BridgeRampFlow({ route }: Props) {
  const { t } = useTranslation()
  const direction = route.params.direction
  const availability = useBridgeRampAvailability(true)
  const oracleStale = availability.state === 'unavailable' || availability.state === 'error'

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t(`bridgeramp.${direction}.title`)}</Text>
        <Text style={styles.by}>{t('rampProviders.bridgeramp.by')}</Text>
        <Text style={styles.body}>{t(`bridgeramp.${direction}.explainer`)}</Text>

        {oracleStale && (
          <InLineNotification
            variant={NotificationVariant.Warning}
            description={t('rampProviders.bridgeramp.outsideHours')}
            style={styles.notice}
            testID="bridgeramp-oracle-stale"
          />
        )}

        {direction === 'offramp' ? (
          <BridgeRampWithdraw oracleStale={oracleStale} />
        ) : (
          <DepositPreview />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function DepositPreview() {
  const { t } = useTranslation()
  const [amountCop, setAmountCop] = useState('')
  const amountNum = Number(amountCop.replace(/[^0-9]/g, ''))
  const amountValid = Number.isFinite(amountNum) && amountNum >= BRIDGE_MIN_COP
  const amountIn = useMemo(
    () =>
      amountValid
        ? BigInt(
            new BigNumber(amountNum)
              .dividedBy(FALLBACK_COP_PER_USD)
              .shiftedBy(USDC_DECIMALS)
              .toFixed(0)
          )
        : null,
    [amountNum, amountValid]
  )
  const quoteState = useMentoQuote('usdcToCopm', amountIn)

  return (
    <View>
      {quoteState.state === 'oracle-unavailable' && (
        <InLineNotification
          variant={NotificationVariant.Warning}
          description={t('rampProviders.bridgeramp.outsideHours')}
          style={styles.notice}
          testID="bridgeramp-oracle-stale"
        />
      )}
      <Text style={styles.label}>{t('bridgeramp.amountLabel')}</Text>
      <TextInput
        style={styles.input}
        value={amountCop}
        onChangeText={setAmountCop}
        keyboardType="number-pad"
        placeholder={t('bridgeramp.amountPlaceholder') ?? ''}
        placeholderTextColor={Colors.gray4}
        testID="bridgeramp-amount"
      />
      {amountCop.length > 0 && !amountValid && (
        <Text style={styles.helperError}>
          {t('bridgeramp.amountBelowMin', { min: BRIDGE_MIN_COP.toLocaleString('es-CO') })}
        </Text>
      )}

      {quoteState.state === 'loading' && <ActivityIndicator style={styles.spinner} />}
      {quoteState.state === 'ready' && (
        <View style={styles.quoteBox} testID="bridgeramp-quote">
          <Row
            label={t('bridgeramp.onramp.quoteIn')}
            value={formatAmount(quoteState.quote, 'in')}
          />
          <Row
            label={t('bridgeramp.onramp.quoteOut')}
            value={formatAmount(quoteState.quote, 'out')}
          />
          <Row
            label={t('bridgeramp.rateLabel')}
            value={`${quoteState.quote.copPerUsd.toFormat(2)} COP / USD`}
          />
          <Text style={styles.quoteNote}>{t('bridgeramp.quoteNote')}</Text>
        </View>
      )}
      {quoteState.state === 'error' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.quoteError')}
          style={styles.notice}
        />
      )}

      <Button
        text={t('bridgeramp.continueCta')}
        onPress={() => undefined}
        disabled
        type={BtnTypes.PRIMARY}
        size={BtnSizes.FULL}
        style={styles.cta}
        testID="bridgeramp-continue"
      />
      <Text style={styles.comingSoon}>{t('bridgeramp.onramp.comingSoon')}</Text>
    </View>
  )
}

function formatAmount(quote: MentoQuote, side: 'in' | 'out'): string {
  const whole = side === 'in' ? quote.amountInWhole : quote.amountOutWhole
  const isCopm = (quote.direction === 'copmToUsdc') === (side === 'in')
  return isCopm ? `${whole.toFormat(0)} pesos digitales` : `${whole.toFormat(2)} USDC`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: Spacing.Thick24 },
  title: { ...typeScale.titleMedium, color: Colors.black },
  by: { ...typeScale.labelSmall, color: Colors.gray4, marginBottom: Spacing.Small12 },
  body: { ...typeScale.bodyMedium, color: Colors.gray4, marginBottom: Spacing.Thick24 },
  notice: { marginBottom: Spacing.Regular16 },
  label: { ...typeScale.labelSmall, color: Colors.gray4, marginBottom: Spacing.Smallest8 },
  input: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: Spacing.Smallest8,
    padding: Spacing.Small12,
  },
  helperError: { ...typeScale.bodySmall, color: Colors.error, marginTop: Spacing.Smallest8 },
  spinner: { marginTop: Spacing.Regular16 },
  quoteBox: {
    marginTop: Spacing.Regular16,
    padding: Spacing.Regular16,
    borderRadius: Spacing.Small12,
    backgroundColor: Colors.gray1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.Smallest8 },
  rowLabel: { ...typeScale.bodySmall, color: Colors.gray4 },
  rowValue: { ...typeScale.labelSemiBoldMedium, color: Colors.black },
  quoteNote: { ...typeScale.bodySmall, color: Colors.gray4, marginTop: Spacing.Smallest8 },
  cta: { marginTop: Spacing.Thick24 },
  comingSoon: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Smallest8,
    textAlign: 'center',
  },
})

export default BridgeRampFlow
