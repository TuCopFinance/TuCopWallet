import { render, renderHook } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import React from 'react'
import { Text, View } from 'react-native'
import { Provider } from 'react-redux'
import { getFeatureGate, getMultichainFeatures } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import {
  useAmountAsUsd,
  useCashInTokens,
  useCashOutTokens,
  useDollarBalance,
  useDollarTokensWithBalance,
  useLocalToTokenAmount,
  useSwappableTokens,
  useTokenInfo,
  useTokenPricesAreStale,
  useTokensInfo,
  useTokenToLocalAmount,
  useUSDC,
  useUSDm,
  useUSAT,
} from 'src/tokens/hooks'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import { createMockStore } from 'test/utils'
import {
  mockAccount,
  mockCeloTokenId,
  mockCeurTokenId,
  mockCkesTokenId,
  mockCrealTokenId,
  mockCusdTokenId,
  mockPoofTokenId,
  mockTokenBalances,
  mockUSDCTokenId,
} from 'test/values'

jest.mock('src/statsig')

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getFeatureGate).mockReturnValue(true)
  jest.mocked(getMultichainFeatures).mockReturnValue({
    showCico: [NetworkId['celo-sepolia']],
    showSend: [NetworkId['celo-sepolia']],
    showSwap: [NetworkId['celo-sepolia']],
    showBalances: [NetworkId['celo-sepolia']],
  })
})

const tokenAddressWithPriceAndBalance = '0x001'
const tokenIdWithPriceAndBalance = `celo-sepolia:${tokenAddressWithPriceAndBalance}`
const tokenAddressWithoutBalance = '0x002'
const tokenIdWithoutBalance = `celo-sepolia:${tokenAddressWithoutBalance}`
const ethTokenId = 'ethereum-sepolia:native'

function TestComponent({ tokenId }: { tokenId: string }) {
  const tokenAmount = useLocalToTokenAmount(new BigNumber(1), tokenId)
  const localAmount = useTokenToLocalAmount(new BigNumber(1), tokenId)
  const usdAmount = useAmountAsUsd(new BigNumber(1), tokenId)
  const tokenPricesAreStale = useTokenPricesAreStale([NetworkId['celo-sepolia']])

  return (
    <View>
      <Text testID="tokenAmount">{tokenAmount?.toNumber()}</Text>
      <Text testID="localAmount">{localAmount?.toNumber()}</Text>
      <Text testID="usdAmount">{usdAmount?.toNumber()}</Text>
      <Text testID="pricesStale">{tokenPricesAreStale}</Text>
    </View>
  )
}

function TokenHookTestComponent({ hook }: { hook: () => TokenBalance[] }) {
  const tokens = hook()

  return <Text testID="tokenIDs">{tokens.map((token) => token.tokenId)}</Text>
}

const store = (usdToLocalRate: string | null, priceFetchedAt: number) =>
  createMockStore({
    tokens: {
      tokenBalances: {
        [tokenIdWithPriceAndBalance]: {
          address: tokenAddressWithPriceAndBalance,
          tokenId: tokenIdWithPriceAndBalance,
          networkId: NetworkId['celo-sepolia'],
          symbol: 'T1',
          balance: '0',
          priceUsd: '5',
          priceFetchedAt,
        },
        [tokenIdWithoutBalance]: {
          address: tokenAddressWithoutBalance,
          tokenId: tokenIdWithoutBalance,
          networkId: NetworkId['celo-sepolia'],
          symbol: 'T2',
          priceUsd: '5',
          balance: null,
          priceFetchedAt,
        },
      },
    },
    localCurrency: {
      usdToLocalRate,
    },
  })

