import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  BridgeRampAvailability,
  useBridgeRampAvailability,
} from 'src/bridgeramp/useBridgeRampAvailability'
import {
  RAMP_PROVIDERS,
  RampDirection,
  RampProviderDefinition,
} from 'src/fiatExchanges/rampProviders'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { getFeatureGate } from 'src/statsig'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.SelectRampProvider>

// Both ramps live here, for withdrawals and for deposits. Each card names the
// provider, who runs it, how long it takes and what it costs, so the user
// picks between "free but up to 24 h" and "minutes but with a fee".
function SelectRampProvider({ route }: Props) {
  const { t } = useTranslation()
  const direction: RampDirection = route.params?.direction ?? 'offramp'

  const providers = RAMP_PROVIDERS.filter((provider) => getFeatureGate(provider.gate[direction]))
  const bridgeEnabled = providers.some((provider) => provider.requiresCopmOracle)
  const availability = useBridgeRampAvailability(bridgeEnabled)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t(`rampProviders.${direction}.title`)}</Text>
        <Text style={styles.subtitle}>{t(`rampProviders.${direction}.subtitle`)}</Text>

        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            direction={direction}
            availability={provider.requiresCopmOracle ? availability : null}
          />
        ))}

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
}: {
  provider: RampProviderDefinition
  direction: RampDirection
  availability: BridgeRampAvailability | null
}) {
  const { t } = useTranslation()
  const checking = availability?.state === 'checking'
  const blocked =
    availability !== null &&
    (availability.state === 'unavailable' || availability.state === 'error')

  const onPress = () => {
    if (checking || blocked) return
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
      disabled={checking || blocked}
      accessibilityState={{ disabled: checking || blocked }}
    >
      <View style={styles.providerRow}>
        <View style={[styles.providerLogo, styles.providerLogoTucop]}>
          <Text style={styles.providerLogoText}>{t(`${provider.i18nKey}.logo`)}</Text>
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
          {availability.state === 'error'
            ? t('rampProviders.bridgeramp.unreachable')
            : t('rampProviders.bridgeramp.outsideHours')}
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
})

export default SelectRampProvider
