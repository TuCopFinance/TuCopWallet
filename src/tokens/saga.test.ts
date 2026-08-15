import BigNumber from 'bignumber.js'
import { FetchMock } from 'jest-fetch-mock'
import { expectSaga } from 'redux-saga-test-plan'
import { dynamic, throwError } from 'redux-saga-test-plan/providers'
import { call, select } from 'redux-saga/effects'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { AppEvents } from 'src/analytics/Events'
import { getMultichainFeatures } from 'src/statsig'
import { ALLOWED_TOKEN_IDS } from 'src/tokens/constants'
import {
  fetchImportedTokenBalances,
  fetchTokenBalancesForAddressByTokenId,
  fetchTokenBalancesSaga,
  getTokensInfo,
  tokenAmountInSmallestUnit,
  watchAccountFundedOrLiquidated,
} from 'src/tokens/saga'
import {
  importedTokensSelector,
  lastKnownTokenBalancesSelector,
  networksIconSelector,
} from 'src/tokens/selectors'
import {
  StoredTokenBalance,
  StoredTokenBalances,
  TokenBalance,
  fetchTokenBalancesFailure,
  setTokenBalances,
} from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import {
  mockAccount,
  mockCeurTokenId,
  mockCusdAddress,
  mockCusdTokenId,
  mockPoofAddress,
  mockPoofTokenId,
  mockTestTokenAddress,
  mockTestTokenTokenId,
  mockTokenBalances,
  mockUSDCAddress,
  mockUSDCTokenId,
} from 'test/values'
import { getContract } from 'viem'

jest.mock('src/statsig', () => ({
  getMultichainFeatures: jest.fn(),
  getFeatureGate: jest.fn(),
}))
jest.mock('src/web3/networkConfig', () => {
  const originalModule = jest.requireActual('src/web3/networkConfig')
  return {
    ...originalModule,
    __esModule: true,
    default: {
      ...originalModule.default,
      networkToNetworkId: {
        celo: 'celo-mainnet',
        ethereum: 'ethereum-mainnet',
      },
      defaultNetworkId: 'celo-mainnet',
    },
  }
})
jest.mock('src/utils/Logger')
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  getContract: jest.fn(),
}))

const mockFetch = fetch as FetchMock

const mockBlockchainApiTokenInfo: StoredTokenBalances = {
  [mockPoofTokenId]: {
    ...mockTokenBalances[mockPoofTokenId],
    balance: null,
  },
  [mockCusdTokenId]: {
    ...mockTokenBalances[mockCusdTokenId],
    balance: null,
  },
  [mockCeurTokenId]: {
    ...mockTokenBalances[mockCeurTokenId],
    balance: null,
  },
}

const fetchBalancesResponse = {
  [mockPoofTokenId]: {
    tokenAddress: mockPoofAddress,
    tokenId: mockPoofTokenId,
    balance: (5 * Math.pow(10, 18)).toString(),
    decimals: '18',
  },
  [mockCusdTokenId]: {
    tokenAddress: mockCusdAddress,
    tokenId: mockCusdTokenId,
    balance: '0',
    decimals: '18',
  },
  // cEUR intentionally missing
}

