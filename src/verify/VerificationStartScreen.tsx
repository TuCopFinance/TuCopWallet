import { useHeaderHeight } from '@react-navigation/elements'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useAsync } from 'react-async-hook'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native'
import * as RNLocalize from 'react-native-localize'
import { SafeAreaView } from 'react-native-safe-area-context'
import { initializeAccount } from 'src/account/actions'
import {
  choseToRestoreAccountSelector,
  defaultCountryCodeSelector,
  e164NumberSelector,
} from 'src/account/selectors'
import { getPhoneNumberDetails } from 'src/account/utils'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { PhoneVerificationEvents } from 'src/analytics/Events'
import BackButton from 'src/components/BackButton'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InfoBottomSheet from 'src/components/InfoBottomSheet'
import KeyboardAwareScrollView from 'src/components/KeyboardAwareScrollView'
import KeyboardSpacer from 'src/components/KeyboardSpacer'
import PhoneNumberInput from 'src/components/PhoneNumberInput'
import TextButton from 'src/components/TextButton'
import i18n from 'src/i18n'
import { HeaderTitleWithSubtitle } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { TopBarTextButton } from 'src/navigator/TopBarButton'
import { StackParamList } from 'src/navigator/types'
import {
  getOnboardingStepValues,
  goToNextOnboardingScreen,
  onboardingPropsSelector,
} from 'src/onboarding/steps'
import { retrieveSignedMessage } from 'src/pincode/authentication'
import { useDispatch, useSelector } from 'src/redux/hooks'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { Countries } from 'src/utils/Countries'
import { walletAddressSelector } from 'src/web3/selectors'

