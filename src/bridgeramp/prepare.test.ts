import BigNumber from 'bignumber.js'
import {
  BRIDGE_RAMP_SWAP_ESTIMATED_GAS_USE,
  BRIDGE_RAMP_SWAP_GAS_LIMIT,
  prepareBridgeRampCalls,
} from 'src/bridgeramp/prepare'
import { COPM_ADDRESS_CELO, MENTO_ROUTER_ADDRESS_CELO } from 'src/bridgeramp/mentoRouter'
import { RampCall } from 'src/bridgeramp/swapCalls'
import { mockCeloTokenBalance, mockCusdTokenBalance } from 'test/values'

const USER = '0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856'

const calls: RampCall[] = [
  { to: COPM_ADDRESS_CELO, data: '0x095ea7b3aa', value: BigInt(0) },
  { to: MENTO_ROUTER_ADDRESS_CELO, data: '0x38ed173900', value: BigInt(0) },
]

describe('prepareBridgeRampCalls', () => {
  it('estimates the approve and pins gas on the swap', async () => {
    const prepareTxs = jest.fn().mockResolvedValue({ type: 'possible' })
    const amount = BigInt('800000000000000000000000')
    await prepareBridgeRampCalls(
      {
        calls,
        from: USER,
        spendToken: mockCusdTokenBalance,
        spendTokenAmount: amount,
        feeCurrencies: [mockCeloTokenBalance, mockCusdTokenBalance],
      },
      prepareTxs
    )
    expect(prepareTxs).toHaveBeenCalledTimes(1)
    const args = prepareTxs.mock.calls[0][0]
    expect(args.origin).toBe('bridge-ramp')
    expect(args.spendToken).toBe(mockCusdTokenBalance)
    expect(args.spendTokenAmount).toEqual(new BigNumber(amount.toString()))
    expect(args.feeCurrencies).toEqual([mockCeloTokenBalance, mockCusdTokenBalance])
    expect(args.baseTransactions).toHaveLength(2)
    expect(args.baseTransactions[0]).toEqual({
      from: USER,
      to: COPM_ADDRESS_CELO,
      data: '0x095ea7b3aa',
      value: BigInt(0),
    })
    expect(args.baseTransactions[0].gas).toBeUndefined()
    expect(args.baseTransactions[1]).toMatchObject({
      from: USER,
      to: MENTO_ROUTER_ADDRESS_CELO,
      gas: BRIDGE_RAMP_SWAP_GAS_LIMIT,
      _estimatedGasUse: BRIDGE_RAMP_SWAP_ESTIMATED_GAS_USE,
    })
  })

  it('refuses anything but an approve + swap pair', async () => {
    await expect(
      prepareBridgeRampCalls(
        {
          calls: [calls[0]],
          from: USER,
          spendToken: mockCusdTokenBalance,
          spendTokenAmount: BigInt(1),
          feeCurrencies: [mockCeloTokenBalance],
        },
        jest.fn()
      )
    ).rejects.toThrow('expected [approve, swap]')
  })
})
