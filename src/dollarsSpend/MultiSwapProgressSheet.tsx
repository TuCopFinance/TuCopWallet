import * as React from 'react'
import { useTranslation } from 'react-i18next'
import StateCard from 'src/components/StateCard'
import { inFlightSelector } from 'src/dollarsSpend/selectors'
import { useSelector } from 'src/redux/hooks'

// Standardized progress sheet for both the legacy multi-step Dolares -> Pesos
// path (shows "Paso X de N: convirtiendo SYMBOL") and the atomic 7702 path
// (shows a single in-progress copy because the per-step counter would lie).
//
// Uses the shared StateCard component with the `loading` variant so the visual
// language matches every other transaction in-flight surface in the wallet
// (spinner + card + soft shadow + title typography).
export default function MultiSwapProgressSheet() {
  const { t } = useTranslation()
  const inFlight = useSelector(inFlightSelector)

  if (!inFlight || inFlight.failedAtIndex !== null) {
    return null
  }

  if (inFlight.isAtomic) {
    return (
      <StateCard
        variant="loading"
        title={t('dollarsSpend.atomicProgress')}
        testID="MultiSwapProgressSheet"
      />
    )
  }

  const currentIndex = inFlight.completedSteps
  const total = inFlight.plannedSteps.length
  const currentStep = inFlight.plannedSteps[currentIndex]
  if (!currentStep) return null

  return (
    <StateCard
      variant="loading"
      title={t('dollarsSpend.stepProgress', {
        index: currentIndex + 1,
        total,
        symbol: currentStep.symbol,
      })}
      testID="MultiSwapProgressSheet"
    />
  )
}
