import { initializeAccountSaga } from 'src/account/saga'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { KeylessBackupEvents } from 'src/analytics/Events'
import { generateKeysFromMnemonic, getStoredMnemonic, storeMnemonic } from 'src/backup/utils'
import { walletHasBalance } from 'src/import/saga'
import {
  decryptPassphrase,
  encryptPassphrase,
  getSecp256K1KeyPair,
  getWalletAddressFromPrivateKey,
} from 'src/keylessBackup/encryption'
import {
  deleteEncryptedMnemonic,
  getEncryptedMnemonic,
  storeEncryptedMnemonic,
} from 'src/keylessBackup/index'
import { getSECP256k1PrivateKey, storeSECP256k1PrivateKey } from 'src/keylessBackup/keychain'
import { torusKeyshareSelector } from 'src/keylessBackup/selectors'
import {
  appKeyshareIssued,
  auth0SignInCompleted,
  deleteKeylessBackupCompleted,
  deleteKeylessBackupFailed,
  deleteKeylessBackupStarted,
  keylessBackupAcceptZeroBalance,
  keylessBackupBail,
  keylessBackupCompleted,
  keylessBackupFailed,
  keylessBackupNotFound,
  keylessBackupShowZeroBalance,
  torusKeyshareIssued,
} from 'src/keylessBackup/slice'
import { KeylessBackupFlow } from 'src/keylessBackup/types'
import { getTorusPrivateKey } from 'src/keylessBackup/web3auth'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import Logger from 'src/utils/Logger'
import { privateKeyToAddress } from 'src/utils/address'
import { calculateSha256Hash } from 'src/utils/random'
import networkConfig from 'src/web3/networkConfig'
import { assignAccountFromPrivateKey } from 'src/web3/saga'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, delay, put, race, select, spawn, take, takeLeading } from 'typed-redux-saga'
import { type Hex } from 'viem'

const TAG = 'keylessBackup/saga'

export const DELAY_INTERVAL_MS = 500 // how long to wait between checks for keyshares
export const WAIT_FOR_KEYSHARE_TIMEOUT_MS = 25 * 1000 // how long to wait for keyshares before failing

export function* handleAppKeyshareIssued({
  payload: { keylessBackupFlow, origin, keyshare, jwt, walletAddress, phone },
}: ReturnType<typeof appKeyshareIssued>) {
  try {
    const torusKeyshare = yield* waitForTorusKeyshare()
    const hashedKeyshare = calculateSha256Hash(`CAB_PHONE_KEYSHARE_HASH_${keyshare}`)
    const hashedTorusKeyshare = calculateSha256Hash(`CAB_EMAIL_KEYSHARE_HASH_${torusKeyshare}`)
    if (keylessBackupFlow === KeylessBackupFlow.Restore) {
      Logger.info(TAG, `Phone keyshare: ${hashedKeyshare}, Email keyshare: ${hashedTorusKeyshare}`)
    }

    Logger.info(TAG, `torusKeyshare: ${torusKeyshare}`)

    // Función auxiliar para crear buffers de manera segura
    const createSafeBuffer = (value: any, name: string): Buffer => {
      if (!value) {
        throw new Error(`El valor de ${name} es undefined o null`)
      }
      try {
        return Buffer.from(value, 'hex')
      } catch (error: any) {
        Logger.error(TAG, `Error al crear buffer para ${name}`, error)
        throw new Error(`No se pudo crear buffer para ${name}: ${error.message}`)
      }
    }

    const torusKeyshareBuffer = createSafeBuffer(torusKeyshare, 'torusKeyshare')
    const appKeyshareBuffer = createSafeBuffer(keyshare, 'keyshare')

    const { privateKey: encryptionPrivateKey } = yield* call(
      getSecp256K1KeyPair,
      torusKeyshareBuffer,
      appKeyshareBuffer
    )

    const encryptionAddress = getWalletAddressFromPrivateKey(encryptionPrivateKey)
    if (keylessBackupFlow === KeylessBackupFlow.Setup) {
      yield* handleKeylessBackupSetup({
        torusKeyshareBuffer,
        appKeyshareBuffer,
        encryptionAddress,
        encryptionPrivateKey,
        jwt,
        walletAddress,
        phone,
      })
    } else {
      yield* handleKeylessBackupRestore({
        torusKeyshareBuffer,
        appKeyshareBuffer,
        encryptionPrivateKey,
        jwt,
        phone,
      })
    }
  } catch (error) {
    Logger.error(TAG, `Error handling keyless backup ${keylessBackupFlow}`, error)
    AppAnalytics.track(KeylessBackupEvents.cab_handle_keyless_backup_failed, {
      keylessBackupFlow,
      origin,
    })
    yield* put(keylessBackupFailed())
    return
  }
}

function* handleKeylessBackupSetup({
  torusKeyshareBuffer,
  appKeyshareBuffer,
  encryptionAddress,
  encryptionPrivateKey,
  jwt,
  walletAddress,
  phone,
}: {
  torusKeyshareBuffer: Buffer
  appKeyshareBuffer: Buffer
  encryptionAddress: string
  encryptionPrivateKey: Hex
  jwt: string
  walletAddress: string
  phone: string
}) {
  try {
    Logger.debug(TAG, `Starting keyless backup setup with JWT length: ${jwt?.length || 0}`)

    const mnemonic = yield* call(getStoredMnemonic, walletAddress)
    if (!mnemonic) {
      throw new Error('No mnemonic found')
    }

    const encryptedMnemonic = yield* call(
      encryptPassphrase,
      torusKeyshareBuffer,
      appKeyshareBuffer,
      mnemonic
    )

    // Registrar información antes de almacenar
    Logger.debug(TAG, `Storing encrypted mnemonic for address: ${encryptionAddress}`)

    yield* call(storeEncryptedMnemonic, {
      encryptedMnemonic,
      encryptionAddress,
      jwt,
      walletAddress: walletAddress as string,
      phone: phone as string,
    })

    yield* call(storeSECP256k1PrivateKey, encryptionPrivateKey, walletAddress)

    yield* put(keylessBackupCompleted())
  } catch (error) {
    Logger.error(TAG, 'Error in handleKeylessBackupSetup', error)
    yield* put(keylessBackupFailed())
  }
}

