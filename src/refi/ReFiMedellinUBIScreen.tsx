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
import { useSelector } from 'src/redux/hooks'
import ReFiMedellinUBIContract from 'src/refi/ReFiMedellinUBIContract'
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
  const [isBeneficiary, setIsBeneficiary] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingBeneficiary, setIsCheckingBeneficiary] = useState(true)

  useEffect(() => {
    void checkBeneficiary()
  }, [walletAddress])

  const checkBeneficiary = async () => {
    if (!walletAddress) return

    try {
      setIsCheckingBeneficiary(true)
      const beneficiaryStatus = await ReFiMedellinUBIContract.isBeneficiary(
        walletAddress as Address
      )
      setIsBeneficiary(beneficiaryStatus)
    } catch (error) {
      Logger.error(TAG, 'Error checking beneficiary status', error)
      setIsBeneficiary(false)
    } finally {
      setIsCheckingBeneficiary(false)
    }
  }

  const handleClaimSubsidy = async () => {
    if (!walletAddress) return

    try {
      setIsLoading(true)

      // Primero necesitamos obtener el PIN del usuario
      navigation.navigate(Screens.PincodeEnter, {
        withVerification: true,
        onSuccess: async (pin: string) => {
          try {
            const result = await ReFiMedellinUBIContract.claimSubsidy(walletAddress as Address, pin)

            if (result.success) {
              // Analítica
              AppAnalytics.track(TabHomeEvents.refi_medellin_ubi_pressed)

              // Regresar a la pantalla anterior después del éxito
              navigation.goBack()
            }
          } catch (error) {
            Logger.error(TAG, 'Error claiming subsidy', error)
          } finally {
            setIsLoading(false)
          }
        },
        onCancel: () => {
          setIsLoading(false)
        },
      })
    } catch (error) {
      Logger.error(TAG, 'Error in claim process', error)
      setIsLoading(false)
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

    if (isBeneficiary === null) {
      return (
        <View style={styles.errorContainer}>
          <Celebration size={48} color={Colors.error} />
          <Text style={styles.errorTitle}>{t('reFiMedellinUbi.error.title')}</Text>
          <Text style={styles.errorText}>{t('reFiMedellinUbi.error.description')}</Text>
          <Button
            onPress={checkBeneficiary}
            text={t('reFiMedellinUbi.error.retry')}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.MEDIUM}
            style={styles.retryButton}
          />
        </View>
      )
    }

    if (!isBeneficiary) {
      return (
        <View style={styles.notEligibleContainer}>
          <View style={styles.notEligibleCard}>
            <Celebration size={56} color={Colors.gray3} />
            <Text style={styles.notEligibleTitle}>{t('reFiMedellinUbi.notEligible.title')}</Text>
            <Text style={styles.notEligibleDescription}>
              {t('reFiMedellinUbi.notEligible.description')}
            </Text>
            <Text style={styles.contactInfo}>{t('reFiMedellinUbi.notEligible.contact')}</Text>
          </View>
        </View>
      )
    }

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
  eligibleContainer: {
    flex: 1,
    justifyContent: 'center',
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
  claimButton: {
    ...getShadowStyle(Shadow.Soft),
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
})
