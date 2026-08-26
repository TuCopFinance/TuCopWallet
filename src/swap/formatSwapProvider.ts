// Map backend/saga swapProvider slugs to short user-facing labels. Kept
// as a dedicated helper so pre-confirm ('Ruta del intercambio'), success
// screen ('Proveedor') and tx-details ('Proveedor') read the same string
// for the same tx. Unrecognized values fall through as-is (upper-cased
// first letter) instead of hiding behind a generic 'unknown', so a new
// venue name added by the backend surfaces without a wallet release.
export function formatSwapProvider(provider: string): string {
  const map: Record<string, string> = {
    squid: 'Squid',
    'squid-router': 'Squid',
    'uniswap-v4': 'Uniswap',
    uniswap_v4: 'Uniswap',
    uniswap: 'Uniswap',
  }
  const key = provider.toLowerCase()
  if (map[key]) return map[key]
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}
