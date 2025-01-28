import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { NativeStackHeaderProps, NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
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
          height: variables.height * 0.1,
          borderTopWidth: 0,
          backgroundColor: Colors.white,
        },
        tabBarLabelPosition: 'beside-icon',
        ...(tabHeader as NativeStackHeaderProps),
      }}
    >
      <Tab.Screen
        name={Screens.TabWallet}
        component={TabWallet}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: '100%',
                gap: 8,
              }}
            >
              <Text
                style={{
                  color,
                  fontSize: 16,
                  marginRight: 6,
                  marginLeft: 14,
                }}
              >
                {t('bottomTabsNavigator.wallet.tabName')}
              </Text>
              <Wallet />
            </View>
          ),
          tabBarIcon: () => null, // Hide default icon since we're using custom label
          tabBarButtonTestID: 'Tab/Wallet',
        }}
      />
      <Tab.Screen
        name={Screens.TabHome}
        component={TabHome}
        options={{
          freezeOnBlur: false,
          lazy: false,
          tabBarIcon: () => <Swap />,
          tabBarLabel: '',
          tabBarButtonTestID: 'Tab/Home',
          tabBarIconStyle: {
            marginLeft: 15,
          },
        }}
      />
      <Tab.Screen
        name={Screens.TabActivity}
        component={TabActivity}
        options={{
          tabBarLabel: ({ focused, color }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                width: '100%',
                marginRight: 20,
                gap: 8,
              }}
            >
              <ClockIcon />
              <Text
                style={{
                  color,
                  fontSize: 16,
                  paddingLeft: 6,
                }}
              >
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
  },
  tabBarItem: {
    paddingVertical: Spacing.Smallest8,
  },
})
