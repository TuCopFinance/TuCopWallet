import { useAsync } from 'react-async-hook'
import { showError } from 'src/alert/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { OnboardingEvents } from 'src/analytics/Events'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { getPassword } from 'src/pincode/authentication'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { removeStoredItem, retrieveStoredItem, storeItem } from 'src/storage/keychain'
import Logger from 'src/utils/Logger'
import { CELO_DERIVATION_PATH_BASE, generateKeys } from 'src/utils/account'
import { aesDecrypt, aesEncrypt } from 'src/utils/aes'
import { ETHEREUM_DERIVATION_PATH } from 'src/web3/consts'
import { currentAccountSelector } from 'src/web3/selectors'

const TAG = 'Backup/utils'

const MNEMONIC_STORAGE_KEY = 'mnemonic'

export async function generateKeysFromMnemonic(mnemonic: string) {
  const wordCount = countMnemonicWords(mnemonic)
  const derivationPath = wordCount === 24 ? CELO_DERIVATION_PATH_BASE : ETHEREUM_DERIVATION_PATH
  return generateKeys(mnemonic, undefined, undefined, undefined, derivationPath)
}

export async function storeMnemonic(mnemonic: string, account: string | null, password?: string) {
  if (!account) {
    throw new Error('Account not yet initialized')
  }
  const passwordToUse = password ?? (await getPassword(account))
  const encryptedMnemonic = await encryptMnemonic(mnemonic, passwordToUse)
  Logger.debug(TAG, 'Storing mnemonic', encryptedMnemonic)

  return storeItem({ key: MNEMONIC_STORAGE_KEY, value: encryptedMnemonic })
}

export async function clearStoredMnemonic() {
  await removeStoredItem(MNEMONIC_STORAGE_KEY)
}

export async function getStoredMnemonic(
  account: string | null,
  password?: string
): Promise<string | null> {
  try {
    if (!account) {
      throw new Error('Account not yet initialized')
    }

    Logger.debug(TAG, 'Checking keystore for mnemonic')
    const encryptedMnemonic = await retrieveStoredItem(MNEMONIC_STORAGE_KEY)
    if (!encryptedMnemonic) {
      throw new Error('No mnemonic found in storage')
    }

    const passwordToUse = password ?? (await getPassword(account))
    Logger.debug(TAG, 'passwordToUse', passwordToUse)
    Logger.debug(TAG, 'passwordToUse>account', account)
    Logger.debug(TAG, 'encryptedMnemonic', encryptedMnemonic)
    return decryptMnemonic(encryptedMnemonic, passwordToUse)
  } catch (error) {
    Logger.error(TAG, 'Failed to retrieve mnemonic', error)
    return null
  }
}

export function onGetMnemonicFail(viewError: (error: ErrorMessages) => void, context?: string) {
  viewError(ErrorMessages.FAILED_FETCH_MNEMONIC)
  AppAnalytics.track(OnboardingEvents.backup_error, {
    error: 'Failed to retrieve Recovery Phrase',
    context,
  })
}

export function useAccountKey(): string | null {
  const dispatch = useDispatch()
  const account = useSelector(currentAccountSelector)
  const asyncAccountKey = useAsync(getStoredMnemonic, [account])

  if (!asyncAccountKey || asyncAccountKey.error) {
    onGetMnemonicFail((error) => dispatch(showError(error)), 'useAccountKey')
  }

  return asyncAccountKey.result || null
}

export function countMnemonicWords(phrase: string): number {
  return [...phrase.trim().split(/\s+/)].length
}

// Because of a RN bug, we can't fully clean the text as the user types
// https://github.com/facebook/react-native/issues/11068
export function formatBackupPhraseOnEdit(phrase: string) {
  return phrase.replace(/\s+/gm, ' ')
}

export function isValidBackupPhrase(phrase: string) {
  const allowedPhraseLengths = [12, 24]
  const phraseLength = countMnemonicWords(formatBackupPhraseOnEdit(phrase))
  return !!phrase && allowedPhraseLengths.includes(phraseLength)
}

export async function encryptMnemonic(phrase: string, password: string) {
  return aesEncrypt(phrase, password)
}

export async function decryptMnemonic(encryptedMnemonic: string, password: string) {
  return aesDecrypt(encryptedMnemonic, password)
}
