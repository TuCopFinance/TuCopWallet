import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { inFlightSelector } from 'src/dollarsSpend/selectors'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  onRetry: () => void
  onCancel: () => void
}

export default function PartialSuccessSheet({ onRetry, onCancel }: Props) {
  const { t } = useTranslation()
  const inFlight = useSelector(inFlightSelector)

  if (!inFlight || inFlight.failedAtIndex === null) {
    return null
  }

  // Atomic 7702 batch: either all legs go through or none do (single tx).
  // The "Completaste N de M pasos" partial-progress copy from the legacy
  // multi-tx path is misleading here — it implied some legs succeeded when
  // in reality the whole batch aborted (typically because a quote fetch
  // failed before submit, e.g. Squid upstream 502 for one leg). Show a
  // dedicated failure copy that names the actual cause (provider unavailable)
  // and offers Retry / Cancel without the "restante" partial-completion
  // framing.
  if (inFlight.isAtomic) {
    return (
      <View style={styles.container} testID="PartialSuccessSheet">
        <Text style={styles.title}>{t('dollarsSpend.atomicFailure.title')}</Text>
        <Text style={styles.body}>{t('dollarsSpend.atomicFailure.body')}</Text>
        <Button
          text={t('dollarsSpend.atomicFailure.retry')}
          onPress={onRetry}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          testID="PartialSuccessSheet/Retry"
        />
        <Button
          text={t('dollarsSpend.atomicFailure.cancel')}
          onPress={onCancel}
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
          testID="PartialSuccessSheet/Cancel"
        />
      </View>
    )
  }

  const total = inFlight.plannedSteps.length
  const completed = inFlight.completedSteps
  const remainingUsd = inFlight.plannedSteps
    .slice(inFlight.failedAtIndex)
    .reduce((sum, s) => sum.plus(s.amountUsd), new BigNumber(0))

  return (
    <View style={styles.container} testID="PartialSuccessSheet">
      <Text style={styles.title}>
        {t('dollarsSpend.partialSuccess.title', { completed, total })}
      </Text>
      <Text style={styles.body}>
        {t('dollarsSpend.partialSuccess.remaining', {
          remainingUsd: `$${remainingUsd.toFormat(2)}`,
        })}
      </Text>
      <Button
        text={t('dollarsSpend.partialSuccess.retry')}
        onPress={onRetry}
        type={BtnTypes.PRIMARY}
        size={BtnSizes.FULL}
        testID="PartialSuccessSheet/Retry"
      />
      <Button
        text={t('dollarsSpend.partialSuccess.cancel')}
        onPress={onCancel}
        type={BtnTypes.SECONDARY}
        size={BtnSizes.FULL}
        testID="PartialSuccessSheet/Cancel"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.Thick24,
    backgroundColor: Colors.white,
    borderRadius: Spacing.Regular16,
    gap: Spacing.Regular16,
  },
  title: {
    ...typeScale.titleSmall,
    color: Colors.black,
  },
  body: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
})
