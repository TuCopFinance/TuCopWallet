import CleverTap from 'clevertap-react-native'
import { useEffect, useState } from 'react'
import { useAsync } from 'react-async-hook'
import { Linking, Platform } from 'react-native'
import { deepLinkDeferred, openDeepLink } from 'src/app/actions'
import { pendingDeepLinkSelector } from 'src/app/selectors'
import { hasVisitedHomeSelector } from 'src/home/selectors'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Logger from 'src/utils/Logger'
import { walletAddressSelector } from 'src/web3/selectors'

export const useDeepLinks = () => {
  const [isConsumingInitialLink, setIsConsumingInitialLink] = useState(false)
  const dispatch = useDispatch()

  const pendingDeepLink = useSelector(pendingDeepLinkSelector)
  const address = useSelector(walletAddressSelector)
  // having seen the home screen is a proxy for having finished onboarding. we
  // want to prevent consuming deep links during the onboarding flow in case the
  // deep link includes navigation.
  const hasVisitedHome = useSelector(hasVisitedHomeSelector)

  const shouldConsumeDeepLinks = address && hasVisitedHome

  const handleOpenURL = (event: { url: string }, isSecureOrigin: boolean = false) => {
    Logger.debug('Deep Link Received:', event.url)

    // defer consuming deep links until the user has completed onboarding
    if (shouldConsumeDeepLinks) {
      dispatch(openDeepLink(event.url, isSecureOrigin))
    } else {
      dispatch(deepLinkDeferred(event.url, isSecureOrigin))
    }
  }

  useEffect(() => {
    if (pendingDeepLink && shouldConsumeDeepLinks) {
      dispatch(openDeepLink(pendingDeepLink.url, pendingDeepLink.isSecureOrigin))
    }
  }, [pendingDeepLink, address, hasVisitedHome])

  const handleOpenInitialURL = (event: { url: string }, isSecureOrigin: boolean = false) => {
    if (!isConsumingInitialLink) {
      setIsConsumingInitialLink(true)
      handleOpenURL(event, isSecureOrigin)
    }
  }

  useAsync(async () => {
    // Handles opening Clevertap deeplinks when app is closed / in background
    // @ts-expect-error the clevertap ts definition has url as an object, but it
    // is a string!
    CleverTap.getInitialUrl(async (err: any, url: string) => {
      if (err) {
        if (/CleverTap initialUrl is (nil|null)/gi.test(err)) {
          // This is normal - no deep link on app launch, use debug instead of warn
          Logger.debug('App/componentDidMount', 'CleverTap InitialUrl is nil (no deep link)')
        } else {
          Logger.error('App/componentDidMount', 'App CleverTap Deeplink on Load', err)
        }
      } else if (url) {
        handleOpenInitialURL({ url }, true)
      }
    })

    const initialUrl = await Linking.getInitialURL()
    if (initialUrl) {
      handleOpenInitialURL({ url: initialUrl })
    }
  }, [])

  useEffect(() => {
    // Handles opening Clevertap deeplinks when app is open
    CleverTap.addListener('CleverTapPushNotificationClicked', async (event: any) => {
      // Url location differs for iOS and Android
      const url = Platform.OS === 'ios' ? event.customExtras['wzrk_dl'] : event['wzrk_dl']
      if (url) {
        handleOpenURL({ url }, true)
      }
    })

    const linkingEventListener = Linking.addEventListener('url', (event) => {
      handleOpenURL(event)
    })

    return () => {
      CleverTap.removeListener('CleverTapPushNotificationClicked')
      linkingEventListener.remove()
    }
  }, [])
}
