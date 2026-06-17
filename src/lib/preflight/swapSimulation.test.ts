import { simulateSwapTransaction } from 'src/lib/preflight/swapSimulation'

describe('simulateSwapTransaction', () => {
  it('returns ok when call simulation succeeds', async () => {
    const client = { call: jest.fn().mockResolvedValue({ data: '0x' }) }
    const result = await simulateSwapTransaction(client as any, {
      from: '0x0000000000000000000000000000000000000001',
      to: '0x0000000000000000000000000000000000000002',
      data: '0x',
      value: BigInt(0),
      assumedAllowance: BigInt(1000),
      sellToken: '0x0000000000000000000000000000000000000003',
    })
    expect(result.kind).toBe('ok')
  })

  it('returns revert with reason when call reverts', async () => {
    const client = {
      call: jest.fn().mockRejectedValue(new Error('execution reverted: slippage')),
    }
    const result = await simulateSwapTransaction(client as any, {
      from: '0x0000000000000000000000000000000000000001',
      to: '0x0000000000000000000000000000000000000002',
      data: '0x',
      value: BigInt(0),
      assumedAllowance: BigInt(1000),
      sellToken: '0x0000000000000000000000000000000000000003',
    })
    expect(result).toEqual({ kind: 'revert', reason: expect.stringContaining('slippage') })
  })

  it('returns network-error when call throws non-revert error', async () => {
    const client = { call: jest.fn().mockRejectedValue(new Error('connection lost')) }
    const result = await simulateSwapTransaction(client as any, {
      from: '0x0000000000000000000000000000000000000001',
      to: '0x0000000000000000000000000000000000000002',
      data: '0x',
      value: BigInt(0),
      assumedAllowance: BigInt(1000),
      sellToken: '0x0000000000000000000000000000000000000003',
    })
    expect(result.kind).toBe('network-error')
  })
})
