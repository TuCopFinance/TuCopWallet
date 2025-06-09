import { parseUri } from '@walletconnect/utils'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { WalletConnectEvents } from 'src/analytics/Events'
import { WalletConnectPairingOrigin } from 'src/analytics/types'
import { getDappRequestOrigin } from 'src/app/utils'
import { WALLETCONNECT_UNIVERSAL_LINK } from 'src/config'
import { activeDappSelector } from 'src/dapps/selectors'
import { ActiveDapp } from 'src/dapps/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import Logger from 'src/utils/Logger'
import { Actions } from 'src/walletConnect/actions'
import { initialiseWalletConnect } from 'src/walletConnect/saga'
import { selectHasPendingState } from 'src/walletConnect/selectors'
import { WalletConnectRequestType } from 'src/walletConnect/types'
import { call, delay, fork, race, select, take } from 'typed-redux-saga'

const WC_PREFIX = 'wc:'
const APP_DEEPLINK_PREFIX = `myapp://tucop/wc?uri=`
const APP_DEEPLINK_BASE = `myapp://tucop/wc`
const CONNECTION_TIMEOUT = 45_000

const TAG = 'WalletConnect/walletConnect'

/**
 * See https://docs.walletconnect.org/v/2.0/mobile-linking for exactly
 * how these links can look.
 *
 * Once we have a link (whether deep or universal) we need to figure out
 * if it's a connection request (in which case we need to initialise the
 * connection) or an action request (in which case it's a no op and the
 * already establised WC client will handle showing the prompt)
 */
export function* handleWalletConnectDeepLink(deepLink: string) {
  Logger.debug(TAG, '🔗 WalletConnect Deep Link recibido:', deepLink)
  let link = deepLink

  // Manejar deep link con parámetro URI
  if (link.startsWith(APP_DEEPLINK_PREFIX)) {
    Logger.debug(TAG, '📱 Procesando deep link con URI:', link)
    link = deepLink.substring(APP_DEEPLINK_PREFIX.length)
  }
  // Manejar deep link base (sin parámetros)
  else if (link.startsWith(APP_DEEPLINK_BASE)) {
    Logger.debug(TAG, '📱 Deep link base sin URI, retornando:', link)
    // Si es solo el deep link base sin URI, no hay nada que procesar
    // Esto puede ocurrir cuando la app se abre desde WalletConnect pero sin una URI específica
    return
  }

  const wcLinkWithUri = `${WALLETCONNECT_UNIVERSAL_LINK}?uri=`
  if (link.startsWith(wcLinkWithUri)) {
    Logger.debug(TAG, '🌐 Procesando universal link:', link)
    link = deepLink.substring(wcLinkWithUri.length)
  }

  link = decodeURIComponent(link)
  Logger.debug(TAG, '🔍 Link procesado:', link)

  // Show loading screen if there is no pending state
  // Sometimes the WC request is received from the WebSocket before this deeplink
  // handler is called, so it's important we don't display the loading screen on top
  const hasPendingState: boolean = yield* select(selectHasPendingState)
  if (!hasPendingState) {
    Logger.debug(TAG, '⏳ Mostrando pantalla de carga')
    yield* fork(handleLoadingWithTimeout, WalletConnectPairingOrigin.Deeplink)
  }

  // pairing request
  // https://docs.walletconnect.com/2.0/specs/clients/core/pairing/pairing-uri
  try {
    const parsedUri = parseUri(link)
    Logger.debug(TAG, '🔑 URI parseado:', parsedUri)
    if (parsedUri.symKey) {
      Logger.debug(TAG, '✅ Iniciando WalletConnect con symKey')
      yield* call(initialiseWalletConnect, link, WalletConnectPairingOrigin.Deeplink)
    } else {
      Logger.debug(TAG, '❌ No se encontró symKey en el URI')
    }
  } catch (error) {
    Logger.debug(TAG, '❌ Error parseando URI:', error)
  }

  // action request, we can do nothing
}

export function isWalletConnectDeepLink(deepLink: string) {
  const decodedLink = decodeURIComponent(deepLink)
  return [WC_PREFIX, APP_DEEPLINK_PREFIX, APP_DEEPLINK_BASE, WALLETCONNECT_UNIVERSAL_LINK].some(
    (prefix) => decodedLink.startsWith(prefix)
  )
}

export function* handleLoadingWithTimeout(origin: WalletConnectPairingOrigin) {
  navigate(Screens.WalletConnectRequest, {
    type: WalletConnectRequestType.Loading,
    origin,
  })

  const { timedOut } = yield* race({
    timedOut: delay(CONNECTION_TIMEOUT),
    sessionRequestReceived: take(Actions.SESSION_PROPOSAL),
    actionRequestReceived: take(Actions.SESSION_PAYLOAD),
  })

  if (timedOut) {
    const activeDapp: ActiveDapp | null = yield* select(activeDappSelector)
    AppAnalytics.track(WalletConnectEvents.wc_pairing_error, {
      dappRequestOrigin: getDappRequestOrigin(activeDapp),
      error: 'timed out while waiting for a session',
    })

    navigate(Screens.WalletConnectRequest, { type: WalletConnectRequestType.TimeOut })
  }
}