describe('getTokensInfo', () => {
  beforeEach(() => {
    mockFetch.resetMocks()
  })
  it('filters to allowed token IDs and overrides null/NaN priceUsd to 1 for USD stablecoins', async () => {
    mockFetch.mockResponseOnce(
      JSON.stringify({
        [networkConfig.copmTokenId]: { symbol: 'COPm', priceUsd: null },
        [networkConfig.usdtTokenId]: { symbol: 'USDT', priceUsd: null },
        [networkConfig.usdcTokenId]: { symbol: 'USDC', priceUsd: '1' },
        [networkConfig.usdmTokenId]: { symbol: 'USDm', priceUsd: 'NaN' },
        'celo-mainnet:native': { symbol: 'CELO', priceUsd: '0.5' },
      })
    )

    const result = await getTokensInfo([NetworkId['celo-mainnet']])
    // USDT/USDm had null/NaN priceUsd upstream: overridden to '1'.
    // USDC had '1' already: passes through unchanged.
    // COPm is NOT in the dollar-peg override list (COP-pegged, not USD),
    // so its null priceUsd stays null; UI derives its "Pesos" value from
    // balance directly, not USD price.
    expect(result).toEqual({
      [networkConfig.copmTokenId]: { symbol: 'COPm', priceUsd: null },
      [networkConfig.usdtTokenId]: { symbol: 'USDT', priceUsd: '1' },
      [networkConfig.usdcTokenId]: { symbol: 'USDC', priceUsd: '1' },
      [networkConfig.usdmTokenId]: { symbol: 'USDm', priceUsd: '1' },
    })
  })
  it('throws if request does not complete within timeout', async () => {
    // fetchWithTimeout now retries 3x on 5xx with real backoff; need real timers
    // so the sleep between retries actually fires.
    jest.useRealTimers()
    mockFetch.mockResponse('error!', { status: 500, statusText: 'some error' })
    await expect(getTokensInfo([NetworkId['celo-mainnet']])).rejects.toEqual(
      new Error('Failure response fetching token info. 500  some error')
    )
    expect(Logger.error).toHaveBeenCalledTimes(1)
    jest.useFakeTimers()
  })
})
describe(fetchTokenBalancesSaga, () => {
  const tokenBalancesAfterUpdate: StoredTokenBalances = {
    ...mockBlockchainApiTokenInfo,
    [mockPoofTokenId]: {
      ...(mockBlockchainApiTokenInfo[mockPoofTokenId] as StoredTokenBalance),
      balance: '5', // should convert to ethers (rather than keep in wei)
    },
    [mockCusdTokenId]: {
      ...(mockBlockchainApiTokenInfo[mockCusdTokenId] as StoredTokenBalance),
      balance: '0',
    },
  }

  const mockImportedTokensInfo = {
    [mockTestTokenTokenId]: {
      address: mockTestTokenAddress,
      decimals: 18,
      name: 'TestToken',
      symbol: 'TT',
      tokenId: mockTestTokenTokenId,
      balance: new BigNumber(0),
      showZeroBalance: true,
      networkId: NetworkId['celo-mainnet'],
      isManuallyImported: true,
      networkIconUrl: 'oldCeloUrl',
    },
    [mockUSDCTokenId]: {
      address: mockUSDCAddress,
      decimals: 8,
      name: 'USD Coin',
      symbol: 'USDC',
      tokenId: mockUSDCTokenId,
      balance: new BigNumber(0),
      showZeroBalance: true,
      networkId: NetworkId['ethereum-mainnet'],
      isManuallyImported: true,
      networkIconUrl: 'oldEthUrl',
    },
  }

  it('get token info successfully', async () => {
    const supportedNetworks = [NetworkId['celo-mainnet']]
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showBalances: supportedNetworks,
    })

    await expectSaga(fetchTokenBalancesSaga)
      .provide([
        [select(importedTokensSelector, supportedNetworks), []],
        [select(networksIconSelector), {}],
        [call(getTokensInfo, supportedNetworks), mockBlockchainApiTokenInfo],
        [select(walletAddressSelector), mockAccount],
        [call(fetchTokenBalancesForAddressByTokenId, mockAccount), fetchBalancesResponse],
      ])
      .put(setTokenBalances(tokenBalancesAfterUpdate))
      .run()
  })

  it("nothing happens if there's no address in the store", async () => {
    await expectSaga(fetchTokenBalancesSaga)
      .provide([
        [select(walletAddressSelector), null],
        [call(getTokensInfo, [NetworkId['celo-mainnet']]), mockBlockchainApiTokenInfo],
        [call(fetchTokenBalancesForAddressByTokenId, mockAccount), fetchBalancesResponse],
      ])
      .not.call(getTokensInfo)
      .not.put(setTokenBalances(tokenBalancesAfterUpdate))
      .run()
  })

  it("fires an event if there's an error", async () => {
    const supportedNetworks = [NetworkId['celo-mainnet']]
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showBalances: supportedNetworks,
    })

    await expectSaga(fetchTokenBalancesSaga)
      .provide([
        [select(importedTokensSelector, supportedNetworks), []],
        [select(networksIconSelector), {}],
        [call(getTokensInfo, supportedNetworks), mockBlockchainApiTokenInfo],
        [select(walletAddressSelector), mockAccount],
        [
          call(fetchTokenBalancesForAddressByTokenId, mockAccount),
          throwError(new Error('Error message')),
        ],
      ])
      .not.put(setTokenBalances(tokenBalancesAfterUpdate))
      .put(fetchTokenBalancesFailure())
      .run()
    expect(AppAnalytics.track).toHaveBeenCalledWith(AppEvents.fetch_balance_error, {
      error: 'Error message',
    })
  })

  it('includes imported tokens for multiple networks', async () => {
    const supportedNetworks = [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']]
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showBalances: supportedNetworks,
    })

    const expectedBalances = {
      ...tokenBalancesAfterUpdate,
      [mockTestTokenTokenId]: {
        ...mockImportedTokensInfo[mockTestTokenTokenId],
        balance: '1000',
        networkIconUrl: 'newCeloUrl',
      },
      [mockUSDCTokenId]: {
        ...mockImportedTokensInfo[mockUSDCTokenId],
        balance: '0',
        networkIconUrl: 'newEthUrl',
      },
    }

    const importedTokens = Object.values(mockImportedTokensInfo)

    await expectSaga(fetchTokenBalancesSaga)
      .provide([
        [call(getTokensInfo, supportedNetworks), mockBlockchainApiTokenInfo],
        [select(importedTokensSelector, supportedNetworks), importedTokens],
        [
          select(networksIconSelector),
          {
            [NetworkId['celo-mainnet']]: 'newCeloUrl',
            [NetworkId['ethereum-mainnet']]: 'newEthUrl',
          },
        ],
        [select(walletAddressSelector), mockAccount],
        [call(fetchTokenBalancesForAddressByTokenId, mockAccount), fetchBalancesResponse],
        [
          call(
            fetchImportedTokenBalances,
            mockAccount,
            importedTokens as TokenBalance[],
            fetchBalancesResponse
          ),
          {
            [mockTestTokenTokenId]: {
              ...mockImportedTokensInfo[mockTestTokenTokenId],
              balance: new BigNumber(1000).toFixed(),
            },
            [mockUSDCTokenId]: {
              ...mockImportedTokensInfo[mockUSDCTokenId],
              balance: new BigNumber(0).toFixed(),
            },
          },
        ],
      ])
      .put(setTokenBalances(expectedBalances))
      .run()
  })
})

