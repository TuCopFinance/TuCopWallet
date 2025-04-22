import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native'
import MarranitosPoolCard from 'src/earn/marranitos/MarranitosPoolCard'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useSelector } from 'src/redux/hooks'
import { Spacing } from 'src/styles/styles'
import { walletAddressSelector } from 'src/web3/selectors'
import MarranitosContract, { STAKING_ADDRESS, STAKING_DURATIONS } from './MarranitosContract'

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList)

const pools = [
  {
    positionId: '1',
    network: 'CELO',
    apy: MarranitosContract.calculateEffectiveAPY('1.25', STAKING_DURATIONS.DAYS_30),
    days: '30',
    duration: STAKING_DURATIONS.DAYS_30,
    isActive: true,
  },
  {
    positionId: '2',
    network: 'CELO',
    apy: MarranitosContract.calculateEffectiveAPY('1.50', STAKING_DURATIONS.DAYS_60),
    days: '60',
    duration: STAKING_DURATIONS.DAYS_60,
    isActive: true,
  },
  {
    positionId: '3',
    network: 'CELO',
    apy: MarranitosContract.calculateEffectiveAPY('2.00', STAKING_DURATIONS.DAYS_90),
    days: '90',
    duration: STAKING_DURATIONS.DAYS_90,
    isActive: true,
  },
]

interface MarranitosPoolsProps {
  refreshControl?: React.ReactElement
  paddingBottom: number
  listHeaderHeight: number
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}

const MarranitosPools = ({
  refreshControl,
  paddingBottom,
  handleScroll,
  listHeaderHeight,
}: MarranitosPoolsProps) => {
  const { t } = useTranslation()
  const walletAddress = useSelector(walletAddressSelector)

  const handlePoolSelection = async (pool: any) => {
    if (!walletAddress) {
      Alert.alert(t('earnFlow.staking.connectRequired'), t('earnFlow.staking.connectToStake'), [
        { text: t('global.ok') },
      ])
      return
    }

    // Obtener el balance del contrato
    const balance = await MarranitosContract.getTokenBalance(STAKING_ADDRESS)

    // Navegar a la pantalla de staking
    navigate(Screens.MarranitoStaking, {
      pool,
      tokenBalance: balance,
      walletAddress,
    })
  }

  return (
    <View style={styles.container}>
      {/* Corregir la expresión lógica para usar un booleano explícito */}

      <AnimatedFlatList
        data={pools}
        renderItem={({ item }: { item: any }) => (
          <MarranitosPoolCard
            pool={item}
            testID={`PoolCard/${item.positionId}`}
            onPress={() => handlePoolSelection(item)}
            walletConnected={!!walletAddress}
          />
        )}
        keyExtractor={(item: any) => item.positionId}
        scrollIndicatorInsets={{ top: 0.01 }}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
        ListHeaderComponent={<View style={{ height: listHeaderHeight }} />}
        style={styles.sectionList}
        contentContainerStyle={[
          styles.sectionListContentContainer,
          { paddingBottom: Math.max(paddingBottom, Spacing.Regular16) },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionListContentContainer: {
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Smallest8,
    gap: Spacing.Regular16,
    flexGrow: 1,
  },
  sectionList: {
    flex: 1,
  },
})

export default MarranitosPools
