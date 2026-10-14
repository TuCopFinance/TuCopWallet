import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import {
  BridgeRampAvailability,
  useBridgeRampAvailability,
} from 'src/bridgeramp/useBridgeRampAvailability'
import { InLineNotification, NotificationVariant } from 'src/components/InLineNotification'
import {
  RAMP_PROVIDERS,
  RampDirection,
  RampProviderDefinition,
} from 'src/fiatExchanges/rampProviders'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { getFeatureGate } from 'src/statsig'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { checkActiveOfframpOrder } from 'src/tucopramp/saga'
import {
  offrampActiveCheckStatusSelector,
  offrampActiveOrderIdSelector,
  offrampStatusSelector,
} from 'src/tucopramp/selectors'
import { OfframpFlowStatus } from 'src/tucopramp/slice'

type Props = NativeStackScreenProps<StackParamList, Screens.SelectRampProvider>

// Local off-ramp statuses that mean a TuCOP Ramp P2P withdrawal is still
// moving (same buckets checkActiveOfframpOrder treats as active).
const ACTIVE_OFFRAMP_STATUSES: OfframpFlowStatus[] = [
  'awaiting-deposit',
  'deposit-confirmed',
  'processing',
]

// True when the user has a TuCOP Ramp P2P withdrawal in flight, either known
// locally or reported by the server through checkActiveOfframpOrder.
function useHasActiveP2POfframp() {
  const dispatch = useDispatch()
  const activeCheckStatus = useSelector(offrampActiveCheckStatusSelector)
  const activeOrderId = useSelector(offrampActiveOrderIdSelector)
  const offrampStatus = useSelector(offrampStatusSelector)

  useEffect(() => {
    dispatch(checkActiveOfframpOrder())
  }, [])

  return (
    (activeCheckStatus === 'done' && !!activeOrderId) ||
    ACTIVE_OFFRAMP_STATUSES.includes(offrampStatus)
  )
}

// Owns the TuCOP Ramp (Bridge) availability check. Remounting it (new `key`)
// restarts the check right away, which is how the error state retries
// without waiting for the next poll.
function BridgeAvailability({
  enabled,
  children,
}: {
  enabled: boolean
  children: (availability: BridgeRampAvailability) => React.ReactElement
}) {
  const availability = useBridgeRampAvailability(enabled)
  return children(availability)
}

// Both ramps live here, for withdrawals and for deposits. Each card names the
// provider, who runs it, how long it takes and what it costs, so the user
// picks between "free but up to 24 h" and "minutes but with a fee".
function SelectRampProvider({ route }: Props) {
  const { t } = useTranslation()
  const direction: RampDirection = route.params?.direction ?? 'offramp'
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0)

  const providers = RAMP_PROVIDERS.filter((provider) => getFeatureGate(provider.gate[direction]))
  const bridgeEnabled = providers.some((provider) => provider.requiresCopmOracle)
  const p2pShown = providers.some((provider) => !provider.requiresCopmOracle)
  const hasActiveP2POfframp = useHasActiveP2POfframp()

  useEffect(() => {
    AppAnalytics.track(FiatExchangeEvents.ramp_chooser_open, { direction })
  }, [direction])

  const onResumeOfframp = () => {
    navigate(Screens.TuCOPRampOfframpFlow)
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t(`rampProviders.${direction}.title`)}</Text>
        <Text style={styles.subtitle}>{t(`rampProviders.${direction}.subtitle`)}</Text>

        {hasActiveP2POfframp && (
          <InLineNotification
            variant={NotificationVariant.Info}
            title={t('rampProviders.resumeOfframp.title')}
            description={t('rampProviders.resumeOfframp.description')}
            ctaLabel={t('rampProviders.resumeOfframp.cta')}
            onPressCta={onResumeOfframp}
            style={styles.resumeBanner}
            testID="ramp-resume-offramp"
          />
        )}

        <BridgeAvailability key={availabilityAttempt} enabled={bridgeEnabled}>
          {(availability) => (
            <>
              {providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  direction={direction}
                  availability={provider.requiresCopmOracle ? availability : null}
                  p2pShown={p2pShown}
                  onRetryAvailability={() => setAvailabilityAttempt((attempt) => attempt + 1)}
                />
              ))}
            </>
          )}
        </BridgeAvailability>

        {providers.length === 0 && (
          <Text style={styles.empty} testID="ramp-provider-none">
            {t('rampProviders.noneAvailable')}
          </Text>
        )}
      </View>
    </SafeAreaView>
  )
}

