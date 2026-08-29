import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { SubsidiesEvents, TabHomeEvents } from 'src/analytics/Events'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import DebugInfoPanel from 'src/components/DebugInfoPanel'
import { ErrorMessage } from 'src/components/ErrorMessage'
import FeeSummary from 'src/components/FeeSummary'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import Checkmark from 'src/icons/status/Checkmark'
import TuCOPLogo from 'src/navigator/Logo.svg'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { classifyError } from 'src/lib/errors'
import { useTransactionInFlight } from 'src/lib/useTransactionInFlight'
import { NetworkId } from 'src/transactions/types'
import { getPassword } from 'src/pincode/authentication'
import { useSelector } from 'src/redux/hooks'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import ReFiColombiaSubsidiesContract, {
  UBIClaimStatus,
} from 'src/subsidies/ReFiColombiaSubsidiesContract'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { getShadowStyle, Shadow, Spacing } from 'src/styles/styles'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import Logger from 'src/utils/Logger'
import { getEstimatedGasFee, getFeeDecimals } from 'src/viem/prepareTransactions'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address } from 'viem'

const TAG = 'ReFiColombiaSubsidiesScreen'

type Props = NativeStackScreenProps<StackParamList, Screens.ReFiColombiaSubsidies>

export default function ReFiColombiaSubsidiesScreen({ navigation }: Props) {
  const { t } = useTranslation()
  const walletAddress = useSelector(walletAddressSelector)
  const { start, advance, fail, abort } = useTransactionInFlight({ scopeToFlowKind: 'subsidy' })
  const [ubiStatus, setUbiStatus] = useState<UBIClaimStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingBeneficiary, setIsCheckingBeneficiary] = useState(true)
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [feePreview, setFeePreview] = useState<{
    token: TokenBalance
    amount: BigNumber
  } | null>(null)
  const feeCurrencies = useSelector((state) =>
    feeCurrenciesSelector(state, NetworkId['celo-mainnet'])
  )
  // Memoize by the ordered symbol list rather than the array reference so
  // the preview effect does not re-run on every render (feeCurrenciesSelector
  // returns a new sorted array each time even when contents are identical).
  const feeCurrenciesKey = useMemo(
    () => feeCurrencies.map((tok) => `${tok.tokenId}:${tok.balance.toString()}`).join('|'),
    [feeCurrencies]
  )

  useEffect(() => {
    void checkUBIStatus()
    void runDebugInfo()
  }, [walletAddress])

  // Preview the network fee once the user is confirmed eligible + can claim.
  // Runs prepareTransactions against the current fee-currency cascade (same
  // one claimSubsidy uses) so the FeeSummary shown before "Reclamar" is
  // faithful to what will actually pay gas. Guarded by feeCurrenciesKey so
  // it only re-runs when balances / order actually change.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!walletAddress || !ubiStatus?.isBeneficiary || ubiStatus.hasClaimedThisWeek) {
        setFeePreview(null)
        return
      }
      if (feeCurrencies.length === 0) {
        setFeePreview(null)
        return
      }
      try {
        const prepared = await ReFiColombiaSubsidiesContract.prepareClaimTransaction(
          walletAddress as Address,
          feeCurrencies
        )
        if (cancelled) return
        if (prepared.type !== 'possible') {
          setFeePreview(null)
          return
        }
        const feeDecimals = getFeeDecimals(prepared.transactions, prepared.feeCurrency)
        const amount = getEstimatedGasFee(prepared.transactions).shiftedBy(-feeDecimals)
        setFeePreview({ token: prepared.feeCurrency, amount })
      } catch (error) {
        if (cancelled) return
        Logger.warn(TAG, 'Fee preview failed')
        captureBusinessError(error, {
          feature: 'subsidies',
          provider: 'refi-colombia-subsidies',
          action: 'preview_claim_fee',
          errorCode: 'rpc_error',
        })
        setFeePreview(null)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, ubiStatus?.isBeneficiary, ubiStatus?.hasClaimedThisWeek, feeCurrenciesKey])

  const runDebugInfo = async () => {
    try {
      await ReFiColombiaSubsidiesContract.debugContractInfo()
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
        status = await ReFiColombiaSubsidiesContract.getUBIStatus(walletAddress as Address)
      } catch (error) {
        Logger.warn(TAG, 'Could not get full UBI status, falling back to basic status:', error)
        // Si falla, usar la función básica como fallback
        status = await ReFiColombiaSubsidiesContract.getBasicUBIStatus(walletAddress as Address)
      }

      setUbiStatus(status)
      // Fires once per successful status check so we can measure how many
      // Colombians reach the screen + break down by eligibility state.
      AppAnalytics.track(SubsidiesEvents.subsidies_screen_view, {
        claimableAmountCopm: status.isBeneficiary && !status.hasClaimedThisWeek ? 'claimable' : '0',
        hasHistory: !!status.lastClaimTimestamp,
      })

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
        debug += `Sin claims previos registrados\n`
      }
      setDebugInfo(debug)
    } catch (error) {
      Logger.error(TAG, 'Error checking UBI status', error)
      setUbiStatus(null)
      setLoadError(error instanceof Error ? error : new Error(String(error)))
      setDebugInfo(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsCheckingBeneficiary(false)
    }
  }

  const handleClaimSubsidy = async () => {
    if (!walletAddress || !ubiStatus) return

    AppAnalytics.track(SubsidiesEvents.subsidies_claim_press, {
      claimableAmountCopm: 'claimable',
    })

    let flowId: string | undefined
    try {
      setIsLoading(true)
      Logger.debug(TAG, 'Starting claim process with biometric authentication')

      AppAnalytics.track(SubsidiesEvents.subsidies_claim_start, {
        claimableAmountCopm: 'claimable',
      })
      flowId = start({
        flowKind: 'subsidy',
        steps: 1,
        preparedTransactions: [],
        networkId: NetworkId['celo-mainnet'],
      })

      // Usar el sistema de autenticacion de la app que maneja automaticamente Face ID/Touch ID
      const password = await getPassword(walletAddress, true, false)

      advance(flowId, 'submitting')

      Logger.debug(TAG, 'Authentication successful, proceeding with claim')
      const result = await ReFiColombiaSubsidiesContract.claimSubsidy(
        walletAddress as Address,
        password
      )

      Logger.debug(TAG, 'Claim result:', result)

      if (result.success) {
        // Analitica
        AppAnalytics.track(TabHomeEvents.refi_medellin_ubi_pressed)
        AppAnalytics.track(SubsidiesEvents.subsidies_claim_success, {
          claimableAmountCopm: 'claimable',
          transactionHash: result.txHash ?? '',
        })
        advance(flowId, 'succeeded')

        // Actualizar el estado despues del exito
        await checkUBIStatus()

        // Regresar a la pantalla anterior despues del exito
        navigation.goBack()
      } else {
        Logger.warn(TAG, 'Claim failed:', result.error)
        AppAnalytics.track(SubsidiesEvents.subsidies_claim_error, {
          claimableAmountCopm: 'claimable',
          error: result.error ?? 'unknown',
        })
        fail(flowId, classifyError(new Error(result.error ?? 'Subsidy claim failed')))
        // El error ya se mostro en el contrato, solo actualizamos el estado
        await checkUBIStatus()
      }
    } catch (error) {
      Logger.error(TAG, 'Error in claim process', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      AppAnalytics.track(SubsidiesEvents.subsidies_claim_error, {
        claimableAmountCopm: 'claimable',
        error: errorMessage,
      })
      if (flowId) {
        if (error instanceof Error && error.message?.includes('cancel')) {
          abort(flowId)
        } else {
          fail(flowId, classifyError(error))
        }
      }
      await checkUBIStatus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyForSubsidy = () => {
    void Linking.openURL('https://tinyurl.com/SubsidiosReFiCol')
  }

  const handleContactReFi = () => {
    void Linking.openURL('https://linktr.ee/reficolombia')
  }

  const formatTimeRemaining = (timestamp: number): string => {
    const now = Math.floor(Date.now() / 1000)
    const remaining = timestamp - now

    if (remaining <= 0) return t('reFiColombiaSubsidies.timeRemaining.availableNow')

    const days = Math.floor(remaining / (24 * 60 * 60))
    const hours = Math.floor((remaining % (24 * 60 * 60)) / (60 * 60))

    if (days > 0) {
      return t('reFiColombiaSubsidies.timeRemaining.daysAndHours', {
        days,
        daysPlural: days > 1 ? 's' : '',
        hours,
        hoursPlural: hours > 1 ? 's' : '',
      })
    } else {
      return t('reFiColombiaSubsidies.timeRemaining.hoursOnly', {
        hours,
        hoursPlural: hours > 1 ? 's' : '',
      })
    }
  }

  const renderContent = () => {
    if (isCheckingBeneficiary) {
      return (
        <View style={styles.stateContainer}>
          <StateCard
            variant="loading"
            title={t('reFiColombiaSubsidies.checking.title')}
            subtitle={t('reFiColombiaSubsidies.checking.subtitle')}
          />
        </View>
      )
    }

    if (ubiStatus === null) {
      return (
        <View style={styles.stateContainer}>
          <StateCard
            variant="error"
            title={t('reFiColombiaSubsidies.error.title')}
            subtitle={t('reFiColombiaSubsidies.error.description')}
          >
            <ErrorMessage
              error={loadError ?? new Error('ubiStatus null')}
              context={{ screen: 'ReFiColombiaSubsidies', action: 'checkUBIStatus' }}
              variant="banner"
            />
            <DebugInfoPanel info={debugInfo} />
          </StateCard>
        </View>
      )
    }

    if (!ubiStatus.isBeneficiary) {
      return (
        <View style={styles.stateContainer}>
          <StateCard
            variant="info"
            title={t('reFiColombiaSubsidies.notEligible.title')}
            subtitle={t('reFiColombiaSubsidies.notEligible.description')}
          >
            <Text style={styles.applyDisclaimer}>
              {t('reFiColombiaSubsidies.notEligible.applyDisclaimer')}
            </Text>
            <Text style={styles.contactInfo} onPress={handleContactReFi}>
              {t('reFiColombiaSubsidies.notEligible.contact')}
            </Text>
            <DebugInfoPanel info={debugInfo} />
          </StateCard>
        </View>
      )
    }

    // Usuario es beneficiario
    if (ubiStatus.hasClaimedThisWeek) {
      return (
        <View style={styles.stateContainer}>
          <StateCard
            variant="success"
            title={t('reFiColombiaSubsidies.alreadyClaimed.title')}
            subtitle={t('reFiColombiaSubsidies.alreadyClaimed.subtitle')}
          >
            {!!ubiStatus.lastClaimTimestamp && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('reFiColombiaSubsidies.alreadyClaimed.lastClaimTitle')}
                </Text>
                <Text style={styles.detailValue}>
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
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {t('reFiColombiaSubsidies.alreadyClaimed.nextClaimTitle')}
                </Text>
                <Text style={styles.detailValueLarge}>
                  {formatTimeRemaining(ubiStatus.nextClaimAvailable)}
                </Text>
                <Text style={styles.detailValueMuted}>
                  {new Date(ubiStatus.nextClaimAvailable * 1000).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            )}

            <DebugInfoPanel info={debugInfo} />
          </StateCard>
        </View>
      )
    }

    // Usuario puede reclamar
    return (
      <View style={styles.stateContainer}>
        <StateCard
          variant="success"
          icon={<Checkmark width={64} height={64} color={Colors.primary} />}
          title={t('reFiColombiaSubsidies.eligible.congratulations')}
          subtitle={t('reFiColombiaSubsidies.eligible.subtitle')}
        >
          <View style={styles.benefitCard}>
            <Text style={styles.benefitTitle}>
              {t('reFiColombiaSubsidies.eligible.benefitTitle')}
            </Text>
            <Text style={styles.benefitDescription}>
              {t('reFiColombiaSubsidies.eligible.benefitDescription')}
            </Text>
          </View>

          {!!ubiStatus.lastClaimTimestamp && (
            <View style={styles.lastClaimInfo}>
              <Text style={styles.lastClaimText}>
                {t('reFiColombiaSubsidies.alreadyClaimed.lastClaimTitle')}:{' '}
                {new Date(ubiStatus.lastClaimTimestamp * 1000).toLocaleDateString()}
              </Text>
            </View>
          )}

          {isLoading && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.processingText}>
                {t('reFiColombiaSubsidies.eligible.processingText')}
              </Text>
            </View>
          )}

          {feePreview && (
            <View style={styles.feeSummaryWrap} testID="ReFiColombiaSubsidies/FeeSummary">
              <Text style={styles.feeSummaryLabel}>
                {t('reFiColombiaSubsidies.eligible.networkFeeLabel')}
              </Text>
              <FeeSummary
                layout="stacked"
                components={[{ amount: feePreview.amount, token: feePreview.token }]}
              />
            </View>
          )}

          <DebugInfoPanel info={debugInfo} />
        </StateCard>
      </View>
    )
  }

  const renderStickyButton = () => {
    if (isCheckingBeneficiary) {
      return null
    }
    if (ubiStatus === null) {
      return (
        <Button
          onPress={checkUBIStatus}
          text={t('reFiColombiaSubsidies.error.retry')}
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
        />
      )
    }
    if (!ubiStatus.isBeneficiary) {
      return (
        <Button
          onPress={handleApplyForSubsidy}
          text={t('reFiColombiaSubsidies.notEligible.applyButton')}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
        />
      )
    }
    if (ubiStatus.hasClaimedThisWeek) {
      return (
        <Button
          onPress={() => navigation.goBack()}
          text={t('reFiColombiaSubsidies.alreadyClaimed.backButton')}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
        />
      )
    }
    return (
      <Button
        onPress={handleClaimSubsidy}
        text={
          isLoading
            ? t('reFiColombiaSubsidies.eligible.claimingButton')
            : t('reFiColombiaSubsidies.eligible.claimButton')
        }
        type={BtnTypes.PRIMARY}
        size={BtnSizes.FULL}
        disabled={isLoading}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <TuCOPLogo width={100} height={32} />
          <View style={styles.logoSeparator} />
          <Image
            source={require('../home/refi-colombia-logo.webp')}
            style={styles.reFiLogo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.headerTitle}>{t('reFiColombiaSubsidies.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('reFiColombiaSubsidies.subtitle')}</Text>
      </View>

      <View style={styles.gradientDecoration} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>

      {renderStickyButton() && <StickyCtaBottom>{renderStickyButton()}</StickyCtaBottom>}
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
    zIndex: 1,
    elevation: 3,
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
    borderRadius: 24,
  },
  headerTitle: {
    ...typeScale.titleLarge,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: Spacing.Tiny4,
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
  contentContainer: {
    flexGrow: 1,
    paddingBottom: Spacing.Large32,
  },
  // Wraps the StateCard for any per-state outer alignment / spacing the
  // ScrollView needs. The card chrome itself lives in <StateCard/>.
  stateContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.Regular16,
  },
  contactInfo: {
    ...typeScale.bodySmall,
    color: Colors.primary,
    textAlign: 'center',
    fontStyle: 'italic',
    textDecorationLine: 'underline',
  },
  applyDisclaimer: {
    ...typeScale.bodyXSmall,
    color: Colors.gray3,
    textAlign: 'center',
    marginBottom: Spacing.Regular16,
  },
  detailRow: {
    flexDirection: 'column',
    gap: Spacing.Tiny4,
    alignSelf: 'stretch',
    marginBottom: Spacing.Regular16,
  },
  detailLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  detailValue: {
    ...typeScale.labelMedium,
    color: Colors.black,
  },
  detailValueLarge: {
    ...typeScale.labelSemiBoldLarge,
    color: Colors.black,
  },
  detailValueMuted: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  benefitCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    alignSelf: 'stretch',
    gap: Spacing.Smallest8,
  },
  benefitTitle: {
    ...typeScale.titleSmall,
    color: Colors.primary,
  },
  benefitDescription: {
    ...typeScale.bodyMedium,
    color: Colors.gray6,
    lineHeight: 22,
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
  feeSummaryWrap: {
    marginTop: Spacing.Regular16,
    paddingTop: Spacing.Regular16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray2,
  },
  feeSummaryLabel: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
})
