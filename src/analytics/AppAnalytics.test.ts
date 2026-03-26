import { createClient } from '@segment/analytics-react-native'
import { PincodeType } from 'src/account/reducer'
import AppAnalyticsModule from 'src/analytics/AppAnalytics'
import { OnboardingEvents } from 'src/analytics/Events'
import { store } from 'src/redux/store'
import { getDefaultStatsigUser, getFeatureGate, getMultichainFeatures } from 'src/statsig'
import { NetworkId } from 'src/transactions/types'
import { Statsig } from 'statsig-react-native'
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
jest.mock('statsig-react-native')
jest.mock('src/statsig')
jest.mock('src/web3/networkConfig', () => {
  const originalModule = jest.requireActual('src/web3/networkConfig')
  return {
    ...originalModule,
    __esModule: true,
    default: {
      ...originalModule.default,
      defaultNetworkId: 'celo-sepolia',
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
        networkId: NetworkId['celo-sepolia'],
        symbol: 'cUSD',
        priceUsd: '1',
        balance: '10',
        priceFetchedAt: Date.now(),
        isFeeCurrency: true,
      },
      [mockCeurTokenId]: {
        address: mockCeurAddress,
        tokenId: mockCeurTokenId,
        networkId: NetworkId['celo-sepolia'],
        symbol: 'cEUR',
        priceUsd: '1.2',
        balance: '20',
        priceFetchedAt: Date.now(),
        isFeeCurrency: true,
      },
      [mockCeloTokenId]: {
        address: mockCeloAddress,
        tokenId: mockCeloTokenId,
        networkId: NetworkId['celo-sepolia'],
        symbol: 'CELO',
        priceUsd: '5',
        balance: '0',
        priceFetchedAt: Date.now(),
        isFeeCurrency: true,
      },
      [mockTestTokenTokenId]: {
        address: mockTestTokenAddress,
        tokenId: mockTestTokenTokenId,
        networkId: NetworkId['celo-sepolia'],
        symbol: 'TT',
        balance: '10',
        priceFetchedAt: Date.now(),
      },
      'celo-sepolia:0xMOO': {
        address: '0xMOO',
        tokenId: 'celo-sepolia:0xMOO',
        networkId: NetworkId['celo-sepolia'],
        symbol: 'MOO',
        priceUsd: '4',
        balance: '0',
        priceFetchedAt: Date.now(),
      },
      'celo-sepolia:0xUBE': {
        address: '0xUBE',
        tokenId: 'celo-sepolia:0xUBE',
        networkId: NetworkId['celo-sepolia'],
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
      showBalances: [NetworkId['celo-sepolia']],
    })
  })

  it('creates statsig client on initialization with default statsig user', async () => {
    jest.mocked(getDefaultStatsigUser).mockReturnValue({ userID: 'someUserId' })
    await AppAnalytics.init()
    expect(Statsig.initialize).toHaveBeenCalledWith(
      'statsig-key',
      { userID: 'someUserId' },
      // Segment client is disabled, so overrideStableID uses device uniqueID as fallback
      { environment: { tier: 'development' }, overrideStableID: mockDeviceId, localMode: false }
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
})