function ProviderCard({
  provider,
  direction,
  availability,
  p2pShown,
  onRetryAvailability,
}: {
  provider: RampProviderDefinition
  direction: RampDirection
  availability: BridgeRampAvailability | null
  p2pShown: boolean
  onRetryAvailability: () => void
}) {
  const { t } = useTranslation()
  const checking = availability?.state === 'checking'
  const failed = availability?.state === 'error'
  const blocked = availability?.state === 'unavailable' || failed

  const onPress = () => {
    if (failed) {
      // The availability check could not run: tapping the card retries it
      // right away instead of waiting for the next poll.
      onRetryAvailability()
      return
    }
    if (checking || blocked) return
    AppAnalytics.track(FiatExchangeEvents.ramp_chooser_select, {
      ramp: provider.analyticsId,
      direction,
    })
    if (provider.id === 'bridgeramp') {
      navigate(Screens.BridgeRampFlow, { direction })
      return
    }
    if (direction === 'offramp') {
      navigate(Screens.TuCOPRampOfframpFlow)
    } else {
      navigate(Screens.TuCOPRampOnrampFlow)
    }
  }

  return (
    <TouchableOpacity
      style={[styles.providerCard, blocked && styles.providerCardBlocked]}
      testID={`ramp-provider-${provider.id}`}
      onPress={onPress}
      disabled={checking || (blocked && !failed)}
      accessibilityState={{ disabled: checking || blocked }}
    >
      <View style={styles.providerRow}>
        <View style={[styles.providerLogo, styles.providerLogoTucop]}>
          <Text style={styles.providerLogoText} numberOfLines={1}>
            {t(`${provider.i18nKey}.logo`)}
          </Text>
        </View>
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>{t(`${provider.i18nKey}.name`)}</Text>
          <Text style={styles.providerBy} testID={`ramp-provider-${provider.id}-by`}>
            {t(`${provider.i18nKey}.by`)}
          </Text>
          <Text style={styles.providerSubtitle}>
            {t(`${provider.i18nKey}.${direction}.tagline`)}
          </Text>
        </View>
        {checking && (
          <ActivityIndicator size="small" testID={`ramp-provider-${provider.id}-checking`} />
        )}
      </View>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{t(`${provider.i18nKey}.timing`)}</Text>
        <Text style={styles.badge}>{t(`${provider.i18nKey}.cost`)}</Text>
      </View>
      {blocked && (
        <Text style={styles.blockedNote} testID={`ramp-provider-${provider.id}-blocked`}>
          {failed
            ? t(
                p2pShown
                  ? 'rampProviders.bridgeramp.unreachable'
                  : 'rampProviders.bridgeramp.unreachableNoAlternative'
              )
            : t(
                p2pShown
                  ? 'rampProviders.bridgeramp.outsideHours'
                  : 'rampProviders.bridgeramp.outsideHoursNoAlternative'
              )}
        </Text>
      )}
      {failed && (
        <Text
          style={styles.retryLink}
          onPress={onRetryAvailability}
          accessibilityRole="button"
          testID={`ramp-provider-${provider.id}-retry`}
        >
          {t('rampProviders.retry')}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    padding: Spacing.Thick24,
  },
  title: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    marginBottom: Spacing.Thick24,
  },
  resumeBanner: {
    marginBottom: Spacing.Regular16,
  },
  empty: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
  providerCard: {
    padding: Spacing.Regular16,
    borderRadius: Spacing.Small12,
    borderWidth: 1,
    borderColor: Colors.gray2,
    backgroundColor: Colors.white,
    marginBottom: Spacing.Regular16,
  },
  providerCardBlocked: {
    opacity: 0.6,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: Spacing.Smallest8,
  },
  providerLogoTucop: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerLogoText: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.white,
  },
  providerInfo: {
    flex: 1,
    marginLeft: Spacing.Small12,
  },
  providerName: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
  },
  providerBy: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
  },
  providerSubtitle: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.Smallest8,
    marginTop: Spacing.Small12,
  },
  badge: {
    ...typeScale.labelSmall,
    color: Colors.black,
    backgroundColor: Colors.gray1,
    borderRadius: Spacing.Smallest8,
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: 2,
  },
  blockedNote: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Smallest8,
  },
  retryLink: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.primary,
    marginTop: Spacing.Smallest8,
    alignSelf: 'flex-start',
  },
})

export default SelectRampProvider
