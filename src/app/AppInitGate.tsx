import React, { useEffect } from 'react'
import { useAsync } from 'react-async-hook'
import { Dimensions } from 'react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { AppEvents } from 'src/analytics/Events'
import { appMounted, appUnmounted } from 'src/app/actions'
import i18n from 'src/i18n'
import { currentLanguageSelector } from 'src/i18n/selectors'
import { setLanguage } from 'src/i18n/slice'
import { navigateToError } from 'src/navigator/NavigationService'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { waitUntilSagasFinishLoading } from 'src/redux/sagas'
import Logger from 'src/utils/Logger'
const TAG = 'AppInitGate'

interface Props {
  reactLoadTime: number
  appStartedMillis: number
  children: React.ReactNode
}

const AppInitGate = ({ appStartedMillis, reactLoadTime, children }: Props) => {
  const dispatch = useDispatch()

  const language = useSelector(currentLanguageSelector)

  useEffect(() => {
    return () => {
      dispatch(appUnmounted())
    }
  }, [])

  const initResult = useAsync(
    async () => {
      Logger.debug(TAG, 'Starting AppInitGate init')
      await waitUntilSagasFinishLoading()

      dispatch(setLanguage('es-419'))
      i18n.changeLanguage('es-419' as string).catch((e) => {
        Logger.error(TAG, 'Failed to change language', e)
      })

      const reactLoadDuration = (reactLoadTime - appStartedMillis) / 1000
      const appLoadDuration = (Date.now() - appStartedMillis) / 1000
      Logger.debug('TAG', `reactLoad: ${reactLoadDuration} appLoad: ${appLoadDuration}`)

      const { width, height } = Dimensions.get('window')
      AppAnalytics.startSession(AppEvents.app_launched, {
        deviceHeight: height,
        deviceWidth: width,
        reactLoadDuration,
        appLoadDuration,
        language: i18n.language || language,
      })

      Logger.debug(TAG, 'AppInitGate init completed', language)
      dispatch(appMounted())
    },
    [],
    {
      onError: (error) => {
        Logger.error(TAG, 'Failed init', error)
        navigateToError('appInitFailed', error)
      },
    }
  )

  // type assertion here because https://github.com/DefinitelyTyped/DefinitelyTyped/issues/44572
  return initResult.loading ? null : (children as JSX.Element)
}

export default AppInitGate
