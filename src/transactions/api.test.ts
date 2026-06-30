import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { transactionFeedV2Api } from 'src/transactions/api'
import { LocalCurrencyCode } from 'src/localCurrency/consts'
import networkConfig from 'src/web3/networkConfig'

jest.mock('src/statsig', () => ({
  ...jest.requireActual('src/statsig'),
  getFeatureGate: jest.fn(),
  getMultichainFeatures: jest.fn().mockReturnValue({ showTransfers: ['celo-mainnet'] }),
}))

function buildStore() {
  const store = configureStore({
    reducer: { [transactionFeedV2Api.reducerPath]: transactionFeedV2Api.reducer },
    middleware: (getDefault) => getDefault().concat(transactionFeedV2Api.middleware),
  })
  setupListeners(store.dispatch)
  return store
}

describe('transactionFeedV2Api', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('routes to the legacy Valora endpoint when WRI_TX_FEED_TUCOP_V1 is off', async () => {
    jest.mocked(getFeatureGate).mockImplementation((g) => {
      if (g === StatsigFeatureGates.WRI_TX_FEED_TUCOP_V1) return false
      return false
    })
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ transactions: [], pageInfo: {} }), { status: 200 })
      )

    const store = buildStore()
    await store.dispatch(
      transactionFeedV2Api.endpoints.transactionFeedV2.initiate({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        localCurrencyCode: LocalCurrencyCode.USD,
        endCursor: undefined,
      })
    )

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const firstArg = fetchSpy.mock.calls[0][0]
    const url = typeof firstArg === 'string' ? firstArg : (firstArg as Request).url
    expect(url.startsWith(networkConfig.getWalletTransactionsUrl)).toBe(true)
    expect(url.startsWith(networkConfig.wriTxFeedUrl)).toBe(false)
    fetchSpy.mockRestore()
  })

  it('routes to the TuCop indexer endpoint when WRI_TX_FEED_TUCOP_V1 is on', async () => {
    jest.mocked(getFeatureGate).mockImplementation((g) => {
      if (g === StatsigFeatureGates.WRI_TX_FEED_TUCOP_V1) return true
      return false
    })
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ transactions: [], pageInfo: {} }), { status: 200 })
      )

    const store = buildStore()
    await store.dispatch(
      transactionFeedV2Api.endpoints.transactionFeedV2.initiate({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        localCurrencyCode: LocalCurrencyCode.USD,
        endCursor: undefined,
      })
    )

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const firstArg = fetchSpy.mock.calls[0][0]
    const url = typeof firstArg === 'string' ? firstArg : (firstArg as Request).url
    expect(url.startsWith(networkConfig.wriTxFeedUrl)).toBe(true)
    expect(url.startsWith(networkConfig.getWalletTransactionsUrl)).toBe(false)
    fetchSpy.mockRestore()
  })

  it('preserves the existing query params (address, networkIds, includeTypes, localCurrencyCode) under both gates', async () => {
    jest.mocked(getFeatureGate).mockReturnValue(true)
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ transactions: [], pageInfo: {} }), { status: 200 })
      )

    const store = buildStore()
    await store.dispatch(
      transactionFeedV2Api.endpoints.transactionFeedV2.initiate({
        address: '0xabc',
        localCurrencyCode: LocalCurrencyCode.COP,
        endCursor: undefined,
      })
    )

    const firstArg = fetchSpy.mock.calls[0][0]
    const url = typeof firstArg === 'string' ? firstArg : (firstArg as Request).url
    // RTK Query URL-encodes the params; assert by substring rather than parsing.
    expect(url).toContain('address=0xabc')
    expect(url).toContain('localCurrencyCode=COP')
    expect(url).toContain('networkIds=celo-mainnet')
    expect(url).toContain('includeTypes=')
    fetchSpy.mockRestore()
  })
})
