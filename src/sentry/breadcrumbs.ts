import * as Sentry from '@sentry/react-native'
import { SENTRY_ENABLED } from 'src/config'
import type { TokenBalance } from 'src/tokens/slice'

// Central place to emit structured Sentry breadcrumbs so every issue lands
// with enough trail to diagnose without having to reproduce.
//
// Rules:
// - No PII. Symbols + tokenIds only, never balances or addresses. Any
//   free-form string still passes through piiScrub in beforeBreadcrumb.
// - Every breadcrumb has a stable `category` so dashboard filters keep
//   working when we add more emit sites (do not invent new categories at
//   call sites).
// - No-op when Sentry is disabled (dev builds) to keep hot paths free.

const CATEGORY_FEE_CURRENCY = 'fee_currency.selected'
const CATEGORY_RPC = 'rpc.call'
const CATEGORY_TX_SUBMITTED = 'tx.submitted'

// Emitted right after prepareTransactions picks a fee currency. When a
// downstream error fires (insufficient funds surfaced later, revert on
// send, receipt timeout) the Sentry event carries a breadcrumb that says
// which token was going to pay gas, without leaking balances.
export function addFeeCurrencyBreadcrumb(
  feeCurrency: Pick<TokenBalance, 'symbol' | 'tokenId' | 'isNative'>,
  meta: { origin: string; stage?: 'prepared' | 'sent' }
): void {
  if (!SENTRY_ENABLED) return
  Sentry.addBreadcrumb({
    category: CATEGORY_FEE_CURRENCY,
    level: 'info',
    message: `${meta.origin}: fee currency = ${feeCurrency.symbol}`,
    data: {
      symbol: feeCurrency.symbol,
      tokenId: feeCurrency.tokenId,
      isNative: !!feeCurrency.isNative,
      origin: meta.origin,
      stage: meta.stage ?? 'prepared',
    },
  })
}

// Emitted from RPC / backend fetch wrappers on failure or slow response.
// Lets Sentry issue "receipt timeout" reveal whether Forno was slow,
// backend was 5xx, or Alchemy was the culprit, without duplicating the
// data as tags (which cost quota). URL is passed through hostname only
// to avoid embedding query strings that may hint at wallet activity.
export function addRpcBreadcrumb(
  url: string,
  meta: { method?: string; status?: number; durationMs?: number; error?: string }
): void {
  if (!SENTRY_ENABLED) return
  let host = 'unknown'
  try {
    host = new URL(url).hostname
  } catch {
    // ignore: url was a template or relative path; host stays 'unknown'
  }
  Sentry.addBreadcrumb({
    category: CATEGORY_RPC,
    level: meta.status && meta.status >= 500 ? 'error' : 'info',
    message: `${meta.method ?? 'GET'} ${host}${meta.status != null ? ` -> ${meta.status}` : ''}`,
    data: {
      host,
      method: meta.method,
      status: meta.status,
      durationMs: meta.durationMs,
      error: meta.error,
    },
  })
}

// Emitted when a transaction is submitted to the network (post-signing,
// pre-receipt). Tx hash is intentionally NOT included: piiScrub would
// shorten it to a 0xABCD...WXYZ form anyway, and correlation across users
// is done via feature/provider/action tags. If we ever need per-tx
// investigation, pull it from Celoscan using the wallet's opaque user id
// + timestamp on the issue.
export function addTxSubmittedBreadcrumb(meta: {
  feature: string
  feeCurrencySymbol?: string
  networkId: string
}): void {
  if (!SENTRY_ENABLED) return
  Sentry.addBreadcrumb({
    category: CATEGORY_TX_SUBMITTED,
    level: 'info',
    message: `${meta.feature}: tx submitted (fee=${meta.feeCurrencySymbol ?? 'native'})`,
    data: meta,
  })
}
