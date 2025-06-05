import { Alert, Linking, Platform } from 'react-native'
import DeviceInfo from 'react-native-device-info'
import { APP_STORE_ID } from 'src/config'
import Logger from 'src/utils/Logger'
import { compareVersion } from 'src/utils/versionCheck'

const TAG = 'utils/appUpdateChecker'

export interface AppStoreVersionInfo {
  version: string
  releaseNotes?: string
  minimumOsVersion?: string
  currentVersionReleaseDate?: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  isForced?: boolean
  releaseNotes?: string
  downloadUrl?: string
}

/**
 * Verifica si hay una nueva versión disponible en la App Store (iOS)
 */
async function checkAppStoreVersion(): Promise<AppStoreVersionInfo | null> {
  try {
    const response = await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    if (data.results && data.results.length > 0) {
      const appInfo = data.results[0]
      return {
        version: appInfo.version,
        releaseNotes: appInfo.releaseNotes,
        minimumOsVersion: appInfo.minimumOsVersion,
        currentVersionReleaseDate: appInfo.currentVersionReleaseDate,
      }
    }

    return null
  } catch (error) {
    Logger.error(TAG, 'Error checking App Store version:', error)
    return null
  }
}

/**
 * Verifica si hay una nueva versión disponible en Google Play Store (Android)
 */
async function checkPlayStoreVersion(): Promise<AppStoreVersionInfo | null> {
  try {
    const bundleId = DeviceInfo.getBundleId()

    // Nota: Google Play Store no tiene una API pública oficial para obtener información de versiones
    // Esta es una implementación usando web scraping que puede ser inestable
    // Para producción, se recomienda usar tu propio backend o Firebase Remote Config
    const response = await fetch(
      `https://play.google.com/store/apps/details?id=${bundleId}&hl=en`,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AppVersionChecker/1.0)',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const html = await response.text()

    // Buscar la versión en el HTML (esto puede cambiar si Google modifica su estructura)
    const versionMatch = html.match(/Current Version<\/span><span[^>]*>([^<]+)<\/span>/)

    if (versionMatch && versionMatch[1]) {
      return {
        version: versionMatch[1].trim(),
      }
    }

    return null
  } catch (error) {
    Logger.error(TAG, 'Error checking Play Store version:', error)
    return null
  }
}

/**
 * Verifica si hay actualizaciones disponibles usando tu propio backend
 * Esta es la opción más confiable para producción
 */
async function checkBackendVersion(): Promise<AppStoreVersionInfo | null> {
  try {
    // URL actualizada para usar Railway backend
    const response = await fetch('https://tucopwallet-production.up.railway.app/api/app-version', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': Platform.OS,
        'X-Bundle-ID': DeviceInfo.getBundleId(),
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return {
      version: data.latestVersion,
      releaseNotes: data.releaseNotes,
      minimumOsVersion: data.minimumOsVersion,
    }
  } catch (error) {
    Logger.error(TAG, 'Error checking backend version:', error)
    return null
  }
}

/**
 * Función principal para verificar actualizaciones
 */
export async function checkForAppUpdate(
  useBackend: boolean = false,
  minRequiredVersion?: string
): Promise<UpdateCheckResult> {
  const currentVersion = DeviceInfo.getVersion()

  Logger.info(TAG, `Checking for updates. Current version: ${currentVersion}`)

  try {
    let storeInfo: AppStoreVersionInfo | null = null
    let downloadUrl: string | undefined

    if (useBackend) {
      // Usar tu propio backend (recomendado para producción)
      storeInfo = await checkBackendVersion()

      // Determinar URLs de descarga basadas en la plataforma
      try {
        const systemName = DeviceInfo.getSystemName()

        if (systemName === 'iOS') {
          downloadUrl = 'https://apps.apple.com/app/tucop-wallet/id1234567890'
        } else {
          downloadUrl = 'https://play.google.com/store/apps/details?id=org.tucop'
        }
      } catch (error) {
        Logger.warn(TAG, 'Error getting system info for download URL', error)
        downloadUrl = 'https://play.google.com/store/apps/details?id=org.tucop'
      }
    } else {
      // Usar APIs de las tiendas directamente
      if (Platform.OS === 'ios') {
        storeInfo = await checkAppStoreVersion()
        downloadUrl = 'https://apps.apple.com/app/tucop-wallet/id1234567890' // Actualizar con ID real
      } else {
        storeInfo = await checkPlayStoreVersion()
        downloadUrl = 'https://play.google.com/store/apps/details?id=org.tucop'
      }
    }

    if (!storeInfo) {
      Logger.warn(TAG, 'Could not fetch store version information')
      return {
        hasUpdate: false,
        currentVersion,
        downloadUrl,
      }
    }

    const latestVersion = storeInfo.version
    const hasUpdate = compareVersion(currentVersion, latestVersion) < 0

    // Verificar si es una actualización forzada
    let isForced = false
    if (minRequiredVersion) {
      isForced = compareVersion(currentVersion, minRequiredVersion) < 0
    }

    Logger.info(
      TAG,
      `Update check result: hasUpdate=${hasUpdate}, isForced=${isForced}, latest=${latestVersion}`
    )

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      isForced,
      releaseNotes: storeInfo.releaseNotes,
      downloadUrl,
    }
  } catch (error) {
    Logger.error(TAG, 'Error during update check:', error)
    return {
      hasUpdate: false,
      currentVersion,
    }
  }
}

/**
 * Navegar a la tienda de aplicaciones correspondiente
 */
export function navigateToAppStore(): void {
  if (Platform.OS === 'ios') {
    // Actualizar con el ID real de App Store cuando esté disponible
    void Linking.openURL('https://apps.apple.com/app/tucop-wallet/id1234567890')
  } else {
    // URL correcta de Google Play Store para TuCOP
    void Linking.openURL('https://play.google.com/store/apps/details?id=org.tucop')
  }
}

/**
 * Muestra un diálogo de actualización al usuario
 */
export function showUpdateDialog(
  updateInfo: UpdateCheckResult,
  onUpdate?: () => void,
  onLater?: () => void
): void {
  const { isForced, latestVersion, releaseNotes } = updateInfo

  const title = isForced ? 'Actualización Requerida' : 'Actualización Disponible'
  const message = isForced
    ? `Se requiere actualizar a la versión ${latestVersion} para continuar usando la aplicación.`
    : `Hay una nueva versión ${latestVersion} disponible. ${releaseNotes ? `\n\n${releaseNotes}` : ''}`

  const buttons = isForced
    ? [
        {
          text: 'Actualizar Ahora',
          onPress: () => {
            onUpdate?.()
            navigateToAppStore()
          },
        },
      ]
    : [
        {
          text: 'Más Tarde',
          style: 'cancel' as const,
          onPress: onLater,
        },
        {
          text: 'Actualizar',
          onPress: () => {
            onUpdate?.()
            navigateToAppStore()
          },
        },
      ]

  Alert.alert(title, message, buttons, {
    cancelable: !isForced,
  })
}

/**
 * Hook para verificar actualizaciones automáticamente
 */
export async function performAutomaticUpdateCheck(
  minRequiredVersion?: string,
  useBackend: boolean = false,
  showDialogAutomatically: boolean = true
): Promise<UpdateCheckResult> {
  const updateInfo = await checkForAppUpdate(useBackend, minRequiredVersion)

  if (updateInfo.hasUpdate && showDialogAutomatically) {
    showUpdateDialog(updateInfo)
  }

  return updateInfo
}
