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
type GoldPriceSource = 'backend' | 'dia_data' | 'fallback_hardcoded'

function tagPriceSource(source: GoldPriceSource): void {
  if (!SENTRY_ENABLED) return
  Sentry.setTag('gold_price_source', source)
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

  return {
    priceUsd: data.priceUsd,
    price24hChange: 0,
    timestamp: Date.now(),
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
  try {
    const priceData = await fetchFromTucopBackend()
    cachedGoldPrice = priceData
    tagPriceSource('backend')
    Logger.debug(TAG, 'Got XAUt price from TuCop backend', { price: priceData.priceUsd })
    return priceData
  } catch (primaryError: any) {
    Logger.warn(TAG, 'TuCop backend failed, trying DIA fallback', primaryError.message)
    captureBusinessError(primaryError, {
      feature: 'transactions',
      provider: 'internal',
      action: 'fetch_gold_price_backend',
      errorCode: isCircuitBreakerError(primaryError)
        ? 'circuit_open'
        : classifyHttpError(primaryError),
    })
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
