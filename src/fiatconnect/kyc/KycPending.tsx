import { KycStatus as FiatConnectKycStatus } from '@fiatconnect/fiatconnect-types'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import getNavigationOptions from 'src/fiatconnect/kyc/getNavigationOptions'
import { navigateHome } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.KycPending>

function KycPending({ route, navigation }: Props) {
  navigation.setOptions(
    getNavigationOptions({
      fiatConnectKycStatus: FiatConnectKycStatus.KycPending,
      quote: route.params.quote,
    })
  )

  const { t } = useTranslation()

  const onPressClose = () => {
    AppAnalytics.track(FiatExchangeEvents.cico_fc_kyc_status_close, {
      provider: route.params.quote.getProviderId(),
      flow: route.params.flow,
      fiatConnectKycStatus: FiatConnectKycStatus.KycPending,
    })
    navigateHome()
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateCard
          variant="info"
          title={t('fiatConnectKycStatusScreen.pending.title')}
          subtitle={t('fiatConnectKycStatusScreen.pending.description')}
        />
      </ScrollView>
      <StickyCtaBottom>
        <Button
          testID="closeButton"
          onPress={onPressClose}
          text={t('fiatConnectKycStatusScreen.pending.close')}
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
        />
      </StickyCtaBottom>
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

export default KycPending