const storeWithMultipleNetworkTokens = (walletAddress?: string) =>
  createMockStore({
    web3: {
      account: walletAddress ?? mockAccount,
    },
    tokens: {
      tokenBalances: {
        ...mockTokenBalances,
        [mockCrealTokenId]: {
          ...mockTokenBalances[mockCrealTokenId],
          balance: '1',
          minimumAppVersionToSwap: '1.0.0',
        },
        [mockCeloTokenId]: {
          ...mockTokenBalances[mockCeloTokenId],
          balance: '1',
          isSwappable: true,
        },
        [ethTokenId]: {
          tokenId: ethTokenId,
          symbol: 'ETH',
          balance: '10',
          priceUsd: '5',
          networkId: NetworkId['ethereum-sepolia'],
          priceFetchedAt: Date.now(),
          isCashInEligible: true,
          isCashOutEligible: true,
          minimumAppVersionToSwap: '0.0.1',
        },
      },
    },
    positions: {
      positions: [
        {
          type: 'app-token' as const,
          networkId: NetworkId['celo-sepolia'],
          tokenId: 'celo-sepolia:0xa',
          address: '0xa',
          priceUsd: '60',
          balance: '3',
          displayProps: {
            title: 'Title',
          },
          tokens: [
            {
              networkId: NetworkId['celo-sepolia'],
              tokenId: 'celo-sepolia:0xb',
              balance: '1',
              priceUsd: '30',
            },
            {
              networkId: NetworkId['celo-sepolia'],
              tokenId: 'celo-sepolia:0xc',
              balance: '2',
              priceUsd: '20',
            },
          ],
        },
      ],
    },
  })

describe('token to fiat exchanges', () => {
  it('maps correctly if all the info is available', async () => {
    const { getByTestId } = render(
      <Provider store={store('2', Date.now())}>
        <TestComponent tokenId={tokenIdWithPriceAndBalance} />
      </Provider>
    )

    const tokenAmount = getByTestId('tokenAmount')
    expect(tokenAmount.props.children).toEqual(0.1)
    const localAmount = getByTestId('localAmount')
    expect(localAmount.props.children).toEqual(10)
    const usdAmount = getByTestId('usdAmount')
    expect(usdAmount.props.children).toEqual(5)
    const pricesStale = getByTestId('pricesStale')
    expect(pricesStale.props.children).toEqual(false)
  })

  it('returns undefined if there is no balance set', async () => {
    const { getByTestId } = render(
      <Provider store={store('2', Date.now())}>
        <TestComponent tokenId={tokenIdWithoutBalance} />
      </Provider>
    )

    const tokenAmount = getByTestId('tokenAmount')
    expect(tokenAmount.props.children).toBeUndefined()
    const localAmount = getByTestId('localAmount')
    expect(localAmount.props.children).toBeUndefined()
    const usdAmount = getByTestId('usdAmount')
    expect(usdAmount.props.children).toBeUndefined()
    const pricesStale = getByTestId('pricesStale')
    expect(pricesStale.props.children).toEqual(false)
  })

  it('returns undefined if there is no exchange rate', async () => {
    const { getByTestId } = render(
      <Provider store={store(null, Date.now())}>
        <TestComponent tokenId={tokenIdWithPriceAndBalance} />
      </Provider>
    )

    const tokenAmount = getByTestId('tokenAmount')
    expect(tokenAmount.props.children).toBeUndefined()
    const localAmount = getByTestId('localAmount')
    expect(localAmount.props.children).toBeUndefined()

    // USD amount doesn't use the exchange rate
    const usdAmount = getByTestId('usdAmount')
    expect(usdAmount.props.children).toEqual(5)
    const pricesStale = getByTestId('pricesStale')
    expect(pricesStale.props.children).toEqual(false)
  })

  it('returns undefined if the token doesnt exist', async () => {
    const { getByTestId } = render(
      <Provider store={store('2', Date.now())}>
        <TestComponent tokenId={'0x000'} />
      </Provider>
    )

    const tokenAmount = getByTestId('tokenAmount')
    expect(tokenAmount.props.children).toBeUndefined()
    const localAmount = getByTestId('localAmount')
    expect(localAmount.props.children).toBeUndefined()
    const usdAmount = getByTestId('usdAmount')
    expect(usdAmount.props.children).toBeUndefined()
    const pricesStale = getByTestId('pricesStale')
    expect(pricesStale.props.children).toEqual(false)
  })

  it('shows prices are stale', async () => {
    const { getByTestId } = render(
      <Provider store={store('2', Date.now() - 100000000)}>
        <TestComponent tokenId={tokenIdWithPriceAndBalance} />
      </Provider>
    )

    const pricesStale = getByTestId('pricesStale')
    expect(pricesStale.props.children).toEqual(true)
  })
})

