import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { fetchNeeruPositions } from 'src/earn/neeru/api'
import { fetchNeeruPositionsSaga } from 'src/earn/neeru/saga'
import {
  fetchPositionsFailure,
  fetchPositionsStart,
  fetchPositionsSuccess,
} from 'src/earn/neeru/slice'
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
      .catch(() => {})
    expect(dispatchedSuccess).toBe(false)
  })
})
