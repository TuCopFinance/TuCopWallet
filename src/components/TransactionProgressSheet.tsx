import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import type { ConfirmationNoun } from 'src/components/ConfirmationSheet'
import { useConnectivityState } from 'src/lib/connectivity'
import { useTransactionInFlight } from 'src/lib/useTransactionInFlight'
import type { FlowKind, InFlightStatus } from 'src/lib/useTransactionInFlight/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

export interface TransactionProgressSheetProps {
  scopeToFlowKind: FlowKind
  noun: ConfirmationNoun
  testID?: string
}

// Maps the descriptor `status` to the i18n key suffix under `progress.*`.
// Hyphenated statuses translate to camelCase keys (i18n keys cannot contain
// dashes when accessed via dotted lookups). `partial-failure` and `failed` are
// rendered by other components in the flow shell, so they yield `null` here.
const STATUS_TO_KEY: Record<InFlightStatus, string | null> = {
  idle: null,
  preparing: 'preparing',
  'awaiting-pin': 'awaitingPin',
  submitting: 'submitting',
  'pending-confirmation': 'pendingConfirmation',
  progress: 'multiStep',
  succeeded: 'succeeded',
  'partial-failure': null,
  failed: null,
}

export function TransactionProgressSheet(props: TransactionProgressSheetProps) {
  const { t } = useTranslation()
  const { current } = useTransactionInFlight({ scopeToFlowKind: props.scopeToFlowKind })
  const { isConnected } = useConnectivityState()

  if (!current) {
    return null
  }

  const keySuffix = STATUS_TO_KEY[current.status]
  if (!keySuffix) {
    return null
  }

  const messageKey = `progress.${keySuffix}`
  const tParams = {
    noun: props.noun,
    currentStep: current.currentStep + 1,
    total: current.steps,
  }

  const showConnectivityBanner =
    !isConnected && (current.status === 'submitting' || current.status === 'progress')

  return (
    <View testID={props.testID ?? 'TransactionProgressSheet'} style={styles.container}>
      <Text style={styles.message}>{t(messageKey, tParams)}</Text>
      {showConnectivityBanner && (
        <View testID="TransactionProgressSheet/ConnectivityBanner" style={styles.banner}>
          <Text style={styles.bannerText}>
            {t('progress.connectivityLost', { noun: props.noun })}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.Thick24,
    backgroundColor: Colors.white,
  },
  message: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    textAlign: 'center',
  },
  banner: {
    marginTop: Spacing.Regular16,
    padding: Spacing.Regular16,
    borderRadius: 12,
    backgroundColor: Colors.warningLight,
  },
  bannerText: {
    ...typeScale.bodySmall,
    color: Colors.warningDark,
    textAlign: 'center',
  },
})

export default TransactionProgressSheet
