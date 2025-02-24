import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NativeStackHeaderProps, NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import TabActivity from 'src/home/TabActivity'
import TabHome from 'src/home/TabHome'
import ClockIcon from 'src/icons/ClockIcon'
import Wallet from 'src/icons/navigator/Wallet'
import Swap from 'src/icons/tab-home/Swap'
import { tabHeader } from 'src/navigator/Headers'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import TabWallet from 'src/tokens/TabWallet'

const Tab = createBottomTabNavigator()

type Props = NativeStackScreenProps<StackParamList, Screens.TabNavigator>

export default function TabNavigator({ route }: Props) {
  const initialScreen = route.params?.initialScreen ?? Screens.TabHome
  const { t } = useTranslation()

  return (
    <Tab.Navigator
      initialRouteName={initialScreen}
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerTitleAllowFontScaling: false,
        tabBarActiveTintColor: Colors.black,
        tabBarInactiveTintColor: Colors.gray3,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.tabBarItem,
        tabBarAllowFontScaling: false,
        tabBarStyle: {
          height: Platform.select({ ios: variables.height * 0.1, android: 65 }),
          borderTopWidth: 0,
          backgroundColor: Colors.white,
          paddingBottom: Platform.select({ ios: 20, android: 12 }),
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
              <Swap />
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
              <ClockIcon />
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
    android_ripple: { color: 'transparent' },
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
