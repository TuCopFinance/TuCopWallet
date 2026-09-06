import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs'
import { useIsFocused } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useRef, useState } from 'react'
import { useAsync } from 'react-async-hook'
import { useTranslation } from 'react-i18next'
import { Platform, StatusBar, StyleSheet, View } from 'react-native'
import { PERMISSIONS, RESULTS, check } from 'react-native-permissions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { QrScreenEvents } from 'src/analytics/Events'
import { noHeader } from 'src/navigator/Headers'
import { Screens } from 'src/navigator/Screens'
import { QRTabParamList, StackParamList } from 'src/navigator/types'
import QRCode from 'src/qrcode/QRCode'
import QRScanner from 'src/qrcode/QRScanner'
import QRTabBar from 'src/qrcode/QRTabBar'
import { useDispatch } from 'src/redux/hooks'
import { SVG, handleQRCodeDetected } from 'src/send/actions'
import { QrCode } from 'src/send/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'

const Tab = createBottomTabNavigator()

export type QRCodeProps = NativeStackScreenProps<QRTabParamList, Screens.QRCode> & {
  qrSvgRef: React.MutableRefObject<SVG>
}

export function QRCodePicker({ route, qrSvgRef, ...props }: QRCodeProps) {
  const onPressCopy = () => {
    AppAnalytics.track(QrScreenEvents.qr_screen_copy_address)
  }
  return <QRCode {...props} qrSvgRef={qrSvgRef} onPressCopy={onPressCopy} />
}

type ScannerSceneProps = NativeStackScreenProps<QRTabParamList, Screens.QRScanner>

// Component doing our custom transition for the QR scanner
function ScannerScene({ route }: ScannerSceneProps) {
  const lastScannedQR = useRef('')
  const dispatch = useDispatch()
  const defaultOnQRCodeDetected = (qrCode: QrCode) =>
    dispatch(
      handleQRCodeDetected({
        qrCode,
        defaultTokenIdOverride: route?.params?.defaultTokenIdOverride,
      })
    )
  const { onQRCodeDetected: onQRCodeDetectedParam = defaultOnQRCodeDetected } = route.params || {}
  const isFocused = useIsFocused()
  const [wasFocused, setWasFocused] = useState(isFocused)
  const cameraPermission = useAsync(check, [
    Platform.select({ ios: PERMISSIONS.IOS.CAMERA, default: PERMISSIONS.ANDROID.CAMERA }),
  ])
  // DENIED means the permission has not been requested / is denied but requestable
  const hasAskedCameraPermission =
    cameraPermission.result !== undefined && cameraPermission.result !== RESULTS.DENIED

  useEffect(() => {
    if (isFocused && !wasFocused) {
      setWasFocused(true)
    }
  }, [isFocused])

  // This only enables the camera when necessary.
  // There a special treatment for when we haven't asked the user for camera permission yet.
  // In that case we want to wait for the screen to be fully focused before enabling the camera so the
  // prompt doesn't show up in the middle of the slide animation.
  // Indeed, enabling the camera directly triggers the permission prompt with the current version of
  // react-native-camera.
  const enableCamera = isFocused || hasAskedCameraPermission || wasFocused

  const onQRCodeDetectedWrapper = (qrCode: QrCode) => {
    if (lastScannedQR.current === qrCode.data) {
      return
    }
    Logger.debug('QRScanner', 'Bar code detected')
    onQRCodeDetectedParam(qrCode)
    lastScannedQR.current = qrCode.data
  }

  return (
    <View style={styles.viewContainer}>
      {isFocused && <StatusBar barStyle="light-content" />}
      {enableCamera && <QRScanner onQRCodeDetected={onQRCodeDetectedWrapper} />}
    </View>
  )
}

type Props = NativeStackScreenProps<StackParamList, Screens.QRNavigator>

export default function QRNavigator({ route }: Props) {
  const qrSvgRef = useRef<SVG>()
  const { t } = useTranslation()

  return (
    <Tab.Navigator
      //tabBar={tabBar}
      // Trick to position the tabs floating on top
      tabBar={(props: BottomTabBarProps) => (
        <QRTabBar
          {...(props as unknown as MaterialTopTabBarProps)}
          qrSvgRef={qrSvgRef}
          canSwitch={!route.params?.params?.showSecureSendStyling}
          leftIcon={route.params?.params?.showSecureSendStyling ? 'back' : 'times'}
        />
      )}
      screenOptions={{
        // Hide the Tab.Navigator's own header. It was spreading
        // `tabHeader` (which renders SendButton + QrScanButton +
        // SettingsGearButton on the right) and reserving ~110-140px
        // at the top of the modal. Two problems: (1) those icons do
        // not make sense on the QR screen itself (why show a "scan
        // QR" button on the scan-QR screen), (2) the QRTabBar sits
        // position:absolute at top:100 to clear that header and
        // still lands inside the reserved area, overlapping the
        // buttons. Killing the header lets QRTabBar own the top
        // strip cleanly.
        headerShown: false,
        tabBarActiveTintColor: Colors.black,
        tabBarInactiveTintColor: Colors.gray3,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.tabBarItem,
        tabBarAllowFontScaling: false,
        tabBarLabelPosition: 'beside-icon',
      }}
    >
      <Tab.Screen name={Screens.QRCode} options={{ title: t('myCode') ?? undefined }}>
        {({ route, navigation }) => (
          <QRCodePicker
            navigation={navigation}
            route={{
              ...route,
              params: { ...route.params },
            }}
            qrSvgRef={qrSvgRef}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name={Screens.QRScanner} options={{ title: t('scanCode') ?? undefined }}>
        {(props) => <ScannerScene {...props} />}
      </Tab.Screen>
    </Tab.Navigator>
  )
}

QRNavigator.navigationOptions = {
  ...noHeader,
}

const styles = StyleSheet.create({
  label: {
    ...typeScale.labelSemiBoldSmall,
  },
  tabBarItem: {
    paddingVertical: Spacing.Smallest8,
    margin: 20,
  },
  viewContainer: {
    // MUST NOT center the child. RNCamera has flex:1 and expects a
    // parent that lets it stretch to the full available area. When
    // this container had justifyContent:center + alignItems:center
    // the camera preview collapsed into a small dark rectangle in
    // the middle of the screen (visible on the simulator, but the
    // same behavior surfaces on real devices as a shrunken viewfinder
    // that misses QRs at the edges). Plain flex:1 lets the camera
    // fill the modal.
    flex: 1,
  },
})
