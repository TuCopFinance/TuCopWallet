import React, { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  Alert,
  FlatList,
  FlatListProps,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSelector } from 'react-redux'
import { MARRANITOS_POSITION_TYPE, MY_MARRANITOS_POSITION_TYPE } from 'src/earn/EarnHome'
import MarranitosContract, { STAKING_ADDRESS } from 'src/earn/marranitos/MarranitosContract'
import MarranitosPoolCard from 'src/earn/marranitos/MarranitosPoolCard'
import { RenderStakeItem } from 'src/earn/marranitos/RenderStakeItem'
import PoolCard from 'src/earn/PoolCard'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { getPassword } from 'src/pincode/authentication'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address } from 'viem'

const AnimatedFlatList = Animated.createAnimatedComponent<FlatListProps<any>>(FlatList)

const TAG = 'earn/PoolList'

export default function PoolList({
  handleScroll,
  listHeaderHeight,
  paddingBottom,
  displayPools,
  onPressLearnMore,
  refreshControl,
  onRefresh,
}: {
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  listHeaderHeight: number
  paddingBottom: number
  displayPools: Array<any>
  onPressLearnMore: () => void
  refreshControl?: React.ReactElement
  onRefresh?: () => any
}) {
  const { t } = useTranslation()
  const walletAddress = useSelector(walletAddressSelector)

  const [withdrawing, setWithdrawing] = useState<number | null>(null)

  const handleMarranitosWithdraw = async (stakeIndex: number) => {
    try {
      setWithdrawing(stakeIndex)

      // Obtener el password usando el sistema de Pincode
      const password = await getPassword(walletAddress as string, true)

      // Asegurar que la dirección de la wallet esté correctamente formateada
      const formattedWalletAddress = walletAddress as Address

      const result = await MarranitosContract.withdraw(stakeIndex, formattedWalletAddress, password)

      // Verificar si es un retiro anticipado que requiere confirmación
      if (typeof result === 'object' && result.type === 'EARLY_WITHDRAW_CONFIRMATION') {
        // Mostrar alerta de confirmación para retiro anticipado
        const { remainingDays, amount, penalty, finalAmount } = result.data

        Alert.alert(
          t('earnFlow.staking.earlyWithdrawTitle'),
          t('earnFlow.staking.earlyWithdrawConfirmation', {
            days: remainingDays,
            amount,
            penalty,
            finalAmount,
          }),
          [
            {
              text: t('global.cancel'),
              style: 'cancel',
            },
            {
              text: t('global.confirm'),
              onPress: async () => {
                // Ejecutar el retiro anticipado con confirmación
                const success = await MarranitosContract.withdraw(
                  stakeIndex,
                  formattedWalletAddress,
                  password,
                  true // confirmEarlyWithdraw = true
                )

                if (success === true) {
                  onRefresh && onRefresh()
                  Alert.alert(t('earnFlow.staking.withdrawSuccess'))
                }
              },
            },
          ]
        )
      } else if (result === true) {
        // Retiro normal exitoso
        onRefresh && onRefresh()
        Alert.alert(t('earnFlow.staking.withdrawSuccess'))
      } else {
        Alert.alert(t('earnFlow.staking.error'), t('earnFlow.staking.withdrawFailed'))
      }
    } catch (error) {
      Logger.error(TAG, 'Error withdrawing stake', error)
      Alert.alert(
        t('earnFlow.staking.error'),
        error instanceof Error ? error.message : t('earnFlow.staking.withdrawFailed')
      )
    } finally {
      setWithdrawing(null)
    }
  }

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
    <AnimatedFlatList
      data={displayPools}
      renderItem={({ item }) =>
        item.positionType == MARRANITOS_POSITION_TYPE ? (
          <MarranitosPoolCard
            pool={item}
            testID={`PoolCard/${item.positionId}`}
            onPress={() => handlePoolSelection(item)}
            walletConnected={!!walletAddress}
          />
        ) : item.positionType == MY_MARRANITOS_POSITION_TYPE ? (
          <RenderStakeItem
            item={item}
            withdrawing={withdrawing}
            handleWithdraw={handleMarranitosWithdraw}
            index={item.index}
          />
        ) : (
          <PoolCard pool={item} testID={`PoolCard/${item.positionId}`} />
        )
      }
      keyExtractor={(item) => item.positionId}
      onScroll={handleScroll}
      // Workaround iOS setting an incorrect automatic inset at the top
      scrollIndicatorInsets={{ top: 0.01 }}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
      ListHeaderComponent={<View style={{ height: listHeaderHeight }} />}
      ListFooterComponent={
        <Text style={styles.learnMore}>
          <Trans i18nKey="earnFlow.home.learnMore">
            <Text
              style={styles.learnMoreLink}
              onPress={onPressLearnMore}
              testID="LearnMoreCta"
            ></Text>
          </Trans>
        </Text>
      }
      style={styles.sectionList}
      contentContainerStyle={[
        styles.sectionListContentContainer,
        { paddingBottom: Math.max(paddingBottom, Spacing.Regular16) },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  sectionListContentContainer: {
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Smallest8,
    gap: Spacing.Regular16,
    flexGrow: 1,
  },
  sectionList: {
    flex: 1,
  },
  learnMore: {
    ...typeScale.bodySmall,
    color: Colors.black,
    textAlign: 'center',
  },
  learnMoreLink: {
    ...typeScale.bodySmall,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
})
