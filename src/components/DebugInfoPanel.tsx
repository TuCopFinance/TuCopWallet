import Clipboard from '@react-native-clipboard/clipboard'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Share from 'react-native-share'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'

const TAG = 'components/DebugInfoPanel'

interface Props {
  info: string
  label?: string
}

export default function DebugInfoPanel({ info, label = 'Debug Info' }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!info) {
    return null
  }

  const handleCopy = () => {
    Clipboard.setString(info)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleShare = async () => {
    try {
      await Share.open({
        message: info,
        subject: t('errors.sheet.shareSubject'),
        failOnCancel: false,
      })
    } catch (error) {
      Logger.warn(TAG, 'Share dismissed or failed', error)
    }
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        accessibilityRole="button"
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {expanded ? 'v ' : '> '}
          {label}
        </Text>
      </Pressable>
      {expanded && (
        <View style={styles.body}>
          <Text style={styles.text} selectable>
            {info}
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
  container: {
    alignSelf: 'stretch',
    marginTop: Spacing.Regular16,
  },
  toggle: {
    paddingVertical: Spacing.Smallest8,
  },
  toggleText: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  body: {
    backgroundColor: Colors.gray1,
    borderRadius: 8,
    padding: Spacing.Regular16,
    marginTop: Spacing.Smallest8,
  },
  text: {
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
