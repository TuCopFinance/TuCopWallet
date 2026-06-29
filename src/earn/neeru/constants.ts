import { NetworkId } from 'src/transactions/types'

export const NEERU_APP_ID = 'neeru-vaults'

export const FONDO_COPM_MVP_ADDRESS = '0xd05cdf2dc56d97333c547519df58d56145766294' as const
export const COPM_TOKEN_ADDRESS = '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as const
export const COPM_TOKEN_ID = `${NetworkId['celo-mainnet']}:${COPM_TOKEN_ADDRESS}` as const
export const FONDO_DEPLOY_BLOCK = BigInt(70594026)

export type NeeruTrancheId = 0 | 1 | 2 | 3

// Display order on the Earn screen: highest APR (longest lock) first
export const NEERU_TRANCHE_IDS: NeeruTrancheId[] = [3, 2, 1, 0]

export const NEERU_TRANCHE_LABEL_KEYS: Record<NeeruTrancheId, string> = {
  0: 'neeruVaults.tranches.flexible',
  1: 'neeruVaults.tranches.thirtyDays',
  2: 'neeruVaults.tranches.sixtyDays',
  3: 'neeruVaults.tranches.ninetyDays',
}

export const trancheIdFromPositionId = (positionId: string): NeeruTrancheId | null => {
  const match = positionId.match(/:tranche-(\d)$/)
  if (!match) return null
  const id = Number(match[1])
  if (id < 0 || id > 3) return null
  return id as NeeruTrancheId
}
