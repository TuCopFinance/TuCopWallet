import * as Sentry from '@sentry/react-native'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import networkConfig from 'src/web3/networkConfig'

jest.mock('src/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(),
}))

jest.mock('src/sentry/captureBusinessError', () => ({
  captureBusinessError: jest.fn(),
}))

jest.mock('@sentry/react-native', () => ({
  setTag: jest.fn(),
}))

// SENTRY_ENABLED is read via `import { SENTRY_ENABLED } from 'src/config'`
// and defaults to false in test env. Force it on so tagPriceSource fires,
// but preserve the rest of the config module so downstream imports (e.g.
// networkConfig) keep resolving the real values they need.
jest.mock('src/config', () => ({
  ...jest.requireActual('src/config'),
  SENTRY_ENABLED: true,
}))

const mockFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>
const mockCaptureBusinessError = captureBusinessError as jest.MockedFunction<
  typeof captureBusinessError
>
const mockSetTag = Sentry.setTag as jest.MockedFunction<typeof Sentry.setTag>

function jsonResponse(
  body: object,
  ok = true,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
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
  mockCaptureBusinessError.mockReset()
  mockSetTag.mockReset()
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

  describe('Sentry telemetry', () => {
    it('tags gold_price_source=backend on primary success', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 3210, asOf: 'x' })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      await fetchGoldPriceFromApi()

      expect(mockSetTag).toHaveBeenCalledWith('gold_price_source', 'backend')
      expect(mockCaptureBusinessError).not.toHaveBeenCalled()
    })

    it('tags gold_price_source=dia_data on fallback success', async () => {
      mockFetchWithTimeout
        .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, false, 502))
        .mockResolvedValueOnce(
          jsonResponse({
            Symbol: 'XAUT',
            Name: 'Tether Gold',
            Price: 3100,
            PriceYesterday: 3000,
            Time: 'x',
          })
        )

      const { fetchGoldPriceFromApi } = loadApi()
      await fetchGoldPriceFromApi()

      expect(mockSetTag).toHaveBeenCalledWith('gold_price_source', 'dia_data')
    })

    it('tags gold_price_source=fallback_hardcoded when all APIs fail', async () => {
      mockFetchWithTimeout
        .mockResolvedValueOnce(jsonResponse({}, false, 500))
        .mockResolvedValueOnce(jsonResponse({}, false, 500))

      const { fetchGoldPriceWithFallback } = loadApi()
      await fetchGoldPriceWithFallback()

      expect(mockSetTag).toHaveBeenCalledWith('gold_price_source', 'fallback_hardcoded')
    })

    it('does NOT capture a business error when backend fails but DIA fallback succeeds', async () => {
      // Behaviour change (2026-08-15): the primary error is only surfaced
      // to Sentry when the DIA fallback ALSO fails. Firing on every
      // primary-only failure produced hundreds of events per user per day
      // during backend outages even though the end-to-end flow recovered.
      // A breadcrumb is added instead (not asserted here since Sentry is
      // mocked, but see src/gold/api.ts for the addBreadcrumb call).
      mockFetchWithTimeout
        .mockResolvedValueOnce(jsonResponse({}, false, 502))
        .mockResolvedValueOnce(
          jsonResponse({
            Symbol: 'XAUT',
            Name: 'Tether Gold',
            Price: 3100,
            PriceYesterday: 3000,
            Time: 'x',
          })
        )

      const { fetchGoldPriceFromApi } = loadApi()
      await fetchGoldPriceFromApi()

      expect(mockCaptureBusinessError).not.toHaveBeenCalled()
    })

    it('captures both backend and DIA errors only when the fallback also fails', async () => {
      mockFetchWithTimeout
        .mockResolvedValueOnce(jsonResponse({}, false, 502))
        .mockResolvedValueOnce(jsonResponse({}, false, 503))

      const { fetchGoldPriceFromApi } = loadApi()
      await expect(fetchGoldPriceFromApi()).rejects.toThrow('All XAUt price APIs failed')

      expect(mockCaptureBusinessError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          feature: 'transactions',
          provider: 'internal',
          action: 'fetch_gold_price_backend',
        })
      )
      expect(mockCaptureBusinessError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          feature: 'transactions',
          provider: 'internal',
          action: 'fetch_gold_price_dia',
        })
      )
    })

    it('surfaces X-Stale headers on the GoldPriceData when backend serves from stale cache', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 3210, asOf: 'x' }, true, 200, {
          'X-Stale': 'true',
          'X-Stale-Age': '342',
        })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      const result = await fetchGoldPriceFromApi()

      expect(result.isStale).toBe(true)
      expect(result.staleAgeSeconds).toBe(342)
    })

    it('leaves isStale unset when backend returns a fresh response (no X-Stale header)', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 3210, asOf: 'x' })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      const result = await fetchGoldPriceFromApi()

      expect(result.isStale).toBe(false)
      expect(result.staleAgeSeconds).toBe(0)
    })

    it('tags gold_price_source=backend_stale + stale_age_bucket when backend serves from stale cache', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse(
          { symbol: 'XAUT0', vs: 'usd', priceUsd: 3210, asOf: 'x' },
          true,
          200,
          { 'X-Stale': 'true', 'X-Stale-Age': '342' } // 342s = 5m42s
        )
      )

      const { fetchGoldPriceFromApi } = loadApi()
      await fetchGoldPriceFromApi()

      expect(mockSetTag).toHaveBeenCalledWith('gold_price_source', 'backend_stale')
      // 342s falls in the 5-15min bucket (5*60=300 <= 342 < 15*60=900)
      expect(mockSetTag).toHaveBeenCalledWith('gold_price_stale_age_bucket', '5-15min')
      // Must NOT also tag the plain 'backend' variant (it's an either/or).
      expect(mockSetTag).not.toHaveBeenCalledWith('gold_price_source', 'backend')
    })

    it.each([
      [10, '<5min'],
      [299, '<5min'],
      [300, '5-15min'],
      [899, '5-15min'],
      [900, '15-60min'],
      [3599, '15-60min'],
      [3600, '>1h'],
      [86400, '>1h'],
    ] as const)('bucketizes staleAge=%is to %s', async (staleAgeSeconds, expectedBucket) => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 3210, asOf: 'x' }, true, 200, {
          'X-Stale': 'true',
          'X-Stale-Age': String(staleAgeSeconds),
        })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      await fetchGoldPriceFromApi()

      expect(mockSetTag).toHaveBeenCalledWith('gold_price_stale_age_bucket', expectedBucket)
    })

    it('parses the x-provider-source header when backend serves a healthy fresh price', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 4355.31, asOf: 'x' }, true, 200, {
          'x-provider-source': 'dia',
        })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      const result = await fetchGoldPriceFromApi()

      expect(result.providerSource).toBe('dia')
    })

    it('falls back to body.source when x-provider-source header is absent', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({
          symbol: 'XAUT0',
          vs: 'usd',
          priceUsd: 4355.31,
          asOf: 'x',
          source: 'mento',
        })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      const result = await fetchGoldPriceFromApi()

      expect(result.providerSource).toBe('mento')
    })

    it('leaves providerSource undefined when both header and body field are absent', async () => {
      // Backwards compatibility with older backends that predate the
      // 2026-08-16 provider-source signal (main sha ecc931d).
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 4355.31, asOf: 'x' })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      const result = await fetchGoldPriceFromApi()

      expect(result.providerSource).toBeUndefined()
    })

    it('ignores unknown provider source values and leaves providerSource undefined', async () => {
      // If backend adds a new provider without coordinating the wallet
      // change, the raw string must never reach the UI or Sentry as a
      // tag. Fall back to undefined; a Logger.warn is emitted alongside
      // (not asserted here because jest.isolateModules gives the module a
      // fresh Logger instance the outer spy cannot see).
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 4355.31, asOf: 'x' }, true, 200, {
          'x-provider-source': 'unknown-provider',
        })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      const result = await fetchGoldPriceFromApi()

      expect(result.providerSource).toBeUndefined()
    })

    it('recognises the stale-cache provider source as a degraded signal', async () => {
      mockFetchWithTimeout.mockResolvedValueOnce(
        jsonResponse({ symbol: 'XAUT0', vs: 'usd', priceUsd: 4355.31, asOf: 'x' }, true, 200, {
          'x-provider-source': 'stale-cache',
        })
      )

      const { fetchGoldPriceFromApi } = loadApi()
      const result = await fetchGoldPriceFromApi()

      expect(result.providerSource).toBe('stale-cache')
    })

    it('tags errorCode=circuit_open when the wallet circuit breaker short-circuits the request', async () => {
      // The circuit breaker in fetchWithTimeout returns a synthetic 503 whose
      // statusText contains 'Service Unavailable (circuit open)'. The code
      // path throws with that message included when response.ok is false.
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable (circuit open)',
      } as unknown as Response)
      // DIA also short-circuits (unlikely but exercises both branches)
      mockFetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'ok',
        json: async () => ({}),
      } as unknown as Response)

      const { fetchGoldPriceFromApi } = loadApi()
      await expect(fetchGoldPriceFromApi()).rejects.toThrow('All XAUt price APIs failed')

      const backendCall = mockCaptureBusinessError.mock.calls.find(
        ([, ctx]) => ctx.action === 'fetch_gold_price_backend'
      )
      expect(backendCall).toBeDefined()
      expect(backendCall![1].errorCode).toBe('circuit_open')
    })
  })
})
