import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLogger } from '@react-navigation/devtools'
import { NavigationContainer, NavigationState } from '@react-navigation/native'
import * as Sentry from '@sentry/react-native'
import { SeverityLevel } from '@sentry/types'
import * as React from 'react'
import { useMemo } from 'react'
import { Linking, Platform, StyleSheet, View } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import ShakeForSupport from 'src/account/ShakeForSupport'
import AlertBanner from 'src/alert/AlertBanner'
import AppAnalytics from 'src/analytics/AppAnalytics'
import UpgradeScreen from 'src/app/UpgradeScreen'
import { activeScreenChanged } from 'src/app/actions'
import { getAppLocked } from 'src/app/selectors'
import { useDeepLinks } from 'src/app/useDeepLinks'
import { APP_STORE_ID, DEV_RESTORE_NAV_STATE_ON_RELOAD } from 'src/config'
import { useAppUpdateChecker } from 'src/hooks/useAppUpdateChecker'
import JumpstartClaimStatusToasts from 'src/jumpstart/JumpstartClaimStatusToasts'
import {
  navigateClearingStack,
  navigationRef,
  navigatorIsReadyRef,
} from 'src/navigator/NavigationService'
import Navigator from 'src/navigator/Navigator'
import { Screens } from 'src/navigator/Screens'
import PincodeLock from 'src/pincode/PincodeLock'
import HooksPreviewModeBanner from 'src/positions/HooksPreviewModeBanner'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { sentryRoutingInstrumentation } from 'src/sentry/Sentry'
import { getDynamicConfigParams } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs } from 'src/statsig/types'
import appTheme from 'src/styles/appTheme'
import Logger from 'src/utils/Logger'
import { userInSanctionedCountrySelector } from 'src/utils/countryFeatures'
import { isVersionBelowMinimum } from 'src/utils/versionCheck'

// This uses RN Navigation's experimental nav state persistence
// to improve the hot reloading experience when in DEV mode
// https://reactnavigation.org/docs/en/state-persistence.html
const PERSISTENCE_KEY = 'NAVIGATION_STATE'

// @ts-ignore https://reactnavigation.org/docs/screen-tracking/
const getActiveRouteName = (state: NavigationState) => {
  const route = state.routes[state.index]

  if (route.state) {
    // @ts-ignore Dive into nested navigators
    return getActiveRouteName(route.state)
  }

  return route.name
}

const RESTORE_STATE = __DEV__ && DEV_RESTORE_NAV_STATE_ON_RELOAD

