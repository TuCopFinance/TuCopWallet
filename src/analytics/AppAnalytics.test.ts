import { createClient } from '@segment/analytics-react-native'
import { StatsigClientRN } from '@statsig/react-native-bindings'
import { PincodeType } from 'src/account/reducer'
import AppAnalyticsModule from 'src/analytics/AppAnalytics'
import { OnboardingEvents } from 'src/analytics/Events'
import { store } from 'src/redux/store'
import { getDefaultStatsigUser, getFeatureGate, getMultichainFeatures } from 'src/statsig'
import { NetworkId } from 'src/transactions/types'
import { getMockStoreData } from 'test/utils'
import {
  mockCeloAddress,
  mockCeloTokenId,
  mockCeurAddress,
  mockCeurTokenId,
  mockCusdAddress,
  mockCusdTokenId,
  mockPositions,
  mockTestTokenAddress,
  mockTestTokenTokenId,
} from 'test/values'

jest.mock('@segment/analytics-react-native')
jest.mock('@segment/analytics-react-native-plugin-adjust')
jest.mock('@segment/analytics-react-native-plugin-clevertap')
jest.mock('@segment/analytics-react-native-plugin-firebase')
jest.mock('@sentry/react-native', () => ({ init: jest.fn() }))
jest.mock('src/redux/store', () => ({ store: { getState: jest.fn() } }))
jest.mock('src/config', () => ({
  ...(jest.requireActual('src/config') as any),
  STATSIG_API_KEY: 'statsig-key',
}))
jest.mock('@statsig/react-native-bindings', () => ({
  StatsigClientRN: jest.fn().mockImplementation(() => ({
    initializeAsync: jest.fn().mockResolvedValue(undefined),
  })),
}))
jest.mock('src/statsig')
jest.mock('src/web3/networkConfig', () => {
  const originalModule = jest.requireActual('src/web3/networkConfig')
  return {
    ...originalModule,
    __esModule: true,
    default: {
      ...originalModule.default,
      defaultNetworkId: 'celo-mainnet',
    },
  }
})

const mockDeviceId = 'abc-def-123' // mocked in __mocks__/react-native-device-info.ts (but importing from that file causes weird errors)
const expectedSessionId = '453e535d43b22002185f316d5b41561010d9224580bfb608da132e74b128227a'
const mockWalletAddress = '0x12AE66CDc592e10B60f9097a7b0D3C59fce29876' // deliberately using checksummed version here

const mockCreateSegmentClient = jest.mocked(createClient)

const mockStore = jest.mocked(store)
const state = getMockStoreData({
  tokens: {
    tokenBalances: {
      [mockCusdTokenId]: {
        address: mockCusdAddress,
        tokenId: mockCusdTokenId,
        networkId: NetworkId['celo-mainnet'],
        symbol: 'cUSD',
        priceUsd: '1',
        balance: '10',
        priceFetchedAt: Date.now(),
        isFeeCurrency: true,
      },
      [mockCeurTokenId]: {
        address: mockCeurAddress,
        tokenId: mockCeurTokenId,
        networkId: NetworkId['celo-mainnet'],
        symbol: 'cEUR',
        priceUsd: '1.2',
        balance: '20',
        priceFetchedAt: Date.now(),
        isFeeCurrency: true,
      },
      [mockCeloTokenId]: {
        address: mockCeloAddress,
        tokenId: mockCeloTokenId,
        networkId: NetworkId['celo-mainnet'],
        symbol: 'CELO',
        priceUsd: '5',
        balance: '0',
        priceFetchedAt: Date.now(),
        isFeeCurrency: true,
      },
      [mockTestTokenTokenId]: {
        address: mockTestTokenAddress,
        tokenId: mockTestTokenTokenId,
        networkId: NetworkId['celo-mainnet'],
        symbol: 'TT',
        balance: '10',
        priceFetchedAt: Date.now(),
      },
      'celo-mainnet:0xMOO': {
        address: '0xMOO',
        tokenId: 'celo-mainnet:0xMOO',
        networkId: NetworkId['celo-mainnet'],
        symbol: 'MOO',
        priceUsd: '4',
        balance: '0',
        priceFetchedAt: Date.now(),
      },
      'celo-mainnet:0xUBE': {
        address: '0xUBE',
        tokenId: 'celo-mainnet:0xUBE',
        networkId: NetworkId['celo-mainnet'],
        symbol: 'UBE',
        priceUsd: '2',
        balance: '1',
        priceFetchedAt: Date.now(),
      },
    },
  },
  positions: {
    positions: mockPositions,
  },
  web3: {
    account: mockWalletAddress,
  },
  account: {
    pincodeType: PincodeType.CustomPin,
  },
  app: {
    phoneNumberVerified: true,
  },
  points: {
    pointsBalance: '50',
  },
})

// Disable __DEV__ so analytics is enabled
// @ts-ignore
global.__DEV__ = false

beforeAll(() => {
  jest.useFakeTimers({ now: 1482363367071 })
})

