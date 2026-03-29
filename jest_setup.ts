import '@testing-library/jest-native/extend-expect'
import { configure } from '@testing-library/react-native'
// react-native-svg is mocked via moduleNameMapper in jest.config.js
// BigInt serialization polyfill is loaded early via setupFiles (jest_bigint_setup.js)

// Configure @testing-library/react-native host component names for RN 0.77
// This fixes the "Element type is invalid" error during detectHostComponentNames
configure({
  hostComponentNames: {
    text: 'Text',
    textInput: 'TextInput',
    switch: 'RCTSwitch',
    scrollView: 'RCTScrollView',
    modal: 'Modal',
  },
})

beforeAll(() => {
  jest.useFakeTimers()
})

if (typeof window !== 'object') {
  // @ts-ignore
  global.window = global
  // @ts-ignore
  global.window.navigator = {}
}

// @ts-ignore
global.fetch = require('jest-fetch-mock')

// Mock LayoutAnimation as it's done not automatically
jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation.js')

// Mock Animated Views this way otherwise we get a
// `JavaScript heap out of memory` error when a ref is set (?!)
// See https://github.com/callstack/react-native-testing-library/issues/539
jest.mock('react-native/Libraries/Animated/components/AnimatedView.js', () => ({
  default: 'View',
}))
jest.mock('react-native/Libraries/Animated/components/AnimatedScrollView.js', () => ({
  default: 'RCTScrollView',
}))
jest.mock('react-native-webview', () => {
  const { View } = require('react-native')
  return {
    default: View,
    WebView: View,
  }
})

// Mock ToastAndroid as it's not done automatically
jest.mock('react-native/Libraries/Components/ToastAndroid/ToastAndroid.android.js', () => ({
  show: jest.fn(),
  showWithGravity: jest.fn(),
  showWithGravityAndOffset: jest.fn(),
}))

jest.mock('react-native-shake', () => ({
  addListener: jest.fn(),
  removeAllListeners: jest.fn(),
}))

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn().mockResolvedValue(''),
  hasString: jest.fn().mockResolvedValue(false),
}))

// this mock defaults to granting all permissions
jest.mock('react-native-permissions', () => require('react-native-permissions/mock'))

// Mock BackHandler for RN 0.77+ which removed removeEventListener
// react-native-modal still uses the old API, so we need to polyfill it
const mockBackHandler = jest.requireActual('react-native').BackHandler
jest.mock('react-native/Libraries/Utilities/BackHandler', () => ({
  ...mockBackHandler,
  addEventListener: jest.fn((event, callback) => ({
    remove: jest.fn(),
  })),
  removeEventListener: jest.fn(),
}))
