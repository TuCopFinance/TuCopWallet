import { SiweClient } from '@fiatconnect/fiatconnect-sdk'
import { getWalletAddressFromPrivateKey } from 'src/keylessBackup/encryption'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'
import { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const TAG = 'keylessBackup/index'
const SIWE_STATEMENT = 'Sign in with Ethereum'
const SIWE_VERSION = '1'
const SESSION_DURATION_MS = 5 * 60 * 1000 // 5 mins

export async function storeEncryptedMnemonic({
  encryptedMnemonic,
  encryptionAddress,
  jwt,
  walletAddress,
  phone,
}: {
  encryptedMnemonic: string
  encryptionAddress: string
  jwt: string
  walletAddress: string
  phone: string
}) {
  Logger.debug(TAG, `Storing encrypted mnemonic for address: ${encryptionAddress}`)
  Logger.debug(TAG, `JWT length: ${jwt?.length || 0}`)

  // Asegurarse de que el JWT existe
  if (!jwt) {
    Logger.error(TAG, 'No JWT provided for storing encrypted mnemonic')
    throw new Error('No JWT provided for storing encrypted mnemonic')
  }

  const response = await fetchWithTimeout(networkConfig.cabStoreEncryptedMnemonicUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': jwt,
      walletAddress: walletAddress,
    },
    body: JSON.stringify({
      encryptedMnemonic,
      encryptionAddress,
      token: jwt,
      phone,
    }),
  })

  if (!response.ok) {
    const statusCode = response.status
    let errorMessage = 'Unknown error'

    try {
      const errorData = await response.json()
      errorMessage = errorData?.message || 'No error message provided'
      Logger.error(TAG, `Server error response: ${JSON.stringify(errorData)}`)
    } catch (e) {
      Logger.error(TAG, 'Failed to parse error response', e)
    }

    throw new Error(
      `Failed to post encrypted mnemonic with status ${statusCode}, message ${errorMessage}`
    )
  }
}

function getSIWEClient(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey)
  const accountAddress = getWalletAddressFromPrivateKey(privateKey)

  return new SiweClient(
    {
      accountAddress,
      statement: SIWE_STATEMENT,
      version: SIWE_VERSION,
      chainId: parseInt(networkConfig.networkId),
      sessionDurationMs: SESSION_DURATION_MS,
      loginUrl: networkConfig.cabLoginUrl,
      clockUrl: networkConfig.cabClockUrl,
      timeout: 60 * 1000,
    },
    (message) => account.signMessage({ message })
  )
}

export async function getEncryptedMnemonic({
  encryptionPrivateKey,
  jwt,
  phone,
}: {
  encryptionPrivateKey: Hex
  jwt: string
  phone: string
}) {
  const siweClient = getSIWEClient(encryptionPrivateKey)
  await siweClient.login()
  const response = await siweClient.fetch(networkConfig.cabGetEncryptedMnemonicUrl, {
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': jwt,
      'X-Phone': phone,
    },
  })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    const message = (await response.json())?.message
    throw new Error(
      `Failed to get encrypted mnemonic with status ${response.status}, message ${message}`
    )
  }
  const { encryptedMnemonic } = (await response.json()) as { encryptedMnemonic: string }
  return encryptedMnemonic
}

export async function deleteEncryptedMnemonic(encryptionPrivateKey: Hex) {
  const siweClient = getSIWEClient(encryptionPrivateKey)
  await siweClient.login()
  const response = await siweClient.fetch(networkConfig.cabDeleteEncryptedMnemonicUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${networkConfig.cabApiKey}`,
    },
  })
  if (!response.ok) {
    const message = (await response.json())?.message
    throw new Error(
      `Failed to delete encrypted mnemonic with status ${response.status}, message ${message}`
    )
  }
}
