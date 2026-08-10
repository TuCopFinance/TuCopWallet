import Clipboard from '@react-native-clipboard/clipboard'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Share from 'react-native-share'
import Svg, { Path, Rect } from 'react-native-svg'
import { formatTechDetails } from 'src/components/ErrorMessage/formatTechDetails'
import { ErrorContext } from 'src/components/ErrorMessage/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'

const TAG = 'components/TechDetailsAccordion'

interface Props {
  context: ErrorContext
}

// Two-page "copy" icon. Inline SVG so the accordion has zero extra deps.
function CopyIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="8" y="8" width="12" height="12" rx="2" stroke={color} strokeWidth={1.8} />
      <Path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
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
      <View style={styles.toggleRow}>
        <Pressable
          style={styles.togglePressable}
          onPress={() => setExpanded((e) => !e)}
          accessibilityRole="button"
        >
          <Text style={styles.toggle}>
            {expanded ? 'v ' : '> '}
            {t('errors.sheet.techDetailsToggle')}
          </Text>
        </Pressable>
        {expanded && (
          <Pressable
            style={styles.copyIconButton}
            onPress={handleCopy}
            accessibilityRole="button"
            accessibilityLabel={t('errors.sheet.copyButton') || 'Copiar'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <CopyIcon color={copied ? Colors.successDark : Colors.primary} />
            {copied && <Text style={styles.copiedLabel}>{t('errors.sheet.copyConfirmation')}</Text>}
          </Pressable>
        )}
      </View>

      {expanded && (
        <View style={styles.body}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            <Text style={styles.code} selectable>
              {text}
            </Text>
          </ScrollView>
          <View style={styles.buttonRow}>
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  togglePressable: {
    flex: 1,
    paddingVertical: Spacing.Smallest8,
  },
  toggle: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  copyIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Tiny4,
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: Spacing.Smallest8,
  },
  copiedLabel: {
    ...typeScale.labelXSmall,
    color: Colors.successDark,
  },
  body: {
    backgroundColor: Colors.gray1,
    borderRadius: 8,
    padding: Spacing.Regular16,
    marginTop: Spacing.Smallest8,
  },
  scroll: {
    maxHeight: 320,
  },
  scrollContent: {
    paddingRight: Spacing.Smallest8,
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
