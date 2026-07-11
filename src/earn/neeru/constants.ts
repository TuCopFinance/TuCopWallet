import { NetworkId } from 'src/transactions/types'

export const NEERU_APP_ID = 'neeru-vaults'

export const NEERU_CONTRACT_ADDRESS = '0x988af5977201a0e988f2c75ea952532f6beb5082' as const
export const COPM_TOKEN_ADDRESS = '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as const
export const COPM_TOKEN_ID = `${NetworkId['celo-mainnet']}:${COPM_TOKEN_ADDRESS}` as const

export type NeeruCategoryId = 0 | 1 | 2 | 3

// Display order on the Earn screen: highest APR (longest lock) first
export const NEERU_CATEGORY_IDS: NeeruCategoryId[] = [3, 2, 1, 0]

export const NEERU_CATEGORY_LABEL_KEYS: Record<NeeruCategoryId, string> = {
  0: 'neeruVaults.categories.flexible',
  1: 'neeruVaults.categories.thirtyDays',
  2: 'neeruVaults.categories.sixtyDays',
  3: 'neeruVaults.categories.ninetyDays',
}

// Backend renamed the positionId suffix from `:category-<N>` to `:category-<N>`
// as part of the categoria UX cutover. Accept both so persisted state from
// prior wallet versions still parses cleanly during the transition; the new
// form is what backend emits going forward.
export const categoryIdFromPositionId = (positionId: string): NeeruCategoryId | null => {
  const match = positionId.match(/:(?:tranche|category)-(\d)$/)
  if (!match) return null
  const id = Number(match[1])
  if (id < 0 || id > 3) return null
  return id as NeeruCategoryId
}
