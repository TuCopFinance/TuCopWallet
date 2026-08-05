import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import { neeruCatalogueCategoryByIdSelector } from 'src/earn/neeru/configSelectors'
import {
  NEERU_CATEGORY_LABEL_KEYS,
  NeeruCategoryId,
  categoryIdFromPositionId,
} from 'src/earn/neeru/constants'
import NeeruPositionRow from 'src/earn/neeru/NeeruPositionRow'
import { effectiveAnnualPercentFromMonthly } from 'src/earn/neeru/rateConversion'
import {
  neeruFetchStatusSelector,
  neeruPositionsByCategorySelector,
} from 'src/earn/neeru/selectors'
import { fetchPositionsStart } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { getTotalYieldRate } from 'src/earn/utils'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.NeeruVaultDetail>

const DESCRIPTION_KEY_BY_CATEGORY: Record<NeeruCategoryId, string> = {
  0: 'neeruVaults.detail.descriptionByCategory.flexible',
  1: 'neeruVaults.detail.descriptionByCategory.thirtyDays',
  2: 'neeruVaults.detail.descriptionByCategory.sixtyDays',
  3: 'neeruVaults.detail.descriptionByCategory.ninetyDays',
}

export default function NeeruVaultDetailScreen({ route }: Props) {
  const { pool } = route.params
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const fetchStatus = useSelector(neeruFetchStatusSelector)
  const byCategory = useSelector(neeruPositionsByCategorySelector)

  const categoryId = categoryIdFromPositionId(pool.positionId)

  useEffect(() => {
    dispatch(fetchPositionsStart())
  }, [dispatch])

  // Backend catalogue is the source of truth for both rates (retunes without
  // a contract upgrade would otherwise leave stale numbers on the empty
  // state hero). Falls back to the pool's yield rate + monthly->annual
  // conversion when the catalogue is not loaded yet, so a cold boot still
  // surfaces a reasonable E.A.
  const catalogueCategory = useSelector((state) =>
    categoryId !== null ? neeruCatalogueCategoryByIdSelector(state, categoryId) : null
  )
  const monthlyRate = useMemo(() => {
    if (catalogueCategory) return catalogueCategory.monthlyRatePercentage
    return getTotalYieldRate(pool).toNumber()
  }, [catalogueCategory, pool])
  const annualRate = useMemo(() => {
    if (catalogueCategory) return catalogueCategory.annualEffectivePercentage
    return effectiveAnnualPercentFromMonthly(monthlyRate)
  }, [catalogueCategory, monthlyRate])

  if (categoryId === null) {
    return null
  }

  const positions = byCategory[categoryId]
  const categoryLabel = t(NEERU_CATEGORY_LABEL_KEYS[categoryId])
  const description = t(DESCRIPTION_KEY_BY_CATEGORY[categoryId])
  const total = formatValueToDisplay(
    positions.reduce((acc, p) => acc.plus(p.currentPayoutIfClosed.total), new BigNumber(0))
  )
  const isEmpty = positions.length === 0
  const withdrawStepKey =
    categoryId === 0
      ? 'neeruVaults.detail.emptyState.step3Flexible'
      : 'neeruVaults.detail.emptyState.step3Fixed'

  // Manage goes to the full-screen NeeruManagePosition. Was a bottom sheet
  // originally, but @gorhom/bottom-sheet couldn't reliably rise from a
  // virtualized item context (the sheet snapped to 0 height), so we use a
  // plain navigation instead.
  const handleManagePress = (pos: NeeruIndividualPosition) => {
    navigate(Screens.NeeruManagePosition, { position: pos, pool })
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={fetchStatus === 'loading'}
            onRefresh={() => dispatch(fetchPositionsStart())}
          />
        }
      >
        <Text style={styles.header}>{t('neeruVaults.detail.header', { categoryLabel })}</Text>
        <Text style={styles.description}>{description}</Text>

        {isEmpty ? (
          // Rich empty state: rate hero + how-it-works + trust footer.
          // Replaces the previous sparse "Total en X: 0.00 Pesos" + one-line
          // "Todavia no tienes depositos" that read as if the page were broken.
          // Redundant total row is suppressed here (0 balance is implied).
          <View testID="NeeruVaultDetail.EmptyState" style={styles.emptyCard}>
            <Text style={styles.emptyRateEyebrow}>
              {t('neeruVaults.detail.emptyState.rateEyebrow')}
            </Text>
            <Text style={styles.emptyRateValue}>
              {t('neeruVaults.detail.emptyState.rateValueEa', {
                percentage: annualRate.toFixed(2),
              })}
            </Text>
            <Text style={styles.emptyRateSubtitle}>
              {t('neeruVaults.detail.emptyState.rateEquivalentMv', {
                percentage: monthlyRate.toFixed(2),
              })}
            </Text>

            <View style={styles.emptyDivider} />

            <Text style={styles.emptyStepsHeader}>
              {t('neeruVaults.detail.emptyState.howItWorksHeader')}
            </Text>
            <View style={styles.emptyStep}>
              <Text style={styles.emptyStepNumber}>1</Text>
              <Text style={styles.emptyStepText}>{t('neeruVaults.detail.emptyState.step1')}</Text>
            </View>
            <View style={styles.emptyStep}>
              <Text style={styles.emptyStepNumber}>2</Text>
              <Text style={styles.emptyStepText}>{t('neeruVaults.detail.emptyState.step2')}</Text>
            </View>
            <View style={styles.emptyStep}>
              <Text style={styles.emptyStepNumber}>3</Text>
              <Text style={styles.emptyStepText}>{t(withdrawStepKey)}</Text>
            </View>

            <Text style={styles.emptyTrustNote}>
              {t('neeruVaults.detail.emptyState.trustNote')}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.total}>
              {t('neeruVaults.detail.aggregateBalance', { categoryLabel, amount: total })}
            </Text>
            <View style={styles.positionsList}>
              {positions.map((p) => (
                <NeeruPositionRow
                  key={p.positionId}
                  position={p}
                  onManagePress={handleManagePress}
                />
              ))}
            </View>
          </>
        )}

        <Button
          size={BtnSizes.FULL}
          type={BtnTypes.PRIMARY}
          text={t('neeruVaults.detail.depositCta')}
          onPress={() => navigate(Screens.EarnEnterAmount, { pool, mode: 'deposit' })}
          testID="NeeruVaultDetail.DepositCta"
          style={styles.cta}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { padding: Spacing.Regular16, gap: Spacing.Regular16 },
  header: { ...typeScale.titleMedium, color: Colors.black },
  description: { ...typeScale.bodyMedium, color: Colors.gray3 },
  total: { ...typeScale.bodyLarge, color: Colors.black },
  positionsList: { gap: Spacing.Smallest8 },
  cta: { marginTop: Spacing.Large32 },
  emptyCard: {
    backgroundColor: Colors.gray1,
    borderRadius: 16,
    padding: Spacing.Thick24,
    marginTop: Spacing.Smallest8,
    gap: Spacing.Smallest8,
  },
  emptyRateEyebrow: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyRateValue: {
    ...typeScale.titleLarge,
    color: Colors.accent,
  },
  emptyRateSubtitle: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  emptyDivider: {
    height: 1,
    backgroundColor: Colors.gray2,
    marginVertical: Spacing.Regular16,
  },
  emptyStepsHeader: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  emptyStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.Small12,
    marginBottom: Spacing.Smallest8,
  },
  emptyStepNumber: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.white,
    backgroundColor: Colors.accent,
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  emptyStepText: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    flex: 1,
  },
  emptyTrustNote: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Regular16,
    fontStyle: 'italic',
  },
})
