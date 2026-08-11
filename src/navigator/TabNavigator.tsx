import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NativeStackHeaderProps, NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import TabActivity from 'src/home/TabActivity'
import TabHome from 'src/home/TabHome'
import Activity from 'src/icons/features/Activity'
import Wallet from 'src/icons/navigator/Wallet'
import { tabHeader } from 'src/navigator/Headers'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import TabWallet from 'src/tokens/TabWallet'
import HomeIcon from './HomeIcon.svg'

const Tab = createBottomTabNavigator()

// Base tab-bar height without accounting for the device's bottom safe area.
// The full rendered height becomes TAB_BAR_BASE_HEIGHT + insets.bottom, so
// on devices with an edge-to-edge display + gesture bar or 3-button nav
// (Xiaomi 14T Pro, most modern Android, iPhones with the home indicator)
// the labels stay above the system navigation area instead of overlapping.
const TAB_BAR_BASE_HEIGHT = 56

type Props = NativeStackScreenProps<StackParamList, Screens.TabNavigator>

export default function TabNavigator({ route }: Props) {
  const initialScreen = route.params?.initialScreen ?? Screens.TabHome
  const { t } = useTranslation()
  // Safe-area-aware bottom padding so the tab bar never sits under the
  // system nav (Android edge-to-edge or iOS home indicator). Prior versions
  // hardcoded 12/20 which overlapped the system nav on Xiaomi 14T Pro and
  // felt tight on iPhones with the home indicator on smaller screens.
  const insets = useSafeAreaInsets()

  return (
    <Tab.Navigator
      initialRouteName={initialScreen}
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerTitleAllowFontScaling: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.primary80,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.tabBarItem,
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          borderTopWidth: 0,
          backgroundColor: Colors.white,
          paddingBottom: insets.bottom,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarButton: (props) => (
          <Pressable
            {...props}
            android_ripple={null}
            style={[
              props.style,
              {
                backgroundColor: 'transparent',
              },
            ]}
          />
        ),
        tabBarLabelPosition: 'beside-icon',
        ...(tabHeader as NativeStackHeaderProps),
      }}
    >
      <Tab.Screen
        name={Screens.TabWallet}
        component={TabWallet}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <View style={styles.tabItemContainer}>
              <Text style={[styles.tabText, { color }]}>
                {t('bottomTabsNavigator.wallet.tabName')}
              </Text>
              <Wallet />
            </View>
          ),
          tabBarIcon: () => null,
          tabBarButtonTestID: 'Tab/Wallet',
        }}
      />
      <Tab.Screen
        name={Screens.TabHome}
        component={TabHome}
        options={{
          freezeOnBlur: false,
          lazy: false,
          tabBarIcon: () => (
            <View style={styles.centerTabIcon}>
              <HomeIcon />
            </View>
          ),
          tabBarLabel: '',
          tabBarButtonTestID: 'Tab/Home',
        }}
      />
      <Tab.Screen
        name={Screens.TabActivity}
        component={TabActivity}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <View style={[styles.tabItemContainer, styles.activityContainer]}>
              <Activity />
              <Text style={[styles.tabText, { color }]}>
                {t('bottomTabsNavigator.activity.tabName')}
              </Text>
            </View>
          ),
          tabBarIcon: () => null,
          tabBarButtonTestID: 'Tab/Activity',
        }}
      />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  label: {
    ...typeScale.labelSemiBoldSmall,
    textAlign: 'center',
    flexShrink: 1,
  },
  tabBarItem: {
    height: Platform.select({ ios: 49, android: 53 }),
    paddingVertical: Spacing.Smallest8,
    flex: 1,
  },
  activityContainer: {
    marginLeft: Platform.select({ ios: 0, android: -44 }),
    marginRight: Platform.select({ ios: 48, android: 12 }),
    paddingRight: Platform.select({ ios: 16, android: 12 }),
  },
  tabItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: Platform.select({ ios: 8, android: 12 }),
    gap: Platform.select({ ios: 8, android: 10 }),
  },
  tabText: {
    ...typeScale.labelSemiBoldMedium,
    marginHorizontal: Platform.select({ android: 8, ios: 8 }),
  },
  centerTabIcon: {
    justifyContent: 'center',
    height: '100%',
    width: '100%',
  },
})
