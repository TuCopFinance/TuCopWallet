import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { TransactionReceipt } from 'viem'
import { fetchNeeruPositions } from 'src/earn/neeru/api'
import { NEERU_CONTRACT_ADDRESS } from 'src/earn/neeru/constants'
import { parseDepositEvent } from 'src/earn/neeru/eventParsing'
import {
  NEERU_LOW_POOL_ACTION,
  awaitOptimisticResolution,
  closeNeeruPositionSaga,
  emergencyCloseNeeruPositionSaga,
  fetchNeeruPositionsSaga,
  handleNeeruDepositOptimistic,
  pollUntilBackendCatchesUp,
} from 'src/earn/neeru/saga'
import {
  addOptimisticPosition,
  closePositionFailure,
  closePositionStart,
  closePositionSuccess,
  emergencyCloseStart,
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
  markOptimisticPositionStale,
  removeOptimisticPosition,
} from 'src/earn/neeru/slice'
import { NeeruIndividualPosition } from 'src/earn/neeru/types'
import { triggerShortcutRequest } from 'src/positions/saga'
import { hooksApiUrlSelector } from 'src/positions/selectors'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { prepareTransactions } from 'src/viem/prepareTransactions'
import { sendPreparedTransactions } from 'src/viem/saga'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'

jest.mock('src/earn/neeru/eventParsing', () => ({
  parseDepositEvent: jest.fn(),
}))

describe('fetchNeeruPositionsSaga', () => {
  const WALLET = '0x' + 'a'.repeat(40)
  const RESPONSE = {
    address: WALLET,
    positions: [],
    lastSyncedBlock: 70750000,
    lastSyncedAt: '2026-06-26T00:00:00Z',
  }

  it('dispatches success on happy path', async () => {
    await expectSaga(fetchNeeruPositionsSaga, fetchPositionsStart())
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.call.fn(fetchNeeruPositions), RESPONSE],
      ])
      .put(
        fetchPositionsSuccess({
          positions: [],
          lastSyncedBlock: 70750000,
          lastSyncedAt: '2026-06-26T00:00:00Z',
        })
      )
      .run()
  })

  it('dispatches failure on API throw', async () => {
    await expectSaga(fetchNeeruPositionsSaga, fetchPositionsStart())
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.call.fn(fetchNeeruPositions), Promise.reject(new Error('boom'))],
      ])
      .put(fetchPositionsFailure({ error: 'boom' }))
      .run()
  })

  it('no-ops when no wallet address', async () => {
    let dispatchedSuccess = false
    await expectSaga(fetchNeeruPositionsSaga, fetchPositionsStart())
      .provide([[matchers.select(walletAddressSelector), null]])
      .run()
      .then((res) => {
        const successCalls = res.effects.put?.filter((p: any) =>
          p.payload.action.type.includes('fetchPositionsSuccess')
        )
        dispatchedSuccess = !!(successCalls && successCalls.length > 0)
      })
      .catch(jest.fn())
    expect(dispatchedSuccess).toBe(false)
  })
})

describe('closeNeeruPositionSaga', () => {
  const WALLET = '0x' + 'a'.repeat(40)
  const POSITION_ID = '1234'

  it('dispatches success on happy path', async () => {
    const fakeTxs = [{ to: '0x', data: '0x', value: '0', networkId: 'celo-mainnet' }]
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [matchers.call.fn(triggerShortcutRequest), { transactions: fakeTxs }],
        [matchers.call.fn(prepareTransactions), { type: 'possible', transactions: [] }],
        [matchers.call.fn(sendPreparedTransactions), []],
      ])
      .put(closePositionSuccess({ positionId: POSITION_ID }))
      .run()
  })

  it('on InterestPoolLow revert, dispatches NEERU_LOW_POOL_ACTION + closePositionFailure', async () => {
    const err = new Error('Reverted: InterestPoolLow')
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [matchers.call.fn(triggerShortcutRequest), Promise.reject(err)],
      ])
      .put({ type: NEERU_LOW_POOL_ACTION, payload: { positionId: POSITION_ID } })
      .put(closePositionFailure({ positionId: POSITION_ID, error: 'InterestPoolLow' }))
      .run()
  })

  it('on generic error, dispatches closePositionFailure', async () => {
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [matchers.call.fn(triggerShortcutRequest), Promise.reject(new Error('boom'))],
      ])
      .put(closePositionFailure({ positionId: POSITION_ID, error: 'boom' }))
      .run()
  })
})