export const NavigatorWrapper = () => {
  const [isReady, setIsReady] = React.useState(RESTORE_STATE ? false : true)
  const [initialState, setInitialState] = React.useState()
  const appLocked = useSelector(getAppLocked)
  const { minRequiredVersion } = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.APP_CONFIG]
  )
  const routeNameRef = React.useRef<string>()
  const inSanctionedCountry = useSelector(userInSanctionedCountrySelector)

  const dispatch = useDispatch()

  useLogger(navigationRef)
  useDeepLinks()

  // Sistema de verificación de actualizaciones mejorado
  const { updateInfo } = useAppUpdateChecker({
    minRequiredVersion,
    useBackend: true,
    showDialogAutomatically: true,
    checkOnAppStart: true,
    checkOnAppResume: true,
    checkInterval: 60 * 60 * 1000,
  })

  // Log para debugging
  React.useEffect(() => {
    Logger.info('NavigatorWrapper', '🔧 Update checker config:', {
      minRequiredVersion,
      useBackend: true,
      showDialogAutomatically: true,
      checkOnAppStart: true,
      checkOnAppResume: true,
    })
  }, [minRequiredVersion])

  React.useEffect(() => {
    if (updateInfo) {
      Logger.info('NavigatorWrapper', '📊 Update info received:', {
        hasUpdate: updateInfo.hasUpdate,
        currentVersion: updateInfo.currentVersion,
        latestVersion: updateInfo.latestVersion,
        isForced: updateInfo.isForced,
      })
    }
  }, [updateInfo])

  // URL de actualización para fallback (mover fuera de la condición)
  const upgradeUrl = React.useMemo(() => {
    // Usar la misma lógica que en appUpdateChecker para consistencia
    if (Platform.OS === 'ios') {
      return `https://apps.apple.com/app/id${APP_STORE_ID}`
    } else {
      const bundleId = DeviceInfo.getBundleId()
      return `https://play.google.com/store/apps/details?id=${bundleId}`
    }
  }, [])

  // Verificación de actualización forzada (mantener compatibilidad con sistema existente)
  const shouldForceUpgrade = useMemo(() => {
    // Priorizar resultado del nuevo sistema
    if (updateInfo?.isForced) {
      return true
    }

    // Fallback al sistema existente con Statsig
    if (minRequiredVersion && DeviceInfo.getVersion()) {
      return isVersionBelowMinimum(DeviceInfo.getVersion(), minRequiredVersion)
    }

    return false
  }, [updateInfo, minRequiredVersion])

  React.useEffect(() => {
    if (inSanctionedCountry) {
      navigateClearingStack(Screens.SanctionedCountryErrorScreen)
    }
  }, [inSanctionedCountry])

  React.useEffect(() => {
    if (navigationRef && navigationRef.current) {
      const state = navigationRef.current.getRootState()

      if (state) {
        // Save the initial route name
        routeNameRef.current = getActiveRouteName(state)
      }
    }
  }, [])

  React.useEffect(() => {
    const restoreState = async () => {
      const savedStateString = await AsyncStorage.getItem(PERSISTENCE_KEY)
      if (savedStateString) {
        try {
          const state = JSON.parse(savedStateString)

          setInitialState(state)
        } catch (e) {
          Logger.error('NavigatorWrapper', 'Error getting nav state', e)
        }
      }
      setIsReady(true)
    }

    if (!isReady) {
      restoreState().catch((error) =>
        Logger.error('NavigatorWrapper', 'Error persisting nav state', error)
      )
    }
  }, [isReady])

  React.useEffect(() => {
    return () => {
      navigatorIsReadyRef.current = false
    }
  }, [])

  if (!isReady) {
    return null
  }

  const handleStateChange = (state: NavigationState | undefined) => {
    if (state === undefined) {
      return
    }

    if (RESTORE_STATE) {
      AsyncStorage.setItem(PERSISTENCE_KEY, JSON.stringify(state)).catch((error) =>
        Logger.error('NavigatorWrapper', 'Error persisting nav state', error)
      )
    }

    const previousRouteName = routeNameRef.current
    const currentRouteName = getActiveRouteName(state)

    if (previousRouteName !== currentRouteName) {
      AppAnalytics.page(currentRouteName, {
        previousScreen: previousRouteName,
        currentScreen: currentRouteName,
      })
      dispatch(activeScreenChanged(currentRouteName as Screens))
      Sentry.addBreadcrumb({
        category: 'navigation',
        message: `Navigated to ${currentRouteName}`,
        level: 'info' as SeverityLevel,
      })
    }

    // Save the current route name for later comparision
    routeNameRef.current = currentRouteName
  }

  const onReady = () => {
    navigatorIsReadyRef.current = true
    sentryRoutingInstrumentation.registerNavigationContainer(navigationRef)
  }

  // Función para navegar a la tienda de aplicaciones
  const navigateToAppStore = () => {
    if (updateInfo?.downloadUrl) {
      void Linking.openURL(updateInfo.downloadUrl)
    } else {
      // Fallback al sistema existente
      void Linking.openURL(upgradeUrl)
    }
  }

  if (shouldForceUpgrade) {
    return (
      <UpgradeScreen
        updateInfo={updateInfo || undefined}
        onUpdate={() => {
          // Usar función de navegación del nuevo sistema
          navigateToAppStore()
        }}
      />
    )
  }

  return (
    <NavigationContainer
      navigationInChildEnabled
      ref={navigationRef}
      onReady={onReady}
      onStateChange={handleStateChange}
      initialState={initialState}
      theme={appTheme}
    >
      <View style={styles.container}>
        <Navigator />
        <HooksPreviewModeBanner />
        {(appLocked || shouldForceUpgrade) && (
          <View style={styles.locked}>
            {shouldForceUpgrade ? (
              <UpgradeScreen
                updateInfo={updateInfo || undefined}
                onUpdate={() => {
                  // Usar función de navegación del nuevo sistema
                  navigateToAppStore()
                }}
              />
            ) : (
              <PincodeLock />
            )}
          </View>
        )}
        <AlertBanner />
        <ShakeForSupport />
        <JumpstartClaimStatusToasts />
      </View>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  locked: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
})

export const navbarStyle: {
  headerMode: 'none'
} = {
  headerMode: 'none',
}

export const headerArea = {
  navigationOptions: {
    headerStyle: {
      elevation: 0,
    },
  },
}

export default NavigatorWrapper
