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
        maxPriorityFeePerGas =
          currentGasPrice > block.baseFeePerGas
            ? currentGasPrice - block.baseFeePerGas
            : BigInt('1000000000') // 1 Gwei fallback
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

    // Apply conservative multipliers even in fallback mode
    const adjustedMaxFee = BigInt(Math.floor(Number(maxFeePerGas) * CELO_GAS_MULTIPLIERS.maxFee))
    const adjustedPriorityFee = BigInt(
      Math.floor(Number(maxPriorityFeePerGas) * CELO_GAS_MULTIPLIERS.priorityFee)
    )

    return {
      maxFeePerGas: adjustedMaxFee,
      maxPriorityFeePerGas: adjustedPriorityFee,
      baseFeePerGas: block.baseFeePerGas,
    }
  }
}
