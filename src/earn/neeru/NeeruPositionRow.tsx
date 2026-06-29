import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  position: NeeruIndividualPosition
  onManagePress: (position: NeeruIndividualPosition) => void
}

export default function NeeruPositionRow({ position, onManagePress }: Props) {
  const { t } = useTranslation()
  const isFlexible = position.tranche === 0
  const maturityDate = new Date(position.endTs * 1000).toLocaleDateString()

  return (
    <View testID="NeeruPositionRow" style={styles.row}>
      <View style={styles.column}>
        <Text style={styles.line}>
          {t('neeruVaults.positionRow.amount', { amount: position.principal })}
        </Text>
        <Text style={styles.line}>
          {t('neeruVaults.positionRow.interest', { amount: position.accruedInterest })}
        </Text>
        <Text style={styles.subline}>
          {isFlexible
            ? t('neeruVaults.positionRow.flexible')
            : t('neeruVaults.positionRow.availableAt', { date: maturityDate })}
        </Text>
      </View>
      <Button
        testID={`NeeruPositionRow.Manage.${position.positionId}`}
        text={t('neeruVaults.positionRow.manageCta')}
        size={BtnSizes.SMALL}
        type={BtnTypes.SECONDARY}
        onPress={() => onManagePress(position)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.gray1,
    borderRadius: 12,
    padding: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  column: { flex: 1 },
  line: { ...typeScale.bodyMedium, color: Colors.black },
  subline: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    marginTop: Spacing.Tiny4,
  },
})