describe('emergencyCloseNeeruPositionSaga', () => {
  const WALLET = '0x' + 'a'.repeat(40)
  const POSITION_ID = '5678'

  it('happy path: dispatches closePositionSuccess', async () => {
    const fakeTxs = [{ to: '0x', data: '0x', value: '0', networkId: 'celo-mainnet' }]
    await expectSaga(
      emergencyCloseNeeruPositionSaga,
      emergencyCloseStart({ positionId: POSITION_ID })
    )
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [matchers.call.fn(triggerShortcutRequest), { transactions: fakeTxs }],
        [matchers.call.fn(prepareTransactions), { type: 'possible', transactions: [] }],
        [matchers.call.fn(sendPreparedTransactions), []],
      ])
      .put(closePositionSuccess({ positionId: POSITION_ID }))
      .run()
  })

  it('failure: dispatches closePositionFailure with error message', async () => {
    await expectSaga(
      emergencyCloseNeeruPositionSaga,
      emergencyCloseStart({ positionId: POSITION_ID })
    )
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [matchers.call.fn(triggerShortcutRequest), Promise.reject(new Error('boom'))],
      ])
      .put(closePositionFailure({ positionId: POSITION_ID, error: 'boom' }))
      .run()
  })
})

describe('pollUntilBackendCatchesUp', () => {
  const WALLET = '0x' + 'a'.repeat(40)
  const BASE_URL = 'https://tucop.test/api'
  const TX = '0x' + 'd'.repeat(64)

  const responseWith = (txHashes: string[]) => ({
    address: WALLET,
    positions: txHashes.map(
      (h, i): NeeruIndividualPosition => ({
        positionId: `id-${i}`,
        tranche: 1,
        categoryLabel: '',
        principal: '0',
        accruedInterest: '0',
        rateValue: '0',
        monthlyRatePercentage: 0,
        startTs: 0,
        endTs: 0,
        depositBlock: 0,
        depositTxHash: h,
        renewedFromPositionId: null,
        currentPayoutIfClosed: {
          principal: '0',
          interest: '0',
          penaltyBps: 0,
          interestAfterPenalty: '0',
          total: '0',
          isEarly: false,
        },
      })
    ),
    lastSyncedBlock: 70_800_000,
    lastSyncedAt: '2026-06-29T00:00:00Z',
  })

  it('returns true and dispatches fetchPositionsSuccess when a position with matching txHash appears', async () => {
    const res = responseWith([TX])
    const final = await expectSaga(pollUntilBackendCatchesUp, {
      baseUrl: BASE_URL,
      walletAddress: WALLET,
      txHash: TX,
    })
      .provide([
        { call: ({ fn }: any, next: any) => (fn.name === 'delayP' ? undefined : next()) },
        [matchers.call.fn(fetchNeeruPositions), res],
      ])
      .put(
        fetchPositionsSuccess({
          positions: res.positions,
          lastSyncedBlock: res.lastSyncedBlock,
          lastSyncedAt: res.lastSyncedAt,
        })
      )
      .run()
    expect(final.returnValue).toBe(true)
  })

  it('keeps polling on transient fetch failures', async () => {
    let calls = 0
    const res = responseWith([TX])
    const final = await expectSaga(pollUntilBackendCatchesUp, {
      baseUrl: BASE_URL,
      walletAddress: WALLET,
      txHash: TX,
    })
      .provide([
        { call: ({ fn }: any, next: any) => (fn.name === 'delayP' ? undefined : next()) },
        {
          call: (effect: any, next: any) => {
            if (effect.fn === fetchNeeruPositions) {
              calls += 1
              if (calls === 1) throw new Error('network down')
              return res
            }
            return next()
          },
        },
      ])
      .put(
        fetchPositionsSuccess({
          positions: res.positions,
          lastSyncedBlock: res.lastSyncedBlock,
          lastSyncedAt: res.lastSyncedAt,
        })
      )
      .run()
    expect(final.returnValue).toBe(true)
    expect(calls).toBe(2)
  })
})

