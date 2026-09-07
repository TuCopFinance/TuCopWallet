import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

function SelectOfframpProvider() {
  const { t } = useTranslation()
  const tucopRampEnabled = getFeatureGate(StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('tucopramp.selectProvider')}</Text>
        <Text style={styles.subtitle}>{t('tucopramp.selectProviderSubtitle')}</Text>

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
    borderRadius: Spacing.Small12,
    borderWidth: 1,
    borderColor: Colors.gray2,
    backgroundColor: Colors.white,
    marginBottom: Spacing.Regular16,
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
  providerSubtitle: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: 2,
  },
})

export default SelectOfframpProvider
