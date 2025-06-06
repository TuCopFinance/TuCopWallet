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
  try {
    // Celo L2 uses standard EIP-1559 with fee currency support
    // Get current block for base fee
    const block = await getBlock(client)

    if (!block.baseFeePerGas) {
      throw new Error(`missing baseFeePerGas on block: ${block.hash}`)
    }

    let maxPriorityFeePerGas: bigint
    let currentGasPrice: bigint

    // Try to get gas price with fee currency if specified
    if (feeCurrency) {
      try {
        const gasPriceResponse = await client.request({
          method: 'eth_gasPrice',
          params: [feeCurrency],
        } as any)
        currentGasPrice = BigInt(gasPriceResponse as string)
      } catch {
        // Fallback to standard gas price if fee currency fails
        const gasPriceResponse = await client.request({
          method: 'eth_gasPrice',
        } as any)
        currentGasPrice = BigInt(gasPriceResponse as string)
      }

      // Try to get max priority fee per gas with fee currency
      try {
        const maxPriorityFeeResponse = await client.request({
          method: 'eth_maxPriorityFeePerGas',
          params: [feeCurrency],
        } as any)
        maxPriorityFeePerGas = BigInt(maxPriorityFeeResponse as string)
      } catch {
        // Fallback: calculate priority fee from gas price and base fee
        if (currentGasPrice > block.baseFeePerGas) {
          maxPriorityFeePerGas = currentGasPrice - block.baseFeePerGas
        } else {
          // Ensure priority fee is at least 10% of base fee or minimum 1 Gwei, whichever is higher
          const minPriorityFee = block.baseFeePerGas / BigInt(10) // 10% of base fee
          const fallbackPriorityFee = BigInt('1000000000') // 1 Gwei
          maxPriorityFeePerGas =
            minPriorityFee > fallbackPriorityFee ? minPriorityFee : fallbackPriorityFee
        }
      }
    } else {
      // Standard EIP-1559 estimation for CELO native token
      const { maxFeePerGas: defaultMaxFee, maxPriorityFeePerGas: defaultPriorityFee } =
        await defaultEstimateFeesPerGas(client, {
          // @ts-expect-error
          block,
        })

      maxPriorityFeePerGas = defaultPriorityFee
      currentGasPrice = defaultMaxFee
    }

    // Apply minimum gas price if needed
    const minGasPrice = CELO_MIN_GAS_PRICES.CELO
    let baseFeePerGas = block.baseFeePerGas

    if (baseFeePerGas < minGasPrice) {
      baseFeePerGas = minGasPrice
    }

    // Ensure maxPriorityFeePerGas is never less than a reasonable minimum relative to baseFeePerGas
    const minReasonablePriorityFee = baseFeePerGas / BigInt(20) // 5% of base fee minimum
    if (maxPriorityFeePerGas < minReasonablePriorityFee) {
      maxPriorityFeePerGas = minReasonablePriorityFee
    }

    // Apply conservative multipliers for Celo L2
    const adjustedPriorityFee = BigInt(
      Math.floor(Number(maxPriorityFeePerGas) * CELO_GAS_MULTIPLIERS.priorityFee)
    )

    const adjustedMaxFee = BigInt(
      Math.floor(Number(baseFeePerGas + adjustedPriorityFee) * CELO_GAS_MULTIPLIERS.maxFee)
    )

    return {
      maxFeePerGas: adjustedMaxFee,
      maxPriorityFeePerGas: adjustedPriorityFee,
      baseFeePerGas,
    }
  } catch (error) {
    // Fallback to standard EIP-1559 estimation if Celo-specific methods fail
    const block = await getBlock(client)

    if (!block.baseFeePerGas) {
      throw new Error(`missing baseFeePerGas on block: ${block.hash}`)
    }

    const { maxFeePerGas, maxPriorityFeePerGas } = await defaultEstimateFeesPerGas(client, {
      // @ts-expect-error
      block,
    })

    // Ensure maxPriorityFeePerGas is reasonable relative to baseFeePerGas even in fallback
    let adjustedPriorityFee = maxPriorityFeePerGas
    const minReasonablePriorityFee = block.baseFeePerGas / BigInt(20) // 5% of base fee minimum
    if (adjustedPriorityFee < minReasonablePriorityFee) {
      adjustedPriorityFee = minReasonablePriorityFee
    }

    // Apply conservative multipliers even in fallback mode
    const finalPriorityFee = BigInt(
      Math.floor(Number(adjustedPriorityFee) * CELO_GAS_MULTIPLIERS.priorityFee)
    )
    const adjustedMaxFee = BigInt(Math.floor(Number(maxFeePerGas) * CELO_GAS_MULTIPLIERS.maxFee))

    return {
      maxFeePerGas: adjustedMaxFee,
      maxPriorityFeePerGas: finalPriorityFee,
      baseFeePerGas: block.baseFeePerGas,
    }
  }
}
