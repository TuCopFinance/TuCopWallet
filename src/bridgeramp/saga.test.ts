import BigNumber from 'bignumber.js'
import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { dynamic, throwError } from 'redux-saga-test-plan/providers'
import { call } from 'redux-saga/effects'
import {
  COPM_ADDRESS_CELO,
  MENTO_ROUTER_ADDRESS_CELO,
  MentoQuote,
  USDC_ADDRESS_CELO,
} from 'src/bridgeramp/mentoRouter'
import {
  ExecuteBridgeRampSwapPayload,
  RampTransactionGuardError,
  assertRampTransactions,
  executeBridgeRampSwap,
  executeBridgeRampSwapSaga,
} from 'src/bridgeramp/saga'
import { swapBroadcast, swapConfirmed, swapFailed, swapSubmitting } from 'src/bridgeramp/slice'
import {
  buildBridgeDepositConversionCalls,
  buildBridgeWithdrawCalls,
} from 'src/bridgeramp/swapCalls'
import { Network, TokenTransactionTypeV2 } from 'src/transactions/types'
import { publicClient } from 'src/viem'
import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import networkConfig from 'src/web3/networkConfig'

jest.mock('src/utils/Logger')
jest.mock('src/sentry/captureBusinessError', () => ({ captureBusinessError: jest.fn() }))

const { captureBusinessError } = jest.requireMock('src/sentry/captureBusinessError') as {
  captureBusinessError: jest.Mock
}

const USER = '0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856'
const LIQUIDATION = '0xe2d21f9bd38d4555c340395d31af39ee3b11a995'
const NOW = 1_791_600_000

const withdrawQuote: MentoQuote = {
  direction: 'copmToUsdc',
  amountIn: BigInt('800000000000000000000000'),
  amountOut: BigInt(247_338_318),
  amountInWhole: new BigNumber('800000'),
  amountOutWhole: new BigNumber('247.338318'),
  copPerUsd: new BigNumber('3234.44'),
  quotedAt: NOW - 30,
}

const depositQuote: MentoQuote = {
  direction: 'usdcToCopm',
  amountIn: BigInt(100_000_000),
  amountOut: BigInt('319000000000000000000000'),
  amountInWhole: new BigNumber('100'),
  amountOutWhole: new BigNumber('319000'),
  copPerUsd: new BigNumber('3190'),
  quotedAt: NOW - 5,
}

function toSerializable(calls: { to: string; data: string }[]): SerializableTransactionRequest[] {
  return calls.map((c) => ({
    from: USER,
    to: c.to as `0x${string}`,
    data: c.data as `0x${string}`,
    gas: '100000',
    maxFeePerGas: '10000000000',
  })) as SerializableTransactionRequest[]
}

const withdrawTxs = toSerializable(
  buildBridgeWithdrawCalls({
    quote: withdrawQuote,
    user: USER,
    liquidationAddress: LIQUIDATION,
    now: NOW,
  })
)
const depositTxs = toSerializable(
  buildBridgeDepositConversionCalls({ quote: depositQuote, user: USER, now: NOW })
)

const withdrawPayload: ExecuteBridgeRampSwapPayload = {
  flowId: 'flow-1',
  direction: 'copmToUsdc',
  amountIn: withdrawQuote.amountIn.toString(),
  quotedAmountOut: withdrawQuote.amountOut.toString(),
  quotedAt: NOW - 30,
  recipient: LIQUIDATION,
  serializablePreparedTransactions: withdrawTxs,
}

