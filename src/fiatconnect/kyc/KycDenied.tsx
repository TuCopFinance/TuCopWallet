import { KycStatus as FiatConnectKycStatus } from '@fiatconnect/fiatconnect-types'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import getNavigationOptions from 'src/fiatconnect/kyc/getNavigationOptions'
import { kycTryAgainLoadingSelector } from 'src/fiatconnect/selectors'
import { kycTryAgain } from 'src/fiatconnect/slice'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import colors from 'src/styles/colors'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'

type Props = NativeStackScreenProps<StackParamList, Screens.KycDenied>

function KycDenied({ route, navigation }: Props) {
  const { quote, flow, retryable } = route.params
  const dispatch = useDispatch()
  const tryAgainLoading = useSelector(kycTryAgainLoadingSelector)

  navigation.setOptions(
    getNavigationOptions({
      fiatConnectKycStatus: FiatConnectKycStatus.KycDenied,
      quote,
    })
  )

  const { t } = useTranslation()

  const onPressTryAgain = () => {
    AppAnalytics.track(FiatExchangeEvents.cico_fc_kyc_status_try_again, {
      provider: quote.getProviderId(),
      flow,
      fiatConnectKycStatus: FiatConnectKycStatus.KycDenied,
    })
    dispatch(kycTryAgain({ quote, flow }))
  }
  const onPressSwitch = () => {
    AppAnalytics.track(FiatExchangeEvents.cico_fc_kyc_status_switch_method, {
      provider: quote.getProviderId(),
      flow,
      fiatConnectKycStatus: FiatConnectKycStatus.KycDenied,
    })
    navigate(Screens.SelectProvider, {
      flow,
      tokenId: quote.getTokenId(),
      amount: {
        crypto: Number(quote.getCryptoAmount()),
        fiat: Number(quote.getFiatAmount()),
      },
    })
  }

  if (tryAgainLoading) {
    return (
      <View testID="spinnerContainer" style={styles.activityIndicatorContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  const title = retryable
    ? t('fiatConnectKycStatusScreen.denied.retryable.title')
    : t('fiatConnectKycStatusScreen.denied.final.title')
  const subtitle = retryable
    ? t('fiatConnectKycStatusScreen.denied.retryable.description')
    : t('fiatConnectKycStatusScreen.denied.final.description')

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateCard variant="error" title={title} subtitle={subtitle} />
      </ScrollView>
      <StickyCtaBottom>
        {retryable && (
          <Button
            testID="tryAgainButton"
            onPress={onPressTryAgain}
            text={t('fiatConnectKycStatusScreen.denied.retryable.tryAgain')}
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
          />
        )}
        <Button
          style={retryable ? styles.secondaryButton : undefined}
          testID="switchButton"
          onPress={onPressSwitch}
          text={t('fiatConnectKycStatusScreen.denied.switch')}
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
  secondaryButton: {
    marginTop: Spacing.Smallest8,
  },
  activityIndicatorContainer: {
    paddingVertical: variables.contentPadding,
    flex: 1,
    alignContent: 'center',
    justifyContent: 'center',
  },
})

export default KycDenied
