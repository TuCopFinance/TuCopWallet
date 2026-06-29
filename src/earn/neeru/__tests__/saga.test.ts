import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { fetchNeeruPositions } from 'src/earn/neeru/api'
import {
  NEERU_LOW_POOL_ACTION,
  closeNeeruPositionSaga,
  fetchNeeruPositionsSaga,
} from 'src/earn/neeru/saga'
import {
  closePositionFailure,
  closePositionStart,
  closePositionSuccess,
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
} from 'src/earn/neeru/slice'
import { triggerShortcutRequest } from 'src/positions/saga'
import { hooksApiUrlSelector } from 'src/positions/selectors'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { prepareTransactions } from 'src/viem/prepareTransactions'
import { sendPreparedTransactions } from 'src/viem/saga'
import { walletAddressSelector } from 'src/web3/selectors'

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
