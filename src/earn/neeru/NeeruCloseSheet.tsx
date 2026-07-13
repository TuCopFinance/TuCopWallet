import { BottomSheetModal } from '@gorhom/bottom-sheet'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import BottomSheet from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { neeruCloseStatusSelector } from 'src/earn/neeru/selectors'
import { closePositionStart } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  position: NeeruIndividualPosition
  onClose: () => void
  onAmountOnlyRequested?: (position: NeeruIndividualPosition) => void
}

export default function NeeruCloseSheet({ position, onClose, onAmountOnlyRequested }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const closeStatus = useSelector(neeruCloseStatusSelector)
  const ref = React.useRef<BottomSheetModal>(null)

  const { currentPayoutIfClosed: payout } = position
  const endDate = new Date(position.endTs * 1000).toLocaleDateString()
  const penaltyAmount = new BigNumber(payout.interest).minus(payout.interestAfterPenalty).toFixed()

  return (
    <BottomSheet
      forwardedRef={ref}
      onClose={onClose}
      title={t('neeruVaults.closeSheet.title')}
      testId="NeeruCloseSheet"
    >
      <View style={styles.body}>
        <Text style={styles.subtitle}>{t('neeruVaults.closeSheet.currentPayout')}</Text>
        <Row label={t('neeruVaults.closeSheet.amountLabel')} value={`${payout.amount} Pesos`} />
        <Row label={t('neeruVaults.closeSheet.interestLabel')} value={`${payout.interest} Pesos`} />
        {payout.isEarly && (
          <Row
            label={t('neeruVaults.closeSheet.penaltyLabel', {
              percentage: payout.penaltyBps / 100,
            })}
            value={`-${penaltyAmount} Pesos`}
            negative
          />
        )}
        <Row label={t('neeruVaults.closeSheet.totalLabel')} value={`${payout.total} Pesos`} bold />
        {payout.isEarly && (
          <Text style={styles.warning}>
            {t('neeruVaults.closeSheet.earlyWarning', { date: endDate })}
          </Text>
        )}
        <Button
          testID="NeeruCloseSheet.Confirm"
          size={BtnSizes.FULL}
          type={BtnTypes.PRIMARY}
          text={t('neeruVaults.closeSheet.confirmCta')}
          showLoading={closeStatus === 'loading'}
          disabled={closeStatus === 'loading'}
          onPress={() => dispatch(closePositionStart({ positionId: position.positionId }))}
          style={styles.cta}
        />
        {onAmountOnlyRequested && (
          <>
            <Button
              testID="NeeruCloseSheet.AmountOnly"
              size={BtnSizes.FULL}
              type={BtnTypes.SECONDARY}
              text={t('neeruVaults.closeSheet.amountOnlyCta')}
              disabled={closeStatus === 'loading'}
              onPress={() => onAmountOnlyRequested(position)}
              style={styles.secondaryCta}
            />
            <Text style={styles.amountOnlyHelp}>{t('neeruVaults.closeSheet.amountOnlyHelp')}</Text>
          </>
        )}
      </View>
    </BottomSheet>
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
  body: { padding: Spacing.Regular16, gap: Spacing.Smallest8 },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
    marginBottom: Spacing.Smallest8,
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
  secondaryCta: { marginTop: Spacing.Smallest8 },
  amountOnlyHelp: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    marginTop: Spacing.Smallest8,
    textAlign: 'center',
  },
})
