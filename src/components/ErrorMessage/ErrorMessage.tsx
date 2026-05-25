import React, { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import ErrorSheet from 'src/components/ErrorMessage/ErrorSheet'
import { ErrorMessageProps } from 'src/components/ErrorMessage/types'
import { classifyError } from 'src/utils/errors'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

export default function ErrorMessage({ error, context, variant, onDismiss }: ErrorMessageProps) {
  const { t } = useTranslation()
  const classified = useMemo(() => classifyError(error, context), [error, context])

  if (variant === 'fullscreen') {
    return (
      <SafeAreaView style={styles.fullscreenRoot}>
        <Text style={styles.fullscreenTitle}>{t('oops')}</Text>
        <ErrorSheet classified={classified} />
        {onDismiss && (
          <Pressable style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissText}>{t('dismiss')}</Text>
          </Pressable>
        )}
      </SafeAreaView>
    )
  }

  if (variant === 'banner') {
    return (
      <View style={styles.bannerRoot}>
        <ErrorSheet classified={classified} />
      </View>
    )
  }

  // inline
  return (
    <View style={styles.inlineRoot}>
      <ErrorSheet classified={classified} />
    </View>
  )
}

const styles = StyleSheet.create({
  fullscreenRoot: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.Thick24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenTitle: {
    ...typeScale.titleLarge,
    color: Colors.gray6,
    marginBottom: Spacing.Smallest8,
  },
  dismissButton: {
    marginTop: Spacing.Large32,
    paddingVertical: Spacing.Regular16,
    paddingHorizontal: Spacing.Thick24,
    borderRadius: 25,
    backgroundColor: Colors.primary,
  },
  dismissText: {
    ...typeScale.bodyMedium,
    color: Colors.white,
    fontWeight: '600',
  },
  bannerRoot: {
    backgroundColor: Colors.gray1,
    borderRadius: 12,
    margin: Spacing.Regular16,
  },
  inlineRoot: {
    paddingVertical: Spacing.Smallest8,
  },
})
