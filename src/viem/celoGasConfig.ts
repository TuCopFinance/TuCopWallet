import { Address } from 'viem'

// Celo network IDs (L2)
export const CELO_MAINNET_ID = 42220
export const CELO_SEPOLIA_ID = 11142220

// Gas estimation multipliers for Celo L2 (optimized for low-cost L2)
export const CELO_GAS_MULTIPLIERS = {
  // Base multiplier for gas limit estimation (5% buffer for L2)
  gasLimit: 1.05,
  // Priority fee multiplier (5% buffer - L2 has stable fees)
  priorityFee: 1.05,
  // Max fee multiplier (2% buffer since L2 has very predictable fees)
  maxFee: 1.02,
} as const

// Minimum gas prices for different fee currencies (in wei) - L2 optimized
export const CELO_MIN_GAS_PRICES = {
  // CELO native token minimum (optimized for L2 low fees)
  CELO: BigInt('100000000'), // 0.1 Gwei - optimized for L2 low costs
  // cUSD minimum
  cUSD: BigInt('100000000'), // 0.1 Gwei equivalent
  // cEUR minimum
  cEUR: BigInt('100000000'), // 0.1 Gwei equivalent
  // cREAL minimum
  cREAL: BigInt('100000000'), // 0.1 Gwei equivalent
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

// Fee currency addresses on Celo Sepolia Testnet
// From https://docs.celo.org/token-addresses
export const CELO_SEPOLIA_FEE_CURRENCIES = {
  CELO: '0x471EcE3750Da237f93B8E339c536989b8978a438' as Address,
  cUSD: '0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80' as Address,
  cEUR: '0x6B172e333e2978484261D7eCC3DE491E79764BbC' as Address,
  cREAL: '0x2294298942fdc79417DE9E0D740A4957E0e7783a' as Address,
  // USDC adapter for Celo Sepolia
  USDC: '0x4822e58de6f5e485eF90df51C41CE01721331dC0' as Address, // USDC Adapter
} as const

/**
 * Get fee currency addresses for the given chain ID
 */
export function getFeeCurrencies(chainId: number) {
  switch (chainId) {
    case CELO_MAINNET_ID:
      return CELO_FEE_CURRENCIES
    case CELO_SEPOLIA_ID:
      return CELO_SEPOLIA_FEE_CURRENCIES
    default:
      throw new Error(`Unsupported Celo chain ID: ${chainId}`)
  }
}

/**
 * Check if a chain ID is a Celo network (L2)
 */
export function isCeloNetwork(chainId?: number): boolean {
  return chainId === CELO_MAINNET_ID || chainId === CELO_SEPOLIA_ID
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