describe(fetchTokenBalancesForAddressByTokenId, () => {
  beforeEach(() => {
    mockFetch.resetMocks()
  })

  it('returns token balances for a single chain', async () => {
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showBalances: [NetworkId['celo-mainnet']],
    })
    mockFetch.mockResponseOnce(
      JSON.stringify([
        {
          tokenId: mockCusdTokenId,
          tokenAddress: mockCusdAddress,
          balance: '10000000000000',
        },
      ])
    )
    const result = await fetchTokenBalancesForAddressByTokenId('some-address')
    expect(result).toMatchObject({
      [mockCusdTokenId]: {
        balance: '10000000000000',
        tokenAddress: mockCusdAddress,
        tokenId: mockCusdTokenId,
      },
    })
    expect(mockFetch.mock.calls.length).toEqual(1)
    expect(mockFetch.mock.calls[0][0]).toEqual(
      'https://api.mainnet.valora.xyz/getWalletBalances?address=some-address&networkIds=celo-mainnet'
    )
  })

  it('returns token balances for multiple chains', async () => {
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showBalances: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
    })
    mockFetch.mockResponseOnce(
      JSON.stringify([
        {
          tokenId: mockCusdTokenId,
          tokenAddress: mockCusdAddress,
          balance: '10000000000000',
        },
        {
          tokenId: mockUSDCTokenId,
          tokenAddress: mockUSDCAddress,
          balance: '20000000000000',
        },
      ])
    )
    const result = await fetchTokenBalancesForAddressByTokenId('some-address')
    expect(result).toMatchObject({
      [mockCusdTokenId]: {
        balance: '10000000000000',
        tokenAddress: mockCusdAddress,
        tokenId: mockCusdTokenId,
      },
      [mockUSDCTokenId]: {
        balance: '20000000000000',
        tokenAddress: mockUSDCAddress,
        tokenId: mockUSDCTokenId,
      },
    })
    expect(mockFetch.mock.calls.length).toEqual(1)
    expect(mockFetch.mock.calls[0][0]).toEqual(
      'https://api.mainnet.valora.xyz/getWalletBalances?address=some-address&networkIds=celo-mainnet%2Cethereum-mainnet'
    )
  })

  it('throws when received status is other than 200', async () => {
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showBalances: [NetworkId['celo-mainnet']],
    })
    // fetchWithTimeout now retries 3x on 5xx with real backoff; need real timers
    // so the sleep between retries actually fires.
    jest.useRealTimers()
    mockFetch.mockResponse('error', { status: 500, statusText: 'some error' })

    const result = fetchTokenBalancesForAddressByTokenId('some-address')
    await expect(result).rejects.toThrow('Failed to fetch token balances: 500 some error')
    jest.useFakeTimers()
  })
})

