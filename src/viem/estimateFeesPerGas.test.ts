import { estimateFeesPerGas } from 'src/viem/estimateFeesPerGas'
import networkConfig from 'src/web3/networkConfig'
import { Block } from 'viem'
import { estimateFeesPerGas as defaultEstimateFeesPerGas, getBlock } from 'viem/actions'

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
    const mockBlock = { baseFeePerGas: BigInt(50), hash: '0x123' } as any as Block
    jest.mocked(getBlock).mockResolvedValue(mockBlock)
    jest.mocked(defaultEstimateFeesPerGas).mockResolvedValue({
      maxFeePerGas: BigInt(110),
      maxPriorityFeePerGas: BigInt(10),
    })

    const client = {
      chain: { id: networkConfig.viemChain.celo.id },
      request: jest.fn(async ({ method, params }) => {
        expect(params).toBeUndefined()
        if (method === 'eth_gasPrice') return '0x64' // 100 in hex
        if (method === 'eth_maxPriorityFeePerGas') return '0xa' // 10 in hex
        throw new Error(`Unknown method ${method}`)
      }),
    }
    const fees = await estimateFeesPerGas(client as any)

    // With the new implementation:
    // - baseFeePerGas should be the minimum (500000000 wei = 0.5 Gwei)
    // - minReasonablePriorityFee = 500000000 / 20 = 25000000 wei = 0.025 Gwei
    // - After 1.2 multiplier: 25000000 * 1.2 = 30000000 wei = 0.03 Gwei
    expect(fees.baseFeePerGas).toBe(BigInt('500000000')) // Minimum gas price applied
    expect(fees.maxPriorityFeePerGas).toBe(BigInt('30000000')) // minReasonablePriorityFee * 1.2
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas + fees.maxPriorityFeePerGas)

    expect(getBlock).toHaveBeenCalledWith(client)
  })

  it('should return the correct fees per gas on Celo when fee currency is specified', async () => {
    const mockBlock = { baseFeePerGas: BigInt(50), hash: '0x123' } as any as Block
    jest.mocked(getBlock).mockResolvedValue(mockBlock)

    const client = {
      chain: { id: networkConfig.viemChain.celo.id },
      request: jest.fn(async ({ method, params }) => {
        expect(params).toEqual(['0x123'])
        if (method === 'eth_gasPrice') return '0x64' // 100 in hex
        if (method === 'eth_maxPriorityFeePerGas') return '0xa' // 10 in hex
        throw new Error(`Unknown method ${method}`)
      }),
    }
    const fees = await estimateFeesPerGas(client as any, '0x123')

    // With fee currency:
    // - baseFeePerGas should be the minimum (500000000 wei = 0.5 Gwei)
    // - minReasonablePriorityFee = 500000000 / 20 = 25000000 wei = 0.025 Gwei
    // - After 1.2 multiplier: 25000000 * 1.2 = 30000000 wei = 0.03 Gwei
    expect(fees.baseFeePerGas).toBe(BigInt('500000000')) // Minimum gas price applied
    expect(fees.maxPriorityFeePerGas).toBe(BigInt('30000000')) // minReasonablePriorityFee * 1.2
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas + fees.maxPriorityFeePerGas)

    expect(defaultEstimateFeesPerGas).not.toHaveBeenCalled()
    expect(getBlock).toHaveBeenCalledWith(client)
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
    const mockBlock = { baseFeePerGas: BigInt('20000000000'), hash: '0x123' } as any as Block // 20 Gwei base fee
    jest.mocked(getBlock).mockResolvedValue(mockBlock)

    const client = {
      chain: { id: networkConfig.viemChain.celo.id },
      request: jest.fn(async ({ method, params }) => {
        if (method === 'eth_gasPrice') return '0x4a817c800' // 20 Gwei in hex (same as base fee)
        if (method === 'eth_maxPriorityFeePerGas') throw new Error('Method not supported') // Force fallback
        throw new Error(`Unknown method ${method}`)
      }),
    }

    const fees = await estimateFeesPerGas(client as any)

    // With 20 Gwei base fee, minReasonablePriorityFee should be 5% = 1000000000 wei = 1 Gwei
    // After applying the 1.2 multiplier, it should be 1200000000 wei = 1.2 Gwei
    expect(fees.maxPriorityFeePerGas).toBeGreaterThanOrEqual(BigInt('1000000000'))
    expect(fees.baseFeePerGas).toBe(BigInt('20000000000'))
    expect(fees.maxFeePerGas).toBeGreaterThan(fees.baseFeePerGas + fees.maxPriorityFeePerGas)
  })
})