describe('assertRampTransactions', () => {
  it('accepts the pair built by swapCalls for a withdraw', () => {
    expect(() =>
      assertRampTransactions(withdrawTxs, {
        direction: 'copmToUsdc',
        amountIn: withdrawQuote.amountIn,
        recipient: LIQUIDATION,
      })
    ).not.toThrow()
  })

  it('accepts the pair built by swapCalls for a deposit conversion', () => {
    expect(() =>
      assertRampTransactions(depositTxs, {
        direction: 'usdcToCopm',
        amountIn: depositQuote.amountIn,
        recipient: USER,
      })
    ).not.toThrow()
  })

  it('rejects a swap whose recipient is not the expected one', () => {
    expect(() =>
      assertRampTransactions(withdrawTxs, {
        direction: 'copmToUsdc',
        amountIn: withdrawQuote.amountIn,
        recipient: USER,
      })
    ).toThrow(RampTransactionGuardError)
  })

  it('rejects a mismatched amount', () => {
    expect(() =>
      assertRampTransactions(withdrawTxs, {
        direction: 'copmToUsdc',
        amountIn: withdrawQuote.amountIn + BigInt(1),
        recipient: LIQUIDATION,
      })
    ).toThrow('approve amount does not match amountIn')
  })

  it('rejects the wrong direction for the given transactions', () => {
    expect(() =>
      assertRampTransactions(depositTxs, {
        direction: 'copmToUsdc',
        amountIn: depositQuote.amountIn,
        recipient: USER,
      })
    ).toThrow('approve is not on the input token')
  })

  it('rejects an approve whose spender is not the Router', () => {
    const [approve, swap] = withdrawTxs
    const tampered = {
      ...approve,
      // approve(USER, amountIn)
      data: approve.data!.replace(
        MENTO_ROUTER_ADDRESS_CELO.slice(2).toLowerCase(),
        USER.slice(2).toLowerCase()
      ) as `0x${string}`,
    }
    expect(() =>
      assertRampTransactions([tampered, swap], {
        direction: 'copmToUsdc',
        amountIn: withdrawQuote.amountIn,
        recipient: LIQUIDATION,
      })
    ).toThrow('approve spender is not the Mento Router')
  })

  it('rejects a plain transfer disguised as the swap', () => {
    const [approve] = withdrawTxs
    expect(() =>
      assertRampTransactions([approve, { ...approve, to: MENTO_ROUTER_ADDRESS_CELO }], {
        direction: 'copmToUsdc',
        amountIn: withdrawQuote.amountIn,
        recipient: LIQUIDATION,
      })
    ).toThrow()
    expect(() =>
      assertRampTransactions([approve], {
        direction: 'copmToUsdc',
        amountIn: withdrawQuote.amountIn,
        recipient: LIQUIDATION,
      })
    ).toThrow('expected 2 transactions')
  })
})

