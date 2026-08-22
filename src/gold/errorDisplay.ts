import type { TFunction } from 'i18next'
import { extractSquidEnvelope } from 'src/swap/useSwapQuote'

// Central helper for translating a gold-quote error object into user-safe
// copy. Never returns the raw error message: raw errors carry the enriched
// squid_unavailable / squid_rate_limited envelope JSON, or a HTTP status
// blurb, both of which were shown verbatim to users before this helper
// existed (see Sentry TUCOPWALLET-E, 2026-08-22, where the JSON body was
// rendered inside an InLineNotification).
//
// Envelope-aware branches mirror the SwapScreen banner variants so gold
// users see the same "Servicio saturado" / "Ruta no disponible: prueba
// USDT" copy as swap users when the underlying cause is identical.
export function describeGoldQuoteError(
  err: unknown,
  t: TFunction,
  direction: 'buy' | 'sell'
): { title: string; body: string } {
  const envelope = extractSquidEnvelope(err)
  if (envelope?.error === 'squid_rate_limited') {
    return {
      title: t('swapScreen.errorRateLimited.title'),
      body: t('swapScreen.errorRateLimited.body'),
    }
  }
  if (envelope?.error === 'squid_unavailable' && envelope.fallback_hint === 'USDT') {
    return {
      title: t('swapScreen.errorUnavailableFallbackUsdt.title'),
      body: t('swapScreen.errorUnavailableFallbackUsdt.body'),
    }
  }
  // Any other case (unknown envelope, plain HTTP error, timeout): show the
  // generic gold-specific i18n copy. Raw error text NEVER reaches the UI.
  const namespace = direction === 'buy' ? 'goldFlow.buy' : 'goldFlow.sell'
  return {
    title: t(`${namespace}.quoteErrorTitle`),
    body: t(`${namespace}.quoteErrorDescription`),
  }
}
