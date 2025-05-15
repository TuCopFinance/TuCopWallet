/**
 * Re-exporta el SDK oficial de Divvi para mantener la separación de responsabilidades en la arquitectura
 *
 * El SDK oficial maneja:
 * - Generación de sufijo de datos para transacciones (getDataSuffix)
 * - Envío de información de referidos a la API de Divvi (submitReferral)
 */
import { getDataSuffix, submitReferral } from '@divvi/referral-sdk'
import Logger from 'src/utils/Logger'

export { getDataSuffix, submitReferral }

const TAG = 'divviProtocol/registerReferral'

/**
 * Agrega el calldata de Divvi a una transacción si está configurado
 *
 * @param txData Datos actuales de la transacción
 * @param divviSuffix Sufijo de datos de Divvi
 * @returns Datos de transacción con calldata agregado, siempre con prefijo '0x'
 */
export function appendDivviCalldata(txData: string, divviSuffix: string | null): string {
  if (!divviSuffix) {
    // Si no hay divviSuffix, aseguramos que txData tenga el prefijo '0x'
    return txData.startsWith('0x') ? txData : `0x${txData}`
  }

  // Si no hay datos en la tx original, simplemente devolvemos el divviSuffix
  if (!txData || txData === '0x' || txData === '0x0') {
    // Aseguramos que divviSuffix tiene el prefijo '0x'
    return divviSuffix.startsWith('0x') ? divviSuffix : `0x${divviSuffix}`
  }

  // Si ambos tienen datos, necesitamos combinarlos
  try {
    // Eliminar el prefijo 0x
    const txDataWithoutPrefix = txData.startsWith('0x') ? txData.slice(2) : txData
    const divviSuffixWithoutPrefix = divviSuffix.startsWith('0x')
      ? divviSuffix.slice(2)
      : divviSuffix

    // Combinamos los datos, siempre con prefijo '0x'
    return `0x${txDataWithoutPrefix}${divviSuffixWithoutPrefix}`
  } catch (error) {
    Logger.error(TAG, 'Error al combinar calldata', error)
    // En caso de error, aseguramos que txData tenga el prefijo '0x'
    return txData.startsWith('0x') ? txData : `0x${txData}`
  }
}
