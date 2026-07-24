import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import type { BottomSheetDefaultBackdropProps } from '@gorhom/bottom-sheet/lib/typescript/components/bottomSheetBackdrop/types'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import { neeruCloseStatusSelector } from 'src/earn/neeru/selectors'
import { closePositionStart } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  forwardedRef: React.RefObject<BottomSheetModal>
  position: NeeruIndividualPosition | null
  onClose: () => void
  onAmountOnly?: (position: NeeruIndividualPosition) => void
}

function formatPesos(value: string | BigNumber): string {
  return `${formatValueToDisplay(new BigNumber(value))} Pesos`
}

export default function NeeruCloseSheet({ forwardedRef, position, onClose, onAmountOnly }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const closeStatus = useSelector(neeruCloseStatusSelector)

  const renderBackdrop = useCallback(
    (props: BottomSheetDefaultBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  )

  const payout = position?.currentPayoutIfClosed
  const endDate = position ? new Date(position.endTs * 1000).toLocaleDateString() : ''
  const penaltyAmount = payout
    ? new BigNumber(payout.interest).minus(payout.interestAfterPenalty).toFixed()
    : '0'

  return (
    <BottomSheetModal
      ref={forwardedRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onDismiss={onClose}
    >
      <BottomSheetView>
        {position && payout && (
          <View style={styles.body} testID="NeeruCloseSheet">
            <Text style={styles.title}>{t('neeruVaults.closeSheet.title')}</Text>
            <Text style={styles.subtitle}>{t('neeruVaults.closeSheet.currentPayout')}</Text>
            <Row
              label={t('neeruVaults.closeSheet.amountLabel')}
              value={formatPesos(payout.amount)}
            />
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
            {onAmountOnly && (
              <Button
                testID="NeeruCloseSheet.AmountOnly"
                size={BtnSizes.FULL}
                type={BtnTypes.SECONDARY}
                text={t('neeruVaults.closeSheet.amountOnlyCta')}
                disabled={closeStatus === 'loading'}
                onPress={() => onAmountOnly(position)}
                style={styles.cta}
              />
            )}
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
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
  body: { padding: Spacing.Thick24, gap: Spacing.Smallest8 },
  title: {
    ...typeScale.titleSmall,
    color: Colors.black,
    marginBottom: Spacing.Small12,
  },
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
})
