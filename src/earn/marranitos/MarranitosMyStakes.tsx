import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Shadow } from 'react-native-shadow-2'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import PasswordInput from 'src/components/PasswordInput'
import { getPassword } from 'src/pincode/authentication'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address, formatEther } from 'viem'
import MarranitoAvatar from './marranito.svg'
import MarranitosContract, { Stake } from './MarranitosContract'

const TAG = 'earn/marranitos/MarranitosMyStakes'

const MarranitosMyStakes = () => {
  const { t } = useTranslation()
  const walletAddress = useSelector(walletAddressSelector)
  const [stakes, setStakes] = useState<Stake[]>([])
  const [loading, setLoading] = useState(true)
  const [withdrawing, setWithdrawing] = useState<number | null>(null)
  const [password, setPassword] = useState('')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedStakeIndex, setSelectedStakeIndex] = useState<number | null>(null)

  useEffect(() => {
    if (walletAddress) {
      // Corregir el error de promesa no manejada
      void loadStakes()
    }
  }, [walletAddress])

  const loadStakes = async () => {
    if (!walletAddress) return

    try {
      setLoading(true)
      const userStakes = await MarranitosContract.getUserStakes(walletAddress as Address)
      setStakes(userStakes)
    } catch (error) {
      Logger.error(TAG, 'Error loading stakes', error)
      Alert.alert(t('earnFlow.staking.error'), t('earnFlow.staking.errorLoadingStakes'))
    } finally {
      setLoading(false)
    }
  }

  const handleWithdraw = async (stakeIndex: number) => {
    try {
      setWithdrawing(stakeIndex)

      // Obtener el password usando el sistema de Pincode
      const password = await getPassword(walletAddress as string, true)

      // Asegurar que la dirección de la wallet esté correctamente formateada
      const formattedWalletAddress = walletAddress as Address

      const success = await MarranitosContract.withdraw(
        stakeIndex,
        formattedWalletAddress,
        password
      )

      if (success) {
        // Recargar stakes después de un retiro exitoso
        await loadStakes()
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

  const confirmWithdraw = async () => {
    if (selectedStakeIndex === null || !walletAddress || !password) return

    try {
      setWithdrawing(selectedStakeIndex)
      setShowPasswordModal(false)

      const success = await MarranitosContract.withdraw(
        selectedStakeIndex,
        walletAddress as Address,
        password
      )

      if (success) {
        Alert.alert(
          t('earnFlow.staking.withdrawSuccess'),
          t('earnFlow.staking.withdrawSuccessMessage'),
          [{ text: t('global.ok') }]
        )

        // Reload stakes
        await loadStakes()
      }
    } catch (error) {
      Logger.error(TAG, 'Error withdrawing stake', error)
    } finally {
      setWithdrawing(null)
      setPassword('')
      setSelectedStakeIndex(null)
    }
  }

  const renderStakeItem = ({ item, index }: { item: Stake; index: number }) => {
    const isWithdrawing = withdrawing === index
    const isClaimed = item.claimed
    const amount = formatEther(item.amount)
    const startDate = new Date(Number(item.startTime) * 1000).toLocaleDateString()
    const endDate = new Date(Number(item.endTime) * 1000).toLocaleDateString()
    const daysRemaining = MarranitosContract.calculateRemainingDays(item)

    return (
      <Shadow
        style={styles.shadow}
        offset={[0, 0]}
        distance={8}
        startColor="rgba(190, 201, 255, 0.2)"
      >
        <View style={styles.stakeItem}>
          <View style={styles.stakeHeader}>
            <MarranitoAvatar width={24} height={24} />
            <Text style={styles.stakeTitle}>
              {t('earnFlow.myStakes.stakeTitle', { index: index + 1 })}
            </Text>
          </View>

          <View style={styles.stakeDetails}>
            <View style={styles.stakeRow}>
              <Text style={styles.stakeLabel}>{t('earnFlow.myStakes.amount')}</Text>
              <Text style={styles.stakeValue}>{amount} CCOP</Text>
            </View>

            <View style={styles.stakeRow}>
              <Text style={styles.stakeLabel}>{t('earnFlow.myStakes.startDate')}</Text>
              <Text style={styles.stakeValue}>{startDate}</Text>
            </View>

            <View style={styles.stakeRow}>
              <Text style={styles.stakeLabel}>{t('earnFlow.myStakes.endDate')}</Text>
              <Text style={styles.stakeValue}>{endDate}</Text>
            </View>

            {daysRemaining > 0 && (
              <View style={styles.stakeRow}>
                <Text style={styles.stakeLabel}>{t('earnFlow.myStakes.daysRemaining')}</Text>
                <Text style={styles.stakeValue}>
                  {daysRemaining} {t('earnFlow.myStakes.days')}
                </Text>
              </View>
            )}

            {isClaimed && (
              <View style={styles.claimedBadge}>
                <Text style={styles.claimedText}>{t('earnFlow.myStakes.claimed')}</Text>
              </View>
            )}
          </View>

          {!isClaimed && (
            <Button
              onPress={() => handleWithdraw(index)}
              text={
                daysRemaining > 0
                  ? t('earnFlow.myStakes.earlyWithdraw')
                  : t('earnFlow.myStakes.withdraw')
              }
              type={daysRemaining > 0 ? BtnTypes.SECONDARY : BtnTypes.PRIMARY}
              size={BtnSizes.FULL}
              showLoading={isWithdrawing}
              disabled={isWithdrawing}
            />
          )}
        </View>
      </Shadow>
    )
  }

  const renderPasswordModal = () => {
    if (!showPasswordModal) return null

    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{t('earnFlow.staking.enterPassword')}</Text>

          <PasswordInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('global.enterPassword')}
            containerStyle={styles.passwordInput}
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowPasswordModal(false)
                setPassword('')
                setSelectedStakeIndex(null)
              }}
            >
              <Text style={styles.cancelButtonText}>{t('global.cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, !password && styles.disabledButton]}
              onPress={confirmWithdraw}
              disabled={!password}
            >
              <Text style={styles.confirmButtonText}>{t('global.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t('earnFlow.myStakes.loading')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {stakes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MarranitoAvatar width={80} height={80} />
          <Text style={styles.emptyText}>{t('earnFlow.myStakes.noStakes')}</Text>
        </View>
      ) : (
        <FlatList
          data={stakes}
          renderItem={renderStakeItem}
          keyExtractor={(_, index) => `stake-${index}`}
          contentContainerStyle={styles.listContent}
        />
      )}

      {renderPasswordModal()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
    marginTop: Spacing.Regular16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.Regular16,
  },
  emptyText: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
    marginTop: Spacing.Regular16,
    textAlign: 'center',
  },
  listContent: {
    padding: Spacing.Regular16,
    gap: Spacing.Regular16,
  },
  shadow: {
    width: '100%',
    borderRadius: 12,
  },
  stakeItem: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.Regular16,
    gap: Spacing.Regular16,
  },
  stakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
  },
  stakeTitle: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  stakeDetails: {
    gap: Spacing.Smallest8,
  },
  stakeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stakeLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  stakeValue: {
    ...typeScale.bodySmall,
    color: Colors.black,
  },
  claimedBadge: {
    backgroundColor: Colors.successLight,
    borderRadius: 4,
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: Spacing.Tiny4,
    alignSelf: 'flex-start',
    marginTop: Spacing.Smallest8,
  },
  claimedText: {
    ...typeScale.bodyXSmall,
    color: Colors.white,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.Regular16,
    width: '80%',
  },
  modalTitle: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
    marginBottom: Spacing.Regular16,
    textAlign: 'center',
  },
  passwordInput: {
    marginBottom: Spacing.Regular16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.Smallest8,
    alignItems: 'center',
    marginRight: Spacing.Smallest8,
  },
  cancelButtonText: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.gray3,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    padding: Spacing.Smallest8,
    alignItems: 'center',
  },
  confirmButtonText: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.white,
  },
  disabledButton: {
    backgroundColor: Colors.gray2,
  },
})

export default MarranitosMyStakes
