import { GoldPriceData } from 'src/gold/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import Logger from 'src/utils/Logger'

const TAG = 'gold/api'

// CoinGecko API for gold price (tether-gold token)
// Documentation: https://docs.coingecko.com/reference/simple-price
const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3'
const GOLD_COINGECKO_ID = 'tether-gold'

export interface CoinGeckoSimplePriceResponse {
  [id: string]: {
    usd: number
    usd_24h_change?: number
  }
}

/**
 * Fetch gold price from CoinGecko API
 * Returns price per troy ounce in USD and 24h change percentage
 */
export async function fetchGoldPriceFromApi(): Promise<GoldPriceData> {
  const url = `${COINGECKO_API_BASE}/simple/price?ids=${GOLD_COINGECKO_ID}&vs_currencies=usd&include_24hr_change=true`
  Logger.debug(TAG, 'Fetching gold price from CoinGecko')

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    Logger.error(TAG, `CoinGecko API error: ${response.status} - ${errorText}`)
    throw new Error(`Failed to fetch gold price: HTTP ${response.status}`)
  }

  const data: CoinGeckoSimplePriceResponse = await response.json()

  if (!data[GOLD_COINGECKO_ID]) {
    throw new Error('Gold price data not found in response')
  }

  const goldData = data[GOLD_COINGECKO_ID]

  return {
    priceUsd: goldData.usd,
    price24hChange: goldData.usd_24h_change ?? 0,
    timestamp: Date.now(),
  }
}

/**
 * Fallback: Use a backup price API if CoinGecko fails
 * This could be expanded to use multiple sources
 */
export async function fetchGoldPriceWithFallback(): Promise<GoldPriceData> {
  try {
    return await fetchGoldPriceFromApi()
  } catch (primaryError) {
    Logger.warn(TAG, 'Primary gold price API failed, no fallback configured', primaryError)
    throw primaryError
  }
}
