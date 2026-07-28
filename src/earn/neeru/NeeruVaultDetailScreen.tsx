import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import {
  NEERU_CATEGORY_LABEL_KEYS,
  NeeruCategoryId,
  categoryIdFromPositionId,
} from 'src/earn/neeru/constants'
import NeeruCloseSheet from 'src/earn/neeru/NeeruCloseSheet'
import NeeruEmergencyCloseSheet from 'src/earn/neeru/NeeruEmergencyCloseSheet'
import NeeruPositionRow from 'src/earn/neeru/NeeruPositionRow'
import {
  neeruCloseStatusSelector,
  neeruFetchStatusSelector,
  neeruLastErrorSelector,
  neeruPositionsByCategorySelector,
} from 'src/earn/neeru/selectors'
import { NEERU_LOW_POOL_ERROR } from 'src/earn/neeru/saga'
import { emergencyCloseStart, fetchPositionsStart } from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
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
  const closeStatus = useSelector(neeruCloseStatusSelector)
  const lastError = useSelector(neeruLastErrorSelector)
  const byCategory = useSelector(neeruPositionsByCategorySelector)
  const [selectedPosition, setSelectedPosition] = React.useState<NeeruIndividualPosition | null>(
    null
  )
  const [emergencyTarget, setEmergencyTarget] = React.useState<NeeruIndividualPosition | null>(null)
  const lastSelectedRef = useRef<NeeruIndividualPosition | null>(null)
  const closeSheetRef = useRef<BottomSheetModal>(null)
  const emergencySheetRef = useRef<BottomSheetModal>(null)

  const categoryId = categoryIdFromPositionId(pool.positionId)

  useEffect(() => {
    dispatch(fetchPositionsStart())
  }, [dispatch])

  useEffect(() => {
    if (selectedPosition) {
      lastSelectedRef.current = selectedPosition
    }
  }, [selectedPosition])

  useEffect(() => {
    if (closeStatus === 'error' && lastError === NEERU_LOW_POOL_ERROR && lastSelectedRef.current) {
      closeSheetRef.current?.dismiss()
      setSelectedPosition(null)
      setEmergencyTarget(lastSelectedRef.current)
      // Allow the close sheet dismissal animation to finish before we open the
      // emergency sheet, so the two modals don't stack visually.
      setTimeout(() => emergencySheetRef.current?.present(), 250)
    }
  }, [closeStatus, lastError])

  useEffect(() => {
    // Withdraw succeeded: the saga navigates to TransactionSuccessScreen but
    // the bottom sheet stays mounted on top of it. Dismiss both explicitly.
    if (closeStatus === 'success') {
      closeSheetRef.current?.dismiss()
      emergencySheetRef.current?.dismiss()
      setSelectedPosition(null)
      setEmergencyTarget(null)
    }
  }, [closeStatus])

  if (categoryId === null) {
    return null
  }

  const positions = byCategory[categoryId]
  const categoryLabel = t(NEERU_CATEGORY_LABEL_KEYS[categoryId])
  const description = t(DESCRIPTION_KEY_BY_CATEGORY[categoryId])
  const total = formatValueToDisplay(
    positions.reduce((acc, p) => acc.plus(p.currentPayoutIfClosed.total), new BigNumber(0))
  )

  const handleManagePress = (pos: NeeruIndividualPosition) => {
    setSelectedPosition(pos)
    closeSheetRef.current?.present()
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
        <Text style={styles.total}>
          {t('neeruVaults.detail.aggregateBalance', { categoryLabel, amount: total })}
        </Text>

        {positions.length === 0 ? (
          <Text style={styles.empty}>{t('neeruVaults.detail.noPositions')}</Text>
        ) : (
          <View style={styles.positionsList}>
            {positions.map((p) => (
              <NeeruPositionRow key={p.positionId} position={p} onManagePress={handleManagePress} />
            ))}
          </View>
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
      <NeeruCloseSheet
        forwardedRef={closeSheetRef}
        position={selectedPosition}
        onClose={() => setSelectedPosition(null)}
        onAmountOnly={(pos) => {
          // Proactive amount-only path: user knows the interest pool may be low
          // (or accepts forfeiting interest for other reasons) and skips the
          // full withdraw attempt. Same sheet transition as the LOW_POOL
          // fallback, minus the failed close round-trip.
          closeSheetRef.current?.dismiss()
          setSelectedPosition(null)
          setEmergencyTarget(pos)
          setTimeout(() => emergencySheetRef.current?.present(), 250)
        }}
      />
      <NeeruEmergencyCloseSheet
        forwardedRef={emergencySheetRef}
        position={emergencyTarget}
        onCancel={() => setEmergencyTarget(null)}
        onConfirm={(pos) => {
          dispatch(emergencyCloseStart({ positionId: pos.positionId }))
          emergencySheetRef.current?.dismiss()
          setEmergencyTarget(null)
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { padding: Spacing.Regular16, gap: Spacing.Regular16 },
  header: { ...typeScale.titleMedium, color: Colors.black },
  description: { ...typeScale.bodyMedium, color: Colors.gray3 },
  total: { ...typeScale.bodyLarge, color: Colors.black },
  empty: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
    marginTop: Spacing.Large32,
    textAlign: 'center',
  },
  positionsList: { gap: Spacing.Smallest8 },
  cta: { marginTop: Spacing.Large32 },
})