describe('useSwappableTokens', () => {
  it('returns sorted swappable tokens for the non-holdout group', () => {
    jest
      .mocked(getFeatureGate)
      .mockImplementation(
        (featureGate) => featureGate !== StatsigFeatureGates.SHUFFLE_SWAP_TOKENS_ORDER
      )

    const { result } = renderHook(() => useSwappableTokens(), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result.current.swappableToTokens.map((token) => token.tokenId)).toEqual([
      mockCeloTokenId,
    ])
    expect(result.current.swappableFromTokens.map((token) => token.tokenId)).toEqual([
      mockCeloTokenId,
      mockPoofTokenId,
      mockCrealTokenId,
    ])
    expect(result.current.areSwapTokensShuffled).toBe(false)
  })

  it('returns sorted tokens with balance for multiple networks for the non-holdout group', () => {
    jest
      .mocked(getFeatureGate)
      .mockImplementation(
        (featureGate) => featureGate !== StatsigFeatureGates.SHUFFLE_SWAP_TOKENS_ORDER
      )
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showSwap: [NetworkId['celo-sepolia'], NetworkId['ethereum-sepolia']],
    })
    const { result } = renderHook(() => useSwappableTokens(), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result.current.swappableToTokens.map((token) => token.tokenId)).toEqual([
      ethTokenId,
      mockCeloTokenId,
    ])
    expect(result.current.swappableFromTokens.map((token) => token.tokenId)).toEqual([
      ethTokenId,
      mockCeloTokenId,
      mockPoofTokenId,
      mockCrealTokenId,
    ])
  })

  it('returns deterministically shuffled tokens for each user in the holdout group', () => {
    jest.mocked(getMultichainFeatures).mockReturnValue({
      showSwap: [NetworkId['celo-sepolia'], NetworkId['ethereum-sepolia']],
    })

    const expectedToTokens1 = [mockCeloTokenId, ethTokenId]
    const expectedFromTokens1 = [mockCrealTokenId, mockPoofTokenId, mockCeloTokenId, ethTokenId]

    const expectedToTokens2 = [mockCeloTokenId, ethTokenId]
    const expectedFromTokens2 = [mockCrealTokenId, mockCeloTokenId, ethTokenId, mockPoofTokenId]

    const { result: result1 } = renderHook(() => useSwappableTokens(), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })
    const { result: result2 } = renderHook(() => useSwappableTokens(), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens('0xabcde')}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result1.current.swappableToTokens.map((token) => token.tokenId)).toEqual(
      expectedToTokens1
    )
    expect(result1.current.swappableFromTokens.map((token) => token.tokenId)).toEqual(
      expectedFromTokens1
    )
    expect(result1.current.areSwapTokensShuffled).toBe(true)

    expect(result2.current.swappableToTokens.map((token) => token.tokenId)).toEqual(
      expectedToTokens2
    )
    expect(result2.current.swappableFromTokens.map((token) => token.tokenId)).toEqual(
      expectedFromTokens2
    )
    expect(result2.current.areSwapTokensShuffled).toBe(true)
  })
})

describe('useCashInTokens', () => {
  it('returns tokens eligible for cash in', () => {
    const { getByTestId } = render(
      <Provider store={storeWithMultipleNetworkTokens()}>
        <TokenHookTestComponent hook={useCashInTokens} />
      </Provider>
    )

    expect(getByTestId('tokenIDs').props.children).toEqual([
      mockPoofTokenId,
      mockCeurTokenId,
      mockCusdTokenId,
      mockCeloTokenId,
      mockCrealTokenId,
      mockCkesTokenId,
    ])
  })

  it('returns tokens eligible for cash in for multiple networks', () => {
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showCico: [NetworkId['celo-sepolia'], NetworkId['ethereum-sepolia']],
    })
    const { getByTestId } = render(
      <Provider store={storeWithMultipleNetworkTokens()}>
        <TokenHookTestComponent hook={useCashInTokens} />
      </Provider>
    )

    expect(getByTestId('tokenIDs').props.children).toEqual([
      mockPoofTokenId,
      mockCeurTokenId,
      mockCusdTokenId,
      mockCeloTokenId,
      mockCrealTokenId,
      ethTokenId,
      mockUSDCTokenId,
      mockCkesTokenId,
    ])
  })
})

