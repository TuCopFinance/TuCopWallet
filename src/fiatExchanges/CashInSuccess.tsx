import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import Button, { BtnSizes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import { fiatExchange } from 'src/images/Images'
import { noHeaderGestureDisabled } from 'src/navigator/Headers'
import { navigateHome } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.CashInSuccess>

const capitalizeProvider = (provider?: string) => {
  if (provider) {
    const providerArr = provider.split('')
    providerArr[0].toUpperCase()
    return providerArr.join('')
  }
}

function CashInSuccessScreen({ route }: Props) {
  const { t } = useTranslation()
  const { provider } = route.params

  useEffect(() => {
    AppAnalytics.track(FiatExchangeEvents.cash_in_success, { provider })
  }, [])

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StateCard
          variant="success"
          title={t('cicoSuccess.title')}
          subtitle={
            provider
              ? t('cicoSuccess.bodyWithProvider', { provider: capitalizeProvider(provider) })
              : t('cicoSuccess.bodyWithoutProvider')
          }
          icon={<Image source={fiatExchange} resizeMode="contain" style={styles.brandImage} />}
        />
      </ScrollView>
      <StickyCtaBottom>
        <Button
          size={BtnSizes.FULL}
          text={t('continue')}
          accessibilityLabel={t('continue') ?? undefined}
          onPress={navigateHome}
          testID="SuccessContinue"
        />
      </StickyCtaBottom>
    </SafeAreaView>
  )
}

CashInSuccessScreen.navigationOptions = () => ({
  ...noHeaderGestureDisabled,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  brandImage: {
    width: 100,
    height: 100,
  },
})

export default CashInSuccessScreen
