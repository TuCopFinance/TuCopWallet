import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useAuth0 } from 'react-native-auth0'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { KeylessBackupEvents } from 'src/analytics/Events'
import BackButton from 'src/components/BackButton'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import CustomHeader from 'src/components/header/CustomHeader'
import TextButton from 'src/components/TextButton'
import i18n from 'src/i18n'
import AppleIcon from 'src/icons/Apple'
import GoogleIcon from 'src/icons/Google'
import KeylessBackupCancelButton from 'src/keylessBackup/KeylessBackupCancelButton'
import { auth0SignInCompleted, keylessBackupStarted } from 'src/keylessBackup/slice'
import { KeylessBackupFlow, KeylessBackupOrigin } from 'src/keylessBackup/types'
import { HeaderTitleWithSubtitle } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import {
  getOnboardingStepValues,
  goToNextOnboardingScreen,
  onboardingPropsSelector,
} from 'src/onboarding/steps'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { default as Colors, default as colors } from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'
import EmailImage from './email.svg'

const TAG = 'keylessBackup/SignInWithEmail'

function SignInWithEmailBottomSheet({
  keylessBackupFlow,
  origin,
  bottomSheetRef,
}: {
  keylessBackupFlow: KeylessBackupFlow
  origin: KeylessBackupOrigin
  bottomSheetRef: React.RefObject<BottomSheetModalRefType>
}) {
  const { t } = useTranslation()
  const onboardingProps = useSelector(onboardingPropsSelector)

  const onPressContinue = () => {
    AppAnalytics.track(KeylessBackupEvents.cab_setup_recovery_phrase)
    bottomSheetRef.current?.close()
    navigate(Screens.AccountKeyEducation, { origin: 'cabOnboarding' })
  }

  const onPressSkip = () => {
    AppAnalytics.track(KeylessBackupEvents.cab_sign_in_with_email_screen_skip, {
      keylessBackupFlow,
      origin,
    })
    goToNextOnboardingScreen({
      firstScreenInCurrentStep: Screens.SignInWithEmail,
      onboardingProps,
    })
    bottomSheetRef.current?.close()
  }

  return (
    <BottomSheet
      forwardedRef={bottomSheetRef}
      title={t('signInWithEmail.bottomSheet.title')}
      titleStyle={styles.bottomSheetTitle}
      testId="KeylessBackupSignInWithEmail/BottomSheet"
    >
      <Text style={styles.bottomSheetDescription}>
        {t('signInWithEmail.bottomSheet.description')}
      </Text>
      <View style={styles.bottomSheetButtonContainer}>
        <Button
          testID="BottomSheet/Continue"
          onPress={onPressContinue}
          text={t('signInWithEmail.bottomSheet.continue')}
          size={BtnSizes.FULL}
          type={BtnTypes.PRIMARY}
        />
        <Button
          testID="BottomSheet/Skip"
          onPress={onPressSkip}
          size={BtnSizes.FULL}
          type={BtnTypes.SECONDARY}
          text={t('signInWithEmail.bottomSheet.skip')}
        />
      </View>
    </BottomSheet>
  )
}
type OAuthProvider = 'google-oauth2' | 'apple'
type Props = NativeStackScreenProps<StackParamList, Screens.SignInWithEmail>

