import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import Touchable from 'src/components/Touchable'
import { fetchPositionsStart } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { useDispatch } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  position: NeeruIndividualPosition
  onManagePress: (position: NeeruIndividualPosition) => void
}

function celoscanUrlFor(txHash: string): string {
  return `https://celoscan.io/tx/${txHash}`
}

export default function NeeruPositionRow({ position, onManagePress }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const isFlexible = position.tranche === 0
  const maturityDate = new Date(position.maturityTs * 1000).toLocaleDateString()
  const isOptimistic = position.optimistic === true
  const isStale = isOptimistic && position.staleOptimistic === true

  return (
    <View testID="NeeruPositionRow" style={styles.row}>
      <View style={styles.column}>
        <Text style={styles.line}>
          {t('neeruVaults.positionRow.principal', { amount: position.principal })}
        </Text>
        <Text style={styles.line}>
          {t('neeruVaults.positionRow.interest', { amount: position.accruedInterest })}
        </Text>
        <Text style={styles.subline}>
          {isFlexible
            ? t('neeruVaults.positionRow.flexible')
            : t('neeruVaults.positionRow.maturity', { date: maturityDate })}
        </Text>
        {isOptimistic && !isStale && (
          <View testID="NeeruPositionRow.ProcessingBadge" style={styles.badge}>
            <Text style={styles.badgeText}>{t('neeruVaults.positionRow.processingBadge')}</Text>
          </View>
        )}
        {isStale && (
          <Text style={styles.staleNote}>
            {t('neeruVaults.positionRow.optimisticTakingLong')}
          </Text>
        )}
      </View>
      {isOptimistic ? (
        isStale ? (
          <View style={styles.staleActions}>
            <Button
              testID={`NeeruPositionRow.Refresh.${position.positionId}`}
              text={t('neeruVaults.positionRow.refreshCta')}
              size={BtnSizes.SMALL}
              type={BtnTypes.SECONDARY}
              onPress={() => dispatch(fetchPositionsStart())}
            />
            <Touchable
              testID={`NeeruPositionRow.Celoscan.${position.positionId}`}
              onPress={() => Linking.openURL(celoscanUrlFor(position.depositTxHash))}
            >
              <Text style={styles.celoscanLink}>
                {t('neeruVaults.positionRow.viewOnCeloscanCta')}
              </Text>
            </Touchable>
          </View>
        ) : null
      ) : (
        <Button
          testID={`NeeruPositionRow.Manage.${position.positionId}`}
          text={t('neeruVaults.positionRow.manageCta')}
          size={BtnSizes.SMALL}
          type={BtnTypes.SECONDARY}
          onPress={() => onManagePress(position)}
        />
      )}
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
  badge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.Smallest8,
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: Spacing.Tiny4,
    borderRadius: 8,
    backgroundColor: Colors.gray2,
  },
  badgeText: { ...typeScale.labelSmall, color: Colors.gray4 },
  staleNote: {
    ...typeScale.bodySmall,
    color: Colors.warningDark,
    marginTop: Spacing.Smallest8,
  },
  staleActions: {
    alignItems: 'flex-end',
    gap: Spacing.Smallest8,
  },
  celoscanLink: {
    ...typeScale.bodySmall,
    color: Colors.accent,
    textDecorationLine: 'underline',
  },
})
