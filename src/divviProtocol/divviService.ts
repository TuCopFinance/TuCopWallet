import { getReferralTag } from '@divvi/referral-sdk'
import { getDivviConfig } from 'src/divviProtocol/selectors'
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address } from 'viem'

const TAG = 'divviProtocol/divviService'

/**
 * Obtiene el sufijo de datos para incluir en transacciones según el protocolo Divvi v2
 * @returns El sufijo de datos o undefined si no hay configuración
 */
export async function fetchDivviCalldata(state: any): Promise<string | undefined> {
  try {
    Logger.debug(TAG, 'Iniciando obtención de sufijo de datos Divvi v2')

    // Obtener la configuración de Divvi desde el estado
    const divviConfig = getDivviConfig(state)

    // Obtener la dirección del usuario desde el estado (requerido en v2)
    const userAddress = walletAddressSelector(state)

    if (!divviConfig) {
      Logger.debug(TAG, 'No hay configuración de Divvi disponible')
      return undefined
    }

    if (!userAddress) {
      Logger.debug(TAG, 'No hay dirección de usuario disponible')
      return undefined
    }

    Logger.info(TAG, 'Configuración de Divvi encontrada', {
      consumer: divviConfig.consumer,
      providersCount: divviConfig.providers?.length || 0,
      divviId: divviConfig.divviId,
      userAddress: userAddress.substring(0, 8) + '...',
    })

    if (!divviConfig.consumer) {
      Logger.warn(TAG, 'Configuración de Divvi incompleta, se requiere consumer')
      return undefined
    }

    // Obtener el sufijo de datos usando el SDK de Divvi v2
    const dataSuffix = getReferralTag({
      user: userAddress as Address,
      consumer: divviConfig.consumer as Address,
    })

    Logger.debug(TAG, 'Sufijo de datos Divvi v2 generado correctamente', {
      dataLength: dataSuffix.length,
      sample: dataSuffix.substring(0, 10) + '...',
    })

    return dataSuffix
  } catch (error) {
    Logger.error(TAG, 'Error al obtener el sufijo de datos Divvi v2', error)
    return undefined
  }
}