function* handleKeylessBackupRestore({
  torusKeyshareBuffer,
  appKeyshareBuffer,
  encryptionPrivateKey,
  jwt,
  phone,
}: {
  torusKeyshareBuffer: Buffer
  appKeyshareBuffer: Buffer
  encryptionPrivateKey: Hex
  jwt: string
  phone: string
}) {
  const encryptedMnemonic = yield* call(getEncryptedMnemonic, {
    encryptionPrivateKey: encryptionPrivateKey as Hex,
    jwt: jwt as string,
    phone: phone as string,
  })

  Logger.debug(TAG, `Encrypted mnemonic in handleKey: ${encryptedMnemonic}`)

  if (!encryptedMnemonic) {
    AppAnalytics.track(KeylessBackupEvents.cab_restore_mnemonic_not_found)
    yield* put(keylessBackupNotFound())
    return
  }

  const decryptedMnemonic = yield* call(
    decryptPassphrase,
    torusKeyshareBuffer,
    appKeyshareBuffer,
    encryptedMnemonic
  )

  const { privateKey } = yield* call(generateKeysFromMnemonic, decryptedMnemonic)
  if (!privateKey) {
    throw new Error('Failed to convert mnemonic to hex')
  }
  const backupAccount = privateKeyToAddress(privateKey)
  if (!(yield* call(walletHasBalance, backupAccount))) {
    // show zero balance modal
    yield* put(keylessBackupShowZeroBalance())

    // wait for user to click continue or bail from keyless backup
    const [_continueAction, bailAction] = yield* race([
      take(keylessBackupAcceptZeroBalance.type),
      take(keylessBackupBail.type),
    ])
    if (bailAction) {
      navigate(Screens.ImportSelect)
      return
    }
  }

  const account: string | null = yield* call(
    assignAccountFromPrivateKey,
    privateKey,
    decryptedMnemonic
  )
  if (!account) {
    throw new Error('Failed to assign account from private key')
  }

  yield* call(storeSECP256k1PrivateKey, encryptionPrivateKey, account)

  // Set key in phone's secure store
  yield* call(storeMnemonic, decryptedMnemonic, account)

  yield* call(initializeAccountSaga)

  yield* put(keylessBackupCompleted())
}

export function* waitForTorusKeyshare() {
  const startTime = Date.now()
  let torusKeyshare: string | null = yield* select(torusKeyshareSelector)
  while (!torusKeyshare && Date.now() - startTime < WAIT_FOR_KEYSHARE_TIMEOUT_MS) {
    yield* delay(DELAY_INTERVAL_MS)
    torusKeyshare = yield* select(torusKeyshareSelector)
  }
  if (!torusKeyshare) {
    AppAnalytics.track(KeylessBackupEvents.cab_torus_keyshare_timeout)
    throw new Error(`Timed out waiting for torus keyshare.`)
  }
  return torusKeyshare
}

export function* handleAuth0SignInCompleted({
  payload: { idToken: jwt },
}: ReturnType<typeof auth0SignInCompleted>) {
  // Note: this is done async while the user verifies their phone number.
  try {
    const torusPrivateKey = yield* call(getTorusPrivateKey, {
      verifier: networkConfig.web3AuthVerifier,
      jwt,
    })
    yield* put(torusKeyshareIssued({ keyshare: torusPrivateKey }))
  } catch (error) {
    Logger.error(TAG, 'Error getting Torus private key from auth0 jwt', error)
    AppAnalytics.track(KeylessBackupEvents.cab_get_torus_keyshare_failed)
    yield* put(keylessBackupFailed()) // this just updates state for now. when the user reaches the
    // KeylessBackupProgress screen (after phone verification), they will see the failure UI
  }
}

export function* handleDeleteKeylessBackup() {
  try {
    const account = yield* select(walletAddressSelector)
    const secp256k1PrivateKey = yield* call(getSECP256k1PrivateKey, account)
    yield* call(deleteEncryptedMnemonic, secp256k1PrivateKey)
    yield* put(deleteKeylessBackupCompleted())
  } catch (error) {
    Logger.error(TAG, 'Error deleting keyless backup', error)
    yield* put(deleteKeylessBackupFailed())
  }
}

function* watchGoogleSignInCompleted() {
  yield* takeLeading(auth0SignInCompleted.type, handleAuth0SignInCompleted)
}

function* watchAppKeyshareIssued() {
  yield* takeLeading(appKeyshareIssued.type, handleAppKeyshareIssued)
}

function* watchDeleteKeylessBackupStarted() {
  yield* takeLeading(deleteKeylessBackupStarted.type, handleDeleteKeylessBackup)
}

export function* keylessBackupSaga() {
  yield* spawn(watchGoogleSignInCompleted)
  yield* spawn(watchAppKeyshareIssued)
  yield* spawn(watchDeleteKeylessBackupStarted)
}
