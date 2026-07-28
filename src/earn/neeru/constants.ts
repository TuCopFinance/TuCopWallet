// Contract identity, event topic0, data schema, error selectors and deposit
// token address are no longer sourced from build-time env. They flow through
// the neeruConfig Redux slice at runtime (backend > cache > hardcoded
// fallback) and callers read them via neeruMetaSelector. The hardcoded
// last-resort values live in configSelectors.NEERU_META_HARDCODED_FALLBACK
// and a blocking CI job (neeru-meta-drift) fails merge if they drift from
// the live /api/meta/contracts/neeru payload.

export const NEERU_APP_ID = 'neeru-vaults'

export type NeeruCategoryId = 0 | 1 | 2 | 3

// Display order on the Earn screen: highest APR (longest lock) first
export const NEERU_CATEGORY_IDS: NeeruCategoryId[] = [3, 2, 1, 0]

export const NEERU_CATEGORY_LABEL_KEYS: Record<NeeruCategoryId, string> = {
  0: 'neeruVaults.categories.flexible',
  1: 'neeruVaults.categories.thirtyDays',
  2: 'neeruVaults.categories.sixtyDays',
  3: 'neeruVaults.categories.ninetyDays',
}

export const categoryIdFromPositionId = (positionId: string): NeeruCategoryId | null => {
  const match = positionId.match(/:category-(\d)$/)
  if (!match) return null
  const id = Number(match[1])
  if (id < 0 || id > 3) return null
  return id as NeeruCategoryId
}
