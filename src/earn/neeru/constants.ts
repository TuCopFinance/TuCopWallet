// Contract identity, event topic0, data schema, error selectors and deposit
// token address are no longer sourced from build-time env. They flow through
// the neeruConfig Redux slice at runtime (backend > cache > hardcoded
// fallback) and callers read them via neeruMetaSelector. The hardcoded
// last-resort values live in configSelectors.NEERU_META_HARDCODED_FALLBACK
// and a blocking CI job (neeru-meta-drift) fails merge if they drift from
// the live /api/meta/contracts/neeru payload.

export const NEERU_APP_ID = 'neeru-vaults'

// Backend expanded the vault to 6 categories (Flexible + 30/60/90/180/365 dias)
// on 2026-08-25 without a wallet coordinated flip. Typed as `number` so a
// future term (e.g. category-6) enters the feed and the pool list without a
// wallet release; callsites that carry hand-tuned copy fall back to
// pool.displayProps.title/description when the id is not in their local map.
export type NeeruCategoryId = number

// Display order on the Earn screen: highest APR (longest lock) first.
// Anything the backend adds beyond the last known id is appended dynamically
// by expandNeeruPositions so new categories still surface.
export const NEERU_CATEGORY_IDS: NeeruCategoryId[] = [5, 4, 3, 2, 1, 0]

// i18n keys for the four originally-shipped categories. Newer categories
// (180/365 dias) fall back to pool.displayProps.title at the callsite so we
// don't need to keep hardcoding entries as Neeru extends the ladder.
export const NEERU_CATEGORY_LABEL_KEYS: Record<number, string> = {
  0: 'neeruVaults.categories.flexible',
  1: 'neeruVaults.categories.thirtyDays',
  2: 'neeruVaults.categories.sixtyDays',
  3: 'neeruVaults.categories.ninetyDays',
  4: 'neeruVaults.categories.oneEightyDays',
  5: 'neeruVaults.categories.threeSixtyFiveDays',
}

export const categoryIdFromPositionId = (positionId: string): NeeruCategoryId | null => {
  const match = positionId.match(/:category-(\d+)$/)
  if (!match) return null
  const id = Number(match[1])
  if (!Number.isFinite(id) || id < 0) return null
  return id
}
