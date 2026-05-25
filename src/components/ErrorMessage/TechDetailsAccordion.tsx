import Clipboard from '@react-native-clipboard/clipboard'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Share from 'react-native-share'
import { ErrorContext } from 'src/components/ErrorMessage/types'
import { formatTechDetails } from 'src/components/ErrorMessage/formatTechDetails'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'

const TAG = 'components/TechDetailsAccordion'

interface Props {
  context: ErrorContext
}

export default function TechDetailsAccordion({ context }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const text = formatTechDetails(context)

  const handleCopy = () => {
    Clipboard.setString(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleShare = async () => {
    try {
      await Share.open({
        message: text,
        subject: t('errors.sheet.shareSubject'),
        failOnCancel: false,
      })
    } catch (error) {
      Logger.warn(TAG, 'Share dismissed or failed', error)
    }
  }

  return (
    <View style={styles.root}>
      <Pressable onPress={() => setExpanded((e) => !e)} accessibilityRole="button">
        <Text style={styles.toggle}>
          {expanded ? 'v ' : '> '}
          {t('errors.sheet.techDetailsToggle')}
        </Text>
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          <Text style={styles.code} selectable>
            {text}
          </Text>
          <View style={styles.buttonRow}>
            <Pressable style={styles.button} onPress={handleCopy}>
              <Text style={styles.buttonText}>
                {copied ? t('errors.sheet.copyConfirmation') : t('errors.sheet.copyButton')}
              </Text>
            </Pressable>
            <Pressable style={styles.button} onPress={handleShare}>
              <Text style={styles.buttonText}>{t('errors.sheet.shareButton')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    marginTop: Spacing.Regular16,
  },
  toggle: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    paddingVertical: Spacing.Smallest8,
  },
  body: {
    backgroundColor: Colors.gray1,
    borderRadius: 8,
    padding: Spacing.Regular16,
    marginTop: Spacing.Smallest8,
  },
  code: {
    ...typeScale.bodyXSmall,
    fontFamily: 'monospace',
    color: Colors.gray6,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  button: {
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Smallest8,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  buttonText: {
    ...typeScale.bodySmall,
    color: Colors.primary,
    fontWeight: '600',
  },
})
