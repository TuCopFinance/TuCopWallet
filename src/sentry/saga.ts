import { spawn, takeEvery } from 'typed-redux-saga'
import { initializeSentryUserContext } from 'src/sentry/Sentry'
import { Actions as Web3Actions } from 'src/web3/actions'

// Wires Sentry.setUser({id: opaqueAccountId(account)}) so every event ships
// with a stable user_id. Without this saga the dashboard cannot group events
// per wallet and tag-based panels (gold_price_source, squid_integrator_fee,
// neeru_meta_source) surface as anonymous.
//
// Runs once on boot for the already-imported-wallet case (the selector inside
// initializeSentryUserContext is a no-op when no account exists yet) and then
// on every SET_ACCOUNT so mid-session import/create also lands the id
// without an app restart.
export function* sentrySaga() {
  yield* spawn(initializeSentryUserContext)
  yield* takeEvery(Web3Actions.SET_ACCOUNT, initializeSentryUserContext)
}
