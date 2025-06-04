import { getDataSuffix } from '@divvi/referral-sdk'
import { getDivviConfig } from 'src/divviProtocol/selectors'
import Logger from 'src/utils/Logger'
import { Address } from 'viem'

const TAG = 'divviProtocol/divviService'

/**
 * Obtiene el sufijo de datos para incluir en transacciones según el protocolo Divvi
 * @returns El sufijo de datos o undefined si no hay configuración
 */
export async function fetchDivviCalldata(state: any): Promise<string | undefined> {
  try {
    Logger.debug(TAG, 'Iniciando obtención de sufijo de datos Divvi')

    // Obtener la configuración de Divvi desde el estado
    const divviConfig = getDivviConfig(state)

    if (!divviConfig) {
      Logger.debug(TAG, 'No hay configuración de Divvi disponible')
      return undefined
    }

    Logger.info(TAG, 'Configuración de Divvi encontrada', {
      consumer: divviConfig.consumer,
      providersCount: divviConfig.providers?.length || 0,
      divviId: divviConfig.divviId,
    })

    if (!divviConfig.consumer || !divviConfig.providers || !divviConfig.providers.length) {
      Logger.warn(TAG, 'Configuración de Divvi incompleta, se requiere consumer y providers')
      return undefined
    }

    // Obtener el sufijo de datos usando el SDK de Divvi
    const dataSuffix = getDataSuffix({
      consumer: divviConfig.consumer as Address,
      providers: divviConfig.providers as Address[],
    })

    Logger.debug(TAG, 'Sufijo de datos Divvi generado correctamente', {
      dataLength: dataSuffix.length,
      sample: dataSuffix.substring(0, 10) + '...',
    })

    return dataSuffix
  } catch (error) {
    Logger.error(TAG, 'Error al obtener el sufijo de datos Divvi', error)
    return undefined
  }
}
