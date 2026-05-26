import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import TechDetailsAccordion from 'src/components/ErrorMessage/TechDetailsAccordion'
import { ClassifiedError } from 'src/components/ErrorMessage/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  classified: ClassifiedError
}

export default function ErrorSheet({ classified }: Props) {
  const { t } = useTranslation()
  const publicMessage = t(classified.publicMessageKey, classified.publicMessageFallback)

  return (
    <View style={styles.root}>
      <Text style={[styles.message, styleForSeverity(classified.severity)]}>{publicMessage}</Text>
      <TechDetailsAccordion context={classified.technical} />
    </View>
  )
}

const styleForSeverity = (severity: ClassifiedError['severity']) => {
  switch (severity) {
    case 'error':
      return { color: Colors.error }
    case 'warning':
      return { color: Colors.warningDark }
    default:
      return { color: Colors.gray6 }
  }
}

const styles = StyleSheet.create({
  root: {
    padding: Spacing.Thick24,
  },
  message: {
    ...typeScale.titleSmall,
    fontWeight: '600',
  },
})
