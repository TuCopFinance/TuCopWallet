import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  COPM_DECIMALS,
  MentoOracleUnavailableError,
  MentoQuote,
  USDC_DECIMALS,
  quoteMentoSwap,
} from 'src/bridgeramp/mentoRouter'
import { useBridgeRampAvailability } from 'src/bridgeramp/useBridgeRampAvailability'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'

const TAG = 'bridgeramp/BridgeRampFlow'

// Debounce user typing before asking the chain for a quote.
const QUOTE_DEBOUNCE_MS = 400
// Bridge pays nothing below this (COP). Enforced here until TuCOPRamp returns
// limits for the wallet consumer.
const BRIDGE_MIN_COP = 4_000
// Rough USD estimate used only to size a USDC input from a COP amount for the
// on-ramp preview; the real number comes from the Mento quote itself.
const FALLBACK_COP_PER_USD = 3_200

type Props = NativeStackScreenProps<StackParamList, Screens.BridgeRampFlow>

type QuoteState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; quote: MentoQuote }
  | { state: 'oracle-unavailable' }
  | { state: 'error' }

// First slice of Bridge Ramp in the wallet: the user sees the live Mento
// conversion for the amount they type, in both directions, while the
// TuCOPRamp side (`/v1/withdraw`, `/v1/deposit`, party sessions) is built.
// The continue button stays disabled until those endpoints exist, so nothing
// here moves funds yet. Gated by SHOW_BRIDGERAMP_*; the provider card only
// reaches this screen while the COPm oracle is fresh.
function BridgeRampFlow({ route }: Props) {
  const { t } = useTranslation()
  const direction = route.params.direction
  const availability = useBridgeRampAvailability(true)
  const [amountCop, setAmountCop] = useState('')
  const [quoteState, setQuoteState] = useState<QuoteState>({ state: 'idle' })

  const amountNum = Number(amountCop.replace(/[^0-9]/g, ''))
  const amountValid = Number.isFinite(amountNum) && amountNum >= BRIDGE_MIN_COP

  useEffect(() => {
    if (!amountValid) {
      setQuoteState({ state: 'idle' })
      return
    }
    let cancelled = false
    setQuoteState({ state: 'loading' })
    const timer = setTimeout(() => {
      const amountIn =
        direction === 'offramp'
          ? BigInt(new BigNumber(amountNum).shiftedBy(COPM_DECIMALS).toFixed(0))
          : BigInt(
              new BigNumber(amountNum)
                .dividedBy(FALLBACK_COP_PER_USD)
                .shiftedBy(USDC_DECIMALS)
                .toFixed(0)
            )
      quoteMentoSwap(direction === 'offramp' ? 'copmToUsdc' : 'usdcToCopm', amountIn)
        .then((quote) => {
          if (!cancelled) setQuoteState({ state: 'ready', quote })
        })
        .catch((error) => {
          if (cancelled) return
          if (error instanceof MentoOracleUnavailableError) {
            setQuoteState({ state: 'oracle-unavailable' })
            return
          }
          Logger.warn(TAG, 'quote failed', error)
          setQuoteState({ state: 'error' })
        })
    }, QUOTE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [amountNum, amountValid, direction])

  const oracleStale =
    availability.state === 'unavailable' ||
    availability.state === 'error' ||
    quoteState.state === 'oracle-unavailable'

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
              label={t(`bridgeramp.${direction}.quoteIn`)}
              value={formatAmount(quoteState.quote, 'in')}
            />
            <Row
              label={t(`bridgeramp.${direction}.quoteOut`)}
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
        <Text style={styles.comingSoon}>{t('bridgeramp.comingSoon')}</Text>
      </ScrollView>
    </SafeAreaView>
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
