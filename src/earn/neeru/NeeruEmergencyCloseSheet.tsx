import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import type { BottomSheetDefaultBackdropProps } from '@gorhom/bottom-sheet/lib/typescript/components/bottomSheetBackdrop/types'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  forwardedRef: React.RefObject<BottomSheetModal>
  position: NeeruIndividualPosition | null
  onConfirm: (position: NeeruIndividualPosition) => void
  onCancel: () => void
}

function formatPesos(value: string | BigNumber): string {
  return formatValueToDisplay(new BigNumber(value))
}

export default function NeeruEmergencyCloseSheet({
  forwardedRef,
  position,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation()
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (position) setArmed(false)
  }, [position])

  const renderBackdrop = useCallback(
    (props: BottomSheetDefaultBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  )

  return (
    <BottomSheetModal
      ref={forwardedRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onDismiss={onCancel}
    >
      <BottomSheetView>
        {position && (
          <View style={styles.body} testID="NeeruEmergencyCloseSheet">
            <Text style={styles.title}>{t('neeruVaults.emergencyCloseSheet.title')}</Text>
            <Text style={styles.subtitle}>{t('neeruVaults.emergencyCloseSheet.subtitle')}</Text>
            <Text style={styles.bodyText}>
              {t('neeruVaults.emergencyCloseSheet.explanation', {
                amount: formatPesos(position.amount),
                interest: formatPesos(position.accruedInterest),
              })}
            </Text>
            <Text style={styles.bodyText}>{t('neeruVaults.emergencyCloseSheet.alternative')}</Text>
            <Button
              testID="NeeruEmergencyCloseSheet.Primary"
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              text={t('neeruVaults.emergencyCloseSheet.primaryCta')}
              onPress={onCancel}
              style={styles.cta}
            />
            <Button
              testID="NeeruEmergencyCloseSheet.Secondary"
              size={BtnSizes.FULL}
              type={armed ? BtnTypes.PRIMARY : BtnTypes.SECONDARY}
              text={t(
                armed
                  ? 'neeruVaults.emergencyCloseSheet.confirmAgain'
                  : 'neeruVaults.emergencyCloseSheet.secondaryCta'
              )}
              onPress={() => {
                if (armed) onConfirm(position)
                else setArmed(true)
              }}
              style={styles.cta}
            />
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
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
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  bodyText: { ...typeScale.bodyMedium, color: Colors.gray3 },
  cta: { marginTop: Spacing.Smallest8 },
})
