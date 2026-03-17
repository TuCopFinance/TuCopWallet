import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  bucksPayCertificateUrlSelector,
  bucksPayErrorSelector,
  bucksPayFlowStatusSelector,
  bucksPayStatusSelector,
  bucksPayTransactionHashSelector,
} from 'src/buckspay/selectors'
import { resetFlow } from 'src/buckspay/slice'
import { BucksPayTransactionStatus } from 'src/buckspay/types'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { navigateHome } from 'src/navigator/NavigationService'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

const STATUS_STEPS: BucksPayTransactionStatus[] = [
  'PENDING',
  'INPROGRESS',
  'STARTED',
  'PAYED',
  'FINISHED',
]

function getStepIndex(status: BucksPayTransactionStatus | null): number {
  if (!status) return 0
  const idx = STATUS_STEPS.indexOf(status)
  return idx >= 0 ? idx : 0
}

function BucksPayStatus() {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const flowStatus = useSelector(bucksPayFlowStatusSelector)
  const bucksPayStatus = useSelector(bucksPayStatusSelector)
  const transactionHash = useSelector(bucksPayTransactionHashSelector)
  const certificateUrl = useSelector(bucksPayCertificateUrlSelector)
  const error = useSelector(bucksPayErrorSelector)

  const isError = flowStatus === 'error'
  const isCompleted = flowStatus === 'completed'
  const currentStepIndex = getStepIndex(bucksPayStatus)

  function onPressDone() {
    dispatch(resetFlow())
    navigateHome()
  }

  function onPressViewReceipt() {
    if (certificateUrl) {
      Linking.openURL(certificateUrl)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>
          {isError
            ? t('buckspay.statusError')
            : isCompleted
              ? t('buckspay.statusCompleted')
              : t('buckspay.statusTracking')}
        </Text>

        {isError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error || t('buckspay.unknownError')}</Text>
          </View>
        )}

        {!isError && (
          <View style={styles.stepsContainer}>
            {STATUS_STEPS.map((step, index) => {
              const isActive = index <= currentStepIndex
              const isCurrent = index === currentStepIndex && !isCompleted
              return (
                <View key={step} style={styles.stepRow}>
                  <View
                    style={[
                      styles.stepDot,
                      isActive && styles.stepDotActive,
                      isCurrent && styles.stepDotCurrent,
                    ]}
                  />
                  {index < STATUS_STEPS.length - 1 && (
                    <View style={[styles.stepLine, isActive && styles.stepLineActive]} />
                  )}
                  <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                    {t(`buckspay.status_${step}`)}
                  </Text>
                </View>
              )
            })}
          </View>
        )}

        {!isError && !isCompleted && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>{t('buckspay.processingTransaction')}</Text>
          </View>
        )}

        {transactionHash && (
          <View style={styles.txHashContainer}>
            <Text style={styles.txHashLabel}>{t('buckspay.transactionHash')}</Text>
            <Text style={styles.txHashValue} numberOfLines={1} ellipsizeMode="middle">
              {transactionHash}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.buttonContainer}>
        {isCompleted && certificateUrl && (
          <Button
            onPress={onPressViewReceipt}
            text={t('buckspay.viewReceipt')}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.FULL}
            style={styles.receiptButton}
            testID="buckspay-view-receipt"
          />
        )}
        {(isCompleted || isError) && (
          <Button
            onPress={onPressDone}
            text={t('buckspay.done')}
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            testID="buckspay-done-button"
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    padding: Spacing.Thick24,
  },
  title: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Thick24,
  },
  errorContainer: {
    backgroundColor: Colors.errorLight,
    padding: Spacing.Regular16,
    borderRadius: 8,
  },
  errorText: {
    ...typeScale.bodySmall,
    color: Colors.errorDark,
  },
  stepsContainer: {
    marginBottom: Spacing.Thick24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.Regular16,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.gray2,
  },
  stepDotActive: {
    backgroundColor: Colors.successDark,
  },
  stepDotCurrent: {
    backgroundColor: Colors.primary,
  },
  stepLine: {
    position: 'absolute',
    left: 5,
    top: 12,
    width: 2,
    height: Spacing.Regular16,
    backgroundColor: Colors.gray2,
  },
  stepLineActive: {
    backgroundColor: Colors.successDark,
  },
  stepLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    marginLeft: Spacing.Small12,
  },
  stepLabelActive: {
    color: Colors.black,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.Regular16,
    backgroundColor: Colors.primary10,
    borderRadius: 8,
    marginBottom: Spacing.Regular16,
  },
  loadingText: {
    ...typeScale.bodySmall,
    color: Colors.primary,
    marginLeft: Spacing.Smallest8,
  },
  txHashContainer: {
    marginTop: Spacing.Regular16,
  },
  txHashLabel: {
    ...typeScale.labelSemiBoldXSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Tiny4,
  },
  txHashValue: {
    ...typeScale.bodyXSmall,
    color: Colors.black,
  },
  buttonContainer: {
    padding: Spacing.Thick24,
  },
  receiptButton: {
    marginBottom: Spacing.Small12,
  },
})

export default BucksPayStatus
