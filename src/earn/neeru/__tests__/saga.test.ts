import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { TransactionReceipt } from 'viem'
import { fetchNeeruPositions } from 'src/earn/neeru/api'
import { NEERU_META_HARDCODED_FALLBACK, neeruMetaSelector } from 'src/earn/neeru/configSelectors'
import { parseDepositEvent } from 'src/earn/neeru/eventParsing'
import {
  NEERU_ALREADY_CLOSED_ERROR,
  NEERU_LOW_POOL_ACTION,
  NEERU_LOW_POOL_ERROR,
  NEERU_NOT_OWNER_ERROR,
  NEERU_UNKNOWN_REVERT_ERROR,
  awaitOptimisticResolution,
  closeNeeruPositionSaga,
  emergencyCloseNeeruPositionSaga,
  fetchNeeruPositionsSaga,
  handleNeeruDepositOptimistic,
  isLowPoolError,
  pollUntilBackendCatchesUp,
} from 'src/earn/neeru/saga'
import {
  addOptimisticPosition,
  clearEmergencyFallback,
  closePositionFailure,
  closePositionStart,
  closePositionSuccess,
  emergencyCloseStart,
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
  initialState as neeruInitialState,
  markOptimisticPositionStale,
  removeOptimisticPosition,
  setEmergencyFallback,
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

// Resolved neeruMetaSelector value that all sagas expect when they read the
// meta from Redux. Using the fallback keeps assertions comparing against
// exactly the hex constants the CI drift check enforces.
const RESOLVED_META = {
  meta: NEERU_META_HARDCODED_FALLBACK,
  source: 'fallback' as const,
  isDegraded: true,
}

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
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [matchers.call.fn(triggerShortcutRequest), { transactions: fakeTxs }],
        [matchers.call.fn(prepareTransactions), { type: 'possible', transactions: [] }],
        [matchers.call.fn(sendPreparedTransactions), []],
      ])
      .put(closePositionSuccess({ positionId: POSITION_ID }))
      .run()
  })

  it('on low-pool revert selector, dispatches NEERU_LOW_POOL_ACTION + closePositionFailure', async () => {
    const err = Object.assign(new Error('Execution reverted'), {
      cause: { data: '0x2648b779' },
    })
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [matchers.call.fn(triggerShortcutRequest), Promise.reject(err)],
      ])
      .put({ type: NEERU_LOW_POOL_ACTION, payload: { positionId: POSITION_ID } })
      .put(closePositionFailure({ positionId: POSITION_ID, error: NEERU_LOW_POOL_ERROR }))
      .run()
  })

  it('on generic error, dispatches closePositionFailure', async () => {
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
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
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
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
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
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
        category: 1,
        categoryLabel: '',
        amount: '0',
        accruedInterest: '0',
        rateValue: '0',
        monthlyRatePercentage: 0,
        startTs: 0,
        endTs: 0,
        depositBlock: 0,
        depositTxHash: h,
        renewedFromPositionId: null,
        currentPayoutIfClosed: {
          amount: '0',
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
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
      ])
      .put(fetchPositionsStart())
      .not.put.actionType('neeru/addOptimisticPosition')
      .run()
    expect(parseDepositEvent).toHaveBeenCalledWith(
      receipt,
      NEERU_META_HARDCODED_FALLBACK.proxyAddress,
      NEERU_META_HARDCODED_FALLBACK.events.Deposit.topic0,
      NEERU_META_HARDCODED_FALLBACK.events.Deposit.dataSchema
    )
  })

  it('skips when parsed category is out of range', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue({
      contractPositionId: '1',
      amount: '0',
      category: 7,
      rateValue: '0',
    })
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
      ])
      .not.put.actionType('neeru/addOptimisticPosition')
      .not.put(fetchPositionsStart())
      .run()
  })

  it('happy path: adds optimistic, awaits matched, then removes', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue({
      contractPositionId: '42',
      amount: '10000000000000000000000', // 10000 * 1e18
      category: 1,
      rateValue: '1000003290000000000000000000',
    })
    const recorded: NeeruIndividualPosition[] = []
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
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
    expect(recorded[0].category).toBe(1)
    expect(recorded[0].amount).toBe('10000')
  })

  it('timeout path: adds optimistic then marks it stale', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue({
      contractPositionId: '42',
      amount: '5000000000000000000000', // 5000 * 1e18
      category: 0, // flexible
      rateValue: '1000000000000000000000000000',
    })
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.call.fn(awaitOptimisticResolution), 'timedOut' as const],
      ])
      .put(markOptimisticPositionStale({ depositTxHash: TX.toLowerCase() }))
      .not.put(removeOptimisticPosition({ depositTxHash: TX.toLowerCase() }))
      .run()
  })

  it('passes the tucopBackendApiUrl to the resolver', async () => {
    ;(parseDepositEvent as jest.Mock).mockReturnValue({
      contractPositionId: '1',
      amount: '0',
      category: 2,
      rateValue: '1000003290000000000000000000',
    })
    let observed: any
    await expectSaga(handleNeeruDepositOptimistic, receipt)
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
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

describe('isLowPoolError', () => {
  const LOW_POOL = NEERU_META_HARDCODED_FALLBACK.errorSelectors.INTEREST_POOL_LOW
  it('detects viem prod-style selector in error.cause.data', () => {
    const err = Object.assign(new Error('Execution reverted'), {
      cause: { data: '0x2648b779' },
    })
    expect(isLowPoolError(err, LOW_POOL)).toBe(true)
  })
  it('detects selector inside a longer hex blob (cause.details)', () => {
    const err = Object.assign(new Error('estimateGas failed'), {
      cause: { details: 'execution reverted: 0x2648b779000000000000' },
    })
    expect(isLowPoolError(err, LOW_POOL)).toBe(true)
  })
  it('returns false for unrelated errors', () => {
    expect(isLowPoolError(new Error('insufficient funds'), LOW_POOL)).toBe(false)
    expect(isLowPoolError('not an error', LOW_POOL)).toBe(false)
    expect(isLowPoolError(null, LOW_POOL)).toBe(false)
  })
})

describe('closeNeeruPositionSaga simulation-revert envelope consumer', () => {
  const WALLET = '0x' + 'a'.repeat(40)
  const POSITION_ID = '4242'
  const FALLBACK_TX = {
    to: '0x988af5977201a0e988f2c75ea952532f6beb5082',
    data: '0xa64f127e',
    value: '0',
    networkId: 'celo-mainnet',
  }

  it('routes LOW_POOL selector to the wallet-side action + stashes the pre-built fallback', async () => {
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [
          matchers.call.fn(triggerShortcutRequest),
          {
            transactions: [],
            dataProps: {
              simulationRevert: { selector: '0x2648b779', reason: 'INTEREST_POOL_LOW' },
              fallback: { shortcutId: 'withdraw-amount-only', transactions: [FALLBACK_TX] },
            },
          },
        ],
      ])
      .put(setEmergencyFallback({ positionId: POSITION_ID, transactions: [FALLBACK_TX] as any }))
      .put({ type: NEERU_LOW_POOL_ACTION, payload: { positionId: POSITION_ID } })
      .put(closePositionFailure({ positionId: POSITION_ID, error: NEERU_LOW_POOL_ERROR }))
      .run()
  })

  it('LOW_POOL without a pre-built fallback still dispatches the wallet-side action', async () => {
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [
          matchers.call.fn(triggerShortcutRequest),
          {
            transactions: [],
            dataProps: {
              simulationRevert: { selector: '0x2648b779', reason: 'INTEREST_POOL_LOW' },
            },
          },
        ],
      ])
      .put({ type: NEERU_LOW_POOL_ACTION, payload: { positionId: POSITION_ID } })
      .put(closePositionFailure({ positionId: POSITION_ID, error: NEERU_LOW_POOL_ERROR }))
      .run()
  })

  it('routes ALREADY_CLOSED selector to its dedicated failure tag', async () => {
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [
          matchers.call.fn(triggerShortcutRequest),
          {
            transactions: [],
            dataProps: {
              simulationRevert: { selector: '0x9acb7e52', reason: 'ALREADY_CLOSED' },
            },
          },
        ],
      ])
      .put(closePositionFailure({ positionId: POSITION_ID, error: NEERU_ALREADY_CLOSED_ERROR }))
      .run()
  })

  it('routes NOT_OWNER selector to its dedicated failure tag', async () => {
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [
          matchers.call.fn(triggerShortcutRequest),
          {
            transactions: [],
            dataProps: {
              simulationRevert: { selector: '0x30cd7471', reason: 'NOT_OWNER' },
            },
          },
        ],
      ])
      .put(closePositionFailure({ positionId: POSITION_ID, error: NEERU_NOT_OWNER_ERROR }))
      .run()
  })

  it('routes an unknown selector to the generic revert tag', async () => {
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [
          matchers.call.fn(triggerShortcutRequest),
          {
            transactions: [],
            dataProps: {
              simulationRevert: { selector: '0xdeadbeef', reason: 'UNKNOWN' },
            },
          },
        ],
      ])
      .put(closePositionFailure({ positionId: POSITION_ID, error: NEERU_UNKNOWN_REVERT_ERROR }))
      .run()
  })

  it('empty transactions with no dataProps at all is treated as unknown revert (defense against a stray empty response)', async () => {
    await expectSaga(closeNeeruPositionSaga, closePositionStart({ positionId: POSITION_ID }))
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        [matchers.call.fn(triggerShortcutRequest), { transactions: [] }],
      ])
      .put(closePositionFailure({ positionId: POSITION_ID, error: NEERU_UNKNOWN_REVERT_ERROR }))
      .run()
  })
})

