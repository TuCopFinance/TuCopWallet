// Map backend/saga swapProvider slugs to short user-facing labels. Kept
// as a dedicated helper so pre-confirm ('Ruta del intercambio'), success
// screen ('Proveedor') and tx-details ('Proveedor') read the same string
// for the same tx. Unrecognized values fall through as-is (upper-cased
// first letter) instead of hiding behind a generic 'unknown', so a new
// venue name added by the backend surfaces without a wallet release.
//
// 'squid-7702' is the slug the 7702 saga persists for atomic multi-leg
// batches (N Squid legs executed via a single EIP-7702 tx to our
// BatchExecutor). Only rendered inside the opt-in "Ruta del intercambio"
// detail, never in the main UI, so the technical suffix is acceptable
// (same standard as the Celoscan tx-link, which is also opt-in tech).
export function formatSwapProvider(provider: string, opts: { isBatched?: boolean } = {}): string {
  const map: Record<string, string> = {
    squid: 'Squid',
    'squid-router': 'Squid',
    'squid-7702': 'Squid (7702)',
    'uniswap-v4': 'Uniswap',
    uniswap_v4: 'Uniswap',
    uniswap: 'Uniswap',
  }
  const key = provider.toLowerCase()
  // Preview screens know they will submit as an atomic 7702 batch BEFORE the
  // saga runs (isVirtualDolares + multi-leg + gate ON). Post-tx the saga
  // itself persists 'squid-7702' as the provider slug; both paths converge
  // on the same label. For non-Squid providers or slugs the app has not
  // heard of, isBatched has no effect (batching is Squid-specific today).
  if (opts.isBatched && (key === 'squid' || key === 'squid-router')) {
    return 'Squid (7702)'
  }
  if (map[key]) return map[key]
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}