function VerificationStartScreen({
  route,
  navigation,
}: NativeStackScreenProps<StackParamList, Screens.VerificationStartScreen>) {
  const [showLearnMoreDialog, setShowLearnMoreDialog] = useState(false)
  const [phoneNumberInfo, setPhoneNumberInfo] = useState(() =>
    getPhoneNumberDetails(
      cachedNumber || '',
      cachedCountryCallingCode || 'CO',
      route.params?.selectedCountryCodeAlpha2 || RNLocalize.getCountry()
    )
  )
  const [signedMessageCreated, setSignedMessageCreated] = useState(false)

  const { t } = useTranslation()
  const dispatch = useDispatch()
  const headerHeight = useHeaderHeight()

  const account = useSelector(walletAddressSelector)
  const cachedNumber = useSelector(e164NumberSelector)
  const cachedCountryCallingCode = useSelector(defaultCountryCodeSelector)
  const walletAddress = useSelector(walletAddressSelector)
  const onboardingProps = useSelector(onboardingPropsSelector)
  const { step, totalSteps } = getOnboardingStepValues(
    Screens.VerificationStartScreen,
    onboardingProps
  )
  const choseToRestoreAccount = useSelector(choseToRestoreAccountSelector)
  const showSteps = !route.params?.hasOnboarded && !choseToRestoreAccount

  const countries = useMemo(() => new Countries(i18n.language), [i18n.language])
  const country = phoneNumberInfo.countryCodeAlpha2
    ? countries.getCountryByCodeAlpha2(phoneNumberInfo.countryCodeAlpha2)
    : countries.getCountryByCodeAlpha2('57')

  const onPressStart = () => {
    AppAnalytics.track(PhoneVerificationEvents.phone_verification_start, {
      country: country?.displayNameNoDiacritics || '',
      countryCallingCode: country?.countryCallingCode || '',
    })

    const routes = navigation.getState().routes
    const prevRoute = routes[routes.length - 2] // -2 because -1 is the current route
    // Usually it makes sense to navigate the user back to where they launched
    // the verification flow after they complete it, but during onboarding we
    // want to navigate to the next step.
    const verificationCompletionScreen = !route.params?.hasOnboarded
      ? Screens.OnboardingSuccessScreen
      : (prevRoute?.name ?? Screens.TabHome)

    navigate(Screens.VerificationCodeInputScreen, {
      registrationStep: showSteps ? { step, totalSteps } : undefined,
      e164Number: phoneNumberInfo.e164Number,
      countryCallingCode: country?.countryCallingCode || '+57',
      verificationCompletionScreen,
    })
  }

  const onPressSkip = () => {
    AppAnalytics.track(PhoneVerificationEvents.phone_verification_skip_confirm)
    goToNextOnboardingScreen({
      firstScreenInCurrentStep: Screens.VerificationStartScreen,
      onboardingProps,
    })
  }

  const onPressLearnMore = () => {
    AppAnalytics.track(PhoneVerificationEvents.phone_verification_learn_more)
    setShowLearnMoreDialog(true)
  }

  const onPressLearnMoreDismiss = () => {
    setShowLearnMoreDialog(false)
  }

  useLayoutEffect(() => {
    const title = () => (
      <HeaderTitleWithSubtitle
        subTitle={showSteps && t('registrationSteps', { step, totalSteps })}
      />
    )

    navigation.setOptions({
      headerTitle: title,
      headerRight: () =>
        !route.params?.hasOnboarded && (
          <TopBarTextButton
            title={t('skip')}
            testID="PhoneVerificationSkipHeader"
            onPress={onPressSkip}
            titleStyle={{ color: colors.black }}
          />
        ),
      headerLeft: () => route.params?.hasOnboarded && <BackButton />,
      // Disable iOS back during onboarding
      gestureEnabled: !!route.params?.hasOnboarded,
    })
  }, [navigation, step, totalSteps, route.params, showSteps])

  // Prevent device back on Android during onboarding
  useEffect(() => {
    if (!route.params?.hasOnboarded) {
      const backPressListener = () => true
      BackHandler.addEventListener('hardwareBackPress', backPressListener)
      return () => BackHandler.removeEventListener('hardwareBackPress', backPressListener)
    }
  }, [])

  useEffect(() => {
    const newCountryAlpha2 = route.params?.selectedCountryCodeAlpha2
    if (newCountryAlpha2 && newCountryAlpha2 !== phoneNumberInfo.countryCodeAlpha2) {
      const countryCallingCode =
        countries.getCountryByCodeAlpha2(newCountryAlpha2)?.countryCallingCode ?? ''
      setPhoneNumberInfo(
        getPhoneNumberDetails(
          phoneNumberInfo.internationalPhoneNumber,
          countryCallingCode,
          newCountryAlpha2
        )
      )
    }
  }, [route.params?.selectedCountryCodeAlpha2])

  useEffect(() => {
    if (signedMessageCreated) {
      return
    }

    const interval = setInterval(async () => {
      const signedMessage = await retrieveSignedMessage()
      setSignedMessageCreated(!!signedMessage)
    }, 500)

    return () => clearInterval(interval)
  }, [signedMessageCreated])

  useAsync(async () => {
    if (walletAddress === null) {
      dispatch(initializeAccount())
    }
  }, [])

  const onPressCountry = () => {
    navigate(Screens.SelectCountry, {
      countries,
      selectedCountryCodeAlpha2: phoneNumberInfo.countryCodeAlpha2,
      onSelectCountry: (countryCodeAlpha2: string) => {
        navigate(Screens.VerificationStartScreen, {
          hasOnboarded: !!route.params?.hasOnboarded,
          selectedCountryCodeAlpha2: countryCodeAlpha2,
        })
      },
    })
  }

  const onChangePhoneNumberInput = (
    internationalPhoneNumber: string,
    countryCallingCode: string
  ) => {
    setPhoneNumberInfo(
      getPhoneNumberDetails(
        internationalPhoneNumber,
        countryCallingCode,
        phoneNumberInfo.countryCodeAlpha2
      )
    )
  }

  if (!account) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScrollView
        style={[styles.scrollContainer, headerHeight ? { marginTop: headerHeight } : undefined]}
        keyboardShouldPersistTaps="always"
      >
        <Text style={styles.header} testID="PhoneVerificationHeader">
          {t('phoneVerificationScreen.title')}
        </Text>
        <Text style={styles.body}>{t('phoneVerificationScreen.description')}</Text>
        <PhoneNumberInput
          style={styles.phoneNumber}
          country={country}
          internationalPhoneNumber={phoneNumberInfo.internationalPhoneNumber}
          onPressCountry={onPressCountry}
          onChange={onChangePhoneNumberInput}
          countryFlagStyle={styles.countryFlag}
        />
        <Button
          text={t('phoneVerificationScreen.startButtonLabel')}
          onPress={onPressStart}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          showLoading={!signedMessageCreated}
          style={styles.startButton}
          disabled={!phoneNumberInfo.isValidNumber || !signedMessageCreated}
          testID="PhoneVerificationContinue"
        />
      </KeyboardAwareScrollView>
      <View style={styles.bottomButtonContainer}>
        <TextButton
          testID="PhoneVerificationLearnMore"
          style={styles.learnMore}
          onPress={onPressLearnMore}
        >
          {t('phoneVerificationScreen.learnMore.buttonLabel')}
        </TextButton>
      </View>
      <KeyboardSpacer />
      <InfoBottomSheet
        isVisible={showLearnMoreDialog}
        title={t('phoneVerificationScreen.learnMore.title')}
        body={t('phoneVerificationScreen.learnMore.body')}
        onDismiss={onPressLearnMoreDismiss}
        testID="PhoneVerificationLearnMoreDialog"
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
    padding: Spacing.Thick24,
    width: '100%',
  },
  header: {
    ...typeScale.titleMedium,
    marginBottom: Spacing.Regular16,
    textAlign: 'center',
  },
  body: {
    ...typeScale.bodyMedium,
    marginBottom: 32,
    textAlign: 'center',
  },
  startButton: {
    marginBottom: Spacing.Thick24,
  },
  phoneNumber: {
    marginBottom: 32,
  },
  bottomButtonContainer: {
    padding: Spacing.Thick24,
    alignItems: 'center',
  },
  learnMore: {
    color: colors.gray3,
  },
  countryFlag: {
    backgroundColor: colors.gray1,
    borderWidth: 1,
    borderColor: colors.gray2,
  },
})

export default VerificationStartScreen
