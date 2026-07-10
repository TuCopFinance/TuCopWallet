import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import MultiSwapProgressSheet from 'src/dollarsSpend/MultiSwapProgressSheet'
import PartialSuccessSheet from 'src/dollarsSpend/PartialSuccessSheet'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  onRetry: () => void
  onCancel: () => void
}

// Wraps the in-flight progress sheet and the partial-success sheet so the user
// never sees a blank frame between a step failure dispatching and the partial-
// success UI committing. While `transitioning` is true the shell renders a brief
// transitional message; otherwise it renders whichever sheet applies for the
// current slice state.
export default function TransactionFlowShell({ onRetry, onCancel }: Props) {
  const { t } = useTranslation()
  const inFlight = useSelector((s) => s.dollarsSpend.inFlight)
  const transitioning = useSelector((s) => s.dollarsSpend.transitioning)

  if (!inFlight && !transitioning) {
    return null
  }

  if (transitioning) {
    return (
      <View style={styles.container} testID="TxFlowShell/Transitioning">
        <Text style={styles.text}>{t('dollarsSpend.transitioning')}</Text>
      </View>
    )
  }

  if (inFlight && inFlight.failedAtIndex !== null) {
    return <PartialSuccessSheet onRetry={onRetry} onCancel={onCancel} />
  }

  return <MultiSwapProgressSheet />
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.Thick24,
    backgroundColor: Colors.white,
    borderRadius: Spacing.Regular16,
  },
  text: {
    ...typeScale.labelMedium,
    color: Colors.black,
    textAlign: 'center',
  },
})
