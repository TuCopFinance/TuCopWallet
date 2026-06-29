import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import {
  NEERU_TRANCHE_LABEL_KEYS,
  NeeruTrancheId,
  trancheIdFromPositionId,
} from 'src/earn/neeru/constants'
import NeeruCloseSheet from 'src/earn/neeru/NeeruCloseSheet'
import NeeruEmergencyCloseSheet from 'src/earn/neeru/NeeruEmergencyCloseSheet'
import NeeruPositionRow from 'src/earn/neeru/NeeruPositionRow'
import {
  neeruCloseStatusSelector,
  neeruFetchStatusSelector,
  neeruLastErrorSelector,
  neeruPositionsByTrancheSelector,
} from 'src/earn/neeru/selectors'
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

const DESCRIPTION_KEY_BY_TRANCHE: Record<NeeruTrancheId, string> = {
  0: 'neeruVaults.detail.descriptionByTranche.flexible',
  1: 'neeruVaults.detail.descriptionByTranche.thirtyDays',
  2: 'neeruVaults.detail.descriptionByTranche.sixtyDays',
  3: 'neeruVaults.detail.descriptionByTranche.ninetyDays',
}

export default function NeeruVaultDetailScreen({ route }: Props) {
  const { pool } = route.params
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const fetchStatus = useSelector(neeruFetchStatusSelector)
  const closeStatus = useSelector(neeruCloseStatusSelector)
  const lastError = useSelector(neeruLastErrorSelector)
  const byTranche = useSelector(neeruPositionsByTrancheSelector)
  const [selectedPosition, setSelectedPosition] = React.useState<NeeruIndividualPosition | null>(
    null
  )
  const [emergencyTarget, setEmergencyTarget] = React.useState<NeeruIndividualPosition | null>(null)
  const lastSelectedRef = React.useRef<NeeruIndividualPosition | null>(null)

  const trancheId = trancheIdFromPositionId(pool.positionId)

  useEffect(() => {
    dispatch(fetchPositionsStart())
  }, [dispatch])

  useEffect(() => {
    if (selectedPosition) {
      lastSelectedRef.current = selectedPosition
    }
  }, [selectedPosition])

  useEffect(() => {
    if (closeStatus === 'error' && lastError === 'InterestPoolLow' && lastSelectedRef.current) {
      setEmergencyTarget(lastSelectedRef.current)
      setSelectedPosition(null)
    }
  }, [closeStatus, lastError])

  if (trancheId === null) {
    return null
  }

  const positions = byTranche[trancheId]
  const trancheLabel = t(NEERU_TRANCHE_LABEL_KEYS[trancheId])
  const description = t(DESCRIPTION_KEY_BY_TRANCHE[trancheId])
  const total = positions
    .reduce((acc, p) => acc.plus(p.currentPayoutIfClosed.total), new BigNumber(0))
    .toFixed(2)

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
        <Text style={styles.header}>{t('neeruVaults.detail.header', { trancheLabel })}</Text>
        <Text style={styles.description}>{description}</Text>
        <Text style={styles.total}>
          {t('neeruVaults.detail.aggregateBalance', { trancheLabel, amount: total })}
        </Text>

        {positions.length === 0 ? (
          <Text style={styles.empty}>{t('neeruVaults.detail.noPositions')}</Text>
        ) : (
          <View style={styles.positionsList}>
            {positions.map((p) => (
              <NeeruPositionRow
                key={p.positionId}
                position={p}
                onManagePress={(pos) => setSelectedPosition(pos)}
              />
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
      {selectedPosition && (
        <NeeruCloseSheet position={selectedPosition} onClose={() => setSelectedPosition(null)} />
      )}
      {emergencyTarget && (
        <NeeruEmergencyCloseSheet
          position={emergencyTarget}
          onCancel={() => setEmergencyTarget(null)}
          onConfirm={(pos) => {
            dispatch(emergencyCloseStart({ positionId: pos.positionId }))
            setEmergencyTarget(null)
          }}
        />
      )}
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