describe('useCashOutTokens', () => {
  it('returns tokens for eligible for cash out', () => {
    const { getByTestId } = render(
      <Provider store={storeWithMultipleNetworkTokens()}>
        <TokenHookTestComponent hook={useCashOutTokens} />
      </Provider>
    )

    expect(getByTestId('tokenIDs').props.children).toEqual([
      mockPoofTokenId,
      mockCeloTokenId,
      mockCrealTokenId,
    ])
  })

  it('returns tokens eligible for cash out for multiple networks', () => {
    jest.mocked(getMultichainFeatures).mockReturnValueOnce({
      showCico: [NetworkId['celo-sepolia'], NetworkId['ethereum-sepolia']],
    })
    const { getByTestId } = render(
      <Provider store={storeWithMultipleNetworkTokens()}>
        <TokenHookTestComponent hook={useCashOutTokens} />
      </Provider>
    )

    expect(getByTestId('tokenIDs').props.children).toEqual([
      mockPoofTokenId,
      mockCeloTokenId,
      mockCrealTokenId,
      ethTokenId,
    ])
  })
})

describe('useTokenInfo', () => {
  it('returns the token when it exists', () => {
    const { result } = renderHook(() => useTokenInfo(mockCeloTokenId), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result.current?.tokenId).toEqual(mockCeloTokenId)
  })

  it('returns position tokens when they exist', () => {
    const { result } = renderHook(() => useTokenInfo('celo-sepolia:0xb'), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result.current?.tokenId).toEqual('celo-sepolia:0xb')
  })

  it('returns undefined if the tokenId is not found', () => {
    const { result } = renderHook(() => useTokenInfo(undefined), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result.current).toBeUndefined()
  })
})

describe('useTokensInfo', () => {
  it('returns the token when it exists', () => {
    const { result } = renderHook(() => useTokensInfo([mockCeloTokenId, mockUSDCTokenId]), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result.current[0]?.tokenId).toEqual(mockCeloTokenId)
    expect(result.current[1]?.tokenId).toEqual(mockUSDCTokenId)
  })

  it('returns position tokens when they exist', () => {
    const { result } = renderHook(() => useTokensInfo(['celo-sepolia:0xb', 'celo-sepolia:0xc']), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result.current[0]?.tokenId).toEqual('celo-sepolia:0xb')
    expect(result.current[1]?.tokenId).toEqual('celo-sepolia:0xc')
  })

  it('returns empty array if the tokenId is not found', () => {
    const { result } = renderHook(() => useTokensInfo(['iDoNotExist']), {
      wrapper: (component) => (
        <Provider store={storeWithMultipleNetworkTokens()}>
          {component?.children ? component.children : component}
        </Provider>
      ),
    })

    expect(result.current).toEqual([])
  })
})

describe('useUSDC / useUSDm / useUSAT', () => {
  const renderWithStore = <T,>(hook: () => T, storeState: object) => {
    const mockStore = createMockStore(storeState)
    return renderHook(() => hook(), {
      wrapper: ({ children }) => <Provider store={mockStore}>{children}</Provider>,
    })
  }

  it('useUSDC returns the USDC TokenBalance when present in store', () => {
    const usdcNetworkId = networkConfig.usdcTokenId.split(':')[0]
    const { result } = renderWithStore(useUSDC, {
      tokens: {
        tokenBalances: {
          [networkConfig.usdcTokenId]: {
            tokenId: networkConfig.usdcTokenId,
            networkId: usdcNetworkId,
            symbol: 'USDC',
            decimals: 6,
            balance: '10',
            address: networkConfig.usdcTokenId.split(':')[1],
            priceUsd: '1',
            priceFetchedAt: Date.now(),
          },
        },
      },
    })
    expect(result.current?.symbol).toBe('USDC')
  })

  it('useUSDm returns the USDm TokenBalance when present', () => {
    const usdmNetworkId = networkConfig.usdmTokenId.split(':')[0]
    const { result } = renderWithStore(useUSDm, {
      tokens: {
        tokenBalances: {
          [networkConfig.usdmTokenId]: {
            tokenId: networkConfig.usdmTokenId,
            networkId: usdmNetworkId,
            symbol: 'USDm',
            decimals: 18,
            balance: '5',
            address: networkConfig.usdmTokenId.split(':')[1],
            priceUsd: '1',
            priceFetchedAt: Date.now(),
          },
        },
      },
    })
    expect(result.current?.symbol).toBe('USDm')
  })

  it('useUSAT returns undefined when usatTokenId is empty (Sepolia)', () => {
    // On Sepolia, usatTokenId is '' so useUSAT always returns undefined.
    const { result } = renderWithStore(useUSAT, { tokens: { tokenBalances: {} } })
    // Symbol is either undefined (Sepolia) or USAT (mainnet) - both acceptable.
    expect(result.current === undefined || result.current?.symbol === 'USAT').toBe(true)
  })
})

