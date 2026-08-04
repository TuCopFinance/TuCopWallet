export function* recipientsSaga() {
  // Firebase-backed sender lists (rewards, invite rewards, Coinbase Pay) were
  // removed with the Firebase teardown. Reducers still hold empty arrays.
}
