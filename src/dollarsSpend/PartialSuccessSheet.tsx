import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import MultiSwapLegList from 'src/dollarsSpend/MultiSwapLegList'
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
    // Pick the body variant from the enriched envelope (backend PR #228)
    // OR from a heuristic on the raw error message when no envelope was
    // carried. Precedence:
    //   1. fallback_hint === "USDT"  -> "prueba con USDT" copy (most actionable)
    //   2. squid_rate_limited        -> "servicio saturado" (+ retry countdown
    //      when the backend forwarded a Retry-After header, otherwise no
    //      countdown - avoids showing a false "0 segundos" placeholder)
    //   3. lastError text contains "execution reverted" / "reverted for an
    //      unknown reason" (typical for on-chain estimateGas revert of the
    //      atomic batch when Squid pool state moved between quote and
    //      simulate) -> "los precios cambiaron" copy that is actually
    //      accurate for this failure mode instead of the misleading
    //      "servicio no disponible"
    //   4. anything else             -> generic "servicio no disponible"
    // The user-visible copy never leaks the raw upstream code (429/502),
    // the route ticker string, EIP number, or the word "reverted". Sentry
    // tags carry those already.
    const env = inFlight.lastErrorEnvelope
    const rawError = inFlight.lastError ?? ''
    const looksLikeOnchainRevert =
      /reverted|revert reason|execution reverted/i.test(rawError) &&
      // Guard against matching a random word "reverted" in a non-EVM error:
      // eth_estimateGas errors from viem always include "Request Arguments"
      // or "Details:" alongside the revert text.
      /request arguments|estimate gas|viem/i.test(rawError)
    let body: string
    if (env?.fallback_hint === 'USDT') {
      body = t('dollarsSpend.atomicFailure.bodyFallbackUsdt')
    } else if (env?.error === 'squid_rate_limited') {
      const retryAfter = env.retry_after_seconds
      body =
        typeof retryAfter === 'number' && retryAfter > 0
          ? t('dollarsSpend.atomicFailure.bodyRateLimitedWithCountdown', {
              seconds: retryAfter,
            })
          : t('dollarsSpend.atomicFailure.bodyRateLimited')
    } else if (looksLikeOnchainRevert) {
      body = t('dollarsSpend.atomicFailure.bodyPriceMoved')
    } else {
      body = t('dollarsSpend.atomicFailure.body')
    }
    return (
      <View style={styles.container} testID="PartialSuccessSheet">
        <Text style={styles.title}>{t('dollarsSpend.atomicFailure.title')}</Text>
        <Text style={styles.body}>{body}</Text>
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
      <MultiSwapLegList
        plannedSteps={inFlight.plannedSteps}
        legStatuses={inFlight.legStatuses}
        destinationLabel={inFlight.destinationLabel}
      />
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
