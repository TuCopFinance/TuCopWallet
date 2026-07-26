import { RootState } from 'src/redux/reducers'
import { NEERU_META_CACHE_FRESH_MS, NeeruConfigSource } from 'src/earn/neeru/configSlice'
import { NeeruCatalogue, NeeruMeta } from 'src/earn/neeru/types'

// Hardcoded fallback used when the wallet has never received a meta payload
// from the backend AND is currently offline. Values MUST agree with live
// /meta after the api.ts adapter translation, enforced by a CI drift check.
// If backend rotates any of these, the CI check fails and this fallback must
// be updated in the same PR.
//
// Addresses are stored in lowercase and event / error identifiers use opaque
// internal names (primary, e1, e2, e3) so a repo grep does not surface the
// contract's proxy prefix, event name or error names in tracked source
// (zero-exposure policy).
export const NEERU_META_HARDCODED_FALLBACK: NeeruMeta = {
  proxyAddress: '0x988af5977201a0e988f2c75ea952532f6beb5082' as `0x${string}`,
  events: {
    primary: {
      topic0: '0x8835c22a0c751188de86681e15904223c054bedd5c68ec8858945b7831290273' as `0x${string}`,
      dataSchema: [
        { type: 'uint8' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
    },
  },
  errorSelectors: {
    e1: '0x2648b779' as `0x${string}`,
    e2: '0x9acb7e52' as `0x${string}`,
    e3: '0x30cd7471' as `0x${string}`,
  },
  depositToken: {
    address: '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as `0x${string}`,
    chainId: 42220,
    networkId: 'celo-mainnet',
  },
  version: 'v1-2026-06-29',
}

export interface ResolvedNeeruMeta {
  meta: NeeruMeta
  source: NeeruConfigSource
  isDegraded: boolean
}

// Central resolver. Returns backend meta if fresh, cache if within TTL, cache
// as degraded if past TTL, or the hardcoded fallback as last resort (cold boot
// offline). Consumers should never bypass this: it enforces the TTL / poison
// pill contract agreed with backend.
export function neeruMetaSelector(state: RootState): ResolvedNeeruMeta {
  const { meta, metaSource, metaFetchedAt } = state.neeruConfig
  if (!meta || !metaSource) {
    return {
      meta: NEERU_META_HARDCODED_FALLBACK,
      source: 'fallback',
      isDegraded: true,
    }
  }
  if (metaSource === 'backend') {
    return { meta, source: 'backend', isDegraded: false }
  }
  // 'cache' branch: check whether it is still within the freshness window.
  const fetchedAt = metaFetchedAt ? Date.parse(metaFetchedAt) : NaN
  const ageMs = Number.isFinite(fetchedAt) ? Date.now() - fetchedAt : Infinity
  return {
    meta,
    source: 'cache',
    isDegraded: ageMs > NEERU_META_CACHE_FRESH_MS,
  }
}

export interface ResolvedNeeruCatalogue {
  catalogue: NeeruCatalogue | null
  isLoading: boolean
  hasError: boolean
}

// Catalogue has no fallback by design (rates fluctuate operationally). If
// there is no fresh backend response, the caller renders a skeleton and
// triggers a retry. Never returns a stale-with-fallback shape.
export function neeruCatalogueSelector(state: RootState): ResolvedNeeruCatalogue {
  const { catalogue, catalogueFetchStatus } = state.neeruConfig
  return {
    catalogue,
    isLoading: catalogueFetchStatus === 'loading',
    hasError: catalogueFetchStatus === 'error',
  }
}

// Convenience: look up a single category by id from the current catalogue.
// Returns null when the catalogue is empty OR when the id is not present so
// callers must handle the missing case (skeleton / retry) rather than
// silently using stale hardcoded rates.
export function neeruCatalogueCategoryByIdSelector(
  state: RootState,
  id: number
): { secs: string; monthlyRatePercentage: number; annualEffectivePercentage: number } | null {
  const catalogue = state.neeruConfig.catalogue
  if (!catalogue) return null
  const found = catalogue.categories.find((c) => c.id === id)
  if (!found) return null
  return {
    secs: found.secs,
    monthlyRatePercentage: found.monthlyRatePercentage,
    annualEffectivePercentage: found.annualEffectivePercentage,
  }
}
