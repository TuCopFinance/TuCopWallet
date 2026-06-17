import { revokeDelegation } from './revokeDelegation'
import { zeroAddress } from 'viem'

describe('revokeDelegation', () => {
  it('signs authorization pointing at zero address', async () => {
    const signSpy = jest
      .fn()
      .mockResolvedValue({ contractAddress: zeroAddress, signature: '0xsig' })
    const sendSpy = jest.fn().mockResolvedValue('0xhash')
    const wallet = {
      account: { address: '0x4D0d9e458e8a0D0C2c033B1fc2fE5a182837c3D2' as const },
      signAuthorization: signSpy,
      sendTransaction: sendSpy,
    } as any

    const hash = await revokeDelegation(wallet)
    expect(signSpy).toHaveBeenCalledWith(expect.objectContaining({ contractAddress: zeroAddress }))
    expect(sendSpy).toHaveBeenCalled()
    expect(hash).toBe('0xhash')
  })

  it('forwards feeCurrency if provided', async () => {
    const signSpy = jest
      .fn()
      .mockResolvedValue({ contractAddress: zeroAddress, signature: '0xsig' })
    const sendSpy = jest.fn().mockResolvedValue('0xhash2')
    const wallet = {
      account: { address: '0x4D0d9e458e8a0D0C2c033B1fc2fE5a182837c3D2' as const },
      signAuthorization: signSpy,
      sendTransaction: sendSpy,
    } as any
    const FEE = '0x765DE816845861e75A25fCA122bb6898B8B1282a' as const

    await revokeDelegation(wallet, { feeCurrency: FEE })
    const callArgs = sendSpy.mock.calls[0][0]
    expect(callArgs.feeCurrency).toBe(FEE)
  })

  it('throws if wallet has no account', async () => {
    const wallet = {
      account: null,
      signAuthorization: jest.fn(),
      sendTransaction: jest.fn(),
    } as any
    await expect(revokeDelegation(wallet)).rejects.toThrow(/account/i)
  })
})
