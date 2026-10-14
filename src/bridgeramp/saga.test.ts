import { combineReducers } from '@reduxjs/toolkit'
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
  checkWithdrawSwapSaga,
  executeBridgeRampSwap,
  executeBridgeRampSwapSaga,
} from 'src/bridgeramp/saga'
import bridgerampReducer, {
  swapBroadcast,
  swapConfirmed,
  swapFailed,
  swapSubmitting,
} from 'src/bridgeramp/slice'
import {
  buildBridgeDepositConversionCalls,
  buildBridgeWithdrawCalls,
} from 'src/bridgeramp/swapCalls'
import { Network, TokenTransactionTypeV2 } from 'src/transactions/types'
import { publicClient } from 'src/viem'
import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import {
  SentTxRecord,
  clearFlow,
  findRecordByIndexSelector,
  sentTransactionLogReducer,
} from 'src/viem/sentTransactionLog'
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

const rootReducer = combineReducers({
  bridgeramp: bridgerampReducer,
  sentTransactionLog: sentTransactionLogReducer,
})

// Runs the swap saga against the real bridgeramp + sent-tx log reducers,
// optionally with records already logged for some flows.
function expectSwapSaga(payload: ExecuteBridgeRampSwapPayload, sentLog: SentTxRecord[] = []) {
  const byFlow: Record<string, SentTxRecord[]> = {}
  for (const record of sentLog) {
    byFlow[record.flowId] = [...(byFlow[record.flowId] ?? []), record]
  }
  const state: ReturnType<typeof rootReducer> = {
    ...rootReducer(undefined, { type: 'init' }),
    sentTransactionLog: { byFlow },
  }
  return expectSaga(executeBridgeRampSwapSaga, executeBridgeRampSwap(payload)).withReducer(
    rootReducer,
    state
  )
}

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
    await expectSwapSaga(withdrawPayload)
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
      .put(clearFlow({ flowId: 'bridgeramp-flow-1' }))
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
    await expectSwapSaga(payload)
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
    await expectSwapSaga(withdrawPayload)
      .provide([
        sendProvider as any,
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0x2' }),
          { status: 'reverted' },
        ],
      ])
      .put(swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
      // Mined: a retry of the same flow must sign again, not replay 0x2.
      .put(clearFlow({ flowId: 'bridgeramp-flow-1' }))
      .put(swapFailed({ code: 'reverted' }))
      .not.put.actionType(swapConfirmed.type)
      .run()
    expect(captureBusinessError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ feature: 'bridgeramp', provider: 'mento', action: 'swap_reverted' })
    )
  })

  it('marks the swap failed when broadcasting throws, without touching the chain', async () => {
    await expectSwapSaga(withdrawPayload)
      .provide([
        [matchers.call.fn(sendPreparedTransactions), throwError(new Error('user cancelled'))],
      ])
      .put(swapFailed({ code: 'broadcast_failed' }))
      .not.put.actionType(swapBroadcast.type)
      .run()
  })

  it('keeps the sent record and reports receipt_unknown when the receipt cannot be read', async () => {
    await expectSwapSaga(withdrawPayload)
      .provide([
        sendProvider as any,
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0x2' }),
          throwError(new Error('rpc timeout')),
        ],
      ])
      .put(swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
      .put(swapFailed({ code: 'receipt_unknown' }))
      .not.put(clearFlow({ flowId: 'bridgeramp-flow-1' }))
      .run()
  })

  it('reports receipt_unknown when sending throws after the swap was logged', async () => {
    // Nothing logged before sending; sendPreparedTransactions logged the swap
    // and then threw (e.g. the mempool poll failed).
    let lookups = 0
    await expectSwapSaga(withdrawPayload)
      .provide([
        [matchers.call.fn(sendPreparedTransactions), throwError(new Error('mempool poll failed'))],
        [
          matchers.select.selector(findRecordByIndexSelector),
          dynamic(() =>
            lookups++ === 0
              ? undefined
              : { flowId: 'bridgeramp-flow-1', index: 1, nonce: 8, hash: '0x2', status: 'pending' }
          ),
        ],
      ])
      .put(swapFailed({ code: 'receipt_unknown' }))
      .not.put.actionType(swapBroadcast.type)
      .run()
  })

  it('waits for an already broadcast swap instead of signing again', async () => {
    const flowId = 'bridgeramp-flow-1'
    const { storeState } = await expectSwapSaga(
      // Old quote and no transactions: nothing new may be signed anyway.
      { ...withdrawPayload, quotedAt: NOW - 3600, serializablePreparedTransactions: [] },
      [
        { flowId, index: 0, nonce: 7, hash: '0xa', status: 'pending' },
        { flowId, index: 1, nonce: 8, hash: '0xb', status: 'pending' },
      ]
    )
      .provide([
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0xb' }),
          { status: 'success' },
        ],
      ])
      .not.call.fn(sendPreparedTransactions)
      .put(swapBroadcast({ approveTxHash: '0xa', swapTxHash: '0xb' }))
      .put(swapConfirmed({ confirmedAt: NOW }))
      .run()
    expect(storeState.sentTransactionLog.byFlow[flowId]).toBeUndefined()
  })

  it('signs a new withdrawal to the same address even with the last one still logged', async () => {
    // Same reusable address, previous attempt never re-awaited: its records
    // are still pending under that attempt's flowId.
    const previous = 'bridgeramp-wdr_1:attempt-1'
    await expectSwapSaga({ ...withdrawPayload, flowId: 'wdr_1:attempt-2' }, [
      { flowId: previous, index: 0, nonce: 7, hash: '0xa', status: 'pending' },
      { flowId: previous, index: 1, nonce: 8, hash: '0xb', status: 'pending' },
    ])
      .provide([
        sendProvider as any,
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0x2' }),
          { status: 'success' },
        ],
      ])
      .put(swapBroadcast({ approveTxHash: '0x1', swapTxHash: '0x2' }))
      .run()
    expect(sendArgs).toHaveBeenCalledWith({
      isGasSubsidized: false,
      flowId: 'bridgeramp-wdr_1:attempt-2',
    })
  })

  it('checks a swap from its stored hash when the log no longer has it, without signing', async () => {
    await expectSwapSaga({
      ...withdrawPayload,
      quotedAt: 0,
      serializablePreparedTransactions: [],
      waitOnly: { swapTxHash: '0xb' },
    })
      .provide([
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0xb' }),
          { status: 'success' },
        ],
      ])
      .not.call.fn(sendPreparedTransactions)
      .put(swapBroadcast({ approveTxHash: null, swapTxHash: '0xb' }))
      .put(swapConfirmed({ confirmedAt: NOW }))
      .run()
  })

  it('a status check trusts a logged swap whose earlier receipt wait failed', async () => {
    const flowId = 'bridgeramp-flow-1'
    await expectSwapSaga(
      { ...withdrawPayload, serializablePreparedTransactions: [], waitOnly: { swapTxHash: null } },
      [{ flowId, index: 1, nonce: 8, hash: '0xb', status: 'failed' }]
    )
      .provide([
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0xb' }),
          { status: 'success' },
        ],
      ])
      .not.call.fn(sendPreparedTransactions)
      .put(swapConfirmed({ confirmedAt: NOW }))
      .run()
  })

  it('a status check with nothing broadcast fails without signing', async () => {
    await expectSwapSaga({
      ...withdrawPayload,
      serializablePreparedTransactions: [],
      waitOnly: { swapTxHash: null },
    })
      .not.call.fn(sendPreparedTransactions)
      .put(swapFailed({ code: 'broadcast_failed' }))
      .run()
  })

  it('refuses a stale quote before signing anything', async () => {
    await expectSwapSaga({ ...withdrawPayload, quotedAt: NOW - 121 })
      .put(swapFailed({ code: 'stale_quote' }))
      .not.call.fn(sendPreparedTransactions)
      .run()
  })

  it('refuses transactions that do not match the declared recipient', async () => {
    await expectSwapSaga({ ...withdrawPayload, recipient: USER })
      .put(swapFailed({ code: 'invalid_recipient' }))
      .not.call.fn(sendPreparedTransactions)
      .run()
    expect(captureBusinessError).toHaveBeenCalledWith(
      expect.any(RampTransactionGuardError),
      expect.objectContaining({ action: 'swap_guard_rejected' })
    )
  })

  it('refuses transactions whose input token does not match the direction', async () => {
    await expectSwapSaga({
      ...withdrawPayload,
      serializablePreparedTransactions: [
        { ...withdrawTxs[0], to: USDC_ADDRESS_CELO },
        withdrawTxs[1],
      ],
    })
      .put(swapFailed({ code: 'invalid_recipient' }))
      .not.call.fn(sendPreparedTransactions)
      .run()
    // sanity: the untampered pair is on COPm
    expect(withdrawTxs[0].to).toBe(COPM_ADDRESS_CELO)
  })
})

