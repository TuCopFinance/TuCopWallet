import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { TabHomeEvents } from 'src/analytics/Events'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import Celebration from 'src/icons/Celebration'
import TuCOPLogo from 'src/navigator/Logo.svg'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { getPassword } from 'src/pincode/authentication'
import { useSelector } from 'src/redux/hooks'
import ReFiMedellinUBIContract, { UBIClaimStatus } from 'src/refi/ReFiMedellinUBIContract'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { getShadowStyle, Shadow, Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address } from 'viem'

const TAG = 'ReFiMedellinUBIScreen'

type Props = NativeStackScreenProps<StackParamList, Screens.ReFiMedellinUBI>

export default function ReFiMedellinUBIScreen({ navigation }: Props) {
  const { t } = useTranslation()
  const walletAddress = useSelector(walletAddressSelector)
  const [ubiStatus, setUbiStatus] = useState<UBIClaimStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingBeneficiary, setIsCheckingBeneficiary] = useState(true)
  const [debugInfo, setDebugInfo] = useState<string>('')

  useEffect(() => {
    void checkUBIStatus()
    void runDebugInfo()
  }, [walletAddress])

  const runDebugInfo = async () => {
    try {
      await ReFiMedellinUBIContract.debugContractInfo()
    } catch (error) {
      Logger.error(TAG, 'Error running debug info', error)
    }
  }

  const checkUBIStatus = async () => {
    if (!walletAddress) return

    try {
      setIsCheckingBeneficiary(true)
      Logger.debug(TAG, `Checking UBI status for ${walletAddress}`)

      let status: UBIClaimStatus

      try {
        // Intentar obtener el estado completo con eventos
        status = await ReFiMedellinUBIContract.getUBIStatus(walletAddress as Address)
      } catch (error) {
        Logger.warn(TAG, 'Could not get full UBI status, falling back to basic status:', error)
        // Si falla, usar la función básica como fallback
        status = await ReFiMedellinUBIContract.getBasicUBIStatus(walletAddress as Address)
      }

      setUbiStatus(status)

      Logger.debug(TAG, 'UBI Status:', status)

      // Crear información de debug para mostrar
      let debug = `Beneficiario: ${status.isBeneficiary}\n`
      debug += `Reclamado esta semana: ${status.hasClaimedThisWeek}\n`
      if (status.lastClaimTimestamp) {
        debug += `Último reclamo: ${new Date(status.lastClaimTimestamp * 1000).toLocaleString()}\n`
      }
      if (status.nextClaimAvailable) {
        debug += `Próximo reclamo disponible: ${new Date(status.nextClaimAvailable * 1000).toLocaleString()}\n`
      }
      if (!status.lastClaimTimestamp && status.isBeneficiary) {
        debug += `Nota: No se pudo verificar el historial de reclamos debido a limitaciones del RPC\n`
      }
      setDebugInfo(debug)
    } catch (error) {
      Logger.error(TAG, 'Error checking UBI status', error)
      setUbiStatus(null)
      setDebugInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsCheckingBeneficiary(false)
    }
  }

  const handleClaimSubsidy = async () => {
    if (!walletAddress || !ubiStatus) return

    try {
      setIsLoading(true)
      Logger.debug(TAG, 'Starting claim process with biometric authentication')

      // Usar el sistema de autenticación de la app que maneja automáticamente Face ID/Touch ID
      const password = await getPassword(walletAddress, true, false)

      Logger.debug(TAG, 'Authentication successful, proceeding with claim')
      const result = await ReFiMedellinUBIContract.claimSubsidy(walletAddress as Address, password)

      Logger.debug(TAG, 'Claim result:', result)

      if (result.success) {
        // Analítica
        AppAnalytics.track(TabHomeEvents.refi_medellin_ubi_pressed)

        // Actualizar el estado después del éxito
        await checkUBIStatus()

        // Regresar a la pantalla anterior después del éxito
        navigation.goBack()
      } else {
        Logger.warn(TAG, 'Claim failed:', result.error)
        // El error ya se mostró en el contrato, solo actualizamos el estado
        await checkUBIStatus()
      }
    } catch (error) {
      Logger.error(TAG, 'Error in claim process', error)
      await checkUBIStatus()
    } finally {
      setIsLoading(false)
    }
  }

  const formatTimeRemaining = (timestamp: number): string => {
    const now = Math.floor(Date.now() / 1000)
    const remaining = timestamp - now

    if (remaining <= 0) return 'Disponible ahora'

    const days = Math.floor(remaining / (24 * 60 * 60))
    const hours = Math.floor((remaining % (24 * 60 * 60)) / (60 * 60))

    if (days > 0) {
      return `${days} día${days > 1 ? 's' : ''} y ${hours} hora${hours > 1 ? 's' : ''}`
    } else {
      return `${hours} hora${hours > 1 ? 's' : ''}`
    }
  }

  const renderContent = () => {
    if (isCheckingBeneficiary) {
      return (
        <View style={styles.loadingContainer}>
          <Celebration size={48} color={Colors.primary} />
          <Text style={styles.loadingText}>{t('reFiMedellinUbi.checking.title')}</Text>
          <Text style={styles.loadingSubtext}>{t('reFiMedellinUbi.checking.subtitle')}</Text>
          <ActivityIndicator size="large" color={Colors.primary} style={styles.spinner} />
        </View>
      )
    }

    if (ubiStatus === null) {
      return (
        <View style={styles.errorContainer}>
          <Celebration size={48} color={Colors.error} />
          <Text style={styles.errorTitle}>{t('reFiMedellinUbi.error.title')}</Text>
          <Text style={styles.errorText}>{t('reFiMedellinUbi.error.description')}</Text>
          {!!debugInfo && (
            <View style={styles.debugContainer}>
              <Text style={styles.debugTitle}>Debug Info:</Text>
              <Text style={styles.debugText}>{debugInfo}</Text>
            </View>
          )}
          <Button
            onPress={checkUBIStatus}
            text={t('reFiMedellinUbi.error.retry')}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.MEDIUM}
            style={styles.retryButton}
          />
        </View>
      )
    }

    if (!ubiStatus.isBeneficiary) {
      return (
        <View style={styles.notEligibleContainer}>
          <View style={styles.notEligibleCard}>
            <Celebration size={56} color={Colors.gray3} />
            <Text style={styles.notEligibleTitle}>{t('reFiMedellinUbi.notEligible.title')}</Text>
            <Text style={styles.notEligibleDescription}>
              {t('reFiMedellinUbi.notEligible.description')}
            </Text>
            <Text style={styles.contactInfo}>{t('reFiMedellinUbi.notEligible.contact')}</Text>
            {!!debugInfo && (
              <View style={styles.debugContainer}>
                <Text style={styles.debugTitle}>Debug Info:</Text>
                <Text style={styles.debugText}>{debugInfo}</Text>
              </View>
            )}
          </View>
        </View>
      )
    }

    // Usuario es beneficiario
    if (ubiStatus.hasClaimedThisWeek) {
      return (
        <View style={styles.alreadyClaimedContainer}>
          <View style={styles.alreadyClaimedCard}>
            <Celebration size={72} color={Colors.successDark} />

            <View style={styles.congratsSection}>
              <Text style={styles.congratsTitle}>¡Ya reclamaste tu subsidio!</Text>
              <Text style={styles.congratsSubtitle}>
                Has reclamado exitosamente tu subsidio UBI esta semana
              </Text>
            </View>

            {!!ubiStatus.lastClaimTimestamp && (
              <View style={styles.claimInfoCard}>
                <Text style={styles.claimInfoTitle}>Último reclamo</Text>
                <Text style={styles.claimInfoDate}>
                  {new Date(ubiStatus.lastClaimTimestamp * 1000).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            )}

            {!!ubiStatus.nextClaimAvailable && (
              <View style={styles.nextClaimCard}>
                <Text style={styles.nextClaimTitle}>Próximo reclamo disponible</Text>
                <Text style={styles.nextClaimTime}>
                  {formatTimeRemaining(ubiStatus.nextClaimAvailable)}
                </Text>
                <Text style={styles.nextClaimDate}>
                  {new Date(ubiStatus.nextClaimAvailable * 1000).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            )}

            <Button
              onPress={() => navigation.goBack()}
              text="Volver"
              type={BtnTypes.SECONDARY}
              size={BtnSizes.FULL}
              style={styles.backButton}
            />
          </View>
        </View>
      )
    }

    // Usuario puede reclamar
    return (
      <View style={styles.eligibleContainer}>
        <View style={styles.eligibleCard}>
          <Celebration size={72} color={Colors.primary} />

          <View style={styles.congratsSection}>
            <Text style={styles.congratsTitle}>
              {t('reFiMedellinUbi.eligible.congratulations')}
            </Text>
            <Text style={styles.congratsSubtitle}>{t('reFiMedellinUbi.eligible.subtitle')}</Text>
          </View>

          <View style={styles.benefitCard}>
            <Text style={styles.benefitTitle}>{t('reFiMedellinUbi.eligible.benefitTitle')}</Text>
            <Text style={styles.benefitDescription}>
              {t('reFiMedellinUbi.eligible.benefitDescription')}
            </Text>
          </View>

          {!!ubiStatus.lastClaimTimestamp && (
            <View style={styles.lastClaimInfo}>
              <Text style={styles.lastClaimText}>
                Último reclamo: {new Date(ubiStatus.lastClaimTimestamp * 1000).toLocaleDateString()}
              </Text>
            </View>
          )}

          <Button
            onPress={handleClaimSubsidy}
            text={
              isLoading
                ? t('reFiMedellinUbi.eligible.claimingButton')
                : t('reFiMedellinUbi.eligible.claimButton')
            }
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            disabled={isLoading}
            style={styles.claimButton}
          />

          {isLoading && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.processingText}>
                {t('reFiMedellinUbi.eligible.processingText')}
              </Text>
            </View>
          )}

          {!!debugInfo && __DEV__ && (
            <View style={styles.debugContainer}>
              <Text style={styles.debugTitle}>Debug Info:</Text>
              <Text style={styles.debugText}>{debugInfo}</Text>
            </View>
          )}
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <TuCOPLogo width={100} height={32} />
          <View style={styles.logoSeparator} />
          <Image
            source={require('../home/refi-medellin-logo.webp')}
            style={styles.reFiLogo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.headerTitle}>{t('reFiMedellinUbi.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('reFiMedellinUbi.subtitle')}</Text>
      </View>

      <View style={styles.gradientDecoration} />

      <View style={styles.content}>{renderContent()}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    paddingHorizontal: Spacing.Thick24,
    paddingVertical: Spacing.Large32,
    backgroundColor: Colors.white,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray2,
    ...getShadowStyle(Shadow.SoftLight),
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.Regular16,
  },
  logoSeparator: {
    width: 2,
    height: 32,
    backgroundColor: Colors.gray2,
    marginHorizontal: Spacing.Regular16,
  },
  reFiLogo: {
    width: 48,
    height: 48,
  },
  headerTitle: {
    ...typeScale.titleLarge,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: Spacing.Tiny4,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  gradientDecoration: {
    height: 4,
    backgroundColor: Colors.primary,
    opacity: 0.1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.Thick24,
    paddingVertical: Spacing.Large32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typeScale.titleSmall,
    color: Colors.primary,
    marginTop: Spacing.Regular16,
    textAlign: 'center',
    fontWeight: '600',
  },
  loadingSubtext: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    marginTop: Spacing.Smallest8,
    textAlign: 'center',
  },
  spinner: {
    marginTop: Spacing.Regular16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  errorTitle: {
    ...typeScale.titleMedium,
    color: Colors.error,
    textAlign: 'center',
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Smallest8,
    fontWeight: '600',
  },
  errorText: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.Regular16,
  },
  retryButton: {
    marginTop: Spacing.Regular16,
  },
  notEligibleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notEligibleCard: {
    backgroundColor: Colors.gray1,
    borderRadius: 16,
    padding: Spacing.Large32,
    alignItems: 'center',
    ...getShadowStyle(Shadow.Soft),
    borderWidth: 1,
    borderColor: Colors.gray2,
  },
  notEligibleTitle: {
    ...typeScale.titleMedium,
    color: Colors.gray6,
    textAlign: 'center',
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Smallest8,
    fontWeight: '600',
  },
  notEligibleDescription: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.Regular16,
  },
  contactInfo: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  alreadyClaimedContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  alreadyClaimedCard: {
    alignItems: 'center',
  },
  eligibleContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  eligibleCard: {
    alignItems: 'center',
  },
  congratsSection: {
    alignItems: 'center',
    marginTop: Spacing.Thick24,
    marginBottom: Spacing.Large32,
  },
  congratsTitle: {
    ...typeScale.titleLarge,
    color: Colors.primary,
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: Spacing.Smallest8,
  },
  congratsSubtitle: {
    ...typeScale.bodyLarge,
    color: Colors.gray3,
    textAlign: 'center',
  },
  benefitCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: Spacing.Thick24,
    marginBottom: Spacing.Large32,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    ...getShadowStyle(Shadow.Soft),
  },
  benefitTitle: {
    ...typeScale.titleSmall,
    color: Colors.primary,
    marginBottom: Spacing.Smallest8,
    fontWeight: '600',
  },
  benefitDescription: {
    ...typeScale.bodyMedium,
    color: Colors.gray6,
    lineHeight: 22,
  },
  claimInfoCard: {
    backgroundColor: '#E8F5E8',
    borderRadius: 12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    alignSelf: 'stretch',
    borderLeftWidth: 4,
    borderLeftColor: Colors.successDark,
  },
  claimInfoTitle: {
    ...typeScale.bodySmall,
    color: Colors.successDark,
    fontWeight: '600',
    marginBottom: Spacing.Tiny4,
  },
  claimInfoDate: {
    ...typeScale.bodyMedium,
    color: Colors.gray6,
  },
  nextClaimCard: {
    backgroundColor: '#FFF4E6',
    borderRadius: 12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Large32,
    alignSelf: 'stretch',
    borderLeftWidth: 4,
    borderLeftColor: Colors.warningDark,
  },
  nextClaimTitle: {
    ...typeScale.bodySmall,
    color: Colors.warningDark,
    fontWeight: '600',
    marginBottom: Spacing.Tiny4,
  },
  nextClaimTime: {
    ...typeScale.titleSmall,
    color: Colors.gray6,
    fontWeight: '600',
    marginBottom: Spacing.Tiny4,
  },
  nextClaimDate: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  lastClaimInfo: {
    backgroundColor: Colors.gray1,
    borderRadius: 8,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    alignSelf: 'stretch',
  },
  lastClaimText: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    textAlign: 'center',
  },
  claimButton: {
    ...getShadowStyle(Shadow.Soft),
  },
  backButton: {
    marginTop: Spacing.Regular16,
  },
  processingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.Regular16,
    padding: Spacing.Regular16,
    backgroundColor: Colors.gray1,
    borderRadius: 8,
  },
  processingText: {
    ...typeScale.bodySmall,
    color: Colors.primary,
    marginLeft: Spacing.Smallest8,
    fontWeight: '500',
  },
  debugContainer: {
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: Spacing.Regular16,
    marginTop: Spacing.Regular16,
    alignSelf: 'stretch',
  },
  debugTitle: {
    ...typeScale.bodySmall,
    color: Colors.gray6,
    fontWeight: '600',
    marginBottom: Spacing.Smallest8,
  },
  debugText: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    fontFamily: 'monospace',
  },
})
