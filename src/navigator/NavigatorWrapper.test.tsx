import { render, waitFor } from '@testing-library/react-native'
import CleverTap from 'clevertap-react-native'
import * as React from 'react'
import { Linking } from 'react-native'
import { Provider } from 'react-redux'
import NavigatorWrapper from 'src/navigator/NavigatorWrapper'
import { getDynamicConfigParams } from 'src/statsig'
import { StatsigDynamicConfigs } from 'src/statsig/types'
import { createMockStore } from 'test/utils'

jest.mock('src/statsig')
jest.mock('src/navigator/NavigationService', () => ({
  ...(jest.requireActual('src/navigator/NavigationService') as any),
  navigatorIsReadyRef: { current: false },
  navigate: jest.fn(),
}))
jest.mock('src/sentry/Sentry', () => ({
  ...(jest.requireActual('src/sentry/Sentry') as any),
  sentryRoutingInstrumentation: { registerNavigationContainer: jest.fn() },
}))

jest.mock('clevertap-react-native', () => ({
  getInitialUrl: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
}))

describe('NavigatorWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('initializes the deep links handlers', async () => {
    jest.mocked(getDynamicConfigParams).mockImplementation(({ configName }) => {
      if (configName === StatsigDynamicConfigs.APP_CONFIG) {
        return {
          minRequiredVersion: '0.0.1', // matches DeviceInfo mocks
        }
      }
      return {} as any
    })

    const { queryByText } = render(
      <Provider store={createMockStore()}>
        <NavigatorWrapper />
      </Provider>
    )

    await waitFor(() => expect(CleverTap.addListener).toHaveBeenCalled())
    expect(Linking.addEventListener).toHaveBeenCalled()
    expect(CleverTap.getInitialUrl).toHaveBeenCalled()
    expect(Linking.getInitialURL).toHaveBeenCalled()
    expect(queryByText('appUpdateAvailable')).toBeFalsy()
  })

  it('shows the upgrade screen if the version is below the minimum (release builds only)', () => {
    // Force release-mode semantics: the force-upgrade path is gated on
    // !__DEV__ so simulator / dogfood runs never land on UpgradeScreen.
    const originalDev = (globalThis as unknown as { __DEV__: boolean }).__DEV__
    ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false
    try {
      jest.mocked(getDynamicConfigParams).mockImplementation(({ configName }) => {
        if (configName === StatsigDynamicConfigs.APP_CONFIG) {
          return {
            minRequiredVersion: '2.0.0', // greater than DeviceInfo mocks
          }
        }
        return {} as any
      })

      const { getByText } = render(
        <Provider store={createMockStore()}>
          <NavigatorWrapper />
        </Provider>
      )

      expect(getByText('appUpdateAvailable')).toBeTruthy()
    } finally {
      ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev
    }
  })

  it('does NOT show the upgrade screen on dev builds even when Statsig demands a higher version', () => {
    // Guardrail: Statsig minRequiredVersion targets shipped users only;
    // simulators keep working even when the local version is below the
    // Statsig floor. Regression fence for the fix in PR #318.
    const originalDev = (globalThis as unknown as { __DEV__: boolean }).__DEV__
    ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true
    try {
      jest.mocked(getDynamicConfigParams).mockImplementation(({ configName }) => {
        if (configName === StatsigDynamicConfigs.APP_CONFIG) {
          return { minRequiredVersion: '2.0.0' }
        }
        return {} as any
      })

      const { queryByText } = render(
        <Provider store={createMockStore()}>
          <NavigatorWrapper />
        </Provider>
      )

      expect(queryByText('appUpdateAvailable')).toBeFalsy()
    } finally {
      ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev
    }
  })
})
