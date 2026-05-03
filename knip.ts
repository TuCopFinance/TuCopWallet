import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  entry: [
    'index.js!',
    'metro.config.js!',
    'e2e/**/*.js',
    'e2e/**/*.ts',
    '.github/scripts/*.ts',
    './scripts/**/*.js',
  ],
  project: ['src/**/*.ts!', 'src/**/*.tsx!', 'src/**/*.js!'],
  ignoreDependencies: [
    '@actions/github',
    '@babel/runtime', // enforce specific version for react-native
    '@babel/plugin-transform-private-methods', // used in babel.config.js to build. not imported, so knip doesn't understand it is used
    '@react-native-picker/picker', // react-native-picker-select requires
    'babel-jest',
    'jest-circus',
    'jest-html-reporter',
    'jest-junit',
    'jest-snapshot',
    'lint-staged', // pre-commit hook
    'lokijs', // walletconnect e2e tests requires
    'react-native-version',
    'react-native-kill-packager',
    'remote-redux-devtools', // for easy debugging with Flipper
    'typescript-json-schema', // helps manage redux state migrations
    '@segment/sovran-react-native', // required for react-native-segment
    '@segment/analytics-react-native-plugin-adjust', // segment plugin
    '@segment/analytics-react-native-plugin-clevertap', // segment plugin
    '@segment/analytics-react-native-plugin-destination-filters', // segment plugin
    '@segment/analytics-react-native-plugin-firebase', // segment plugin
    'react-native-adjust', // required for @segment/analytics-react-native-plugin-adjust
    'react-native-vector-icons', // used via react-native-dropdown-picker
    '@react-native-community/cli', // react-native cli tooling
    '@sentry/types', // type definitions for sentry
    'react-native-svg-mock', // test mocking
    '@types/jest',
    'husky',
    '@divvi/referral-sdk', // paused divviProtocol feature
  ],
  ignore: [
    'src/redux/reducersForSchemaGeneration.ts', // used for root state schema generation
    'src/analytics/docs.ts', // documents analytics events, no references
    'src/account/__mocks__/Persona.tsx', // unit test mocks
    'src/firebase/remoteConfigValuesDefaults.e2e.ts', // e2e test setup
    'src/setupE2eEnv.e2e.ts', // e2e test setup
    'src/statsig/__mocks__/index.ts', // unit test mocks
    'src/divviProtocol/**/*', // paused feature - kept for future reactivation
    'src/refi/**/*', // paused feature - ReFi Medellin UBI
    'src/abis/ICCOPStaking.ts', // ABI for paused marranitos feature
    'src/abis/IReFiMedellinUBI.ts', // ABI for paused ReFi feature
    'src/transactions/apiTestHelpers.ts', // test helpers
    'src/earn/marranitos/**/*', // paused feature - Marranitos staking
  ],
}

export default config
