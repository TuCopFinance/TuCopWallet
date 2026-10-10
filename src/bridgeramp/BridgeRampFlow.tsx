import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import BridgeRampDeposit from 'src/bridgeramp/BridgeRampDeposit'
import BridgeRampWithdraw from 'src/bridgeramp/BridgeRampWithdraw'
import { useBridgeRampAvailability } from 'src/bridgeramp/useBridgeRampAvailability'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.BridgeRampFlow>

// Bridge Ramp entry screen: the off-ramp (BridgeRampWithdraw) or the on-ramp
// (BridgeRampDeposit) under a shared header. Gated by SHOW_BRIDGERAMP_*; the
// provider card only reaches this screen while the COPm oracle is fresh, and
// the notice below covers it going stale in-flow.
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
          <BridgeRampDeposit oracleStale={oracleStale} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: Spacing.Thick24 },
  title: { ...typeScale.titleMedium, color: Colors.black },
  by: { ...typeScale.labelSmall, color: Colors.gray4, marginBottom: Spacing.Small12 },
  body: { ...typeScale.bodyMedium, color: Colors.gray4, marginBottom: Spacing.Thick24 },
  notice: { marginBottom: Spacing.Regular16 },
})

export default BridgeRampFlow