describe('handleNeeruDepositOptimistic', () => {
  const WALLET = '0x' + 'a'.repeat(40)
  const TX = '0x' + 'e'.repeat(64)

  const receipt = {
    blockNumber: BigInt(70_750_000),
    transactionHash: TX,
    logs: [],
  } as unknown as TransactionReceipt

  beforeEach(() => {
    ;(parseDepositEvent as jest.Mock).mockReset()
  })

  it('no-ops when wallet address is missing', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue(null)
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([[matchers.select(walletAddressSelector), null]])
      .not.put.actionType('neeru/addOptimisticPosition')
      .run()
  })

  it('falls back to fetchPositionsStart when the Deposit event is missing', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue(null)
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([[matchers.select(walletAddressSelector), WALLET]])
      .put(fetchPositionsStart())
      .not.put.actionType('neeru/addOptimisticPosition')
      .run()
    expect(parseDepositEvent).toHaveBeenCalledWith(receipt, NEERU_CONTRACT_ADDRESS)
  })

  it('skips when parsed tranche is out of range', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue({
      contractPositionId: '1',
      principal: '0',
      tranche: 7,
      rateValue: '0',
    })
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([[matchers.select(walletAddressSelector), WALLET]])
      .not.put.actionType('neeru/addOptimisticPosition')
      .not.put(fetchPositionsStart())
      .run()
  })

  it('happy path: adds optimistic, awaits matched, then removes', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue({
      contractPositionId: '42',
      principal: '10000000000000000000000', // 10000 * 1e18
      tranche: 1,
      rateValue: '1000003290000000000000000000',
    })
    const recorded: NeeruIndividualPosition[] = []
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        {
          put: (effect: any, next: any) => {
            if (effect.action?.type === addOptimisticPosition.type) {
              recorded.push(effect.action.payload)
            }
            return next()
          },
        },
        [matchers.call.fn(awaitOptimisticResolution), 'matched' as const],
      ])
      .put(removeOptimisticPosition({ depositTxHash: TX.toLowerCase() }))
      .not.put(markOptimisticPositionStale({ depositTxHash: TX.toLowerCase() }))
      .run()
    expect(recorded).toHaveLength(1)
    expect(recorded[0].depositTxHash).toBe(TX.toLowerCase())
    expect(recorded[0].optimistic).toBe(true)
    expect(recorded[0].tranche).toBe(1)
    expect(recorded[0].principal).toBe('10000')
  })

  it('timeout path: adds optimistic then marks it stale', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue({
      contractPositionId: '42',
      principal: '5000000000000000000000', // 5000 * 1e18
      tranche: 0, // flexible
      rateValue: '1000000000000000000000000000',
    })
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.call.fn(awaitOptimisticResolution), 'timedOut' as const],
      ])
      .put(markOptimisticPositionStale({ depositTxHash: TX.toLowerCase() }))
      .not.put(removeOptimisticPosition({ depositTxHash: TX.toLowerCase() }))
      .run()
  })

  it('passes the tucopBackendApiUrl to the resolver', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue({
      contractPositionId: '1',
      principal: '0',
      tranche: 2,
      rateValue: '1000003290000000000000000000',
    })
    let observed: any
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        {
          call: (effect: any, next: any) => {
            if (effect.fn === awaitOptimisticResolution) {
              observed = effect.args[0]
              return 'matched'
            }
            return next()
          },
        },
      ])
      .run()
    expect(observed.baseUrl).toBe(networkConfig.tucopBackendApiUrl)
    expect(observed.walletAddress).toBe(WALLET)
    expect(observed.txHash).toBe(TX.toLowerCase())
  })
})
