import { GoldPriceData } from 'src/gold/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import Logger from 'src/utils/Logger'

const TAG = 'gold/api'

// Primary API: CoinMarketCap for XAUt (Tether Gold) token price
// This tracks the actual XAUt token price, not just physical gold
const CMC_API_URL = 'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest'
const CMC_API_KEY = 'b0118ca69c6a4db5bead46556855df5d'
const XAUT_CMC_ID = '5176' // XAUt token ID on CoinMarketCap

// Fallback API: DIA Data for XAUt specific pricing
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

// CoinMarketCap response format for XAUt
export interface CmcQuoteResponse {
  data: {
    [id: string]: {
      id: number
      name: string
      symbol: string
      quote: {
        USD: {
          price: number
          percent_change_24h: number
          last_updated: string
        }
      }
    }
  }
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
 * Fetch XAUt token price from CoinMarketCap (primary source)
 * This tracks the actual XAUt (Tether Gold) token price
 * Documentation: https://coinmarketcap.com/api/documentation/v1/
 */
async function fetchFromCoinMarketCap(): Promise<GoldPriceData> {
  Logger.debug(TAG, 'Fetching XAUt price from CoinMarketCap')

  const url = `${CMC_API_URL}?id=${XAUT_CMC_ID}`

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-CMC_PRO_API_KEY': CMC_API_KEY,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`CoinMarketCap API error: HTTP ${response.status} - ${errorText}`)
  }

  const data: CmcQuoteResponse = await response.json()
  const xautData = data.data[XAUT_CMC_ID]

  if (!xautData) {
    throw new Error('XAUt data not found in CoinMarketCap response')
  }

  return {
    priceUsd: xautData.quote.USD.price,
    price24hChange: xautData.quote.USD.percent_change_24h,
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
 * Fetch XAUt token price from API with caching
 * Uses CoinMarketCap as primary source, DIA as fallback
 */
export async function fetchGoldPriceFromApi(): Promise<GoldPriceData> {
  // Return cached price if still valid
  if (isCacheValid() && cachedGoldPrice) {
    Logger.debug(TAG, 'Returning cached XAUt price', { price: cachedGoldPrice.priceUsd })
    return cachedGoldPrice
  }

  // Try CoinMarketCap first (tracks actual XAUt token price)
  try {
    const priceData = await fetchFromCoinMarketCap()
    cachedGoldPrice = priceData
    Logger.debug(TAG, 'Got XAUt price from CoinMarketCap', { price: priceData.priceUsd })
    return priceData
  } catch (primaryError: any) {
    Logger.warn(TAG, 'CoinMarketCap failed, trying DIA fallback', primaryError.message)
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
