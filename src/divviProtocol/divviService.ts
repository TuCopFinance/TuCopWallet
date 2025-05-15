import { getDataSuffix } from '@divvi/referral-sdk'
import { getDivviConfig } from 'src/divviProtocol/selectors'
import { store } from 'src/redux/store'
import Logger from 'src/utils/Logger'

const TAG = 'divviProtocol/divviService'

// Aseguramos que las direcciones tengan el formato correcto para el SDK
const formatAddress = (address: string): `0x${string}` => {
  if (!address.startsWith('0x')) {
    return `0x${address}` as `0x${string}`
  }
  return address as `0x${string}`
}

/**
 * Obtiene el sufijo de datos para las transacciones de Divvi
 *
 * @returns El sufijo de datos o null si hay algún error o no está configurado
 */
export const fetchDivviCalldata = async (): Promise<string | null> => {
  try {
    // Obtenemos el estado actual para conseguir la configuración
    const state = store.getState()
    const divviConfig = getDivviConfig(state)

    if (!divviConfig?.consumer || !divviConfig?.providers || !divviConfig.providers.length) {
      Logger.warn(TAG, 'Configuración de Divvi incompleta, se requiere consumer y providers')
      return null
    }

    // Formateamos las direcciones al formato requerido por el SDK
    const consumer = formatAddress(divviConfig.consumer)
    const providers = divviConfig.providers.map(formatAddress)

    // Generamos el sufijo de datos usando el SDK oficial
    return getDataSuffix({
      consumer,
      providers,
    })
  } catch (error) {
    Logger.error(TAG, 'Error al generar sufijo de datos para Divvi', error)
    return null
  }
}
