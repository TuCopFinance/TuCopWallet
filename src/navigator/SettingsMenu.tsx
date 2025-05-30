import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SafeAreaView, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native'
import deviceInfoModule from 'react-native-device-info'
import { ScrollView } from 'react-native-gesture-handler'
import { devModeTriggerClicked } from 'src/account/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { setSessionId } from 'src/app/actions'
import { sessionIdSelector, walletConnectEnabledSelector } from 'src/app/selectors'
import GradientBlock from 'src/components/GradientBlock'
import { SettingsItemTextValue } from 'src/components/SettingsItem'
import Lock from 'src/icons/Lock'
import Preferences from 'src/icons/Preferences'
import Stack from 'src/icons/Stack'
import User from 'src/icons/User'
import Help from 'src/icons/navigator/Help'
import Wallet from 'src/icons/navigator/Wallet'
import MSLogoFull from 'src/images/MSLogoFull'
import { headerWithCloseButton } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import { selectSessions } from 'src/walletConnect/selectors'

export default function SettingsMenu() {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const appVersion = deviceInfoModule.getVersion()
  const buildNumber = deviceInfoModule.getBuildNumber()

  const { v2 } = useSelector(walletConnectEnabledSelector)
  const { sessions } = useSelector(selectSessions)
  const walletConnectEnabled = v2
  const connectedDapps = sessions?.length

  const sessionId = useSelector(sessionIdSelector)

  useEffect(() => {
    if (AppAnalytics.getSessionId() !== sessionId) {
      dispatch(setSessionId(AppAnalytics.getSessionId()))
    }
  }, [])

  const onDevSettingsTriggerPress = () => {
    dispatch(devModeTriggerClicked())
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <SettingsItemTextValue
          icon={<User size={24} color={Colors.black} />}
          title={t('profile')}
          onPress={() => navigate(Screens.ProfileSubmenu)}
          testID="SettingsMenu/Profile"
          showChevron
          borderless
        />

        <GradientBlock style={styles.divider} colors={[Colors.gray2, Colors.gray2]} />

        <SettingsItemTextValue
          icon={<Wallet size={24} color={Colors.black} />}
          title={t('address')}
          onPress={() =>
            navigate(Screens.QRNavigator, {
              screen: Screens.QRCode,
              params: { showSecureSendStyling: true },
            })
          }
          testID="SettingsMenu/Address"
          showChevron
          borderless
        />

        <GradientBlock style={styles.divider} colors={[Colors.gray2, Colors.gray2]} />

        <SettingsItemTextValue
          icon={<Preferences size={24} />}
          title={t('preferences')}
          testID="SettingsMenu/Preferences"
          onPress={() => navigate(Screens.PreferencesSubmenu)}
          showChevron
          borderless
        />
        <SettingsItemTextValue
          icon={<Lock width={24} height={24} color={Colors.black} />}
          title={t('securityPrivacy')}
          testID="SettingsMenu/Security"
          onPress={() => navigate(Screens.SecuritySubmenu)}
          showChevron
          borderless
        />
        {walletConnectEnabled && (
          <SettingsItemTextValue
            icon={<Stack size={24} color={Colors.black} />}
            title={t('connectedApplications')}
            testID="SettingsMenu/ConnectedDapps"
            value={connectedDapps.toString()}
            onPress={() => navigate(Screens.WalletConnectSessions)}
            showChevron
            borderless
          />
        )}

        <SettingsItemTextValue
          icon={<Help size={24} color={Colors.black} />}
          title={t('help')}
          onPress={() => navigate(Screens.Support)}
          testID="SettingsMenu/Help"
          showChevron
          borderless
        />

        <GradientBlock style={styles.divider} colors={[Colors.gray2, Colors.gray2]} />

        <SettingsItemTextValue
          title={t('legal')}
          testID="SettingsMenu/Legal"
          onPress={() => navigate(Screens.LegalSubmenu)}
          showChevron
          borderless
        />
        <TouchableWithoutFeedback onPress={onDevSettingsTriggerPress}>
          <View style={styles.appVersionContainer} testID="SettingsMenu/Version">
            <Text style={styles.appVersionText}>{t('appVersion')}</Text>
            <Text style={styles.appVersionText}>{`${appVersion} (${buildNumber})`}</Text>
          </View>
        </TouchableWithoutFeedback>
        {/* {getDevSettingsComp()} */}
        <View style={styles.logo}>
          <MSLogoFull color="black" />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

SettingsMenu.navigationOptions = () => ({
  ...headerWithCloseButton,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingTop: Spacing.Thick24,
    flexGrow: 1,
  },
  appVersionContainer: {
    flexDirection: 'row',
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingVertical: Spacing.Regular16,
    paddingHorizontal: variables.contentPadding,
  },
  appVersionText: {
    ...typeScale.bodyMedium,
    color: Colors.gray3,
  },
  // devSettings: {
  //   padding: Spacing.Regular16,
  // },
  // devSettingsItem: {
  //   alignSelf: 'stretch',
  //   marginVertical: Spacing.Smallest8,
  // },
  divider: {
    marginVertical: Spacing.Smallest8,
    marginHorizontal: Spacing.Regular16,
  },
  logo: {
    marginTop: 'auto',
    paddingVertical: Spacing.Thick24,
    alignItems: 'center',
  },
})