describe('emergencyCloseNeeruPositionSaga pre-built fallback consumption', () => {
  const WALLET = '0x' + 'a'.repeat(40)
  const POSITION_ID = '4243'
  const STASHED_TX = {
    to: '0x988af5977201a0e988f2c75ea952532f6beb5082' as `0x${string}`,
    data: '0xa64f127e' as `0x${string}`,
    value: '0',
    networkId: 'celo-mainnet',
    from: WALLET as `0x${string}`,
    gas: '240000',
    estimatedGasUse: '130000',
  }

  it('skips the triggerShortcut round-trip when a pre-built fallback exists in state', async () => {
    const stateWithStash = {
      ...neeruInitialState,
      pendingEmergencyFallback: { [POSITION_ID]: [STASHED_TX] },
    }
    let triggerCalled = false
    await expectSaga(
      emergencyCloseNeeruPositionSaga,
      emergencyCloseStart({ positionId: POSITION_ID })
    )
      .withState({ neeru: stateWithStash })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        {
          call(effect, next) {
            if (effect.fn === triggerShortcutRequest) {
              triggerCalled = true
            }
            return next()
          },
        },
        [matchers.call.fn(prepareTransactions), { type: 'possible', transactions: [] }],
        [matchers.call.fn(sendPreparedTransactions), []],
      ])
      .put(clearEmergencyFallback({ positionId: POSITION_ID }))
      .put(closePositionSuccess({ positionId: POSITION_ID }))
      .run()
    expect(triggerCalled).toBe(false)
  })

  it('falls back to a fresh triggerShortcut when no pre-built fallback is stashed', async () => {
    let triggerCalled = false
    await expectSaga(
      emergencyCloseNeeruPositionSaga,
      emergencyCloseStart({ positionId: POSITION_ID })
    )
      .withState({ neeru: neeruInitialState })
      .provide([
        [matchers.select(walletAddressSelector), WALLET],
        [matchers.select(hooksApiUrlSelector), 'https://x.test/hooks-api'],
        [matchers.select(neeruMetaSelector), RESOLVED_META],
        [matchers.select.like({ selector: feeCurrenciesSelector }), []],
        {
          call(effect, next) {
            if (effect.fn === triggerShortcutRequest) {
              triggerCalled = true
              return { transactions: [STASHED_TX] }
            }
            return next()
          },
        },
        [matchers.call.fn(prepareTransactions), { type: 'possible', transactions: [] }],
        [matchers.call.fn(sendPreparedTransactions), []],
      ])
      .put(closePositionSuccess({ positionId: POSITION_ID }))
      .run()
    expect(triggerCalled).toBe(true)
  })
})
