import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ErrorClass } from 'src/lib/errors'
import type { ConnectivityTransition } from 'src/lib/connectivity'

// Local copy of the noun union. ConfirmationSheet (Track A Task 5) will export
// the canonical `ConfirmationNoun`; once it lands, swap this for an import.
export type ConfirmationNoun =
  | 'cambio'
  | 'envio'
  | 'retiro a pesos'
  | 'deposito'
  | 'retiro'
  | 'compra de oro'
  | 'venta de oro'
  | 'reclamo'
  | 'operacion'

export type ResultStatus = 'succeeded' | 'failed' | 'partial-failure'

export interface TransactionResultSheetProps {
  visible: boolean
  status: ResultStatus
  noun: ConfirmationNoun
  errorClass?: ErrorClass
  connectivityHistory?: ConnectivityTransition[]
  onRetry?: () => void
  onClose?: () => void
}

function disconnectDuringFlow(history?: ConnectivityTransition[]): boolean {
  if (!history || history.length === 0) return false
  return history.some((t) => !t.isConnected)
}

export function TransactionResultSheet(props: TransactionResultSheetProps) {
  const { t } = useTranslation()
  if (!props.visible) return null

  let messageKey = 'result.unknown'
  if (props.status === 'succeeded') {
    messageKey = 'result.succeeded'
  } else if (disconnectDuringFlow(props.connectivityHistory)) {
    messageKey = 'result.connectivity'
  } else if (props.errorClass) {
    switch (props.errorClass.kind) {
      case 'gas-insufficient':
        messageKey = 'result.gasInsufficient'
        break
      case 'slippage':
        messageKey = 'result.slippage'
        break
      case 'revert':
        messageKey = 'result.revert'
        break
      case 'rpc-timeout':
        messageKey = 'result.rpcTimeout'
        break
      case 'connectivity':
        messageKey = 'result.connectivity'
        break
      case 'app-backgrounded':
        messageKey = 'result.appBackgrounded'
        break
      default:
        messageKey = 'result.unknown'
    }
  }

  return (
    <View testID="TransactionResultSheet">
      <Text>{t(messageKey, { noun: props.noun })}</Text>
      {props.status !== 'succeeded' && props.onRetry && (
        <Pressable onPress={props.onRetry}>
          <Text>{t('common.retry', { defaultValue: 'Intentar de nuevo' })}</Text>
        </Pressable>
      )}
      {props.onClose && (
        <Pressable onPress={props.onClose}>
          <Text>{t('common.close', { defaultValue: 'Cerrar' })}</Text>
        </Pressable>
      )}
    </View>
  )
}

export default TransactionResultSheet
