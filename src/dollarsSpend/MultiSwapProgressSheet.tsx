import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { inFlightSelector } from 'src/dollarsSpend/selectors'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

export default function MultiSwapProgressSheet() {
  const { t } = useTranslation()
  const inFlight = useSelector(inFlightSelector)

  if (!inFlight || inFlight.failedAtIndex !== null) {
    return null
  }

  const currentIndex = inFlight.completedSteps // 0-based index of the in-progress step
  const total = inFlight.plannedSteps.length
  const currentStep = inFlight.plannedSteps[currentIndex]
  if (!currentStep) return null

  return (
    <View style={styles.container} testID="MultiSwapProgressSheet">
      <Text style={styles.text}>
        {t('dollarsSpend.stepProgress', {
          index: currentIndex + 1,
          total,
          symbol: currentStep.symbol,
        })}
      </Text>
    </View>
  )
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
