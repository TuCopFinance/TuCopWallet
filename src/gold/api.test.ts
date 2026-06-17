import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import networkConfig from 'src/web3/networkConfig'

jest.mock('src/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(),
}))

const mockFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>

function jsonResponse(body: object, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

// Re-require the module under test in isolation so the in-memory price cache
// resets between tests. CommonJS require lets Jest resolve the absolute alias
// at runtime (without a `.js` suffix that TS' nodenext resolver would reject).
type ApiModule = typeof import('./api.js')

function loadApi(): ApiModule {
  let mod!: ApiModule
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('src/gold/api') as ApiModule
  })
  return mod
}

beforeEach(() => {
  mockFetchWithTimeout.mockReset()
})

describe('gold/api', () => {
  it('fetches XAUt USD price from the TuCop backend proxy', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 3210.5, asOf: '2026-06-16T00:00:00Z' })
    )

    const { fetchGoldPriceFromApi } = loadApi()
    const result = await fetchGoldPriceFromApi()

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      networkConfig.getXautPriceUrl,
      expect.objectContaining({ method: 'GET' })
    )
    expect(result.priceUsd).toBe(3210.5)
    expect(result.price24hChange).toBe(0)
  })

  it('does not send any API key header to the TuCop backend', async () => {
    mockFetchWithTimeout.mockResolvedValueOnce(
      jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 3000, asOf: '2026-06-16T00:00:00Z' })
    )

    const { fetchGoldPriceFromApi } = loadApi()
    await fetchGoldPriceFromApi()

    const [, options] = mockFetchWithTimeout.mock.calls[0]
    const headers = (options?.headers ?? {}) as Record<string, string>
    const lowered = Object.keys(headers).map((h) => h.toLowerCase())
    expect(lowered).not.toContain('x-cmc_pro_api_key')
    expect(lowered).not.toContain('authorization')
    expect(lowered).not.toContain('x-api-key')
  })

  it('falls back to DIA when the TuCop backend errors', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, false, 502))
      .mockResolvedValueOnce(
        jsonResponse({
          Symbol: 'XAUT',
          Name: 'Tether Gold',
          Price: 3100,
          PriceYesterday: 3000,
          Time: '2026-06-16T00:00:00Z',
        })
      )

    const { fetchGoldPriceFromApi } = loadApi()
    const result = await fetchGoldPriceFromApi()

    expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2)
    expect(result.priceUsd).toBe(3100)
    expect(result.price24hChange).toBeCloseTo(((3100 - 3000) / 3000) * 100)
  })

  it('returns the hardcoded fallback if all APIs fail', async () => {
    mockFetchWithTimeout
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValueOnce(jsonResponse({}, false, 500))

    const { fetchGoldPriceWithFallback } = loadApi()
    const result = await fetchGoldPriceWithFallback()

    expect(result.priceUsd).toBeGreaterThan(0)
  })

  it('uses the URL configured on networkConfig', () => {
    expect(networkConfig.getXautPriceUrl).toMatch(/^https:\/\/.+\/api\/prices\/xaut\?vs=usd$/)
    expect(networkConfig.blockscoutProxyBase).toMatch(/^https:\/\/.+\/api\/v2$/)
  })
})
