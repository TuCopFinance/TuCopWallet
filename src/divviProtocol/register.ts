import { getReferralTag } from '@divvi/referral-sdk'
import { getDivviConfig, hasReferralSucceeded } from 'src/divviProtocol/selectors'
import { selectReferrals } from 'src/divviProtocol/slice'
import { store } from 'src/redux/store'
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address } from 'viem'

const TAG = 'divviProtocol/register'

/**
 * Verifica si un usuario está referido a cada proveedor y devuelve un sufijo de datos
 * para proveedores donde el usuario aún no está referido.
 *
 * @returns Un sufijo de datos para proveedores donde el usuario aún no está referido,
 * o null si no se necesitan referidos
 */
export function getDivviData(): string | null {
  const state = store.getState()
  const divviConfig = getDivviConfig(state)

  // Obtener la dirección del usuario (requerido en v2)
  const userAddress = walletAddressSelector(state)

  const consumer = divviConfig?.consumer
  const providers = divviConfig?.providers

  if (!consumer) {
    Logger.debug(TAG, 'No hay configuración de Divvi disponible')
    return null
  }

  if (!userAddress) {
    Logger.debug(TAG, 'No hay dirección de usuario disponible')
    return null
  }

  // Verificar si esta combinación ya ha sido referida exitosamente
  // Nota: En v2, solo necesitamos consumer y user, pero mantenemos la compatibilidad
  // con el sistema de verificación existente que usa providers
  if (providers && providers.length > 0) {
    const hasAlreadySucceeded = hasReferralSucceeded(
      state,
      consumer as Address,
      providers as Address[]
    )
    if (hasAlreadySucceeded) {
      Logger.info(TAG, `${consumer} ya ha referido a ${providers.join(', ')}`)
      return null
    }
  }

  // Verificar si hay un referido pendiente para esta combinación
  const referrals = selectReferrals(state)
  // Generar la clave usando v2 (solo user y consumer)
  const key = getReferralTag({
    user: userAddress as Address,
    consumer: consumer as Address,
  })

  if (referrals[key]?.status === 'pending') {
    Logger.info(
      TAG,
      `${consumer} tiene un referido pendiente para usuario ${userAddress.substring(0, 8)}...`
    )
    return null
  }

  // Si no hay referidos pendientes o exitosos, generamos un nuevo sufijo
  Logger.info(TAG, `${consumer} está refiriendo para usuario ${userAddress.substring(0, 8)}...`)

  return getReferralTag({
    user: userAddress as Address,
    consumer: consumer as Address,
  })
}
