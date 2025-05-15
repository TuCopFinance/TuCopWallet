/**
 * Re-exporta el SDK oficial de Divvi para mantener la separación de responsabilidades en la arquitectura
 *
 * El SDK oficial maneja:
 * - Generación de sufijo de datos para transacciones (getDataSuffix)
 * - Envío de información de referidos a la API de Divvi (submitReferral)
 */
import { getDataSuffix, submitReferral } from '@divvi/referral-sdk'
import Logger from 'src/utils/Logger'
import { Address } from 'viem'

export { getDataSuffix, submitReferral }

const TAG = 'divviProtocol/registerReferral'

/**
 * Agrega el sufijo de datos de Divvi a un calldata existente
 *
 * @param calldata El calldata original de la transacción
 * @param dataSuffix El sufijo de datos generado por Divvi
 * @returns El calldata con el sufijo anexado
 */
export function appendDivviCalldata(
  calldata: string | undefined,
  dataSuffix: string | undefined
): string | undefined {
  try {
    // Si alguno de los parámetros es undefined, retornamos el calldata original
    if (!dataSuffix) {
      Logger.debug(TAG, 'No hay sufijo de datos para anexar')
      return calldata
    }

    if (!calldata) {
      Logger.debug(TAG, 'El calldata es undefined, usando solo el sufijo de datos')
      return dataSuffix
    }

    // Validamos que el calldata sea una cadena hexadecimal
    if (!/^0x([0-9a-fA-F]{2})*$/.test(calldata)) {
      Logger.warn(TAG, 'Calldata inválido, formato no hexadecimal', { calldata })
      return calldata
    }

    Logger.debug(TAG, 'Anexando sufijo de datos Divvi al calldata', {
      originalLength: calldata.length,
      suffixLength: dataSuffix.length,
      calldata: calldata.substring(0, 10) + '...',
      dataSuffix: dataSuffix.substring(0, 10) + '...',
    })

    // Simplemente añadir el sufijo al calldata sin intentar modificarlo
    // La SDK de Divvi ya proporciona el sufijo en el formato correcto
    const result = calldata + dataSuffix

    Logger.debug(TAG, 'Calldata con sufijo anexado', {
      finalLength: result.length,
      lengthDifference: result.length - calldata.length,
      result: result.substring(0, 10) + '...' + result.substring(result.length - 10),
    })

    return result
  } catch (error) {
    Logger.error(TAG, 'Error al anexar sufijo de datos Divvi', error)
    return calldata
  }
}

/**
 * Re-exportamos las funciones del SDK oficial de Divvi para facilitar su uso
 * y permitir mocks en pruebas
 */

/**
 * Genera el sufijo de datos para una transacción de Divvi
 */
export function generateDataSuffix(config: { consumer: Address; providers: Address[] }): string {
  try {
    Logger.debug(TAG, 'Generando sufijo de datos con SDK de Divvi', {
      consumer: config.consumer,
      providersCount: config.providers.length,
    })

    const result = getDataSuffix(config)

    Logger.debug(TAG, 'Sufijo de datos generado', {
      length: result.length,
    })

    return result
  } catch (error) {
    Logger.error(TAG, 'Error al generar sufijo de datos', error)
    throw error
  }
}
