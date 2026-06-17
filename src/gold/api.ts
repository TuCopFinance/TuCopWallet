import { GoldPriceData } from 'src/gold/types'
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
    Logger.debug(TAG, 'Got XAUt price from TuCop backend', { price: priceData.priceUsd })
    return priceData
  } catch (primaryError: any) {
    Logger.warn(TAG, 'TuCop backend failed, trying DIA fallback', primaryError.message)
  }

  // Fallback to DIA Data
  try {
    const priceData = await fetchFromDiaApi()
    cachedGoldPrice = priceData
    Logger.debug(TAG, 'Got XAUt price from DIA', { price: priceData.priceUsd })
    return priceData
  } catch (fallbackError: any) {
    Logger.error(TAG, 'DIA API also failed', fallbackError.message)
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

    // Return cached price if available
    if (cachedGoldPrice) {
      Logger.debug(TAG, 'Returning stale cached price')
      return cachedGoldPrice
    }

    // Return hardcoded fallback as last resort
    Logger.debug(TAG, 'Returning hardcoded fallback price')
    return { ...FALLBACK_GOLD_PRICE, timestamp: Date.now() }
  }
}
