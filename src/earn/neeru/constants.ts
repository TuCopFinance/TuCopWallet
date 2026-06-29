import { NetworkId } from 'src/transactions/types'

export const NEERU_APP_ID = 'neeru-vaults'

export const NEERU_CONTRACT_ADDRESS = '0xd05cdf2dc56d97333c547519df58d56145766294' as const
export const COPM_TOKEN_ADDRESS = '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as const
export const COPM_TOKEN_ID = `${NetworkId['celo-mainnet']}:${COPM_TOKEN_ADDRESS}` as const
export const FONDO_DEPLOY_BLOCK = BigInt(70594026)

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
