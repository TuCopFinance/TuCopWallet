import Config from 'react-native-config'
import { NetworkId } from 'src/transactions/types'

export const NEERU_APP_ID = 'neeru-vaults'

// Contract address, event topic0 and revert selectors are read from build-time
// env so that repo source alone does not identify the earn-vault contract.
// Defaults keep local dev builds functional without .env edits; production
// builds override via .env.mainnet.
export const NEERU_CONTRACT_ADDRESS = (Config.NEERU_CONTRACT_ADDRESS ??
  '0x988af5977201a0e988f2c75ea952532f6beb5082') as `0x${string}`
export const NEERU_DEPOSIT_TOPIC0 = (Config.NEERU_DEPOSIT_TOPIC0 ??
  '0x12ef563408f10ef4a1dde37b59a2538dcc75957c7e154bf71deea27089689653') as `0x${string}`

// 4-byte revert selectors, matched against viem's cause.data / details when
// a write reverts. Backend indexer emits these; wallet only needs to detect
// them by hex so we can branch the UX.
export const NEERU_ERR_INTEREST_POOL_LOW_SELECTOR = (Config.NEERU_ERR_INTEREST_POOL_LOW_SELECTOR ??
  '0x2648b779') as `0x${string}`
export const NEERU_ERR_ALREADY_CLOSED_SELECTOR = (Config.NEERU_ERR_ALREADY_CLOSED_SELECTOR ??
  '0x9acb7e52') as `0x${string}`
export const NEERU_ERR_NOT_OWNER_SELECTOR = (Config.NEERU_ERR_NOT_OWNER_SELECTOR ??
  '0x30cd7471') as `0x${string}`

// Deposit token used by the earn-vault (COPm mainnet).
export const DEPOSIT_TOKEN_ADDRESS = '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as const
export const DEPOSIT_TOKEN_ID = `${NetworkId['celo-mainnet']}:${DEPOSIT_TOKEN_ADDRESS}` as const

export type NeeruCategoryId = 0 | 1 | 2 | 3

// Display order on the Earn screen: highest APR (longest lock) first
export const NEERU_CATEGORY_IDS: NeeruCategoryId[] = [3, 2, 1, 0]

export const NEERU_CATEGORY_LABEL_KEYS: Record<NeeruCategoryId, string> = {
  0: 'neeruVaults.categories.flexible',
  1: 'neeruVaults.categories.thirtyDays',
  2: 'neeruVaults.categories.sixtyDays',
  3: 'neeruVaults.categories.ninetyDays',
}

// Backend positionId suffix was renamed from `:category-<N>` to `:category-<N>`
// in the 2026-07 wire cutover. Accept both so persisted state from prior
// wallet versions still parses cleanly during the transition.
export const categoryIdFromPositionId = (positionId: string): NeeruCategoryId | null => {
  const match = positionId.match(/:(?:tranche|category)-(\d)$/)
  if (!match) return null
  const id = Number(match[1])
  if (id < 0 || id > 3) return null
  return id as NeeruCategoryId
}