describe('executeBridgeRampSwapSaga', () => {
  const standby = jest.fn()
  const sendArgs = jest.fn()
  const sendProvider = [
    matchers.call.fn(sendPreparedTransactions),
    dynamic(({ args: [txs, , handlers, isGasSubsidized, flowId] }) => {
      sendArgs({ isGasSubsidized, flowId })
      return (txs as any[]).map((_tx, i) => {
        const hash = `0x${i + 1}`
        standby(handlers[i](hash, 'fee-token'))
        return hash
      })
    }),
  ] as const

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000)
  })

  it('broadcasts approve + swap and confirms on a successful receipt', async () => {
    await expectSaga(executeBridgeRampSwapSaga, executeBridgeRampSwap(withdrawPayload))
      .provide([
        sendProvider as any,
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0x2' }),
          { status: 'success' },
        ],
      ])
      .put(
        swapSubmitting({
          flowId: 'flow-1',
          direction: 'copmToUsdc',
          amountIn: withdrawPayload.amountIn,
          quotedAmountOut: withdrawPayload.quotedAmountOut,
          recipient: LIQUIDATION,
        })
      )
      .put(swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
      .put(swapConfirmed({ confirmedAt: NOW }))
      .run()

    expect(sendArgs).toHaveBeenCalledWith({ isGasSubsidized: false, flowId: 'bridgeramp-flow-1' })
    expect(standby).toHaveBeenCalledTimes(2)
    expect(standby.mock.calls[0][0]).toMatchObject({
      type: TokenTransactionTypeV2.Approval,
      tokenId: networkConfig.copmTokenId,
      approvedAmount: '800000',
      transactionHash: '0x1',
      feeCurrencyId: 'fee-token',
    })
    expect(standby.mock.calls[1][0]).toMatchObject({
      type: TokenTransactionTypeV2.Sent,
      amount: { value: '-800000', tokenId: networkConfig.copmTokenId },
      address: LIQUIDATION,
      transactionHash: '0x2',
    })
    expect(captureBusinessError).not.toHaveBeenCalled()
  })

  it('records a deposit conversion as a swap back into the wallet', async () => {
    const payload: ExecuteBridgeRampSwapPayload = {
      flowId: 'flow-1',
      direction: 'usdcToCopm',
      amountIn: depositQuote.amountIn.toString(),
      quotedAmountOut: depositQuote.amountOut.toString(),
      quotedAt: NOW - 5,
      recipient: USER,
      serializablePreparedTransactions: depositTxs,
    }
    await expectSaga(executeBridgeRampSwapSaga, executeBridgeRampSwap(payload))
      .provide([
        sendProvider as any,
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0x2' }),
          { status: 'success' },
        ],
      ])
      .put(swapConfirmed({ confirmedAt: NOW }))
      .run()

    expect(standby.mock.calls[1][0]).toMatchObject({
      type: TokenTransactionTypeV2.SwapTransaction,
      inAmount: { value: '319000', tokenId: networkConfig.copmTokenId },
      outAmount: { value: '100', tokenId: networkConfig.usdcTokenId },
    })
  })

  it('marks the swap failed when the receipt says reverted', async () => {
    await expectSaga(executeBridgeRampSwapSaga, executeBridgeRampSwap(withdrawPayload))
      .provide([
        sendProvider as any,
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0x2' }),
          { status: 'reverted' },
        ],
      ])
      .put(swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
      .put(swapFailed({ code: 'reverted' }))
      .not.put.actionType(swapConfirmed.type)
      .run()
    expect(captureBusinessError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ feature: 'bridgeramp', provider: 'mento', action: 'swap_reverted' })
    )
  })

  it('marks the swap failed when broadcasting throws, without touching the chain', async () => {
    await expectSaga(executeBridgeRampSwapSaga, executeBridgeRampSwap(withdrawPayload))
      .provide([
        [matchers.call.fn(sendPreparedTransactions), throwError(new Error('user cancelled'))],
      ])
      .put(swapFailed({ code: 'broadcast_failed' }))
      .not.put.actionType(swapBroadcast.type)
      .run()
  })

  it('refuses a stale quote before signing anything', async () => {
    await expectSaga(
      executeBridgeRampSwapSaga,
      executeBridgeRampSwap({ ...withdrawPayload, quotedAt: NOW - 121 })
    )
      .put(swapFailed({ code: 'stale_quote' }))
      .not.call.fn(sendPreparedTransactions)
      .run()
  })

  it('refuses transactions that do not match the declared recipient', async () => {
    await expectSaga(
      executeBridgeRampSwapSaga,
      executeBridgeRampSwap({ ...withdrawPayload, recipient: USER })
    )
      .put(swapFailed({ code: 'invalid_recipient' }))
      .not.call.fn(sendPreparedTransactions)
      .run()
    expect(captureBusinessError).toHaveBeenCalledWith(
      expect.any(RampTransactionGuardError),
      expect.objectContaining({ action: 'swap_guard_rejected' })
    )
  })

  it('refuses transactions whose input token does not match the direction', async () => {
    await expectSaga(
      executeBridgeRampSwapSaga,
      executeBridgeRampSwap({
        ...withdrawPayload,
        serializablePreparedTransactions: [
          { ...withdrawTxs[0], to: USDC_ADDRESS_CELO },
          withdrawTxs[1],
        ],
      })
    )
      .put(swapFailed({ code: 'invalid_recipient' }))
      .not.call.fn(sendPreparedTransactions)
      .run()
    // sanity: the untampered pair is on COPm
    expect(withdrawTxs[0].to).toBe(COPM_ADDRESS_CELO)
  })
})
