import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { checkForAppUpdate, showUpdateDialog, UpdateCheckResult } from 'src/utils/appUpdateChecker'
import Logger from 'src/utils/Logger'

const TAG = 'hooks/useAppUpdateChecker'
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 horas en milisegundos
const LAST_UPDATE_CHECK_KEY = 'lastUpdateCheckTimestamp'
const UPDATE_DISMISSED_KEY = 'updateDismissedVersion'

export interface UseAppUpdateCheckerOptions {
  /** Versión mínima requerida para forzar actualización */
  minRequiredVersion?: string
  /** Usar backend propio en lugar de APIs de tiendas */
  useBackend?: boolean
  /** Mostrar diálogo automáticamente cuando hay actualización */
  showDialogAutomatically?: boolean
  /** Verificar al abrir la app */
  checkOnAppStart?: boolean
  /** Verificar cuando la app vuelve del background */
  checkOnAppResume?: boolean
  /** Intervalo de verificación en milisegundos (por defecto 24 horas) */
  checkInterval?: number
}

export interface UseAppUpdateCheckerReturn {
  /** Información de la última verificación de actualización */
  updateInfo: UpdateCheckResult | null
  /** Si está verificando actualizaciones actualmente */
  isChecking: boolean
  /** Error si ocurrió durante la verificación */
  error: string | null
  /** Función para verificar actualizaciones manualmente */
  checkForUpdate: () => Promise<void>
  /** Función para mostrar el diálogo de actualización */
  showUpdateDialog: () => void
  /** Función para descartar la actualización actual */
  dismissUpdate: () => void
}

export function useAppUpdateChecker(
  options: UseAppUpdateCheckerOptions = {}
): UseAppUpdateCheckerReturn {
  const {
    minRequiredVersion,
    useBackend = false,
    showDialogAutomatically = true,
    checkOnAppStart = true,
    checkOnAppResume = true,
    checkInterval = UPDATE_CHECK_INTERVAL,
  } = options

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Verificar si ya se descartó esta versión
  const isUpdateDismissed = useCallback(async (version: string): Promise<boolean> => {
    try {
      const dismissedVersion = await AsyncStorage.getItem(UPDATE_DISMISSED_KEY)
      return dismissedVersion === version
    } catch (error) {
      Logger.error(TAG, 'Error checking dismissed update:', error)
      return false
    }
  }, [])

  // Verificar si es momento de hacer una nueva verificación
  const shouldCheckForUpdate = useCallback(async (): Promise<boolean> => {
    try {
      const lastCheckStr = await AsyncStorage.getItem(LAST_UPDATE_CHECK_KEY)
      const now = Date.now()

      if (!lastCheckStr) {
        Logger.info(TAG, '🆕 No previous update check found, should check')
        return true
      }

      const lastCheck = parseInt(lastCheckStr, 10)
      const timeSinceLastCheck = now - lastCheck
      const shouldCheck = timeSinceLastCheck >= checkInterval

      Logger.info(
        TAG,
        `⏰ Time since last check: ${Math.round(timeSinceLastCheck / 1000 / 60)} minutes`
      )
      Logger.info(TAG, `⏰ Check interval: ${Math.round(checkInterval / 1000 / 60)} minutes`)
      Logger.info(TAG, `⏰ Should check: ${shouldCheck}`)

      return shouldCheck
    } catch (error) {
      Logger.error(TAG, 'Error checking last update time:', error)
      return true
    }
  }, [checkInterval])

  // Función principal para verificar actualizaciones
  const checkForUpdate = useCallback(async (): Promise<void> => {
    if (isChecking) {
      Logger.info(TAG, '⏳ Update check already in progress, skipping...')
      return
    }

    setIsChecking(true)
    setError(null)

    try {
      Logger.info(TAG, '🚀 Starting update check...')
      Logger.info(TAG, `🔧 Config: useBackend=${useBackend}, showDialog=${showDialogAutomatically}`)

      const result = await checkForAppUpdate(useBackend, minRequiredVersion)
      setUpdateInfo(result)

      Logger.info(TAG, `📊 Update check result:`, {
        hasUpdate: result.hasUpdate,
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        isForced: result.isForced,
      })

      // Guardar timestamp de la última verificación
      await AsyncStorage.setItem(LAST_UPDATE_CHECK_KEY, Date.now().toString())

      if (result.hasUpdate && result.latestVersion) {
        Logger.info(TAG, `🔄 Update available: ${result.latestVersion}`)

        // Verificar si esta versión ya fue descartada por el usuario
        const isDismissed = await isUpdateDismissed(result.latestVersion)
        Logger.info(TAG, `🚫 Update dismissed: ${isDismissed}`)

        // Solo mostrar diálogo si no fue descartada o si es una actualización forzada
        if (showDialogAutomatically && (!isDismissed || result.isForced)) {
          Logger.info(TAG, `💬 Showing update dialog...`)
          showUpdateDialog(result)
        } else {
          Logger.info(
            TAG,
            `🔇 Not showing dialog: dismissed=${isDismissed}, forced=${result.isForced}`
          )
        }
      } else {
        Logger.info(TAG, `✅ No update needed`)
      }

      Logger.info(TAG, '✅ Update check completed successfully')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(errorMessage)
      Logger.error(TAG, '💥 Error during update check:', err)
    } finally {
      setIsChecking(false)
    }
  }, [isChecking, useBackend, minRequiredVersion, showDialogAutomatically, isUpdateDismissed])

  // Función para mostrar el diálogo manualmente
  const showUpdateDialogManually = useCallback(() => {
    if (updateInfo && updateInfo.hasUpdate) {
      showUpdateDialog(updateInfo)
    }
  }, [updateInfo])

  // Función para descartar la actualización actual
  const dismissUpdate = useCallback(async () => {
    if (updateInfo?.latestVersion && !updateInfo.isForced) {
      try {
        await AsyncStorage.setItem(UPDATE_DISMISSED_KEY, updateInfo.latestVersion)
        Logger.info(TAG, `Update dismissed for version: ${updateInfo.latestVersion}`)
      } catch (error) {
        Logger.error(TAG, 'Error dismissing update:', error)
      }
    }
  }, [updateInfo])

  // Verificar actualizaciones al montar el componente
  useEffect(() => {
    if (checkOnAppStart) {
      Logger.info(TAG, '🚀 App started, checking if should verify updates...')
      void shouldCheckForUpdate().then((should) => {
        Logger.info(TAG, `🚀 Should check on app start: ${should}`)
        if (should) {
          Logger.info(TAG, '🚀 Starting update check on app start...')
          void checkForUpdate()
        } else {
          Logger.info(TAG, '🚀 Skipping update check on app start (too recent)')
        }
      })
    } else {
      Logger.info(TAG, '🚀 App started but checkOnAppStart is disabled')
    }
  }, [checkOnAppStart, shouldCheckForUpdate, checkForUpdate])

  // Escuchar cambios de estado de la app
  useEffect(() => {
    if (!checkOnAppResume) return

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        const should = await shouldCheckForUpdate()
        if (should) {
          void checkForUpdate()
        }
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange)

    return () => {
      subscription?.remove()
    }
  }, [checkOnAppResume, shouldCheckForUpdate, checkForUpdate])

  return {
    updateInfo,
    isChecking,
    error,
    checkForUpdate,
    showUpdateDialog: showUpdateDialogManually,
    dismissUpdate,
  }
}
