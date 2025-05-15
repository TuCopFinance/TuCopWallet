import { getDataSuffix } from '@divvi/referral-sdk'
import { getDivviConfig, hasReferralSucceeded } from 'src/divviProtocol/selectors'
import { selectReferrals } from 'src/divviProtocol/slice'
import { store } from 'src/redux/store'
import Logger from 'src/utils/Logger'
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

  const consumer = divviConfig?.consumer
  const providers = divviConfig?.providers

  if (!consumer || !providers || !providers.length) {
    Logger.debug(TAG, 'No hay configuración de Divvi disponible')
    return null
  }

  // Verificar si esta combinación ya ha sido referida exitosamente
  const hasAlreadySucceeded = hasReferralSucceeded(
    state,
    consumer as Address,
    providers as Address[]
  )
  if (hasAlreadySucceeded) {
    Logger.info(TAG, `${consumer} ya ha referido a ${providers.join(', ')}`)
    return null
  }

  // Verificar si hay un referido pendiente para esta combinación
  const referrals = selectReferrals(state)
  const key = getDataSuffix({
    consumer: consumer as Address,
    providers: providers as Address[],
  })
  if (referrals[key]?.status === 'pending') {
    Logger.info(TAG, `${consumer} tiene un referido pendiente para ${providers.join(', ')}`)
    return null
  }

  // Si no hay referidos pendientes o exitosos, generamos un nuevo sufijo
  Logger.info(TAG, `${consumer} está refiriendo a ${providers.join(', ')}`)

  return getDataSuffix({
    consumer: consumer as Address,
    providers: providers as Address[],
  })
}
