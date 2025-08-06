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
  Logger.debug(TAG, `Phone: ${phone}`)
  Logger.debug(TAG, `Wallet Address: ${walletAddress}`)

  // Ensure JWT exists
  if (!jwt) {
    Logger.error(TAG, 'No JWT provided for storing encrypted mnemonic')
    throw new Error('No JWT provided for storing encrypted mnemonic')
  }

  // Ensure phone exists
  if (!phone) {
    Logger.error(TAG, 'No phone number provided for storing encrypted mnemonic')
    throw new Error('No phone number provided for storing encrypted mnemonic')
  }

  const response = await fetchWithTimeout(networkConfig.cabStoreEncryptedMnemonicUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': jwt,
      'X-Phone': phone,
      walletAddress: walletAddress,
    },
    body: JSON.stringify({
      encryptedMnemonic,
      encryptionAddress,
      token: jwt,
      phone,
      walletAddress,
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

  Logger.debug(TAG, 'Successfully stored encrypted mnemonic')
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
  try {
    // First try with SIWE authentication (new method)
    const siweClient = getSIWEClient(encryptionPrivateKey)
    await siweClient.login()
    const response = await siweClient.fetch(networkConfig.cabGetEncryptedMnemonicUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': jwt,
        'X-Phone': phone,
      },
    })

    Logger.debug(TAG, `SIWE Response - Phone: ${phone}, Status: ${response.status}`)

    if (response.ok) {
      const responseData = await response.json()
      Logger.debug(TAG, `Response data: ${JSON.stringify(responseData)}`)

      if (!responseData.encryptedMnemonic) {
        throw new Error('Response missing encrypted mnemonic')
      }

      return responseData.encryptedMnemonic
    }

    // If SIWE method returns 404, try the legacy method
    if (response.status === 404) {
      Logger.debug(TAG, 'SIWE method returned 404, trying legacy method')
    }
  } catch (siweError) {
    Logger.warn(TAG, 'SIWE authentication failed, trying legacy method', siweError)
  }

  // Fallback to legacy method (matching the storage method)
  try {
    const accountAddress = getWalletAddressFromPrivateKey(encryptionPrivateKey)
    const legacyResponse = await fetchWithTimeout(networkConfig.cabGetEncryptedMnemonicUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': jwt,
        walletAddress: accountAddress,
      },
    })

    Logger.debug(TAG, `Legacy Response - Phone: ${phone}, Status: ${legacyResponse.status}`)

    // Check for 404 before trying to parse JSON
    if (legacyResponse.status === 404) {
      return null
    }

    // Check for other errors before trying to parse JSON
    if (!legacyResponse.ok) {
      let message = 'Unknown error'
      try {
        const errorData = await legacyResponse.json()
        message = errorData?.message || message
      } catch (e) {
        Logger.error(TAG, 'Failed to parse error response', e)
      }

      throw new Error(
        `Failed to get encrypted mnemonic with status ${legacyResponse.status}, message ${message}`
      )
    }

    // Parse the response JSON
    const responseData = await legacyResponse.json()
    Logger.debug(TAG, `Legacy response data: ${JSON.stringify(responseData)}`)

    if (!responseData.encryptedMnemonic) {
      throw new Error('Response missing encrypted mnemonic')
    }

    return responseData.encryptedMnemonic
  } catch (legacyError) {
    Logger.error(TAG, 'Both SIWE and legacy methods failed', legacyError)
    throw legacyError
  }
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
