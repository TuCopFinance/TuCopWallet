import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import { NEERU_LOW_POOL_ERROR } from 'src/earn/neeru/saga'
import { neeruCloseStatusSelector, neeruLastErrorSelector } from 'src/earn/neeru/selectors'
import { closePositionStart, emergencyCloseStart } from 'src/earn/neeru/slice'
import { navigate, navigateBack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.NeeruManagePosition>

function formatPesos(value: string | BigNumber): string {
  return `${formatValueToDisplay(new BigNumber(value))} Pesos`
}

// Full-screen manage view for a Neeru position. Replaces the previous
// bottom-sheet approach which never reliably rose (the modal portal + dynamic
// sizing race would leave the sheet at 0 height on this screen). A plain
// screen navigation has zero measurement magic and works everywhere.
export default function NeeruManagePositionScreen({ route }: Props) {
  const { position, pool } = route.params
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const closeStatus = useSelector(neeruCloseStatusSelector)
  const lastError = useSelector(neeruLastErrorSelector)

  const payout = position.currentPayoutIfClosed
  const endDate = new Date(position.endTs * 1000).toLocaleDateString()
  const penaltyAmount = new BigNumber(payout.interest).minus(payout.interestAfterPenalty).toFixed()

  const nowSecs = Math.floor(Date.now() / 1000)
  const elapsedSecs = nowSecs - position.startTs
  const isFlexUnder24h = position.category === 0 && elapsedSecs >= 0 && elapsedSecs < 86400
  const flexHoursRemaining = isFlexUnder24h
    ? Math.max(1, Math.ceil((86400 - elapsedSecs) / 3600))
    : 0

  // Only react to close-flow transitions that happened in THIS mount.
  // Redux persists closeStatus + lastError across sessions, so relying on
  // them directly would (a) auto-navigate back if closeStatus was already
  // 'success' from a previous withdraw and (b) show the emergency fallback
  // button as soon as the screen opens if lastError was already
  // NEERU_LOW_POOL_ERROR. Both were visible bugs during release testing.
  const didStartCloseRef = useRef(false)
  const [showLowPoolFallback, setShowLowPoolFallback] = useState(false)
  useEffect(() => {
    if (closeStatus === 'loading') {
      didStartCloseRef.current = true
      setShowLowPoolFallback(false)
    }
    if (didStartCloseRef.current && closeStatus === 'success') {
      navigateBack()
    }
    if (didStartCloseRef.current && closeStatus === 'error' && lastError === NEERU_LOW_POOL_ERROR) {
      setShowLowPoolFallback(true)
    }
  }, [closeStatus, lastError])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('neeruVaults.closeSheet.title')}</Text>
        <Text style={styles.subtitle}>{t('neeruVaults.closeSheet.currentPayout')}</Text>

        <Row label={t('neeruVaults.closeSheet.amountLabel')} value={formatPesos(payout.amount)} />
        <Row
          label={t('neeruVaults.closeSheet.interestLabel')}
          value={formatPesos(payout.interest)}
        />
        {payout.isEarly && (
          <Row
            label={t('neeruVaults.closeSheet.penaltyLabel', {
              percentage: payout.penaltyBps / 100,
            })}
            value={`-${formatPesos(penaltyAmount)}`}
            negative
          />
        )}
        <Row
          label={t('neeruVaults.closeSheet.totalLabel')}
          value={formatPesos(payout.total)}
          bold
        />

        {payout.isEarly && (
          <Text style={styles.warning}>
            {t('neeruVaults.closeSheet.earlyWarning', { date: endDate })}
          </Text>
        )}
        {isFlexUnder24h && (
          <Text testID="NeeruManagePosition.FlexUnder24hWarning" style={styles.warning}>
            {t('neeruVaults.closeSheet.flexUnder24hWarning', {
              count: flexHoursRemaining,
            })}
          </Text>
        )}

        <Button
          testID="NeeruManagePosition.Confirm"
          size={BtnSizes.FULL}
          type={BtnTypes.PRIMARY}
          text={t('neeruVaults.closeSheet.confirmCta')}
          showLoading={closeStatus === 'loading'}
          disabled={closeStatus === 'loading'}
          onPress={() => dispatch(closePositionStart({ positionId: position.positionId }))}
          style={styles.cta}
        />

        {showLowPoolFallback && (
          <>
            <Text style={styles.warning}>{t('neeruVaults.emergencyCloseSheet.subtitle')}</Text>
            <Button
              testID="NeeruManagePosition.AmountOnly"
              size={BtnSizes.FULL}
              type={BtnTypes.SECONDARY}
              text={t('neeruVaults.emergencyCloseSheet.secondaryCta')}
              onPress={() => dispatch(emergencyCloseStart({ positionId: position.positionId }))}
              style={styles.cta}
            />
          </>
        )}

        <Button
          testID="NeeruManagePosition.DepositMore"
          size={BtnSizes.FULL}
          type={BtnTypes.SECONDARY}
          text={t('neeruVaults.closeSheet.depositMoreCta')}
          disabled={closeStatus === 'loading'}
          onPress={() => navigate(Screens.EarnEnterAmount, { pool, mode: 'deposit' })}
          style={styles.cta}
        />

        <Button
          testID="NeeruManagePosition.Cancel"
          size={BtnSizes.FULL}
          type={BtnTypes.SECONDARY}
          text={t('cancel')}
          disabled={closeStatus === 'loading'}
          onPress={() => navigateBack()}
          style={styles.cta}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

function Row({
  label,
  value,
  bold,
  negative,
}: {
  label: string
  value: string
  bold?: boolean
  negative?: boolean
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold, negative && styles.negative]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { padding: Spacing.Thick24, gap: Spacing.Smallest8 },
  title: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Small12,
  },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
    marginBottom: Spacing.Small12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { ...typeScale.bodyMedium, color: Colors.gray3 },
  rowValue: { ...typeScale.bodyMedium, color: Colors.black },
  bold: { fontWeight: '600' },
  negative: { color: Colors.error },
  warning: {
    ...typeScale.bodySmall,
    color: Colors.warningDark,
    marginTop: Spacing.Smallest8,
  },
  cta: { marginTop: Spacing.Regular16 },
})