describe(fetchImportedTokenBalances, () => {
  it('returns token balances for multiple chains', async () => {
    const mockImportedTokens = {
      [mockTestTokenTokenId]: {
        address: mockTestTokenAddress,
        decimals: 18,
        tokenId: mockTestTokenTokenId,
        networkId: NetworkId['celo-mainnet'],
        balance: new BigNumber(0),
        name: 'TestToken',
        symbol: 'TT',
        isManuallyImported: true,
        priceUsd: null,
        lastKnownPriceUsd: null,
      },
      [mockPoofTokenId]: {
        address: mockPoofAddress,
        decimals: 18,
        tokenId: mockPoofTokenId,
        networkId: NetworkId['celo-mainnet'],
        balance: new BigNumber(0),
        name: 'PoofToken',
        symbol: 'Poof',
        isManuallyImported: true,
        priceUsd: null,
        lastKnownPriceUsd: null,
      },
      [mockUSDCTokenId]: {
        address: mockUSDCAddress,
        decimals: 8,
        tokenId: mockUSDCTokenId,
        showZeroBalance: true,
        networkId: NetworkId['ethereum-mainnet'],
        balance: new BigNumber(0),
        name: 'USD Coin',
        symbol: 'USDC',
        isManuallyImported: true,
        priceUsd: null,
        lastKnownPriceUsd: null,
      },
    }

    const mockKnownTokenBalances = {
      [mockPoofTokenId]: {
        tokenId: mockPoofTokenId,
        balance: '500000000000000',
      },
    }

    // @ts-ignore
    jest.mocked(getContract).mockImplementation((_args: any) => {
      return {
        read: {
          balanceOf: (_argsArray: any) => {
            return BigInt(1000000000)
          },
        },
      }
    })

    const result = await fetchImportedTokenBalances(
      mockAccount,
      Object.values(mockImportedTokens) as TokenBalance[],
      mockKnownTokenBalances
    )

    expect(result).toEqual({
      [mockTestTokenTokenId]: {
        ...mockImportedTokens[mockTestTokenTokenId],
        balance: new BigNumber(0.000000001).toFixed(),
        priceUsd: undefined,
      },
      [mockPoofTokenId]: {
        ...mockImportedTokens[mockPoofTokenId],
        balance: new BigNumber(0.0005).toFixed(),
        priceUsd: undefined,
      },
      [mockUSDCTokenId]: {
        ...mockImportedTokens[mockUSDCTokenId],
        balance: new BigNumber(10).toFixed(),
        priceUsd: undefined,
      },
    })
  })
})

