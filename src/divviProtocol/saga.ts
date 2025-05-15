import { submitReferral } from '@divvi/referral-sdk'
import { call, put, select, spawn, takeEvery, takeLatest } from 'redux-saga/effects'
import { getDivviConfig } from 'src/divviProtocol/selectors'
import { setInitialized, setSDKInitialized } from 'src/divviProtocol/slice'
import { TRANSACTION_CONFIRMED } from 'src/transactions/actions'
import Logger from 'src/utils/Logger'
import { networkIdToChainId } from 'src/web3/networkConfig'

// Declaramos los eventos que no están en AppEvents
const AppEvents = {
  APP_MOUNTED: 'APP_MOUNTED',
  DIVVI_SDK_INITIALIZED: 'DIVVI_SDK_INITIALIZED',
}

// Para la trazabilidad analítica
const TucopAnalytics = {
  track: (event: string, properties?: any) => {
    Logger.debug('TucopAnalytics', `Tracking event: ${event}`, properties)
  },
}

const TAG = 'divviProtocol/saga'

export function* watchDivviProtocol() {
  yield takeLatest(AppEvents.APP_MOUNTED, initializeDivviProtocol)
}

/**
 * Escucha las transacciones confirmadas y reporta a Divvi si es necesario
 */
export function* watchTransactionConfirmed() {
  yield takeEvery(TRANSACTION_CONFIRMED, handleTransactionConfirmed)
}

/**
 * Maneja el evento de transacción confirmada
 * Si la configuración de Divvi está presente, reporta la transacción a la API de Divvi usando el SDK oficial
 */
export function* handleTransactionConfirmed({ txHash, networkId }: any) {
  try {
    // Verificar si la integración con Divvi está configurada
    const divviConfig = yield select(getDivviConfig)

    if (!divviConfig?.consumer || !divviConfig?.providers || !divviConfig?.providers.length) {
      Logger.debug(TAG, 'Configuración de Divvi incompleta, omitiendo reporte de transacción')
      return
    }

    // Convertir networkId a chainId según la documentación de Divvi
    const chainId = networkIdToChainId[networkId]

    if (!chainId) {
      Logger.warn(TAG, `No se pudo determinar el chainId para la red ${networkId}`)
      return
    }

    // Reportar la transacción a Divvi usando el SDK oficial
    try {
      yield call(submitReferral, {
        txHash,
        chainId,
      })

      Logger.info(TAG, `Transacción ${txHash} reportada exitosamente a Divvi`)
    } catch (error) {
      Logger.warn(TAG, `No se pudo reportar la transacción ${txHash} a Divvi`, error)
    }
  } catch (error) {
    Logger.error(TAG, 'Error al manejar transacción confirmada para Divvi', error)
  }
}

export function* initializeDivviProtocol() {
  try {
    const divviConfig = yield select(getDivviConfig)

    if (!divviConfig?.consumer || !divviConfig?.providers || !divviConfig?.providers.length) {
      Logger.debug(TAG, 'Divvi no configurado, omitiendo inicialización')
      return
    }

    Logger.debug(TAG, 'Inicializando Divvi Protocol')

    yield put(setInitialized(true))
    yield put(setSDKInitialized(true))

    TucopAnalytics.track(AppEvents.DIVVI_SDK_INITIALIZED, {
      consumer: divviConfig.consumer,
      providers: divviConfig.providers,
    })
  } catch (error) {
    Logger.error(TAG, 'Error al inicializar Divvi Protocol', error)
  }
}

export function* divviProtocolSaga() {
  yield spawn(watchDivviProtocol)
  yield spawn(watchTransactionConfirmed)
}
