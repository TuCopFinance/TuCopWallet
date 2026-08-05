import BigNumber from 'bignumber.js'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { Shadow } from 'react-native-shadow-2'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import { neeruCatalogueCategoryByIdSelector } from 'src/earn/neeru/configSelectors'
import { NEERU_CATEGORY_LABEL_KEYS, NeeruCategoryId } from 'src/earn/neeru/constants'
import { effectiveAnnualPercentFromMonthly } from 'src/earn/neeru/rateConversion'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { EarnPosition } from 'src/positions/types'
import { getTotalYieldRate } from 'src/earn/utils'
import { useSelector } from 'src/redux/hooks'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  position: NeeruIndividualPosition
  // The parent EarnPosition for this pool. Needed so the "Administrar" button
  // can navigate back into NeeruVaultDetail with the same route shape the rest
  // of the app already uses. Passed down instead of derived so we do not
  // re-fetch positions state twice.
  pool: EarnPosition
  testID?: string
}

function formatAmount(value: string | BigNumber): string {
  return formatValueToDisplay(new BigNumber(value))
}

function daysRemainingFrom(endTs: number): number {
  const nowSec = Math.floor(Date.now() / 1000)
  const diffSec = endTs - nowSec
  return Math.max(0, Math.ceil(diffSec / 86_400))
}

export default function NeeruPositionCard({ position, pool, testID = 'NeeruPositionCard' }: Props) {
  const { t } = useTranslation()
  const categoryId: NeeruCategoryId = position.category
  const isFlexible = categoryId === 0
  const categoryLabel = t(NEERU_CATEGORY_LABEL_KEYS[categoryId])

  // Rate source of truth is the backend catalogue when loaded. Falls back to
  // the pool's local monthly-to-annual conversion so cold-boot renders are
  // still reasonable.
  const catalogueCategory = useSelector((state) =>
    neeruCatalogueCategoryByIdSelector(state, categoryId)
  )
  const rates = useMemo(() => {
    if (catalogueCategory) {
      return {
        mv: catalogueCategory.monthlyRatePercentage.toFixed(2),
        ea: catalogueCategory.annualEffectivePercentage.toFixed(2),
      }
    }
    const mv = getTotalYieldRate(pool).toNumber()
    return { mv: mv.toFixed(2), ea: effectiveAnnualPercentFromMonthly(mv).toFixed(2) }
  }, [catalogueCategory, pool])

  const daysRemaining = isFlexible ? null : daysRemainingFrom(position.endTs)
  const availableDate = isFlexible ? null : new Date(position.endTs * 1000).toLocaleDateString()

  const isOptimistic = position.optimistic === true
  const isStale = isOptimistic && position.staleOptimistic === true

  const onPressManage = () => {
    navigate(Screens.NeeruVaultDetail, { pool })
  }

  return (
    <Shadow
      style={styles.shadow}
      offset={[0, 0]}
      distance={12.8}
      startColor="rgba(190, 201, 255, 0.28)"
    >
      <View style={styles.card} testID={`${testID}/${position.positionId}`}>
        <View style={styles.header}>
          <Text style={styles.pool}>{categoryLabel}</Text>
          {isOptimistic && !isStale ? (
            <View style={styles.badge} testID="NeeruPositionCard.ProcessingBadge">
              <Text style={styles.badgeText}>{t('neeruVaults.positionRow.processingBadge')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.rows}>
          <View style={styles.row}>
            <Text style={styles.rowKey}>{t('neeruVaults.positionCard.capital')}</Text>
            <Text style={styles.rowValueBold}>
              {t('neeruVaults.positionCard.pesosAmount', {
                amount: formatAmount(position.amount),
              })}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowKey}>{t('neeruVaults.positionCard.interestEarned')}</Text>
            <Text style={styles.rowValue}>
              {t('neeruVaults.positionCard.pesosAmount', {
                amount: formatAmount(position.accruedInterest),
              })}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowKey}>{t('neeruVaults.positionCard.rate')}</Text>
            <View style={styles.rateStack}>
              <Text style={styles.rowValueBold}>
                {t('neeruVaults.positionCard.annualRate', { percentage: rates.ea })}
              </Text>
              <Text style={styles.rateSub}>
                {t('neeruVaults.positionCard.monthlyRate', { percentage: rates.mv })}
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowKey}>{t('neeruVaults.positionCard.maturity')}</Text>
            <Text style={styles.rowValue}>
              {isFlexible
                ? t('neeruVaults.positionCard.maturityFlexible')
                : t('neeruVaults.positionCard.maturityDays', {
                    count: daysRemaining ?? 0,
                    date: availableDate,
                  })}
            </Text>
          </View>
        </View>

        <Button
          testID={`NeeruPositionCard.Manage.${position.positionId}`}
          text={t('neeruVaults.positionRow.manageCta')}
          size={BtnSizes.MEDIUM}
          type={BtnTypes.SECONDARY}
          onPress={onPressManage}
          disabled={isOptimistic}
        />
      </View>
    </Shadow>
  )
}

const styles = StyleSheet.create({
  shadow: { width: '100%', borderRadius: 12, marginBottom: Spacing.Smallest8 },
  card: {
    backgroundColor: Colors.white,
    padding: Spacing.Regular16,
    borderColor: Colors.gray2,
    borderRadius: 12,
    borderWidth: 1,
    gap: Spacing.Regular16,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pool: { ...typeScale.labelSemiBoldMedium, color: Colors.black },
  badge: {
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: Spacing.Tiny4,
    borderRadius: 8,
    backgroundColor: Colors.gray2,
  },
  badgeText: { ...typeScale.labelSmall, color: Colors.gray4 },
  rows: { gap: Spacing.Smallest8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowKey: { ...typeScale.bodySmall, color: Colors.gray3 },
  rowValue: { ...typeScale.bodySmall, color: Colors.black, textAlign: 'right' },
  rowValueBold: { ...typeScale.labelSemiBoldSmall, color: Colors.black, textAlign: 'right' },
  rateStack: { alignItems: 'flex-end' },
  rateSub: { ...typeScale.bodyXSmall, color: Colors.gray3 },
})