describe('checkWithdrawSwapSaga', () => {
  const withdrawal = { id: 'wdr_1', deposit: { address: LIQUIDATION } } as any

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000)
  })

  function reviewState(swapTxHash: string | null) {
    const base = rootReducer(undefined, { type: 'init' })
    return {
      ...base,
      bridgeramp: {
        ...base.bridgeramp,
        withdraw: {
          ...base.bridgeramp.withdraw,
          status: 'review' as const,
          withdrawal,
          attemptId: 'a1',
          copmAmountIn: withdrawPayload.amountIn,
          swapTxHash,
        },
      },
    }
  }

  it('waits for the stored swap without a new quote and moves on once it confirms', async () => {
    const { storeState } = await expectSaga(checkWithdrawSwapSaga)
      .withReducer(rootReducer, reviewState('0xb'))
      .provide([
        [
          call([publicClient[Network.Celo], 'waitForTransactionReceipt'], { hash: '0xb' }),
          { status: 'success' },
        ],
      ])
      .not.call.fn(sendPreparedTransactions)
      .put(
        swapSubmitting({
          flowId: 'wdr_1:a1',
          direction: 'copmToUsdc',
          amountIn: withdrawPayload.amountIn,
          quotedAmountOut: '0',
          recipient: LIQUIDATION,
        })
      )
      .put(swapConfirmed({ confirmedAt: NOW }))
      .run()
    expect(storeState.bridgeramp.swap).toMatchObject({
      status: 'confirmed',
      recipient: LIQUIDATION,
    })
  })

  it('does nothing outside the review step', async () => {
    const state = reviewState('0xb')
    state.bridgeramp.withdraw.status = 'awaiting_payout' as any
    await expectSaga(checkWithdrawSwapSaga)
      .withReducer(rootReducer, state)
      .not.call.fn(executeBridgeRampSwapSaga)
      .run()
  })
})
