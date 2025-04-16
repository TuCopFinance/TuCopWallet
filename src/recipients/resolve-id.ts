import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'

const TAG = 'recipient/resolve-id'

export async function resolveId(id: string) {
  if (id === '') {
    return null
  }
  const resolveIdUrl = networkConfig.resolvePhoneNumberUrl
  try {
    Logger.debug(TAG, `Resolving '${id}'`)
    Logger.debug(TAG, `resolveIdUrl '${resolveIdUrl}'`)

    const response = await fetch(`${resolveIdUrl}/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'x-api-key': 'tu-cop-intechchain-1234567890',
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      const responseJson = await response.json()
      return [responseJson.results]
    }

    Logger.warn(TAG, `Unexpected result from resolving '${id}'`)
  } catch (error) {
    Logger.warn(TAG, `Error resolving '${id}'`, error)
  }
  return null
}
