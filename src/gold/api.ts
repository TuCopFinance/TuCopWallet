import * as Sentry from '@sentry/react-native'
import { SENTRY_ENABLED } from 'src/config'
import { GoldPriceData } from 'src/gold/types'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { classifyHttpError } from 'src/sentry/classifyHttpError'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'

const TAG = 'gold/api'

// Primary source: TuCop backend price proxy.
// The backend owns the upstream provider credential; the mobile app never
// holds a CoinMarketCap (or equivalent) API key. Endpoint contract:
//   GET /api/prices/xaut?vs=usd  ->  { symbol, vs, priceUsd, asOf }

// Fallback API: DIA Data for XAUt specific pricing (provides 24h change).
// Documentation: https://www.diadata.org/
const DIA_XAUT_API_URL =
  'https://api.diadata.org/v1/assetQuotation/Ethereum/0x68749665FF8D2d112Fa859AA293F07A622782F38'

// Cache for gold price to avoid unnecessary requests
let cachedGoldPrice: GoldPriceData | null = null
const CACHE_TTL_MS = 60 * 1000 // 1 minute cache

// Fallback price when all APIs are unavailable
const FALLBACK_GOLD_PRICE: GoldPriceData = {
  priceUsd: 3050, // Approximate gold price - updated manually
  price24hChange: 0,
  timestamp: Date.now(),
}

// TuCop backend price endpoint response format
export interface TucopXautPriceResponse {
  symbol: string
  vs: string
  priceUsd: number
  asOf: string
}

// DIA Data response format
export interface DiaAssetQuotationResponse {
  Symbol: string
  Name: string
  Price: number
  PriceYesterday: number
  Time: string
}

// The wallet's per-host circuit breaker (see src/lib/circuitBreaker) short-
// circuits requests to a synthetic Response with this exact statusText once
// FAILURE_THRESHOLD failures accumulate within FAILURE_WINDOW_MS for the
// same host. When that happens, the fetch never actually leaves the device
// and backend logs will show ZERO requests during the outage window.
// Distinguishing this from a real upstream 5xx unblocks the debugging loop
// with backend: they only need to look at their logs if this bucket is NOT
// what fired.
const CIRCUIT_OPEN_MARKER = 'Service Unavailable (circuit open)'

function isCircuitBreakerError(error: unknown): boolean {
  if (!error) return false
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(CIRCUIT_OPEN_MARKER)
}

// Emits an operational signal to Sentry naming which of the three sources
// finally produced the price the app is showing. Backend can dashboard the
// `fallback_hardcoded` rate as a proxy for "how often is our price feed
// degraded end-to-end". Mirrors the neeru_meta_source pattern.
//
// `backend_stale` is a sub-state of a successful backend fetch: the response
// came from the 24h stale cache (upstream unreachable but backend still
// served a recent-ish value). Counted separately from `backend` so backend
// can alert on the ratio without losing "the fetch itself succeeded".
type GoldPriceSource = 'backend' | 'backend_stale' | 'dia_data' | 'fallback_hardcoded'

function tagPriceSource(source: GoldPriceSource): void {
  if (!SENTRY_ENABLED) return
  Sentry.setTag('gold_price_source', source)
}

// Bucketed age so Sentry aggregations do not explode into per-second
// cardinality while still surfacing the operational shape: is the stale
// cache serving fresh-ish reads or hours-old ones?
type StaleAgeBucket = '<5min' | '5-15min' | '15-60min' | '>1h'

function bucketizeStaleAge(seconds: number): StaleAgeBucket {
  if (seconds < 5 * 60) return '<5min'
  if (seconds < 15 * 60) return '5-15min'
  if (seconds < 60 * 60) return '15-60min'
  return '>1h'
}

/**
 * Check if cached price is still valid
 */
function isCacheValid(): boolean {
  if (!cachedGoldPrice) return false
  const age = Date.now() - cachedGoldPrice.timestamp
  return age < CACHE_TTL_MS
}

/**
 * Fetch XAUt token price from the TuCop backend price proxy (primary source).
 * The backend keeps the upstream provider credential; the mobile app does not.
 * The proxy returns only the current USD price, so price24hChange is filled
 * by the DIA fallback path when available (here defaulted to 0).
 */
async function fetchFromTucopBackend(): Promise<GoldPriceData> {
  Logger.debug(TAG, 'Fetching XAUt price from TuCop backend')

  const response = await fetchWithTimeout(networkConfig.getXautPriceUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`TuCop price proxy error: HTTP ${response.status} - ${errorText}`)
  }

  const data: TucopXautPriceResponse = await response.json()

  if (typeof data.priceUsd !== 'number' || !Number.isFinite(data.priceUsd)) {
    throw new Error('Invalid priceUsd in TuCop price proxy response')
  }

  // Backend contract (shipped 2026-07-27): X-Stale + X-Stale-Age headers set
  // when the response body came from the 24h stale cache instead of the
  // fresh (60s TTL) upstream fetch. Absence of the header means fresh.
  const isStale = response.headers.get('X-Stale') === 'true'
  const staleAgeSeconds = isStale ? Number(response.headers.get('X-Stale-Age') ?? 0) : 0

  return {
    priceUsd: data.priceUsd,
    price24hChange: 0,
    timestamp: Date.now(),
    isStale,
    staleAgeSeconds,
  }
}

