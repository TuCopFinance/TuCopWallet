import { __TESTING__, postBuildTx, isUniswapV4SwapInfo } from 'src/swap/uniswapV4Saga'
import { SwapInfo, UNISWAP_V4_PROVIDER } from 'src/swap/types'
import networkConfig from 'src/web3/networkConfig'

jest.mock('src/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(),
}))

const { fetchWithTimeout } = jest.requireMock('src/utils/fetchWithTimeout') as {
  fetchWithTimeout: jest.Mock
}

const buildTxRequest = {
  direction: 'USDT_TO_COPM' as const,
  userAddress: '0x0000000000000000000000000000000000000001',
  sellAmount: '1000000',
  minBuyAmount: '3000000000000000000000',
  deadline: '9999999999',
  permitToken: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
  permitAmount: '1000000',
  permitExpiration: 1800000000,
  permitNonce: 0,
  permitSigDeadline: '9999999999',
}

const permit2Signature = ('0x' + '11'.repeat(65)) as `0x${string}`

describe('resolveBuildTxUrl', () => {
  it('resolves relative path against tucop backend base', () => {
    expect(__TESTING__.resolveBuildTxUrl('/api/swap/build-tx')).toBe(
      `${networkConfig.tucopBackendBaseUrl}/api/swap/build-tx`
    )
  })

  it('resolves path without leading slash', () => {
    expect(__TESTING__.resolveBuildTxUrl('api/swap/build-tx')).toBe(
      `${networkConfig.tucopBackendBaseUrl}/api/swap/build-tx`
    )
  })

  it('passes absolute https URLs through unchanged', () => {
    expect(__TESTING__.resolveBuildTxUrl('https://alt.example/api/swap/build-tx')).toBe(
      'https://alt.example/api/swap/build-tx'
    )
  })

  it('passes absolute http URLs through unchanged', () => {
    expect(__TESTING__.resolveBuildTxUrl('http://localhost:3000/api/swap/build-tx')).toBe(
      'http://localhost:3000/api/swap/build-tx'
    )
  })
})

describe('postBuildTx', () => {
  beforeEach(() => {
    fetchWithTimeout.mockReset()
  })

  it('POSTs the body + returns parsed {to, data, value}', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        to: '0x8b844f885672f333bc0042cb669255f93a4c1e6b',
        data: '0x3593564c',
        value: '0',
      }),
      text: async () => '',
    })

    const result = await postBuildTx('/api/swap/build-tx', {
      ...buildTxRequest,
      permit2Signature,
    })

    expect(result).toEqual({
      to: '0x8b844f885672f333bc0042cb669255f93a4c1e6b',
      data: '0x3593564c',
      value: '0',
    })
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      `${networkConfig.tucopBackendBaseUrl}/api/swap/build-tx`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildTxRequest, permit2Signature }),
      })
    )
  })

  it('throws with status + body on 503 (flag off)', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => JSON.stringify({ error: 'uniswap v4 executor not enabled' }),
      json: async () => ({ error: 'uniswap v4 executor not enabled' }),
    })

    await expect(
      postBuildTx('/api/swap/build-tx', { ...buildTxRequest, permit2Signature })
    ).rejects.toThrow(/build-tx 503/)
  })

  it('throws with status + body on 400 (schema error)', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: 'permitAmount is less than sellAmount' }),
      json: async () => ({ error: 'permitAmount is less than sellAmount' }),
    })

    await expect(
      postBuildTx('/api/swap/build-tx', { ...buildTxRequest, permit2Signature })
    ).rejects.toThrow(/build-tx 400/)
  })

  it('throws when response body is missing to/data', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ to: '', data: '' }),
      text: async () => '',
    })

    await expect(
      postBuildTx('/api/swap/build-tx', { ...buildTxRequest, permit2Signature })
    ).rejects.toThrow(/malformed body/)
  })
})

describe('isUniswapV4SwapInfo', () => {
  const baseSwapInfo = (): SwapInfo => ({
    swapId: 'swap-1',
    userInput: {
      updatedField: 'FROM' as any,
      fromTokenId: 'celo-mainnet:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
      toTokenId: 'celo-mainnet:0x8a567e2ae79ca692bd748ab832081c45de4041ea',
      swapAmount: { FROM: '1', TO: '3000' } as any,
    },
    quote: {
      preparedTransactions: [],
      receivedAt: 1,
      price: '3000',
      appFeePercentageIncludedInPrice: '0.5',
      provider: 'squid',
      estimatedPriceImpact: null,
      allowanceTarget: '0x000000000022d473030f116ddee9f6b43ac78ba3',
      swapType: 'same-chain',
    },
    areSwapTokensShuffled: false,
  })

  it('returns false for Squid provider', () => {
    expect(isUniswapV4SwapInfo(baseSwapInfo())).toBe(false)
  })

  it('returns false when provider is uniswap-v4 but permit2 metadata is missing', () => {
    const info = baseSwapInfo()
    info.quote.provider = UNISWAP_V4_PROVIDER
    expect(isUniswapV4SwapInfo(info)).toBe(false)
  })

  it('returns true when provider is uniswap-v4 AND permit2 metadata is present', () => {
    const info = baseSwapInfo()
    info.quote.provider = UNISWAP_V4_PROVIDER
    info.quote.permit2 = {
      typedData: {
        domain: {},
        types: {},
        primaryType: 'PermitSingle',
        message: {},
      },
      existingAllowance: { amount: '0', expiration: 0, nonce: 0 },
      buildTxUrl: '/api/swap/build-tx',
      buildTxRequest,
    }
    expect(isUniswapV4SwapInfo(info)).toBe(true)
  })
})
