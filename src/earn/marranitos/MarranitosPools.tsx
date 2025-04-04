import React, { useEffect, useState } from 'react'
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
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address } from 'viem'
import MarranitosContract, { STAKING_DURATIONS } from './MarranitosContract'

const TAG = 'earn/marranitos/MarranitosPools'

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList)

const pools = [
  {
    positionId: '1',
    network: 'CELO',
    apy: '1.25',
    days: '30',
    duration: STAKING_DURATIONS.DAYS_30,
    isActive: true,
  },
  {
    positionId: '2',
    network: 'CELO',
    apy: '1.50',
    days: '60',
    duration: STAKING_DURATIONS.DAYS_60,
    isActive: true,
  },
  {
    positionId: '3',
    network: 'CELO',
    apy: '2.00',
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
  const [tokenBalance, setTokenBalance] = useState<string>('0 CCOP')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (walletAddress) {
      // Añadir void para manejar la promesa
      void loadTokenBalance()
    }
  }, [walletAddress])

  const loadTokenBalance = async () => {
    if (!walletAddress) return

    try {
      setIsLoading(true)
      // Ensure walletAddress is properly formatted as an Address type
      const formattedWalletAddress = walletAddress as Address
      const balance = await MarranitosContract.getTokenBalance(formattedWalletAddress)
      setTokenBalance(balance)
    } catch (error) {
      Logger.error(TAG, 'Error loading token balance', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePoolSelection = (pool: any) => {
    if (!walletAddress) {
      Alert.alert(t('earnFlow.staking.connectRequired'), t('earnFlow.staking.connectToStake'), [
        { text: t('global.ok') },
      ])
      return
    }

    // Navegar a la pantalla de staking
    navigate(Screens.MarranitoStaking, {
      pool,
      tokenBalance,
      walletAddress,
    })
  }

  // Función para navegar a la pantalla de mis stakes
  const navigateToMyStakes = () => {
    if (!walletAddress) {
      Alert.alert(
        t('earnFlow.staking.connectRequired'),
        t('earnFlow.staking.connectToViewStakes'),
        [{ text: t('global.ok') }]
      )
      return
    }

    // Navegar a la pantalla de mis stakes
    navigate(Screens.MarranitosMyStakes)
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
