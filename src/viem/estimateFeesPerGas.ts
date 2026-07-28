import Logger from 'src/utils/Logger'
import { Address, Client } from 'viem'
import { estimateFeesPerGas as defaultEstimateFeesPerGas, getBlock } from 'viem/actions'
import { CELO_GAS_MULTIPLIERS, CELO_MIN_GAS_PRICES, isCeloNetwork } from './celoGasConfig'

export async function estimateFeesPerGas(
  client: Client,
  feeCurrency?: Address
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; baseFeePerGas: bigint }> {
  const chainId = client.chain?.id

  if (feeCurrency && !isCeloNetwork(chainId)) {
    throw new Error('feeCurrency is only supported on Celo networks')
  }

  // For Celo L2 networks, use optimized gas estimation with EIP-1559
  if (isCeloNetwork(chainId)) {
    return estimateCeloL2FeesPerGas(client, feeCurrency, chainId!)
  }

  // For other networks, use default estimation
  const block = await getBlock(client)

  if (!block.baseFeePerGas) {
    throw new Error(`missing baseFeePerGas on block: ${block.hash}`)
  }

  const { maxFeePerGas, maxPriorityFeePerGas } = await defaultEstimateFeesPerGas(client, {
    // @ts-expect-error
    block,
  })

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    baseFeePerGas: block.baseFeePerGas,
  }
}

async function estimateCeloL2FeesPerGas(
  client: Client,
  feeCurrency: Address | undefined,
  chainId: number
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; baseFeePerGas: bigint }> {
  // CIP-64 non-native fee currency: use eth_gasPrice(feeCurrency) as the sole
  // authoritative source and build a wide envelope around it. Do NOT mix with
  // block.baseFeePerGas, which is denominated in native (CELO wei) and is
  // therefore not directly comparable with the fee-currency gas price.
  //
  // The previous shared path subtracted (gasPrice(fc) - baseFee(native)) to
  // derive a "priority" fee, which produced priority ≈ gasPrice(fc) and left
  // maxFee within ~2-3% of the current price. op-geth tolerated the tight
  // margin; op-reth (Celo mainnet migrated 2026-07-22) is stricter about
  // validating that maxFee >= actual on-chain baseFee + priority and rejects
  // the request as "Missing or invalid parameters" whenever the base moves
  // up between estimation and inclusion. This branch fixes the class of
  // Forno rejections we observed on Gold buys.
  if (feeCurrency) {
    return estimateCip64FeesPerGas(client, feeCurrency)
  }

  // Get the most recent block to ensure we have current base fee
  const block = await getBlock(client, { blockTag: 'latest' })

  if (!block.baseFeePerGas) {
    throw new Error(`missing baseFeePerGas on block: ${block.hash}`)
  }

  const currentBaseFee = block.baseFeePerGas

  Logger.debug('estimateFeesPerGas', 'Celo L2 estimation start:', {
    blockNumber: block.number?.toString(),
    baseFee: currentBaseFee.toString(),
    feeCurrency: feeCurrency || 'native',
  })

  // Apply minimum gas price if needed
  const minGasPrice = CELO_MIN_GAS_PRICES.CELO
  let adjustedBaseFee = currentBaseFee
  if (adjustedBaseFee < minGasPrice) {
    adjustedBaseFee = minGasPrice
  }

  let priorityFee: bigint

  try {
    // Try to get network gas price
    let networkGasPrice: bigint

    if (feeCurrency) {
      try {
        // Try fee currency specific gas price first
        const gasPriceResponse = await client.request({
          method: 'eth_gasPrice',
          params: [feeCurrency],
        } as any)
        networkGasPrice = BigInt(gasPriceResponse as string)
      } catch {
        // Fallback to standard gas price
        const gasPriceResponse = await client.request({
          method: 'eth_gasPrice',
        } as any)
        networkGasPrice = BigInt(gasPriceResponse as string)
      }
    } else {
      // Standard gas price for native currency
      const gasPriceResponse = await client.request({
        method: 'eth_gasPrice',
      } as any)
      networkGasPrice = BigInt(gasPriceResponse as string)
    }

    // Calculate priority fee from network gas price
    if (networkGasPrice > adjustedBaseFee) {
      priorityFee = networkGasPrice - adjustedBaseFee
    } else {
      // If network gas price <= base fee, use a reasonable minimum
      const minPriorityFee = adjustedBaseFee / BigInt(20) // 5% of base fee
      const fallbackPriorityFee = BigInt('1500000000') // 1.5 Gwei (matching the logs)
      priorityFee = minPriorityFee > fallbackPriorityFee ? minPriorityFee : fallbackPriorityFee
    }

    Logger.debug('estimateFeesPerGas', 'network gas price method:', {
      networkGasPrice: networkGasPrice.toString(),
      calculatedPriorityFee: priorityFee.toString(),
    })
  } catch (error) {
    Logger.debug('estimateFeesPerGas', 'fallback to default priority fee due to:', error)

    // Fallback: use a reasonable priority fee
    const minPriorityFee = adjustedBaseFee / BigInt(20) // 5% of base fee
    const fallbackPriorityFee = BigInt('1500000000') // 1.5 Gwei
    priorityFee = minPriorityFee > fallbackPriorityFee ? minPriorityFee : fallbackPriorityFee
  }

  // Apply Celo multipliers for additional safety
  const adjustedPriorityFee = BigInt(
    Math.floor(Number(priorityFee) * CELO_GAS_MULTIPLIERS.priorityFee)
  )

  // CRITICAL: Calculate maxFeePerGas ensuring it's ALWAYS > baseFeePerGas
  // This is the key fix based on the error logs and internet research
  const baseMaxFee = adjustedBaseFee + adjustedPriorityFee

  // Apply multiplier to the total
  const multipliedMaxFee = BigInt(Math.floor(Number(baseMaxFee) * CELO_GAS_MULTIPLIERS.maxFee))

  // Add additional safety margin to handle base fee volatility
  // For Celo L2, base fee is more stable, so we use a smaller buffer
  const safetyBuffer = adjustedBaseFee / BigInt(10) // 10% of base fee as safety buffer
  const finalMaxFee = multipliedMaxFee + safetyBuffer

  Logger.debug('estimateFeesPerGas', 'Celo L2 calculation:', {
    adjustedBaseFee: adjustedBaseFee.toString(),
    priorityFee: priorityFee.toString(),
    adjustedPriorityFee: adjustedPriorityFee.toString(),
    baseMaxFee: baseMaxFee.toString(),
    multipliedMaxFee: multipliedMaxFee.toString(),
    safetyBuffer: safetyBuffer.toString(),
    finalMaxFee: finalMaxFee.toString(),
    safetyMarginPercent:
      (((finalMaxFee - adjustedBaseFee) * BigInt(100)) / adjustedBaseFee).toString() + '%',
  })

  // Final validation to prevent the error we saw in logs
  if (finalMaxFee <= adjustedBaseFee) {
    const emergencyMaxFee = adjustedBaseFee * BigInt(2) // 100% above base fee as emergency fallback
    Logger.warn('estimateFeesPerGas', 'Emergency fallback activated:', {
      calculatedMaxFee: finalMaxFee.toString(),
      baseFee: adjustedBaseFee.toString(),
      emergencyMaxFee: emergencyMaxFee.toString(),
    })

    return {
      maxFeePerGas: emergencyMaxFee,
      maxPriorityFeePerGas: adjustedPriorityFee,
      baseFeePerGas: adjustedBaseFee,
    }
  }

  return {
    maxFeePerGas: finalMaxFee,
    maxPriorityFeePerGas: adjustedPriorityFee,
    baseFeePerGas: adjustedBaseFee,
  }
}

