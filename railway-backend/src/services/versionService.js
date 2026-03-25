const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/**
 * Obtiene la información de versión para una plataforma específica
 * @param {string} platform - 'ios' o 'android'
 * @returns {Promise<Object|null>} - Información de la versión
 */
async function getVersionInfo(platform) {
  try {
    const versionInfo = await prisma.appVersion.findUnique({
      where: { platform },
    })
    return versionInfo
  } catch (error) {
    console.error(`Error getting version info for ${platform}:`, error)
    return null
  }
}

/**
 * Obtiene información de versiones para todas las plataformas
 * @returns {Promise<Array>} - Array con información de todas las versiones
 */
async function getAllVersions() {
  try {
    const versions = await prisma.appVersion.findMany({
      orderBy: { updatedAt: 'desc' },
    })
    return versions
  } catch (error) {
    console.error('Error getting all versions:', error)
    return []
  }
}

/**
 * Actualiza o crea información de versión para una plataforma
 * @param {string} platform - 'ios' o 'android'
 * @param {Object} versionData - Datos de la versión a actualizar
 * @returns {Promise<Object>} - Versión actualizada
 */
async function updateVersion(platform, versionData) {
  try {
    const { latestVersion, minRequiredVersion, releaseNotes, downloadUrl, isForced, releaseDate } =
      versionData

    const updatedVersion = await prisma.appVersion.upsert({
      where: { platform },
      update: {
        ...(latestVersion && { latestVersion }),
        ...(minRequiredVersion && { minRequiredVersion }),
        ...(releaseNotes !== undefined && { releaseNotes }),
        ...(downloadUrl && { downloadUrl }),
        ...(isForced !== undefined && { isForced }),
        ...(releaseDate && { releaseDate: new Date(releaseDate) }),
      },
      create: {
        platform,
        latestVersion: latestVersion || '1.0.0',
        minRequiredVersion: minRequiredVersion || '1.0.0',
        releaseNotes: releaseNotes || 'Nueva versión disponible',
        downloadUrl: downloadUrl || getDefaultDownloadUrl(platform),
        isForced: isForced || false,
        releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
      },
    })

    return updatedVersion
  } catch (error) {
    console.error(`Error updating version for ${platform}:`, error)
    throw error
  }
}

/**
 * Inicializa las versiones por defecto si no existen
 * @returns {Promise<void>}
 */
async function initializeDefaultVersions() {
  try {
    const defaultVersions = [
      {
        platform: 'ios',
        latestVersion: '1.104.0',
        minRequiredVersion: '1.95.0',
        releaseNotes: 'Actualización con correcciones de WalletConnect y mejoras de sistema',
        downloadUrl: 'https://apps.apple.com/app/id6742667119',
        isForced: false,
      },
      {
        platform: 'android',
        latestVersion: '1.104.0',
        minRequiredVersion: '1.95.0',
        releaseNotes: 'Actualización con correcciones de WalletConnect y mejoras de sistema',
        downloadUrl: 'https://play.google.com/store/apps/details?id=org.tucop',
        isForced: false,
      },
    ]

    for (const versionData of defaultVersions) {
      await prisma.appVersion.upsert({
        where: { platform: versionData.platform },
        update: {},
        create: versionData,
      })
    }

    console.log('✅ Default versions initialized')
  } catch (error) {
    console.error('Error initializing default versions:', error)
  }
}

/**
 * Obtiene la URL de descarga por defecto para una plataforma
 * @param {string} platform - 'ios' o 'android'
 * @returns {string} - URL de descarga
 */
function getDefaultDownloadUrl(platform) {
  const urls = {
    ios: 'https://apps.apple.com/app/id6742667119',
    android: 'https://play.google.com/store/apps/details?id=org.tucop',
  }
  return urls[platform] || urls.android
}

/**
 * Compara dos versiones para determinar si una es mayor que otra
 * @param {string} version1 - Primera versión (ej: "1.2.3")
 * @param {string} version2 - Segunda versión (ej: "1.2.4")
 * @returns {number} - -1 si version1 < version2, 0 si son iguales, 1 si version1 > version2
 */
function compareVersions(version1, version2) {
  const v1Parts = version1.split('.').map(Number)
  const v2Parts = version2.split('.').map(Number)

  const maxLength = Math.max(v1Parts.length, v2Parts.length)

  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0
    const v2Part = v2Parts[i] || 0

    if (v1Part < v2Part) return -1
    if (v1Part > v2Part) return 1
  }

  return 0
}

/**
 * Verifica si una versión requiere actualización forzada
 * @param {string} currentVersion - Versión actual del usuario
 * @param {string} minRequiredVersion - Versión mínima requerida
 * @returns {boolean} - true si requiere actualización forzada
 */
function requiresForceUpdate(currentVersion, minRequiredVersion) {
  return compareVersions(currentVersion, minRequiredVersion) < 0
}

module.exports = {
  getVersionInfo,
  getAllVersions,
  updateVersion,
  initializeDefaultVersions,
  getDefaultDownloadUrl,
  compareVersions,
  requiresForceUpdate,
}
