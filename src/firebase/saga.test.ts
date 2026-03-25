import { expectSaga } from 'redux-saga-test-plan'
import { call } from 'redux-saga/effects'
import { initializeFirebase } from 'src/firebase/saga'
import { getAccount } from 'src/web3/saga'

jest.mock('@react-native-firebase/app', () => ({
  app: () => ({ options: { databaseURL: 'https://test-firebase.example.com' } }),
}))
jest.mock('src/firebase/firebase')

describe('firebase saga', () => {
  it('initializeFirebase', async () => {
    // FIREBASE_ENABLED is false in config, so the saga calls getAccount
    // then returns early without initializing Firebase services
    const testAddress = '0x123'
    await expectSaga(initializeFirebase)
      .provide([[call(getAccount), testAddress]])
      .not.put({ type: 'FIREBASE/AUTHORIZED' })
      .run()
  })
})