/**
 * Dedicated estimator for CIP-64 non-native fee currency transactions.
 *
 * Rationale: on Celo, `eth_gasPrice(feeCurrency)` returns the current total
 * gas price in fee-currency units (baseFee + a small priority) already
 * scaled through the fee currency adapter. Block header baseFeePerGas is in
 * native units and cannot be mixed with it. This function treats the fee-
 * currency gas price as authoritative:
 *
 *   - maxFeePerGas   = gasPrice(fc) * 2         (100% headroom for base drift)
 *   - maxPriorityFee = gasPrice(fc) / 4         (25% of current price)
 *   - baseFeePerGas  = gasPrice(fc) - priority  (approximate, reported for UI)
 *
 * The 100% headroom is deliberately generous because op-reth rejects on any
 * borderline case and the cost of a rejected tx (user-visible error) is
 * higher than the cost of a slightly-overestimated maxFee (user is never
 * actually charged above realBaseFee + priority regardless of maxFee).
 */
async function estimateCip64FeesPerGas(
  client: Client,
  feeCurrency: Address
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; baseFeePerGas: bigint }> {
  let gasPriceInFeeCurrency: bigint
  try {
    const raw = await client.request({
      method: 'eth_gasPrice',
      params: [feeCurrency],
    } as any)
    gasPriceInFeeCurrency = BigInt(raw as string)
  } catch (error) {
    // If the node refuses the fee-currency variant, fall back to the plain
    // eth_gasPrice and let downstream estimation surface the error. Do NOT
    // silently substitute the native gas price into a CIP-64 tx — units
    // would mismatch again.
    Logger.warn('estimateFeesPerGas', 'CIP-64 eth_gasPrice(feeCurrency) failed:', {
      feeCurrency,
      error,
    })
    throw error
  }

  if (gasPriceInFeeCurrency <= BigInt(0)) {
    throw new Error(
      `CIP-64 eth_gasPrice(${feeCurrency}) returned non-positive value: ${gasPriceInFeeCurrency}`
    )
  }

  const maxFeePerGas = gasPriceInFeeCurrency * BigInt(2)
  const maxPriorityFeePerGas = gasPriceInFeeCurrency / BigInt(4)
  const baseFeePerGas = gasPriceInFeeCurrency - maxPriorityFeePerGas

  Logger.debug('estimateFeesPerGas', 'CIP-64 estimation:', {
    feeCurrency,
    gasPriceInFeeCurrency: gasPriceInFeeCurrency.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    baseFeePerGas: baseFeePerGas.toString(),
    headroomMultiple: '2x',
  })

  return { maxFeePerGas, maxPriorityFeePerGas, baseFeePerGas }
}