function SignInWithEmail({ route, navigation }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const showApple = true
  const { authorize, getCredentials, clearCredentials } = useAuth0()
  const { keylessBackupFlow, origin } = route.params
  const [loading, setLoading] = useState<null | OAuthProvider>(null)
  const onboardingProps = useSelector(onboardingPropsSelector)
  const { step, totalSteps } = getOnboardingStepValues(Screens.SignInWithEmail, onboardingProps)
  const { bottom } = useSafeAreaInsets()
  const insetsStyle = {
    paddingBottom: Math.max(0, 40 - bottom),
  }
  const address = useSelector(walletAddressSelector)

  // We check whether or not there is anything to go back to
  // in case that this screen is the app's initial route, which can occur
  // when restarting the app during onboarding.
  // N.B. that a change in this value will /not/ trigger a re-render, but
  // this should be fine since if this is true on the initial render, it should
  // never change.
  const canGoBack = navigation.canGoBack()

  const isSetup = keylessBackupFlow === KeylessBackupFlow.Setup
  const isSetupInOnboarding =
    keylessBackupFlow === KeylessBackupFlow.Setup && origin === KeylessBackupOrigin.Onboarding

  const bottomSheetRef = useRef<BottomSheetModalRefType>(null)

  const onPressSignInAnotherWay = () => {
    AppAnalytics.track(KeylessBackupEvents.cab_sign_in_another_way, {
      keylessBackupFlow,
      origin,
    })
    bottomSheetRef.current?.snapToIndex(0)
  }

  const onPressSignIn = async (provider: OAuthProvider) => {
    setLoading(provider)
    dispatch(
      keylessBackupStarted({
        keylessBackupFlow,
      })
    )
    AppAnalytics.track(KeylessBackupEvents.cab_sign_in_start, {
      keylessBackupFlow,
      origin,
      provider,
    })
    try {
      // clear any existing saved credentials
      await clearCredentials()

      Logger.debug(TAG, 'Starting auth0 login')

      await authorize({ scope: 'email', connection: provider })
      const credentials = await getCredentials()

      if (!credentials) {
        Logger.debug(TAG, 'login cancelled')
        setLoading(null)
        return
      }

      if (!credentials.idToken) {
        throw new Error('got an empty token from auth0')
      }
      navigate(Screens.KeylessBackupPhoneInput, { keylessBackupFlow, origin })
      dispatch(auth0SignInCompleted({ idToken: credentials.idToken }))
      AppAnalytics.track(KeylessBackupEvents.cab_sign_in_success, {
        keylessBackupFlow,
        origin,
        provider,
      })
      setTimeout(() => {
        // to avoid screen flash
        setLoading(null)
      }, 1000)
    } catch (err) {
      Logger.warn(TAG, 'login failed', err)
      setLoading(null)
    }
  }

  if (!address && isSetupInOnboarding) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.activityIndicatorContainer} testID="SignInWithEmail/Spinner">
          <ActivityIndicator testID="loadingTransferStatus" size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaView style={styles.container}>
      <CustomHeader
        style={styles.header}
        left={
          origin === KeylessBackupOrigin.Settings ? (
            <KeylessBackupCancelButton
              flow={keylessBackupFlow}
              origin={origin}
              eventName={KeylessBackupEvents.cab_sign_in_with_email_screen_cancel}
            />
          ) : // This includes Onboarding and Restore
          canGoBack ? (
            <BackButton
              testID="SignInWithEmail/BackButton"
              eventName={KeylessBackupEvents.cab_sign_in_with_email_screen_cancel}
              eventProperties={{
                keylessBackupFlow,
                origin,
              }}
            />
          ) : undefined
        }
        title={
          isSetupInOnboarding ? (
            <HeaderTitleWithSubtitle
              title={t('keylessBackupSetupTitle')}
              subTitle={t('registrationSteps', { step, totalSteps })}
            />
          ) : null
        }
      />
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.innerContainer}>
          <View style={styles.imageContainer}>
            <EmailImage />
            <Text style={styles.title}>{t('signInWithEmail.title')}</Text>
            <Text style={styles.subtitle}>
              <Trans
                i18n={i18n}
                i18nKey={isSetup ? 'signInWithEmail.subtitle' : 'signInWithEmail.subtitleRestore'}
                components={[<Text key={0} style={{ fontWeight: '700' }} />]}
              />
            </Text>
          </View>
          <View
            style={[
              styles.buttonContainer,
              isSetupInOnboarding
                ? insetsStyle
                : { marginBottom: Spacing.Thick24, gap: Spacing.Regular16 },
            ]}
          >
            <Button
              testID="SignInWithEmail/Google"
              onPress={() => onPressSignIn('google-oauth2')}
              text={t('signInWithEmail.google')}
              size={BtnSizes.FULL}
              type={BtnTypes.SECONDARY}
              iconPositionLeft={false}
              icon={<GoogleIcon color={Colors.primary} />}
              iconMargin={5}
              showLoading={loading === 'google-oauth2'}
              disabled={!!loading}
            />
            {showApple && (
              <Button
                testID="SignInWithEmail/Apple"
                onPress={() => onPressSignIn('apple')}
                text={t('signInWithEmail.apple')}
                size={BtnSizes.FULL}
                type={BtnTypes.SECONDARY}
                icon={<AppleIcon color={Colors.primary} />}
                iconPositionLeft={false}
                iconMargin={5}
                showLoading={loading === 'apple'}
                disabled={!!loading}
              />
            )}
            {isSetupInOnboarding && (
              <TextButton
                style={styles.signInAnotherWay}
                testID="SignInWithEmail/SignInAnotherWay"
                onPress={onPressSignInAnotherWay}
              >
                {t('signInWithEmail.signInAnotherWay')}
              </TextButton>
            )}
          </View>
          {isSetupInOnboarding && (
            <SignInWithEmailBottomSheet
              keylessBackupFlow={keylessBackupFlow}
              origin={origin}
              bottomSheetRef={bottomSheetRef}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

export default SignInWithEmail

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  container: {
    justifyContent: 'space-between',
    flex: 1,
  },
  activityIndicatorContainer: {
    paddingVertical: variables.contentPadding,
    flex: 1,
    alignContent: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
    padding: Spacing.Thick24,
  },
  header: {
    paddingHorizontal: variables.contentPadding,
  },
  imageContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.Thick24,
  },
  title: {
    ...typeScale.titleXSmall,
    textAlign: 'center',
    color: Colors.black,
    marginTop: Spacing.Thick24,
  },
  subtitle: {
    ...typeScale.bodySmall,
    textAlign: 'center',
    padding: Spacing.Regular16,
    color: Colors.black,
  },
  buttonContainer: {
    gap: Spacing.Smallest8,
    marginHorizontal: Spacing.Thick24,
  },
  bottomSheetTitle: {
    ...typeScale.titleSmall,
    textAlign: 'center',
    color: Colors.black,
  },
  bottomSheetDescription: {
    ...typeScale.bodyMedium,
    paddingHorizontal: Spacing.Thick24,
    paddingVertical: Spacing.Small12,
    textAlign: 'center',
    color: Colors.black,
  },
  bottomSheetButtonContainer: {
    gap: Spacing.Smallest8,
  },
  signInAnotherWay: {
    alignSelf: 'center',
    marginTop: Spacing.Smallest8,
  },
})
