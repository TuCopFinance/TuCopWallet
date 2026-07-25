import { RootState } from 'src/redux/reducers'
import { NEERU_META_CACHE_FRESH_MS, NeeruConfigSource } from 'src/earn/neeru/configSlice'
import { NeeruCatalogue, NeeruMeta } from 'src/earn/neeru/types'

// Hardcoded fallback used when the wallet has never received a meta payload
// from the backend AND is currently offline. Values MUST match live /meta,
// enforced by a CI drift check. If backend rotates any of these, the CI check
// fails and this fallback must be updated in the same PR.
export const NEERU_META_HARDCODED_FALLBACK: NeeruMeta = {
  proxyAddress: '0x988Af5977201a0e988F2C75eA952532F6beb5082' as `0x${string}`,
  events: {
    Deposit: {
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
    INTEREST_POOL_LOW: '0x2648b779' as `0x${string}`,
    ALREADY_CLOSED: '0x9acb7e52' as `0x${string}`,
    NOT_OWNER: '0x30cd7471' as `0x${string}`,
  },
  depositToken: {
    address: '0x8a567e2aE79CA692Bd748aB832081C45de4041eA' as `0x${string}`,
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