describe(tokenAmountInSmallestUnit, () => {
  it('returns correct value', async () => {
    expect(tokenAmountInSmallestUnit(new BigNumber(10), 5)).toEqual('1000000')
  })
})

describe('watchAccountFundedOrLiquidated', () => {
  beforeEach(() => {
    // https://github.com/jfairbank/redux-saga-test-plan/issues/121
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  const balances = (firstValue: BigNumber | null, restValue: BigNumber | null) => {
    let callCount = 0
    return () => (++callCount == 1 ? firstValue : restValue)
  }

  it('dispatches the account funded event if the account is funded', async () => {
    jest
      .mocked(getMultichainFeatures)
      .mockReturnValue({ showBalances: [NetworkId['celo-mainnet']] })
    await expectSaga(watchAccountFundedOrLiquidated)
      .provide([
        [
          select(lastKnownTokenBalancesSelector, [NetworkId['celo-mainnet']]),
          dynamic(balances(new BigNumber(0), new BigNumber(10))),
        ],
      ])
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .run()

    expect(AppAnalytics.track).toHaveBeenCalledTimes(1)
    expect(AppAnalytics.track).toHaveBeenCalledWith(AppEvents.account_funded)
  })

  it('dispatches the account liquidated event when the account is liquidated', async () => {
    jest
      .mocked(getMultichainFeatures)
      .mockReturnValue({ showBalances: [NetworkId['celo-mainnet']] })
    await expectSaga(watchAccountFundedOrLiquidated)
      .provide([
        [
          select(lastKnownTokenBalancesSelector, [NetworkId['celo-mainnet']]),
          dynamic(balances(new BigNumber(10), new BigNumber(0))),
        ],
      ])
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .run()

    expect(AppAnalytics.track).toHaveBeenCalledTimes(1)
    expect(AppAnalytics.track).toHaveBeenCalledWith(AppEvents.account_liquidated)
  })

  it('does not dispatch the account funded event for an account restore', async () => {
    jest
      .mocked(getMultichainFeatures)
      .mockReturnValue({ showBalances: [NetworkId['celo-mainnet']] })
    await expectSaga(watchAccountFundedOrLiquidated)
      .provide([
        [
          select(lastKnownTokenBalancesSelector, [NetworkId['celo-mainnet']]),
          dynamic(balances(null, new BigNumber(10))),
        ],
      ])
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .run()

    expect(AppAnalytics.track).toHaveBeenCalledTimes(0)
  })

  it('does not dispatch the account funded event when network ID added', async () => {
    jest
      .mocked(getMultichainFeatures)
      .mockReturnValueOnce({ showBalances: [NetworkId['celo-mainnet']] })
      .mockReturnValueOnce({
        showBalances: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
      })
    await expectSaga(watchAccountFundedOrLiquidated)
      .provide([
        [select(lastKnownTokenBalancesSelector, [NetworkId['celo-mainnet']]), new BigNumber(0)],
        [
          select(lastKnownTokenBalancesSelector, [
            NetworkId['celo-mainnet'],
            NetworkId['ethereum-mainnet'],
          ]),
          new BigNumber(10),
        ],
      ])
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .run()

    expect(AppAnalytics.track).toHaveBeenCalledTimes(0)
  })

  it('does not dispatch the account liquidated event when network ID removed', async () => {
    jest
      .mocked(getMultichainFeatures)
      .mockReturnValueOnce({
        showBalances: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
      })
      .mockReturnValueOnce({ showBalances: [NetworkId['celo-mainnet']] })
    await expectSaga(watchAccountFundedOrLiquidated)
      .provide([
        [select(lastKnownTokenBalancesSelector, [NetworkId['celo-mainnet']]), new BigNumber(0)],
        [
          select(lastKnownTokenBalancesSelector, [
            NetworkId['celo-mainnet'],
            NetworkId['ethereum-mainnet'],
          ]),
          new BigNumber(10),
        ],
      ])
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .run()

    expect(AppAnalytics.track).toHaveBeenCalledTimes(0)
  })

  it('account funded event dispatched even if network ID removed', async () => {
    jest
      .mocked(getMultichainFeatures)
      .mockReturnValueOnce({
        showBalances: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
      })
      .mockReturnValueOnce({ showBalances: [NetworkId['celo-mainnet']] })
    await expectSaga(watchAccountFundedOrLiquidated)
      .provide([
        [select(lastKnownTokenBalancesSelector, [NetworkId['celo-mainnet']]), new BigNumber(10)],
        [
          select(lastKnownTokenBalancesSelector, [
            NetworkId['celo-mainnet'],
            NetworkId['ethereum-mainnet'],
          ]),
          new BigNumber(0),
        ],
      ])
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .run()

    expect(AppAnalytics.track).toHaveBeenCalledTimes(1)
    expect(AppAnalytics.track).toHaveBeenCalledWith(AppEvents.account_funded)
  })

  it('account liquidated event dispatched even if network ID added', async () => {
    jest
      .mocked(getMultichainFeatures)
      .mockReturnValue({
        showBalances: [NetworkId['celo-mainnet'], NetworkId['ethereum-mainnet']],
      })
      .mockReturnValueOnce({ showBalances: [NetworkId['celo-mainnet']] })
    await expectSaga(watchAccountFundedOrLiquidated)
      .provide([
        [select(lastKnownTokenBalancesSelector, [NetworkId['celo-mainnet']]), new BigNumber(10)],
        [
          select(lastKnownTokenBalancesSelector, [
            NetworkId['celo-mainnet'],
            NetworkId['ethereum-mainnet'],
          ]),
          new BigNumber(0),
        ],
      ])
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .dispatch({ type: 'TEST_ACTION_TYPE' })
      .run()

    expect(AppAnalytics.track).toHaveBeenCalledTimes(1)
    expect(AppAnalytics.track).toHaveBeenCalledWith(AppEvents.account_liquidated)
  })
})

describe('getTokensInfo USAT priceUsd override', () => {
  beforeEach(() => {
    mockFetch.resetMocks()
  })

  it('overrides USAT priceUsd to "1" when backend returns NaN', async () => {
    if (!networkConfig.usatTokenId) {
      // USAT not configured: override is a no-op.
      return
    }
    mockFetch.mockResponseOnce(
      JSON.stringify({
        [networkConfig.usatTokenId]: {
          tokenId: networkConfig.usatTokenId,
          networkId: 'celo-mainnet',
          symbol: 'USAT',
          name: 'Tether America USD',
          decimals: 6,
          address: '0xd2ab3c9a02dbbab236bfec45d1d755df4267f771',
          priceUsd: 'NaN',
        },
        [networkConfig.usdtTokenId]: {
          tokenId: networkConfig.usdtTokenId,
          networkId: 'celo-mainnet',
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
          address: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
          priceUsd: '1.0',
        },
      })
    )

    const result = await getTokensInfo(['celo-mainnet'] as any)
    expect(result[networkConfig.usatTokenId]?.priceUsd).toBe('1')
    // sanity: other tokens untouched
    expect(result[networkConfig.usdtTokenId]?.priceUsd).toBe('1.0')
  })

  it('overrides USAT priceUsd to "1" when backend returns undefined', async () => {
    if (!networkConfig.usatTokenId) return
    mockFetch.mockResponseOnce(
      JSON.stringify({
        [networkConfig.usatTokenId]: {
          tokenId: networkConfig.usatTokenId,
          networkId: 'celo-mainnet',
          symbol: 'USAT',
          name: 'Tether America USD',
          decimals: 6,
          address: '0xd2ab3c9a02dbbab236bfec45d1d755df4267f771',
          // no priceUsd field
        },
      })
    )

    const result = await getTokensInfo(['celo-mainnet'] as any)
    expect(result[networkConfig.usatTokenId]?.priceUsd).toBe('1')
  })

  it('leaves USAT priceUsd untouched when backend returns a real number', async () => {
    if (!networkConfig.usatTokenId) return
    mockFetch.mockResponseOnce(
      JSON.stringify({
        [networkConfig.usatTokenId]: {
          tokenId: networkConfig.usatTokenId,
          networkId: 'celo-mainnet',
          symbol: 'USAT',
          name: 'Tether America USD',
          decimals: 6,
          address: '0xd2ab3c9a02dbbab236bfec45d1d755df4267f771',
          priceUsd: '0.998',
        },
      })
    )

    const result = await getTokensInfo(['celo-mainnet'] as any)
    expect(result[networkConfig.usatTokenId]?.priceUsd).toBe('0.998')
  })
})

describe('getTokensInfo USAT priceUsd override - forced mainnet env', () => {
  // Uses a fake token ID so the tests exercise the override path even when
  // networkConfig.usatTokenId is unset.
  const fakeUsatTokenId = 'celo-mainnet:0xfake000000000000000000000000000000000001'

  let originalUsatTokenId: string

  beforeEach(() => {
    mockFetch.resetMocks()
    originalUsatTokenId = networkConfig.usatTokenId
    Object.defineProperty(networkConfig, 'usatTokenId', {
      value: fakeUsatTokenId,
      writable: true,
      configurable: true,
    })
    // ALLOWED_TOKEN_IDS is evaluated at module load time; inject the fake ID
    // so getTokensInfo's filter does not strip it out.
    ALLOWED_TOKEN_IDS.add(fakeUsatTokenId)
  })

  afterEach(() => {
    ALLOWED_TOKEN_IDS.delete(fakeUsatTokenId)
    Object.defineProperty(networkConfig, 'usatTokenId', {
      value: originalUsatTokenId,
      writable: true,
      configurable: true,
    })
  })

  it('overrides USAT priceUsd to "1" when backend returns NaN string', async () => {
    mockFetch.mockResponseOnce(
      JSON.stringify({
        [fakeUsatTokenId]: {
          tokenId: fakeUsatTokenId,
          networkId: 'celo-mainnet',
          symbol: 'USAT',
          name: 'Tether America USD',
          decimals: 6,
          address: '0xd2ab3c9a02dbbab236bfec45d1d755df4267f771',
          priceUsd: 'NaN',
        },
      })
    )

    const result = await getTokensInfo(['celo-mainnet'] as any)
    expect(result[fakeUsatTokenId]?.priceUsd).toBe('1')
  })

  it('overrides USAT priceUsd to "1" when backend returns no priceUsd field', async () => {
    mockFetch.mockResponseOnce(
      JSON.stringify({
        [fakeUsatTokenId]: {
          tokenId: fakeUsatTokenId,
          networkId: 'celo-mainnet',
          symbol: 'USAT',
          name: 'Tether America USD',
          decimals: 6,
          address: '0xd2ab3c9a02dbbab236bfec45d1d755df4267f771',
          // no priceUsd field
        },
      })
    )

    const result = await getTokensInfo(['celo-mainnet'] as any)
    expect(result[fakeUsatTokenId]?.priceUsd).toBe('1')
  })

  it('leaves USAT priceUsd untouched when backend returns a real finite number', async () => {
    mockFetch.mockResponseOnce(
      JSON.stringify({
        [fakeUsatTokenId]: {
          tokenId: fakeUsatTokenId,
          networkId: 'celo-mainnet',
          symbol: 'USAT',
          name: 'Tether America USD',
          decimals: 6,
          address: '0xd2ab3c9a02dbbab236bfec45d1d755df4267f771',
          priceUsd: '0.998',
        },
      })
    )

    const result = await getTokensInfo(['celo-mainnet'] as any)
    expect(result[fakeUsatTokenId]?.priceUsd).toBe('0.998')
  })
})