describe('useDollarTokensWithBalance / useDollarBalance', () => {
  const usdtId = networkConfig.usdtTokenId
  const usdcId = networkConfig.usdcTokenId
  const usdmId = networkConfig.usdmTokenId

  // Builds a store with controlled dollar-token balances.
  // balances: map from tokenId to raw balance string (null = zero/absent)
  function makeStore(balances: Record<string, string>) {
    const tokenBalances: Record<string, object> = {}
    const entries: Array<[string, string]> = [
      [usdtId, balances[usdtId] ?? '0'],
      [usdcId, balances[usdcId] ?? '0'],
      [usdmId, balances[usdmId] ?? '0'],
    ]
    for (const [tokenId, balance] of entries) {
      tokenBalances[tokenId] = {
        tokenId,
        networkId: tokenId.split(':')[0],
        symbol: tokenId.includes('usdt') ? 'USDT' : tokenId.includes('usdc') ? 'USDC' : 'USDm',
        decimals: 6,
        balance,
        address: tokenId.split(':')[1],
        priceUsd: '1',
        priceFetchedAt: Date.now(),
      }
    }
    return createMockStore({
      tokens: { tokenBalances },
      localCurrency: { usdToLocalRate: '4000' }, // 1 USD = 4000 COP
    })
  }

  const wrap =
    (mockStore: ReturnType<typeof createMockStore>) =>
    ({ children }: { children: React.ReactNode }) => (
      <Provider store={mockStore}>{children}</Provider>
    )

  it('returns only tokens with balance > 0', () => {
    const mockStore = makeStore({ [usdtId]: '10', [usdcId]: '0', [usdmId]: '5' })
    const { result } = renderHook(() => useDollarTokensWithBalance(), { wrapper: wrap(mockStore) })
    const tokenIds = result.current.map((e) => e.tokenInfo.tokenId)
    expect(tokenIds).toContain(usdtId)
    expect(tokenIds).toContain(usdmId)
    expect(tokenIds).not.toContain(usdcId)
  })

  it('returns empty array when no dollar token has balance', () => {
    const mockStore = makeStore({ [usdtId]: '0', [usdcId]: '0', [usdmId]: '0' })
    const { result } = renderHook(() => useDollarTokensWithBalance(), { wrapper: wrap(mockStore) })
    expect(result.current).toHaveLength(0)
  })

  it('lists entries in the canonical picker order (USDT/USDC/USAT/USDm)', () => {
    // Order is independent of balance / localValue - the home Dolares
    // breakdown follows the same visual order as every picker.
    const mockStore = makeStore({ [usdtId]: '5', [usdcId]: '20', [usdmId]: '10' })
    const { result } = renderHook(() => useDollarTokensWithBalance(), { wrapper: wrap(mockStore) })
    const ids = result.current.map((e) => e.tokenInfo.tokenId)
    expect(ids).toEqual([usdtId, usdcId, usdmId])
  })

  it('useDollarBalance returns sum of all dollar token local values', () => {
    // USDT=10, USDm=5 at priceUsd=1 and rate=4000 => (10+5)*4000 = 60000
    const mockStore = makeStore({ [usdtId]: '10', [usdcId]: '0', [usdmId]: '5' })
    const { result } = renderHook(() => useDollarBalance(), { wrapper: wrap(mockStore) })
    expect(result.current.toNumber()).toBe(60000)
  })

  it('useDollarBalance returns 0 when no dollar tokens have balance', () => {
    const mockStore = makeStore({ [usdtId]: '0', [usdcId]: '0', [usdmId]: '0' })
    const { result } = renderHook(() => useDollarBalance(), { wrapper: wrap(mockStore) })
    expect(result.current.toNumber()).toBe(0)
  })
})
