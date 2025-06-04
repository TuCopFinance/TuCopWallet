import BigNumber from 'bignumber.js'
import { TokenBalance } from 'src/tokens/slice'
import { Address, Client } from 'viem'
import { estimateGas } from 'viem/actions'
import { CELO_GAS_MULTIPLIERS, isCeloNetwork } from './celoGasConfig'
import { estimateFeesPerGas } from './estimateFeesPerGas'

export interface OptimizedGasEstimate {
  gasLimit: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  baseFeePerGas: bigint
  estimatedCost: BigNumber
  maxCost: BigNumber
}

/**
 * Optimized gas estimation specifically for Celo L2 networks
 * Uses conservative multipliers and proper fee currency handling with EIP-1559
 */
export async function estimateOptimizedCeloGas(
  client: Client,
  transaction: any,
  feeCurrency?: TokenBalance
): Promise<OptimizedGasEstimate> {
  const chainId = client.chain?.id

  if (!isCeloNetwork(chainId)) {
    throw new Error('This function is only for Celo networks')
  }

  // Get fee currency address
  const feeCurrencyAddress = getFeeCurrencyAddress(feeCurrency)

  // Get optimized fee estimation using EIP-1559 for Celo L2
  const { maxFeePerGas, maxPriorityFeePerGas, baseFeePerGas } = await estimateFeesPerGas(
    client,
    feeCurrencyAddress
  )

  // Estimate gas limit with the transaction
  const estimatedGasLimit = await estimateGas(client, {
    ...transaction,
    maxFeePerGas,
    maxPriorityFeePerGas,
    ...(feeCurrencyAddress && { feeCurrency: feeCurrencyAddress }),
    account: transaction.from,
  })

  // Apply conservative gas limit multiplier for Celo L2
  const gasLimit = BigInt(Math.ceil(Number(estimatedGasLimit) * CELO_GAS_MULTIPLIERS.gasLimit))

  // Calculate costs
  const estimatedCost = new BigNumber(
    (estimatedGasLimit * (baseFeePerGas + maxPriorityFeePerGas)).toString()
  )

  const maxCost = new BigNumber((gasLimit * maxFeePerGas).toString())

  return {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    baseFeePerGas,
    estimatedCost,
    maxCost,
  }
}

/**
 * Get fee currency address from TokenBalance
 */
function getFeeCurrencyAddress(feeCurrency?: TokenBalance): Address | undefined {
  if (!feeCurrency) {
    return undefined
  }

  if (feeCurrency.isNative) {
    // No address for native currency (CELO)
    return undefined
  }

  // Direct fee currency
  if (feeCurrency.isFeeCurrency) {
    if (!feeCurrency.address) {
      throw new Error(`Fee currency address is missing for fee currency ${feeCurrency.tokenId}`)
    }
    return feeCurrency.address as Address
  }

  // Fee currency adapter
  if (feeCurrency.feeCurrencyAdapterAddress) {
    return feeCurrency.feeCurrencyAdapterAddress
  }

  throw new Error(
    `Unable to determine fee currency address for fee currency ${feeCurrency.tokenId}`
  )
}

/**
 * Calculate the optimal fee currency based on balance and gas costs
 * Updated for Celo L2 with improved efficiency calculation
 */
export function selectOptimalFeeCurrency(
  feeCurrencies: TokenBalance[],
  gasEstimates: Map<string, OptimizedGasEstimate>
): TokenBalance | null {
  let bestOption: { currency: TokenBalance; efficiency: number } | null = null

  for (const currency of feeCurrencies) {
    const estimate = gasEstimates.get(currency.tokenId)
    if (!estimate) continue

    // Check if user has enough balance for max gas cost
    const maxCostInDecimals = estimate.maxCost.shiftedBy(-currency.decimals)
    if (maxCostInDecimals.isGreaterThan(currency.balance)) {
      continue // Not enough balance
    }

    // Calculate efficiency: remaining balance after gas cost
    const remainingBalance = currency.balance.minus(maxCostInDecimals)
    const efficiency = remainingBalance.dividedBy(currency.balance).toNumber()

    // Prefer native CELO and stable currencies for better predictability
    let priorityBonus = 0
    if (currency.symbol === 'CELO') priorityBonus = 0.1
    else if (['cUSD', 'USDC', 'USDT'].includes(currency.symbol)) priorityBonus = 0.05

    const adjustedEfficiency = efficiency + priorityBonus

    if (!bestOption || adjustedEfficiency > bestOption.efficiency) {
      bestOption = { currency, efficiency: adjustedEfficiency }
    }
  }

  return bestOption?.currency || null
}

/**
 * Validate that a transaction can be executed with the given gas parameters
 * Updated for Celo L2 with more reasonable limits
 */
export function validateGasParameters(
  gasEstimate: OptimizedGasEstimate,
  feeCurrency: TokenBalance
): { isValid: boolean; reason?: string } {
  // Check if max cost exceeds balance
  const maxCostInDecimals = gasEstimate.maxCost.shiftedBy(-feeCurrency.decimals)
  if (maxCostInDecimals.isGreaterThan(feeCurrency.balance)) {
    return {
      isValid: false,
      reason: `Insufficient balance for gas. Required: ${maxCostInDecimals.toFixed()}, Available: ${feeCurrency.balance.toFixed()}`,
    }
  }

  // Check if gas limit is reasonable (higher limit for L2)
  const maxReasonableGas = BigInt(30_000_000) // 30M gas limit for L2
  if (gasEstimate.gasLimit > maxReasonableGas) {
    return {
      isValid: false,
      reason: `Gas limit too high: ${gasEstimate.gasLimit.toString()}`,
    }
  }

  // Check if fees are reasonable (lower for L2)
  const maxReasonableFee = BigInt('10000000000') // 10 Gwei for L2
  if (gasEstimate.maxFeePerGas > maxReasonableFee) {
    return {
      isValid: false,
      reason: `Gas price too high: ${gasEstimate.maxFeePerGas.toString()}`,
    }
  }

  return { isValid: true }
}

/**
 * Get gas estimation for multiple fee currencies and return the best options
 * Optimized for Celo L2 with better error handling
 */
export async function getBestGasOptions(
  client: Client,
  transaction: any,
  feeCurrencies: TokenBalance[]
): Promise<{
  estimates: Map<string, OptimizedGasEstimate>
  bestOption: TokenBalance | null
  validOptions: TokenBalance[]
}> {
  const estimates = new Map<string, OptimizedGasEstimate>()
  const validOptions: TokenBalance[] = []

  // Get estimates for each fee currency
  for (const currency of feeCurrencies) {
    try {
      const estimate = await estimateOptimizedCeloGas(client, transaction, currency)
      estimates.set(currency.tokenId, estimate)

      // Validate the estimate
      const validation = validateGasParameters(estimate, currency)
      if (validation.isValid) {
        validOptions.push(currency)
      }
    } catch (error) {
      // Skip this fee currency if estimation fails
      // Silently continue to next fee currency
    }
  }

  // Select the best option
  const bestOption = selectOptimalFeeCurrency(validOptions, estimates)

  return {
    estimates,
    bestOption,
    validOptions,
  }
}
