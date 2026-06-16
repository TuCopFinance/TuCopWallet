import { NetworkId } from 'src/transactions/types'

export const NETWORK_NAMES: Record<NetworkId, string> = {
  [NetworkId['celo-mainnet']]: 'Celo',
  [NetworkId['ethereum-mainnet']]: 'Ethereum',
  [NetworkId['arbitrum-one']]: 'Arbitrum One',
  [NetworkId['op-mainnet']]: 'Optimism',
  [NetworkId['polygon-pos-mainnet']]: 'Polygon',
  [NetworkId['base-mainnet']]: 'Base',
}
