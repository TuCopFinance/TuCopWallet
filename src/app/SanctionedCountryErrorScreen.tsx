import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import StateCard from 'src/components/StateCard'
import { emptyHeader } from 'src/navigator/Headers'
import { Spacing } from 'src/styles/styles'

export function SanctionedCountryErrorScreen() {
  const { t } = useTranslation()

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateCard variant="error" title={t('unsupportedLocation')} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
})

SanctionedCountryErrorScreen.navigationOptions = {
  ...emptyHeader,
  gestureEnabled: false,
  headerLeft: () => null,
}

export default SanctionedCountryErrorScreen