/**
 * Fetch XAUt price from DIA Data (fallback source)
 * Provides 24h change data
 */
async function fetchFromDiaApi(): Promise<GoldPriceData> {
  Logger.debug(TAG, 'Fetching XAUt price from DIA Data')

  const response = await fetchWithTimeout(DIA_XAUT_API_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`DIA API error: HTTP ${response.status}`)
  }

  const data: DiaAssetQuotationResponse = await response.json()

  // Calculate 24h change percentage
  const price24hChange =
    data.PriceYesterday > 0 ? ((data.Price - data.PriceYesterday) / data.PriceYesterday) * 100 : 0

  return {
    priceUsd: data.Price,
    price24hChange,
    timestamp: Date.now(),
  }
}

/**
 * Fetch XAUt token price from API with caching.
 * Uses the TuCop backend proxy as primary source, DIA Data as fallback.
 */
export async function fetchGoldPriceFromApi(): Promise<GoldPriceData> {
  // Return cached price if still valid
  if (isCacheValid() && cachedGoldPrice) {
    Logger.debug(TAG, 'Returning cached XAUt price', { price: cachedGoldPrice.priceUsd })
    return cachedGoldPrice
  }

  // Try TuCop backend proxy first
  let primaryError: any = null
  try {
    const priceData = await fetchFromTucopBackend()
    cachedGoldPrice = priceData
    if (priceData.isStale) {
      tagPriceSource('backend_stale')
      if (SENTRY_ENABLED) {
        Sentry.setTag(
          'gold_price_stale_age_bucket',
          bucketizeStaleAge(priceData.staleAgeSeconds ?? 0)
        )
      }
    } else {
      tagPriceSource('backend')
    }
    Logger.debug(TAG, 'Got XAUt price from TuCop backend', {
      price: priceData.priceUsd,
      isStale: priceData.isStale ?? false,
      staleAgeSeconds: priceData.staleAgeSeconds ?? 0,
    })
    return priceData
  } catch (err: any) {
    primaryError = err
    Logger.warn(TAG, 'TuCop backend failed, trying DIA fallback', err.message)
    // Only add a breadcrumb here. Firing captureBusinessError before we know
    // whether the DIA fallback will succeed sends a Sentry event per user
    // per poll cycle for a completely recovered flow. We defer to the end:
    // fire only when the fallback ALSO fails (real user-visible failure).
    if (SENTRY_ENABLED) {
      try {
        Sentry.addBreadcrumb({
          category: 'gold_price',
          level: 'warning',
          message: 'TuCop backend gold price failed, trying DIA',
          data: {
            error: err.message,
            errorCode: isCircuitBreakerError(err) ? 'circuit_open' : classifyHttpError(err),
          },
        })
      } catch {
        // Sentry not initialized (tests); ignore.
      }
    }
  }

  // Fallback to DIA Data
  try {
    const priceData = await fetchFromDiaApi()
    cachedGoldPrice = priceData
    tagPriceSource('dia_data')
    Logger.debug(TAG, 'Got XAUt price from DIA', { price: priceData.priceUsd })
    return priceData
  } catch (fallbackError: any) {
    Logger.error(TAG, 'DIA API also failed', fallbackError.message)
    // Both sources failed: only NOW is it a real user-visible degradation
    // (the app will render the hardcoded price). Fire both so the dashboard
    // can distinguish "backend down + DIA down" from "backend down + DIA ok".
    if (primaryError) {
      captureBusinessError(primaryError, {
        feature: 'transactions',
        provider: 'internal',
        action: 'fetch_gold_price_backend',
        errorCode: isCircuitBreakerError(primaryError)
          ? 'circuit_open'
          : classifyHttpError(primaryError),
      })
    }
    captureBusinessError(fallbackError, {
      feature: 'transactions',
      provider: 'internal',
      action: 'fetch_gold_price_dia',
      errorCode: isCircuitBreakerError(fallbackError)
        ? 'circuit_open'
        : classifyHttpError(fallbackError),
    })
    throw new Error('All XAUt price APIs failed')
  }
}

/**
 * Fetch XAUt price with fallback to cached/hardcoded price
 * Never throws - always returns a price
 */
export async function fetchGoldPriceWithFallback(): Promise<GoldPriceData> {
  try {
    return await fetchGoldPriceFromApi()
  } catch (error: any) {
    Logger.warn(TAG, 'All APIs failed, using fallback', error.message)

    // Return cached price if available. Tag the source as fallback_hardcoded
    // regardless of whether we hit stale cache vs the constant, because from
    // the user's perspective both are "degraded" states worth counting.
    if (cachedGoldPrice) {
      Logger.debug(TAG, 'Returning stale cached price')
      tagPriceSource('fallback_hardcoded')
      return cachedGoldPrice
    }

    // Return hardcoded fallback as last resort
    Logger.debug(TAG, 'Returning hardcoded fallback price')
    tagPriceSource('fallback_hardcoded')
    return { ...FALLBACK_GOLD_PRICE, timestamp: Date.now() }
  }
}
