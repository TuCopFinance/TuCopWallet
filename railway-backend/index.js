const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const cron = require('node-cron')
const axios = require('axios')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Base de datos en memoria (en producción usar PostgreSQL de Railway)
let appVersions = {
  ios: {
    latestVersion: '1.101.0',
    minRequiredVersion: '1.95.0',
    releaseNotes: 'Mejoras de rendimiento y corrección de errores',
    downloadUrl: 'https://apps.apple.com/app/tucop-wallet/id1234567890',
    releaseDate: new Date().toISOString(),
    isForced: false,
  },
  android: {
    latestVersion: '1.101.0',
    minRequiredVersion: '1.95.0',
    releaseNotes: 'Mejoras de rendimiento y corrección de errores',
    downloadUrl: 'https://play.google.com/store/apps/details?id=org.tucop',
    releaseDate: new Date().toISOString(),
    isForced: false,
  },
}

// Configuración de GitHub
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_REPO || 'tu-usuario/tu-cop-wallet-2'

// Función para obtener la última versión desde GitHub
async function fetchLatestVersionFromGitHub() {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    const release = response.data
    const version = release.tag_name.replace(/^v/, '') // Remover 'v' del inicio si existe

    return {
      version,
      releaseNotes: release.body || 'Nueva versión disponible',
      releaseDate: release.published_at,
    }
  } catch (error) {
    console.error('Error fetching latest version from GitHub:', error.message)
    return null
  }
}

// Función para obtener versión desde package.json en GitHub
async function fetchVersionFromPackageJson() {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/package.json`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    const content = Buffer.from(response.data.content, 'base64').toString()
    const packageJson = JSON.parse(content)

    return packageJson.version
  } catch (error) {
    console.error('Error fetching version from package.json:', error.message)
    return null
  }
}

// Función para disparar build automático
async function triggerBuild(version) {
  try {
    await axios.post(
      `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
      {
        event_type: 'auto-build',
        client_payload: {
          version,
          timestamp: new Date().toISOString(),
        },
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    console.log(`Build triggered for version ${version}`)
    return true
  } catch (error) {
    console.error('Error triggering build:', error.message)
    return false
  }
}

// Rutas de la API

// Endpoint principal para verificar versiones (usado por la app)
app.get('/api/app-version', (req, res) => {
  const platform = req.headers['x-platform'] || 'android'
  const bundleId = req.headers['x-bundle-id']

  const versionInfo = appVersions[platform] || appVersions.android

  res.json({
    latestVersion: versionInfo.latestVersion,
    minRequiredVersion: versionInfo.minRequiredVersion,
    releaseNotes: versionInfo.releaseNotes,
    downloadUrl: versionInfo.downloadUrl,
    releaseDate: versionInfo.releaseDate,
    isForced: versionInfo.isForced,
    platform,
    bundleId,
  })
})

// Endpoint para obtener información detallada
app.get('/api/version-info', (req, res) => {
  res.json({
    versions: appVersions,
    lastUpdated: new Date().toISOString(),
    server: 'Railway',
    environment: process.env.NODE_ENV || 'production',
  })
})

// Endpoint para actualizar versiones manualmente (protegido)
app.post('/api/update-version', (req, res) => {
  const { platform, version, minRequired, releaseNotes, isForced, apiKey } = req.body

  // Verificar API key
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!platform || !version) {
    return res.status(400).json({ error: 'Platform and version are required' })
  }

  if (!appVersions[platform]) {
    appVersions[platform] = {}
  }

  appVersions[platform] = {
    ...appVersions[platform],
    latestVersion: version,
    minRequiredVersion: minRequired || appVersions[platform].minRequiredVersion,
    releaseNotes: releaseNotes || appVersions[platform].releaseNotes,
    isForced: isForced !== undefined ? isForced : appVersions[platform].isForced,
    releaseDate: new Date().toISOString(),
  }

  res.json({
    success: true,
    platform,
    updatedVersion: appVersions[platform],
  })
})

// Webhook para recibir eventos de GitHub
app.post('/api/github-webhook', async (req, res) => {
  const event = req.headers['x-github-event']
  const payload = req.body

  console.log(`Received GitHub event: ${event}`)

  try {
    if (event === 'push' && payload.ref === 'refs/heads/main') {
      // Push a main branch - verificar si cambió la versión
      const newVersion = await fetchVersionFromPackageJson()

      if (newVersion && newVersion !== appVersions.android.latestVersion) {
        console.log(`New version detected: ${newVersion}`)

        // Actualizar versiones
        appVersions.android.latestVersion = newVersion
        appVersions.ios.latestVersion = newVersion
        appVersions.android.releaseDate = new Date().toISOString()
        appVersions.ios.releaseDate = new Date().toISOString()

        // Disparar build automático
        await triggerBuild(newVersion)
      }
    } else if (event === 'release' && payload.action === 'published') {
      // Nueva release publicada
      const release = payload.release
      const version = release.tag_name.replace(/^v/, '')

      console.log(`New release published: ${version}`)

      // Actualizar versiones
      appVersions.android.latestVersion = version
      appVersions.ios.latestVersion = version
      appVersions.android.releaseNotes = release.body || 'Nueva versión disponible'
      appVersions.ios.releaseNotes = release.body || 'Nueva versión disponible'
      appVersions.android.releaseDate = release.published_at
      appVersions.ios.releaseDate = release.published_at
    } else if (event === 'repository_dispatch' && payload.action === 'auto-build') {
      // Build automático disparado
      console.log('Auto-build triggered:', payload.client_payload)
    }

    res.status(200).json({ success: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    versions: Object.keys(appVersions).reduce((acc, platform) => {
      acc[platform] = appVersions[platform].latestVersion
      return acc
    }, {}),
  })
})

// Tarea programada para verificar nuevas versiones cada hora
cron.schedule('0 * * * *', async () => {
  console.log('Checking for new versions...')

  const latestFromGitHub = await fetchLatestVersionFromGitHub()
  if (latestFromGitHub && latestFromGitHub.version !== appVersions.android.latestVersion) {
    console.log(`Updating to version ${latestFromGitHub.version} from GitHub releases`)

    appVersions.android.latestVersion = latestFromGitHub.version
    appVersions.ios.latestVersion = latestFromGitHub.version
    appVersions.android.releaseNotes = latestFromGitHub.releaseNotes
    appVersions.ios.releaseNotes = latestFromGitHub.releaseNotes
    appVersions.android.releaseDate = latestFromGitHub.releaseDate
    appVersions.ios.releaseDate = latestFromGitHub.releaseDate
  }
})

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Tu Cop Wallet Version API running on port ${PORT}`)
  console.log(
    `📱 Serving versions for iOS: ${appVersions.ios.latestVersion}, Android: ${appVersions.android.latestVersion}`
  )
})

module.exports = app