describe('AppAnalytics', () => {
  let AppAnalytics: typeof AppAnalyticsModule
  const mockSegmentClient = {
    identify: jest.fn().mockResolvedValue(undefined),
    track: jest.fn().mockResolvedValue(undefined),
    screen: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    userInfo: {
      get: jest.fn().mockReturnValue({ anonymousId: 'anonId' }),
      set: jest.fn().mockReturnValue(undefined),
    },
    reset: jest.fn(),
    add: jest.fn(),
  }
  mockCreateSegmentClient.mockReturnValue(mockSegmentClient as any)

  beforeEach(() => {
    jest.clearAllMocks()
    jest.unmock('src/analytics/AppAnalytics')
    jest.isolateModules(() => {
      AppAnalytics = require('src/analytics/AppAnalytics').default
    })
    mockStore.getState.mockImplementation(() => state)
    jest.mocked(getFeatureGate).mockReturnValue(true)
    jest.mocked(getMultichainFeatures).mockReturnValue({
      showBalances: [NetworkId['celo-mainnet']],
    })
  })

  it('creates statsig client on initialization with default statsig user', async () => {
    jest.mocked(getDefaultStatsigUser).mockReturnValue({ userID: 'someUserId' })
    await AppAnalytics.init()
    expect(StatsigClientRN).toHaveBeenCalledWith(
      'statsig-key',
      // Segment client is disabled, so stableID uses device uniqueID as fallback
      { userID: 'someUserId', customIDs: { stableID: mockDeviceId } },
      expect.objectContaining({
        environment: { tier: 'production' },
        networkConfig: { preventAllNetworkTraffic: false },
      })
    )
  })

  it('does not call segment when client is disabled', async () => {
    // Segment client creation is commented out in production code
    // So identify/track/page calls before and after init should not reach segment
    AppAnalytics.identify('0xUSER', { someUserProp: 'testValue' })
    AppAnalytics.track(OnboardingEvents.pin_invalid, { error: 'some error' })
    AppAnalytics.page('Some Page', { someProp: 'testValue' })

    await AppAnalytics.init()

    // Segment client is never created, so none of these should be called
    expect(mockSegmentClient.identify).not.toHaveBeenCalled()
    expect(mockSegmentClient.track).not.toHaveBeenCalled()
    expect(mockSegmentClient.screen).not.toHaveBeenCalled()

    // Post-init calls also don't reach segment
    AppAnalytics.identify('0xUSER2', { someUserProp: 'testValue2' })
    AppAnalytics.track(OnboardingEvents.pin_invalid, { error: 'some error' })
    AppAnalytics.page('ScreenA', { someProp: 'someValue' })

    expect(mockSegmentClient.identify).not.toHaveBeenCalled()
    expect(mockSegmentClient.track).not.toHaveBeenCalled()
    expect(mockSegmentClient.screen).not.toHaveBeenCalled()
  })

  it('generates a session id based on device id and timestamp', async () => {
    await AppAnalytics.init()
    expect(AppAnalytics.getSessionId()).toBe(expectedSessionId)
  })

  it('returns a different sessionId if the time is different', async () => {
    const timestamp = 1482363367070
    Date.now = jest.fn(() => timestamp)
    await AppAnalytics.init()
    expect(AppAnalytics.getSessionId()).toBe(
      'bdc761e455b9102eb141594eed7539166564fac4f8a249d19aa232b90e1bc457'
    )
  })

  // Regression guard for the intentional design decision documented at
  // .claude/rules/observability.md line 122:
  //   > distinct_id = raw wallet address (intentional; if you're tempted
  //   > to change this, don't).
  //
  // Changing PostHog identify to pass a hashed / opaque id would silently
  // break every user-history join in PostHog dashboards (and any Sentry
  // -> PostHog pivot via the sentryOpaqueId super-prop). This test breaks
  // loud the moment identify() starts wrapping the userID.
  it('passes raw wallet userID through to PostHog identify (no hashing)', async () => {
    await AppAnalytics.init()
    const mockPosthogIdentify = jest.fn()
    // Attach a minimal posthogClient shim so the identify() PostHog branch
    // fires. isPostHogSendable() checks state.app.analyticsEnabled (mocked
    // above via getMockStoreData) and !isE2EEnv (production build here).
    ;(AppAnalytics as any).posthogClient = {
      identify: mockPosthogIdentify,
      capture: jest.fn(),
      screen: jest.fn().mockResolvedValue(undefined),
      register: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
    }
    const rawWallet = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    AppAnalytics.identify(rawWallet, { some: 'trait' })
    expect(mockPosthogIdentify).toHaveBeenCalledWith(
      rawWallet,
      expect.objectContaining({ some: 'trait' })
    )
    // Belt-and-suspenders: make sure it was NOT called with an opaque id
    // (any hex string of length != 42, or a value that differs from the
    // input) — those are the two ways someone might accidentally regress.
    const firstArg = mockPosthogIdentify.mock.calls[0][0]
    expect(firstArg).toBe(rawWallet)
    expect(firstArg.length).toBe(42)
    expect(firstArg.startsWith('0x')).toBe(true)
  })
})
