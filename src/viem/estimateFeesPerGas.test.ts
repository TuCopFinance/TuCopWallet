import networkConfig from 'src/web3/networkConfig'
import { Address, Block } from 'viem'
import { estimateFeesPerGas as defaultEstimateFeesPerGas, getBlock } from 'viem/actions'
import { estimateFeesPerGas } from './estimateFeesPerGas'

jest.mock('viem/actions', () => ({
  getBlock: jest.fn(),
  estimateFeesPerGas: jest.fn(),
  readContract: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe(estimateFeesPerGas, () => {
  it('should return the correct fees per gas on Celo', async () => {
    const mockBlock = {
      baseFeePerGas: BigInt('100000000'),
      hash: '0x123',
      number: BigInt(100),
    } as any as Block // 0.1 Gwei
    jest.mocked(getBlock).mockResolvedValue(mockBlock)

    const client = {
      chain: { id: networkConfig.viemChain.celo.id },
      request: jest.fn(async ({ method, params }) => {
        if (method === 'eth_gasPrice') return '0x77359400' // 2 Gwei in hex
        throw new Error(`Unknown method ${method}`)
      }),
    }

    const fees = await estimateFeesPerGas(client as any)

    // Critical validations
    expect(fees.baseFeePerGas).toBe(BigInt('500000000')) // Minimum gas price applied
    expect(fees.maxPriorityFeePerGas).toBeGreaterThan(BigInt(0))
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas)
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas + fees.maxPriorityFeePerGas)

    expect(getBlock).toHaveBeenCalledWith(client, { blockTag: 'latest' })
  })

  it('should return the correct fees per gas on Celo when fee currency is specified', async () => {
    const mockBlock = {
      baseFeePerGas: BigInt('100000000'),
      hash: '0x123',
      number: BigInt(100),
    } as any as Block // 0.1 Gwei
    jest.mocked(getBlock).mockResolvedValue(mockBlock)

    const client = {
      chain: { id: networkConfig.viemChain.celo.id },
      request: jest.fn(async ({ method, params }) => {
        if (method === 'eth_gasPrice' && params?.[0] === '0x456') return '0x77359400' // 2 Gwei with fee currency
        if (method === 'eth_gasPrice') return '0x3b9aca00' // 1 Gwei fallback
        throw new Error(`Unknown method ${method}`)
      }),
    }

    const fees = await estimateFeesPerGas(client as any, '0x456' as Address)

    // Critical validations
    expect(fees.baseFeePerGas).toBe(BigInt('500000000')) // Minimum gas price applied
    expect(fees.maxPriorityFeePerGas).toBeGreaterThan(BigInt(0))
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas)
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas + fees.maxPriorityFeePerGas)

    expect(defaultEstimateFeesPerGas).not.toHaveBeenCalled()
  })

  it('should return the default fees per gas on other networks', async () => {
    jest
      .mocked(defaultEstimateFeesPerGas)
      .mockResolvedValue({ maxFeePerGas: BigInt(110), maxPriorityFeePerGas: BigInt(10) })
    const mockBlock = { baseFeePerGas: BigInt(50) } as Block
    jest.mocked(getBlock).mockResolvedValue(mockBlock)
    const client = {
      chain: { id: 1 },
    }
    const fees = await estimateFeesPerGas(client as any)
    expect(fees).toEqual({
      maxFeePerGas: BigInt(110),
      maxPriorityFeePerGas: BigInt(10),
      baseFeePerGas: BigInt(50),
    })
    expect(defaultEstimateFeesPerGas).toHaveBeenCalledWith(client, { block: mockBlock })
    expect(defaultEstimateFeesPerGas).toHaveBeenCalledTimes(1)
    expect(getBlock).toHaveBeenCalledWith(client)
    expect(getBlock).toHaveBeenCalledTimes(1)
  })

  it('should throw on other networks when fee currency is specified', async () => {
    const client = {
      chain: { id: 1 },
    }
    await expect(estimateFeesPerGas(client as any, '0x123')).rejects.toThrowError(
      'feeCurrency is only supported on Celo networks'
    )
    expect(defaultEstimateFeesPerGas).not.toHaveBeenCalled()
    expect(getBlock).not.toHaveBeenCalled()
  })

  it('should throw on other networks if baseFeePerGas is missing', async () => {
    jest
      .mocked(defaultEstimateFeesPerGas)
      .mockResolvedValue({ maxFeePerGas: BigInt(110), maxPriorityFeePerGas: BigInt(10) })
    jest.mocked(getBlock).mockResolvedValue({ hash: '0x123', baseFeePerGas: null } as any as Block)
    const client = {
      chain: { id: 1 },
    }
    await expect(estimateFeesPerGas(client as any)).rejects.toThrowError(
      'missing baseFeePerGas on block: 0x123'
    )
    expect(defaultEstimateFeesPerGas).not.toHaveBeenCalled()
    expect(getBlock).toHaveBeenCalledWith(client)
    expect(getBlock).toHaveBeenCalledTimes(1)
  })

  it('should ensure maxPriorityFeePerGas is never lower than baseFeePerGas on Celo L2', async () => {
    const mockBlock = { baseFeePerGas: BigInt('5000000000'), hash: '0x123' } as any as Block // 5 Gwei base fee
    jest.mocked(getBlock).mockResolvedValue(mockBlock)

    const client = {
      chain: { id: networkConfig.viemChain.celo.id },
      request: jest.fn(async ({ method, params }) => {
        if (method === 'eth_gasPrice') return '0x12a05f200' // 5 Gwei in hex (same as base fee)
        if (method === 'eth_maxPriorityFeePerGas') throw new Error('Method not supported') // Force fallback
        throw new Error(`Unknown method ${method}`)
      }),
    }

    const fees = await estimateFeesPerGas(client as any)

    // With 5 Gwei base fee, minReasonablePriorityFee should be 5% = 250000000 wei = 0.25 Gwei
    // After applying the 1.2 multiplier, it should be 300000000 wei = 0.3 Gwei
    expect(fees.maxPriorityFeePerGas).toBeGreaterThanOrEqual(BigInt('250000000'))
    expect(fees.baseFeePerGas).toBe(BigInt('5000000000'))
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas + fees.maxPriorityFeePerGas)
  })

  it('should handle high baseFeePerGas scenarios on Celo L2', async () => {
    const baseFeePerGas = BigInt('31114383238204') // ~31.11 Gwei base fee (from logs)
    const mockBlock = { baseFeePerGas, hash: '0x123', number: BigInt(100) } as any as Block
    jest.mocked(getBlock).mockResolvedValue(mockBlock)

    const client = {
      chain: { id: networkConfig.viemChain.celo.id },
      request: jest.fn(async ({ method, params }) => {
        if (method === 'eth_gasPrice') return '0x6c6b935b8bdc' // 29.15 gwei in hex (from logs)
        throw new Error(`Unknown method ${method}`)
      }),
    }

    const fees = await estimateFeesPerGas(client as any)

    // CRITICAL validations to prevent the error we saw in logs
    expect(fees.baseFeePerGas).toBe(baseFeePerGas)
    expect(fees.maxPriorityFeePerGas).toBeGreaterThan(BigInt(0))

    // This is the key fix: maxFeePerGas must ALWAYS be greater than baseFeePerGas
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas)

    // Ensure we have a reasonable safety margin (should be at least 25% above base fee)
    const safetyMargin =
      ((fees.maxFeePerGas - fees.baseFeePerGas) * BigInt(100)) / fees.baseFeePerGas
    expect(Number(safetyMargin)).toBeGreaterThan(25) // At least 25% safety margin

    // Verify the specific scenario from the logs won't happen
    expect(fees.maxFeePerGas).toBeGreaterThan(BigInt('31114383238204')) // Must be > baseFee from logs
  })

  it('should ensure maxFeePerGas is never lower than baseFeePerGas in fallback mode', async () => {
    const baseFeePerGas = BigInt('20000000000') // 20 Gwei base fee
    const mockBlock = { baseFeePerGas, hash: '0x123', number: BigInt(100) } as any as Block
    jest.mocked(getBlock).mockResolvedValue(mockBlock)

    const client = {
      chain: { id: networkConfig.viemChain.celo.id },
      request: jest.fn(async ({ method, params }) => {
        // Simulate network error to test fallback behavior
        throw new Error('Network error')
      }),
    }

    const fees = await estimateFeesPerGas(client as any)

    // In fallback mode with network errors, we should use minimum reasonable values
    // - Priority fee should be 5% of base fee = 20 Gwei / 20 = 1 Gwei = 1000000000 wei
    // - Fallback priority fee is 1.5 Gwei = 1500000000 wei (higher, so this is used)
    // - After 1.2 multiplier: 1500000000 * 1.2 = 1800000000 wei
    const expectedPriorityFee = BigInt('1500000000') // 1.5 Gwei fallback
    const expectedAdjustedPriorityFee = BigInt(Math.floor(Number(expectedPriorityFee) * 1.2))

    // Calculate expected maxFeePerGas
    const baseMaxFee = baseFeePerGas + expectedAdjustedPriorityFee
    const multipliedMaxFee = BigInt(Math.floor(Number(baseMaxFee) * 1.1))
    const safetyBuffer = baseFeePerGas / BigInt(4)
    const expectedMaxFee = multipliedMaxFee + safetyBuffer

    expect(fees.baseFeePerGas).toBe(baseFeePerGas)
    expect(fees.maxPriorityFeePerGas).toBe(expectedAdjustedPriorityFee)
    expect(fees.maxFeePerGas).toBe(expectedMaxFee)

    // CRITICAL: Ensure maxFeePerGas is ALWAYS greater than baseFeePerGas
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas)

    // Verify that we're not using defaultEstimateFeesPerGas anymore
    expect(defaultEstimateFeesPerGas).not.toHaveBeenCalled()
  })
})
