import { BottomSheetModal } from '@gorhom/bottom-sheet'
import * as React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import BottomSheet from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  position: NeeruIndividualPosition
  onConfirm: (position: NeeruIndividualPosition) => void
  onCancel: () => void
}

export default function NeeruEmergencyCloseSheet({ position, onConfirm, onCancel }: Props) {
  const { t } = useTranslation()
  const [armed, setArmed] = useState(false)
  const ref = React.useRef<BottomSheetModal>(null)

  return (
    <BottomSheet
      forwardedRef={ref}
      onClose={onCancel}
      title={t('neeruVaults.emergencyCloseSheet.title')}
      testId="NeeruEmergencyCloseSheet"
    >
      <View style={styles.body}>
        <Text style={styles.subtitle}>{t('neeruVaults.emergencyCloseSheet.subtitle')}</Text>
        <Text style={styles.bodyText}>
          {t('neeruVaults.emergencyCloseSheet.explanation', {
            amount: position.amount,
            interest: position.accruedInterest,
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
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { padding: Spacing.Regular16, gap: Spacing.Smallest8 },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  bodyText: { ...typeScale.bodyMedium, color: Colors.gray3 },
  cta: { marginTop: Spacing.Smallest8 },
})
