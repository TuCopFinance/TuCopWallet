import Clipboard from '@react-native-clipboard/clipboard'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

// Platform-native monospace stack. iOS ships Menlo; Android ships monospace
// (Droid Sans Mono under the hood). Falling back to whatever the OS considers
// monospace is more consistent than shipping a custom font just for this
// reference-code render.
const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })

// Shared error-block footer for both TuCOPRamp flows (offramp + onramp).
//
// Adds two UX affordances the sagas surface via extended error state:
//
//   1. Rate-limit countdown: when the server returned 429 with a Retry-After
//      header, the saga persists retryAfterSeconds. We render a live countdown
//      + gate the retry callback until it hits 0, so users cannot spam-tap
//      through the throttle window and rack up more 429s.
//
//   2. request_id copy: RFC 7807 envelope carries a request_id the wallet
//      logs via Logger.warn but has never surfaced. Users opening a support
//      ticket had no way to correlate; now they see a code + one-tap copy.
//
// Both are additive: when neither field is populated the footer just renders
// nothing (returns null), so existing error blocks stay untouched for error
// codes that do not carry the fields.

interface Props {
  errorCode: string | null
  retryAfterSeconds?: number | null
  requestId?: string | null
  onRetry?: () => void
  retryButtonTestId?: string
}

export default function TucopRampErrorFooter({
  errorCode,
  retryAfterSeconds,
  requestId,
  onRetry,
  retryButtonTestId,
}: Props) {
  const { t } = useTranslation()
  const showCountdown = errorCode === 'rate_limited' && !!retryAfterSeconds && retryAfterSeconds > 0
  const [remaining, setRemaining] = useState<number>(
    showCountdown ? Math.ceil(retryAfterSeconds ?? 0) : 0
  )
  const [copied, setCopied] = useState(false)

  // Re-arm the countdown whenever the server pushes a new retry-after (a fresh
  // 429 after a previous retry hit the same wall). Cleanup the interval on
  // unmount to avoid setState on a stale component.
  useEffect(() => {
    if (!showCountdown) return
    setRemaining(Math.ceil(retryAfterSeconds ?? 0))
    const id = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [showCountdown, retryAfterSeconds])

  const canRetry = !showCountdown || remaining === 0

  const onCopyRequestId = () => {
    if (!requestId) return
    Clipboard.setString(requestId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!showCountdown && !requestId && !onRetry) {
    return null
  }

  return (
    <View style={styles.container}>
      {showCountdown && (
        <Text style={styles.countdown} testID="tucopramp-error-retry-countdown">
          {t('tucopramp.errors.rate_limited_countdown', { seconds: remaining })}
        </Text>
      )}

      {!!onRetry && (
        <Button
          text={t('tucopramp.retryCta')}
          onPress={onRetry}
          disabled={!canRetry}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          testID={retryButtonTestId ?? 'tucopramp-error-retry'}
        />
      )}

      {!!requestId && (
        <View style={styles.referenceBlock}>
          <Text style={styles.referenceLabel}>{t('tucopramp.errors.referenceCode')}</Text>
          <Text style={styles.referenceValue} testID="tucopramp-error-request-id" selectable>
            {requestId}
          </Text>
          <Button
            text={copied ? t('tucopramp.errors.copied') : t('tucopramp.errors.copyReference')}
            onPress={onCopyRequestId}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.SMALL}
            testID="tucopramp-error-copy-request-id"
          />
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
  countdown: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    textAlign: 'center',
    marginBottom: Spacing.Smallest8,
  },
  referenceBlock: {
    marginTop: Spacing.Regular16,
    padding: Spacing.Regular16,
    borderRadius: 8,
    backgroundColor: Colors.gray1,
    alignItems: 'center',
  },
  referenceLabel: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Tiny4,
  },
  referenceValue: {
    ...typeScale.labelSmall,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
    fontFamily: MONO_FONT,
  },
})
