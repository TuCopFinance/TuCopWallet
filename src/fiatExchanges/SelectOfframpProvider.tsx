import React from 'react'
import { useTranslation } from 'react-i18next'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

const BucksPayLogo = require('./buckspay-logo.png')

function SelectOfframpProvider() {
  const { t } = useTranslation()
  const tucopRampEnabled = getFeatureGate(StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('buckspay.selectProvider')}</Text>
        <Text style={styles.subtitle}>{t('buckspay.selectProviderSubtitle')}</Text>

        {tucopRampEnabled && (
          <TouchableOpacity
            style={styles.providerCard}
            testID="offramp-provider-tucopramp"
            onPress={() => navigate(Screens.TuCOPRampOfframpFlow)}
          >
            <View style={styles.providerRow}>
              <View style={[styles.providerLogo, styles.providerLogoTucop]}>
                <Text style={styles.providerLogoText}>TC</Text>
              </View>
              <View style={styles.providerInfo}>
                <Text style={styles.providerName}>{t('tucopramp.providerName')}</Text>
                <Text style={styles.providerSubtitle}>{t('tucopramp.offrampProviderTagline')}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* BucksPay - Temporarily Disabled (kept side by side for one release cycle) */}
        <View
          style={[styles.providerCard, styles.providerCardDisabled]}
          testID="offramp-provider-buckspay-disabled"
        >
          <View style={styles.providerRow}>
            <Image
              source={BucksPayLogo}
              style={[styles.providerLogo, styles.providerLogoDisabled]}
              resizeMode="contain"
            />
            <View style={styles.providerInfo}>
              <Text style={[styles.providerName, styles.providerNameDisabled]}>BucksPay</Text>
              <Text style={styles.disabledLabel}>{t('buckspay.temporarilyDisabled')}</Text>
              <Text style={styles.comingSoonText}>{t('buckspay.comingSoonMessage')}</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
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
  providerCard: {
    padding: Spacing.Regular16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray2,
    backgroundColor: Colors.white,
    marginBottom: Spacing.Regular16,
  },
  providerCardDisabled: {
    backgroundColor: Colors.gray1,
    borderColor: Colors.gray2,
    opacity: 0.8,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  providerLogoDisabled: {
    opacity: 0.5,
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
  providerNameDisabled: {
    color: Colors.gray4,
  },
  providerSubtitle: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: 2,
  },
  disabledLabel: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.warningDark,
    marginTop: 2,
  },
  comingSoonText: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: 4,
  },
})

export default SelectOfframpProvider
