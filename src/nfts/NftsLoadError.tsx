import React, { useEffect } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { NftEvents } from 'src/analytics/Events'
import StateCard from 'src/components/StateCard'
import Touchable from 'src/components/Touchable'
import RedLoadingSpinnerToInfo from 'src/icons/loading/RedLoadingSpinnerToInfo'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'

const TAG = 'NftsLoadErrorScreen'

interface Props {
  testID?: string
}

export default function NftsLoadError({ testID }: Props) {
  const { t } = useTranslation()

  function handleSupportPress() {
    Logger.debug(TAG, 'Support Contact pressed')
    navigate(Screens.SupportContact)
  }

  useEffect(() => {
    AppAnalytics.track(NftEvents.nft_error_screen_open)
  }, [])

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} testID={testID}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateCard
          variant="error"
          title={t('nftsLoadErrorScreen.loadErrorTitle')}
          subtitle={t('nftsLoadErrorScreen.loadErrorSubtitle')}
          icon={<RedLoadingSpinnerToInfo />}
        />
        <View style={styles.contactSupportTouchableContainer}>
          <Touchable
            testID="NftsLoadErrorScreen/ContactSupport"
            onPress={handleSupportPress}
            style={styles.contactSupportTouchable}
          >
            <Text style={styles.contactSupportText}>
              <Trans i18nKey="nftsLoadErrorScreen.contactSupport">
                <Text style={styles.contactSupportLink} />
              </Trans>
            </Text>
          </Touchable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  contactSupportText: {
    ...typeScale.bodySmall,
    textAlign: 'center',
    color: colors.gray3,
  },
  contactSupportTouchableContainer: {
    alignSelf: 'center',
    borderRadius: Spacing.Large32,
    overflow: 'hidden',
    marginTop: Spacing.Regular16,
  },
  contactSupportTouchable: {
    padding: Spacing.Regular16,
  },
  contactSupportLink: {
    color: colors.infoDark,
    textDecorationLine: 'underline',
  },
})
