import * as React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

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

export interface ReviewRow {
  label: string
  value: React.ReactNode
}

export interface ConfirmationSheetProps {
  visible: boolean
  noun: ConfirmationNoun
  reviewRows: ReviewRow[]
  onConfirm: () => void
  onCancel: () => void
  confirmDisabled?: boolean
  testID?: string
}

export function ConfirmationSheet(props: ConfirmationSheetProps) {
  const { t } = useTranslation()
  const [showAdvisory, setShowAdvisory] = useState(false)

  if (!props.visible) {
    return null
  }

  const advisoryText = t('preflight.advisory', {
    defaultValue:
      'Estamos por iniciar tu {{noun}}. No cierres la app y asegúrate de tener buena conexión.',
    noun: props.noun,
  })

  const handleConfirmPress = () => {
    setShowAdvisory(true)
  }

  const handleAdvisoryContinue = () => {
    setShowAdvisory(false)
    props.onConfirm()
  }

  const handleAdvisoryCancel = () => {
    setShowAdvisory(false)
  }

  return (
    <View testID={props.testID ?? 'ConfirmationSheet'} style={styles.container}>
      <View style={styles.rowsContainer}>
        {props.reviewRows.map((row, i) => (
          <View key={i} style={styles.row} testID={`ConfirmationSheet/Row/${i}`}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
          </View>
        ))}
      </View>
      <Pressable
        testID="ConfirmationSheet/Confirm"
        onPress={handleConfirmPress}
        disabled={props.confirmDisabled}
        style={[
          styles.button,
          styles.confirmButton,
          props.confirmDisabled && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.confirmButtonText}>{t('confirm', { defaultValue: 'Confirmar' })}</Text>
      </Pressable>
      <Pressable
        testID="ConfirmationSheet/Cancel"
        onPress={props.onCancel}
        style={[styles.button, styles.cancelButton]}
      >
        <Text style={styles.cancelButtonText}>{t('cancel', { defaultValue: 'Cancelar' })}</Text>
      </Pressable>
      <Modal
        visible={showAdvisory}
        transparent
        animationType="fade"
        onRequestClose={handleAdvisoryCancel}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent} testID="ConfirmationSheet/Advisory">
            <Text style={styles.advisoryText}>{advisoryText}</Text>
            <Pressable
              testID="ConfirmationSheet/Advisory/Continue"
              onPress={handleAdvisoryContinue}
              style={[styles.button, styles.confirmButton]}
            >
              <Text style={styles.confirmButtonText}>
                {t('continue', { defaultValue: 'Continuar' })}
              </Text>
            </Pressable>
            <Pressable
              testID="ConfirmationSheet/Advisory/Cancel"
              onPress={handleAdvisoryCancel}
              style={[styles.button, styles.cancelButton]}
            >
              <Text style={styles.cancelButtonText}>
                {t('cancel', { defaultValue: 'Cancelar' })}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.Thick24,
    backgroundColor: Colors.white,
  },
  rowsContainer: {
    marginBottom: Spacing.Thick24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.Smallest8,
  },
  rowLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  rowValue: {
    ...typeScale.bodyMedium,
    color: Colors.black,
  },
  button: {
    paddingVertical: Spacing.Regular16,
    borderRadius: 100,
    alignItems: 'center',
    marginTop: Spacing.Smallest8,
  },
  confirmButton: {
    backgroundColor: Colors.accent,
  },
  confirmButtonText: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.white,
  },
  cancelButton: {
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.Thick24,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: Spacing.Thick24,
    width: '100%',
  },
  advisoryText: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    marginBottom: Spacing.Thick24,
    textAlign: 'center',
  },
})

export default ConfirmationSheet
