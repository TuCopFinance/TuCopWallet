import { Address } from 'viem'

// Celo network IDs (L2)
export const CELO_MAINNET_ID = 42220
export const CELO_ALFAJORES_ID = 44787

// Gas estimation multipliers for Celo L2 (conservative but optimized for L2)
export const CELO_GAS_MULTIPLIERS = {
  // Base multiplier for gas limit estimation (15% buffer for L2)
  gasLimit: 1.15,
  // Priority fee multiplier (20% buffer to ensure it's above base fee)
  priorityFee: 1.2,
  // Max fee multiplier (10% buffer since L2 has more predictable fees)
  maxFee: 1.1,
} as const

// Minimum gas prices for different fee currencies (in wei) - L2 optimized
export const CELO_MIN_GAS_PRICES = {
  // CELO native token minimum (adjusted for L2 base fees)
  CELO: BigInt('500000000'), // 0.5 Gwei - higher minimum to avoid base fee issues
  // cUSD minimum
  cUSD: BigInt('500000000'), // 0.5 Gwei equivalent
  // cEUR minimum
  cEUR: BigInt('500000000'), // 0.5 Gwei equivalent
  // cREAL minimum
  cREAL: BigInt('500000000'), // 0.5 Gwei equivalent
} as const

// Fee currency addresses on Celo L2 Mainnet
// Note: These addresses may have changed with L2 migration
export const CELO_FEE_CURRENCIES = {
  CELO: '0x471EcE3750Da237f93B8E339c536989b8978a438' as Address, // Native CELO
  cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a' as Address,
  cEUR: '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73' as Address,
  cREAL: '0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787' as Address,
  // USDC and USDT adapters for L2
  USDC: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' as Address, // USDC Adapter
  USDT: '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72' as Address, // USDT Adapter
} as const

// Fee currency addresses on Alfajores L2 Testnet
export const CELO_ALFAJORES_FEE_CURRENCIES = {
  CELO: '0xF194afDf50B03e69Bd7D057c1Aa9e10c9954E4C9' as Address,
  cUSD: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1' as Address,
  cEUR: '0x10c892A6EC43a53E45D0B916B4b7D383B1b78C0F' as Address,
  cREAL: '0xE4D517785D091D3c54818832dB6094bcc2744545' as Address,
  // USDC adapter for Alfajores
  USDC: '0x4822e58de6f5e485eF90df51C41CE01721331dC0' as Address, // USDC Adapter
} as const

/**
 * Get fee currency addresses for the given chain ID
 */
export function getFeeCurrencies(chainId: number) {
  switch (chainId) {
    case CELO_MAINNET_ID:
      return CELO_FEE_CURRENCIES
    case CELO_ALFAJORES_ID:
      return CELO_ALFAJORES_FEE_CURRENCIES
    default:
      throw new Error(`Unsupported Celo chain ID: ${chainId}`)
  }
}

/**
 * Check if a chain ID is a Celo network (L2)
 */
export function isCeloNetwork(chainId?: number): boolean {
  return chainId === CELO_MAINNET_ID || chainId === CELO_ALFAJORES_ID
}

/**
 * Get the optimal fee currency for a given balance
 * This helps select the best fee currency based on user's token balances
 */
export function getOptimalFeeCurrency(
  chainId: number,
  balances: Record<string, bigint>
): Address | undefined {
  const feeCurrencies = getFeeCurrencies(chainId)

  // Priority order: CELO > cUSD > USDC > cEUR > cREAL > USDT (if available)
  const priorityOrder = ['CELO', 'cUSD', 'USDC', 'cEUR', 'cREAL', 'USDT'] as const

  for (const currency of priorityOrder) {
    const address = feeCurrencies[currency as keyof typeof feeCurrencies]
    if (address && balances[address] && balances[address] > BigInt('1000000000000000000')) {
      // > 1 token
      return address
    }
  }

  return undefined // Use native CELO as fallback
}
