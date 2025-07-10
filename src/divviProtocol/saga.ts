import { submitReferral } from '@divvi/referral-sdk'
import { getDivviConfig } from 'src/divviProtocol/selectors'
import {
  Referral,
  referralCancelled,
  referralSubmitted,
  referralSuccessful,
  selectReferrals,
  setInitialized,
  setSDKInitialized,
} from 'src/divviProtocol/slice'
import { RootState } from 'src/redux/reducers'
import { transactionConfirmed } from 'src/transactions/slice'
import { NetworkId, StandbyTransaction } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { safely } from 'src/utils/safely'
import { networkIdToChainId } from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, put, select, spawn, takeEvery, takeLatest } from 'typed-redux-saga'
import { Address, Hash } from 'viem'

// Tag para los logs
const TAG = 'divviProtocol/saga'

// Declaramos los eventos que no están en AppEvents
const AppEvents = {
  APP_MOUNTED: 'APP_MOUNTED',
  DIVVI_SDK_INITIALIZED: 'DIVVI_SDK_INITIALIZED',
}

// Eventos personalizados para Divvi
const DivviEvents = {
  divvi_transaction_reported: 'divvi_transaction_reported',
}

// Para la trazabilidad analítica
const TucopAnalytics = {
  track: (event: string, properties?: any) => {
    Logger.debug(TAG, `Tracking event: ${event}`, properties)
  },
}

/**
 * Inicializa la integración con Divvi al montar la aplicación
 */
