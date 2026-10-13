import { revokePartySession } from 'src/bridgeramp/platformClient'
import { bridgeRampSessionSelector } from 'src/bridgeramp/selectors'
import { sessionCleared } from 'src/bridgeramp/slice'
import Logger from 'src/utils/Logger'
import { call, put, select } from 'typed-redux-saga'

const TAG = 'bridgeramp/revokeSession'

// Sign-out for TuCOPRamp: revoke the party session before the wallet that
// opened it goes away. Best effort; an unrevoked session still dies within the
// hour. Runs on ACCOUNT/CLEAR_STORED_ACCOUNT, next to the account removal
// (bridgeRampSaga); account/saga.ts does not import the ramp to avoid a cycle.
export function* revokeBridgeRampSessionSaga() {
  const session = yield* select(bridgeRampSessionSelector)
  if (!session) return
  yield* put(sessionCleared())
  try {
    yield* call(revokePartySession, session.token)
  } catch (err) {
    Logger.warn(TAG, 'Could not revoke the TuCOPRamp party session', err)
  }
}
