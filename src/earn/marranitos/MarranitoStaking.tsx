import { useRoute } from '@react-navigation/native'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'
import { Address } from 'viem'
import MarranitosContract from './MarranitosContract'
// Importar las funciones de autenticación
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { getPassword } from 'src/pincode/authentication'

const TAG = 'earn/marranitos/MarranitoStaking'

type RouteParams = {
  pool: {
    positionId: string
    network: string
    apy: string
    days: string
    duration: number
    isActive: boolean
  }
  tokenBalance: string
  walletAddress: string
}

const MarranitoStaking = () => {
  const { t } = useTranslation()
  const route = useRoute()
  const { pool, tokenBalance, walletAddress } = route.params as RouteParams

  const [amount, setAmount] = useState('')
  const [isStaking, setIsStaking] = useState(false)
  // Eliminamos el estado del password ya que lo obtendremos con el componente Pincode

  const handleStake = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert(t('earnFlow.staking.error'), t('earnFlow.staking.invalidAmount'))
      return
    }

    try {
      setIsStaking(true)

      // Obtener el password usando el sistema de Pincode
      const password = await getPassword(walletAddress, true)

      // Asegurar que la dirección de la wallet esté correctamente formateada
      const formattedWalletAddress = walletAddress as Address

      Logger.debug(TAG, `Staking ${amount} with wallet address: ${formattedWalletAddress}`)

      const success = await MarranitosContract.stake(
        amount,
        pool.duration,
        formattedWalletAddress,
        password
      )

      if (success) {
        Alert.alert(
          t('earnFlow.staking.success'),
          t('earnFlow.staking.successMessage', { days: pool.days }),
          [
            {
              text: t('global.ok'),
              onPress: () => {
                // Navegar a la pantalla de mis inversiones después de completar el staking
                navigate(Screens.MarranitosMyStakes)
              },
            },
          ]
        )
      } else {
        Alert.alert(t('earnFlow.staking.error'), t('earnFlow.staking.stakeFailed'))
      }
    } catch (error) {
      Logger.error(TAG, 'Error staking', error)
      Alert.alert(
        t('earnFlow.staking.error'),
        error instanceof Error ? error.message : t('earnFlow.staking.stakeFailed')
      )
    } finally {
      setIsStaking(false)
    }
  }

  const navigateToMyStakes = () => {
    navigate(Screens.MarranitosMyStakes)
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('earnFlow.staking.title')}</Text>
          <Text style={styles.subtitle}>
            {t('earnFlow.staking.subtitle', { apy: pool.apy, days: pool.days })}
          </Text>

          <View style={styles.poolInfo}>
            <View style={styles.poolInfoRow}>
              <Text style={styles.poolInfoLabel}>{t('earnFlow.staking.network')}</Text>
              <Text style={styles.poolInfoValue}>{pool.network}</Text>
            </View>
            <View style={styles.poolInfoRow}>
              <Text style={styles.poolInfoLabel}>{t('earnFlow.staking.apy')}</Text>
              <Text style={styles.poolInfoValue}>{pool.apy}%</Text>
            </View>
            <View style={styles.poolInfoRow}>
              <Text style={styles.poolInfoLabel}>{t('earnFlow.staking.duration')}</Text>
              <Text style={styles.poolInfoValue}>
                {t('earnFlow.staking.days', { days: pool.days })}
              </Text>
            </View>
            <View style={styles.poolInfoRow}>
              <Text style={styles.poolInfoLabel}>{t('earnFlow.staking.balance')}</Text>
              <Text style={styles.poolInfoValue}>{tokenBalance}</Text>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{t('earnFlow.staking.amount')}</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder={t('earnFlow.staking.enterAmount')}
              keyboardType="numeric"
            />
          </View>

          {/* Eliminamos el input de contraseña ya que usaremos el componente Pincode */}

          <Button
            text={t('earnFlow.staking.stakeButton')}
            onPress={handleStake}
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            style={styles.stakeButton}
            showLoading={isStaking}
            disabled={isStaking}
          />

          <Button
            text={t('earnFlow.staking.myStakes')}
            onPress={navigateToMyStakes}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.FULL}
            style={styles.myStakesButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightPrimary,
  },
  scrollContent: {
    padding: Spacing.Regular16,
    flexGrow: 1,
  },
  content: {
    flex: 1,
  },
  title: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
    marginBottom: Spacing.Regular16,
    textAlign: 'center',
  },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
    marginBottom: Spacing.Regular16,
    textAlign: 'center',
  },
  poolInfo: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  poolInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.Smallest8,
  },
  poolInfoLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  poolInfoValue: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  inputContainer: {
    marginBottom: Spacing.Regular16,
  },
  inputLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    marginBottom: Spacing.Tiny4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    padding: Spacing.Smallest8,
    ...typeScale.bodyMedium,
    color: Colors.black,
    backgroundColor: Colors.white,
  },
  stakeButton: {
    marginTop: Spacing.Regular16,
  },
  myStakesButton: {
    marginTop: Spacing.Smallest8,
  },
})

export default MarranitoStaking