export function* initializeDivviProtocol() {
  try {
    Logger.info(TAG, 'Inicializando integración con Divvi Protocol v2')

    // Verificar si la configuración de Divvi está presente
    const divviConfig = yield* select(getDivviConfig)

    if (!divviConfig) {
      Logger.info(TAG, 'No se encontró configuración de Divvi, omitiendo inicialización')
      return
    }

    Logger.info(TAG, 'Configuración de Divvi encontrada', {
      consumer: divviConfig.consumer,
      providersCount: divviConfig.providers?.length || 0,
      divviId: divviConfig.divviId,
    })

    // Marcar como inicializado
    yield* put(setInitialized(true))
    yield* put(setSDKInitialized(true))

    // Registrar evento de inicialización
    TucopAnalytics.track(AppEvents.DIVVI_SDK_INITIALIZED, {
      success: true,
      divviId: divviConfig.divviId,
    })

    // Procesar referidos pendientes al inicializar
    yield* call(processPendingReferralsSaga)

    Logger.info(TAG, 'Integración con Divvi Protocol v2 inicializada correctamente')
  } catch (error) {
    Logger.error(TAG, 'Error al inicializar integración con Divvi Protocol v2', error)
    TucopAnalytics.track(AppEvents.DIVVI_SDK_INITIALIZED, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Procesa los referidos pendientes
 */
function* processPendingReferralsSaga() {
  try {
    Logger.info(TAG, 'Procesando referidos pendientes')

    const referrals = yield* select(selectReferrals)
    let pendingCount = 0

    // Procesar todos los referidos pendientes usando Object.entries en lugar de for...in
    Object.entries(referrals).forEach(([_, referral]) => {
      if (referral.status === 'pending' && referral.txHash && referral.chainId) {
        pendingCount++
        // No podemos usar yield dentro de un forEach, así que lo manejamos de manera diferente
        // Este enfoque simplemente cuenta los pendientes
      }
    })

    // Si hay referidos pendientes, los procesamos uno por uno
    if (pendingCount > 0) {
      Logger.info(TAG, `Se encontraron ${pendingCount} referidos pendientes para procesar`)

      // Ahora sí podemos usar yield* con un bucle for...of sobre las entradas
      for (const [_, referral] of Object.entries(referrals)) {
        if (referral.status === 'pending' && referral.txHash && referral.chainId) {
          yield* put(referralSubmitted(referral))
        }
      }
    } else {
      Logger.debug(TAG, 'No se encontraron referidos pendientes')
    }
  } catch (error) {
    Logger.error(TAG, 'Error al procesar referidos pendientes', error)
  }
}

/**
 * Maneja el envío de un referido a Divvi con reintentos
 */
function* submitReferralSaga(action: ReturnType<typeof referralSubmitted>) {
  const referral = action.payload

  try {
    Logger.info(TAG, `Enviando referido a Divvi: ${referral.txHash}`, {
      divviId: referral.divviId,
      campaignIds: referral.campaignIds.map((id) => id.substring(0, 8) + '...'),
      chainId: referral.chainId,
      user: referral.user?.substring(0, 8) + '...',
      timestamp: new Date(referral.timestamp).toISOString(),
    })

    if (!referral.txHash || !referral.chainId) {
      Logger.error(TAG, 'Referido inválido, faltan campos obligatorios', referral)
      yield* put(referralCancelled(referral))
      return
    }

    // Convertir a tipo Hash de viem para asegurar compatibilidad
    const hash = (
      referral.txHash.startsWith('0x') ? referral.txHash : `0x${referral.txHash}`
    ) as Hash

    // Log antes de llamar a la API
    Logger.info(TAG, `Llamando a submitReferral SDK con parámetros:`, {
      txHash: hash,
      chainId: referral.chainId,
    })

    // Llamar a la API de Divvi para reportar la transacción
    yield* call(submitReferral, {
      txHash: hash,
      chainId: referral.chainId as number,
    })

    Logger.info(TAG, `Referido ${referral.txHash} enviado exitosamente a Divvi`, {
      chainId: referral.chainId,
      timestamp: new Date().toISOString(),
    })

    yield* put(referralSuccessful(referral))

    // Registrar evento analítico
    TucopAnalytics.track(DivviEvents.divvi_transaction_reported, {
      success: true,
      txHash: referral.txHash,
      chainId: referral.chainId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    Logger.error(TAG, `Error al enviar referido a Divvi: ${message}`, {
      error,
      txHash: referral.txHash,
      chainId: referral.chainId,
      stack: error instanceof Error ? error.stack : 'No stack disponible',
    })

    // Sólo marcamos como cancelado en caso de error de cliente
    if (message.includes('Client error')) {
      yield* put(referralCancelled(referral))
    }

    // Registrar evento analítico
    TucopAnalytics.track(DivviEvents.divvi_transaction_reported, {
      success: false,
      error: message,
      txHash: referral.txHash,
      chainId: referral.chainId,
    })
  }
}

/**
 * Maneja el evento de transacción confirmada
 * Si la configuración de Divvi está presente, reporta la transacción a la API de Divvi usando el SDK oficial
 */
export function* handleTransactionConfirmed({
  txHash,
  networkId,
}: {
  txHash: string
  networkId: NetworkId
}) {
  try {
    Logger.info(TAG, 'Procesando transacción confirmada para Divvi v2', {
      txHash,
      networkId,
      timestamp: new Date().toISOString(),
    })

    // Verificar si la integración con Divvi está configurada
    const divviConfig = yield* select(getDivviConfig)

    // Obtener la dirección del usuario
    const userAddress = yield* select(walletAddressSelector)

    if (!divviConfig?.consumer) {
      Logger.debug(TAG, 'Configuración de Divvi incompleta, omitiendo reporte de transacción', {
        consumer: divviConfig?.consumer || 'No definido',
      })
      return
    }

    if (!userAddress) {
      Logger.debug(TAG, 'No hay dirección de usuario disponible, omitiendo reporte')
      return
    }

    // Convertir networkId a chainId según la documentación de Divvi
    const chainId = networkIdToChainId[networkId]

    if (!chainId) {
      Logger.warn(TAG, `No se pudo determinar chainId para networkId: ${networkId}`, {
        networkIdsDisponibles: Object.keys(networkIdToChainId),
      })
      return
    }

    Logger.info(TAG, 'Reportando transacción a Divvi v2', {
      txHash,
      networkId,
      chainId,
      consumer: divviConfig.consumer.substring(0, 8) + '...',
      user: userAddress.substring(0, 8) + '...',
    })

    // Convertir los providers a Address (mantenemos para compatibilidad)
    const providersAsAddress = divviConfig.providers?.map((provider) => provider as Address) || []

    // Crear un objeto Referral con el campo user para v2
    const referral: Referral = {
      divviId: divviConfig.consumer,
      campaignIds: providersAsAddress,
      txHash,
      chainId,
      status: 'pending',
      timestamp: Date.now(),
      user: userAddress as Address, // Agregamos el campo user para v2
    }

    Logger.info(TAG, 'Creado objeto Referral para enviar a Divvi v2', {
      referralId: `${txHash.substring(0, 8)}-${chainId}`,
      campaignIdsCount: providersAsAddress.length,
      user: userAddress.substring(0, 8) + '...',
    })

    // Enviar el referido para su procesamiento
    yield* put(referralSubmitted(referral))

    Logger.info(TAG, 'Acción referralSubmitted emitida correctamente', {
      txHash: txHash.substring(0, 8) + '...',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    Logger.error(TAG, 'Error al procesar transacción confirmada para Divvi v2', {
      error,
      txHash,
      networkId,
      stack: error instanceof Error ? error.stack : 'No stack disponible',
    })
  }
}

export function* watchDivviProtocol() {
  try {
    Logger.info(TAG, 'Iniciando watchers de Divvi Protocol v2')

    // Observar el evento de montaje de la aplicación para inicializar Divvi
    yield* takeLatest(AppEvents.APP_MOUNTED, initializeDivviProtocol)
    Logger.info(TAG, 'Watcher para evento APP_MOUNTED configurado')

    // Modificado: Observar la acción transactionConfirmed de Redux en lugar del evento
    // TransactionEvents.transaction_confirmed que nunca se emite
    yield* takeEvery(
      transactionConfirmed.type,
      safely(function* (action: ReturnType<typeof transactionConfirmed>) {
        const { txId, receipt } = action.payload
        Logger.info(TAG, '⚡ Acción transactionConfirmed detectada, procesando para Divvi v2', {
          txId,
          transactionHash: receipt.transactionHash,
          timestamp: new Date().toISOString(),
          status: receipt.status,
        })

        // Extraer los datos necesarios para handleTransactionConfirmed
        // Necesitamos determinar el networkId basado en el contexto
        const standbyTransactions = yield* select(
          (state: RootState) => state.transactions.standbyTransactions
        )
        Logger.debug(TAG, `Buscando transacción en standbyTransactions con id: ${txId}`, {
          standbyTransactionsCount: standbyTransactions.length,
        })

        const transaction = standbyTransactions.find(
          (tx: StandbyTransaction) => tx.context.id === txId
        )

        if (transaction && receipt.transactionHash) {
          Logger.info(TAG, `Transacción encontrada con id: ${txId}`, {
            networkId: transaction.networkId,
            transactionType: transaction.type,
          })

          yield* call(handleTransactionConfirmed, {
            txHash: receipt.transactionHash,
            networkId: transaction.networkId,
          })
        } else {
          Logger.warn(
            TAG,
            'No se pudo encontrar la información completa de la transacción para Divvi v2',
            {
              txId,
              transactionHash: receipt.transactionHash,
              standbyTransactionsIds: standbyTransactions.map((tx) => tx.context.id).join(', '),
            }
          )
        }
      })
    )
    Logger.info(TAG, 'Watcher para acción transactionConfirmed.type configurado')

    // Observar eventos de referidos enviados para procesarlos
    yield* takeEvery(referralSubmitted.type, safely(submitReferralSaga))
    Logger.info(TAG, 'Watcher para acción referralSubmitted.type configurado')

    // También capturar eventos de swap completados para asegurar que se reportan a Divvi
    yield* takeEvery(
      'SWAP/SWAP_COMPLETED',
      safely(function* (action: any) {
        if (action.hash && action.networkId) {
          Logger.info(TAG, '🔄 Detectado swap completado, procesando para Divvi v2', {
            txHash: action.hash,
            networkId: action.networkId,
            timestamp: new Date().toISOString(),
            // Añadir más detalles del swap si están disponibles
            details: action.payload
              ? JSON.stringify({
                  fromToken: action.payload.fromToken?.symbol,
                  toToken: action.payload.toToken?.symbol,
                  amount: action.payload.amount,
                })
              : 'Sin detalles',
          })

          // Registrar el evento de swap para análisis
          TucopAnalytics.track('DIVVI_SWAP_DETECTED', {
            txHash: action.hash,
            networkId: action.networkId,
          })

          yield* call(handleTransactionConfirmed, {
            txHash: action.hash,
            networkId: action.networkId,
          })
        } else {
          Logger.warn(TAG, 'Evento de swap detectado pero faltan datos necesarios', {
            action,
            actionType: 'SWAP/SWAP_COMPLETED',
          })
        }
      })
    )
    Logger.info(TAG, 'Watcher para evento SWAP/SWAP_COMPLETED configurado')

    Logger.info(TAG, 'Todos los watchers de Divvi Protocol v2 iniciados correctamente')
  } catch (error) {
    Logger.error(TAG, 'Error al iniciar watchers de Divvi Protocol v2', {
      error,
      stack: error instanceof Error ? error.stack : 'No stack disponible',
    })
  }
}

export function* divviProtocolSaga() {
  try {
    yield* spawn(watchDivviProtocol)

    // Inicializar inmediatamente
    yield* call(initializeDivviProtocol)

    Logger.info(TAG, 'Saga de Divvi Protocol v2 inicializado')
  } catch (error) {
    Logger.error(TAG, 'Error al inicializar saga de Divvi Protocol v2', error)
  }
}
