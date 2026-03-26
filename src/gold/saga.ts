import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import { fetchGoldPriceWithFallback } from 'src/gold/api'
import { enabledPriceAlertsSelector } from 'src/gold/selectors'
import {
  fetchGoldPrice,
  fetchGoldPriceError,
  markAlertTriggered,
  setGoldPrice,
} from 'src/gold/slice'
import { PriceAlert } from 'src/gold/types'
import Logger from 'src/utils/Logger'
import { safely } from 'src/utils/safely'
import { call, put, select, takeLeading } from 'typed-redux-saga'

const TAG = 'gold/saga'

/**
 * Fetch gold price from API and update Redux state
 */
function* fetchGoldPriceSaga() {
  try {
    Logger.debug(TAG, 'Fetching gold price')
    const priceData = yield* call(fetchGoldPriceWithFallback)

    yield* put(setGoldPrice(priceData))

    AppAnalytics.track(GoldEvents.gold_price_fetch_success, {
      price: priceData.priceUsd,
    })

    // Check price alerts
    yield* call(checkPriceAlertsSaga, priceData.priceUsd)
  } catch (error: any) {
    Logger.error(TAG, 'Failed to fetch gold price', error)
    yield* put(fetchGoldPriceError(error.message || 'Failed to fetch gold price'))

    AppAnalytics.track(GoldEvents.gold_price_fetch_error, {
      error: error.message || 'Unknown error',
    })
  }
}

/**
 * Check enabled price alerts against current price
 */
function* checkPriceAlertsSaga(currentPrice: number) {
  const enabledAlerts: PriceAlert[] = yield* select(enabledPriceAlertsSelector)

  for (const alert of enabledAlerts) {
    const shouldTrigger =
      (alert.direction === 'above' && currentPrice >= alert.targetPrice) ||
      (alert.direction === 'below' && currentPrice <= alert.targetPrice)

    if (shouldTrigger) {
      Logger.info(TAG, `Price alert triggered: ${alert.id}, target: ${alert.targetPrice}`)
      yield* put(markAlertTriggered(alert.id))

      AppAnalytics.track(GoldEvents.gold_price_alert_triggered, {
        alertId: alert.id,
        targetPrice: alert.targetPrice,
      })

      // TODO: Show notification to user
      // Could use local notifications here
    }
  }
}

export function* goldSaga() {
  Logger.debug(TAG, 'Gold saga initialized')
  yield* takeLeading(fetchGoldPrice.type, safely(fetchGoldPriceSaga))
}
