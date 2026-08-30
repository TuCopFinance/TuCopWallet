// Order is important, please don't change it unless you know what you're doing :D
import 'src/missingGlobals'
import 'src/forceCommunityAsyncStorage'
import 'src/setupE2eEnv' // This is only for E2E tests and has no effects when not running E2E tests
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated'
import { AppRegistry } from 'react-native'
import Logger from 'src/utils/Logger'
// This needs to happen early so any errors (including in the store) get caught
import Config from 'react-native-config'
import { stringToBoolean } from 'src/utils/parsing'
import App from 'src/app/App'
import * as Sentry from '@sentry/react-native'
import { initializeSentryEarly } from 'src/sentry/Sentry'
import 'react-native-gesture-handler'
import { Text, TextInput } from 'react-native'
import 'intl-pluralrules'

const SENTRY_ENABLED = stringToBoolean(Config.SENTRY_ENABLED || 'false')

Logger.overrideConsoleLogs()
Logger.cleanupOldLogs()

// Configure Reanimated logger to suppress strict mode warnings
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false, // Disable strict mode warnings about reading .value during render
})

// Filter out Sentry warnings in development mode
if (__DEV__ && !SENTRY_ENABLED) {
  const originalConsoleWarn = console.warn
  console.warn = (...args) => {
    const message = args.join(' ')
    // Skip Sentry-related warnings when Sentry is disabled
    if (
      message.includes('Sentry') ||
      message.includes('sentry/') ||
      message.includes('App Start Span')
    ) {
      return
    }
    originalConsoleWarn(...args)
  }
}

// Initialize Sentry early, before App component registration
// This prevents "Sentry.wrap called before Sentry.init" warning
initializeSentryEarly()

// Global JS error handler. Sentry's reactNativeErrorHandlersIntegration
// (default) also patches this and forwards to Sentry, but we chain a
// breadcrumb + Logger.error BEFORE the default handler runs so the Sentry
// event carries a searchable "root_error_handler" breadcrumb even if the
// event itself lands untagged (no captureBusinessError). Belt-and-suspenders
// for the P1P class of fatal-unhandled crashes (TUCOPWALLET-1P and friends).
const defaultErrorHandler = ErrorUtils.getGlobalHandler()
const customErrorHandler = (e, isFatal) => {
  Logger.error('RootErrorHandler', `Unhandled error. isFatal: ${isFatal}`, e)
  try {
    Sentry.addBreadcrumb({
      category: 'app.root_error_handler',
      level: isFatal ? 'fatal' : 'error',
      message: e && e.message ? e.message : 'unknown error',
      data: {
        isFatal: !!isFatal,
        name: e && e.name,
        // Truncated stack: full stack is on the event itself, this is
        // just a hint in the breadcrumb trail so support can see the
        // crash chain at a glance.
        stackTop:
          e && typeof e.stack === 'string'
            ? e.stack.split('\n').slice(0, 3).join(' | ')
            : undefined,
      },
    })
  } catch {
    // never let the breadcrumb layer swallow the original error
  }
  defaultErrorHandler(e, isFatal)
}
ErrorUtils.setGlobalHandler(customErrorHandler)

// Prevent Text elements font from scaling over 2
Text.defaultProps = {
  ...Text.defaultProps,
  maxFontSizeMultiplier: 2,
}

// Prevent TextInput font from scaling over 2
// Scale font to fit on TextInput elements
TextInput.defaultProps = {
  ...TextInput.defaultProps,
  maxFontSizeMultiplier: 2,
  adjustsFontSizeToFit: true,
}

AppRegistry.registerComponent(Config.APP_REGISTRY_NAME, () => App)
