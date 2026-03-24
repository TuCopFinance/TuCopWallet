const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
const cron = require('node-cron')
const axios = require('axios')
const { PrismaClient } = require('@prisma/client')
require('dotenv').config()

// Importar servicios y middleware
const versionService = require('./src/services/versionService')
const authUtils = require('./src/utils/auth')
const { requireApiKey } = require('./src/middleware/auth')
const { requestLogger, cleanOldLogs } = require('./src/middleware/logging')
const {
  updateVersionValidation,
  platformHeaderValidation,
  createApiKeyValidation,
  handleValidationErrors,
  sanitizeVersion,
} = require('./src/validators/version')

const app = express()
const PORT = process.env.PORT || 3000
const prisma = new PrismaClient()

// Configuración de rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por ventana por IP
  message: {
    error: 'Too many requests from this IP',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // máximo 10 requests por ventana para endpoints sensibles
  message: {
    error: 'Too many requests to sensitive endpoint',
    code: 'RATE_LIMIT_EXCEEDED',
  },
})

// Middleware básico
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
)

app.use(compression())
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  })
)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Trust proxy para obtener IPs reales en Railway
app.set('trust proxy', 1)

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'))
  app.use(requestLogger)
}

// Rate limiting
app.use('/api/', limiter)

// Configuración de GitHub
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_REPO || 'tu-usuario/tu-cop-wallet-2'

// Funciones de GitHub (mantenidas del archivo original)
async function fetchLatestVersionFromGitHub() {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: 10000,
      }
    )

    const release = response.data
    const version = release.tag_name.replace(/^v/, '')

    return {
      version: sanitizeVersion(version),
      releaseNotes: release.body || 'Nueva versión disponible',
      releaseDate: release.published_at,
    }
  } catch (error) {
    console.error('Error fetching latest version from GitHub:', error.message)
    return null
  }
}

async function fetchVersionFromPackageJson() {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/package.json`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: 10000,
      }
    )

    const content = Buffer.from(response.data.content, 'base64').toString()
    const packageJson = JSON.parse(content)

    return sanitizeVersion(packageJson.version)
  } catch (error) {
    console.error('Error fetching version from package.json:', error.message)
    return null
  }
}

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
        timeout: 10000,
      }
    )

    console.log(`Build triggered for version ${version}`)
    return true
  } catch (error) {
    console.error('Error triggering build:', error.message)
    return false
  }
}

// ================================
// RUTAS DE LA API
// ================================

/**
 * Endpoint principal para verificar versiones (público)
 */
app.get('/api/app-version', platformHeaderValidation, handleValidationErrors, async (req, res) => {
  try {
    const platform = req.headers['x-platform'] || 'android'
    const bundleId = req.headers['x-bundle-id']
    const currentVersion = req.headers['x-app-version']

    const versionInfo = await versionService.getVersionInfo(platform)

    if (!versionInfo) {
      return res.status(404).json({
        error: 'Version information not found for platform',
        code: 'VERSION_NOT_FOUND',
        platform,
      })
    }

    // Determinar si requiere actualización forzada
    const requiresForceUpdate = currentVersion
      ? versionService.requiresForceUpdate(currentVersion, versionInfo.minRequiredVersion)
      : false

    res.json({
      latestVersion: versionInfo.latestVersion,
      minRequiredVersion: versionInfo.minRequiredVersion,
      releaseNotes: versionInfo.releaseNotes,
      downloadUrl: versionInfo.downloadUrl,
      releaseDate: versionInfo.releaseDate,
      isForced: versionInfo.isForced || requiresForceUpdate,
      requiresUpdate: currentVersion
        ? versionService.compareVersions(currentVersion, versionInfo.latestVersion) < 0
        : true,
      platform,
      bundleId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error in app-version endpoint:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  }
})

/**
 * Endpoint para obtener información detallada (público)
 */
app.get('/api/version-info', async (req, res) => {
  try {
    const versions = await versionService.getAllVersions()

    const formattedVersions = {}
    versions.forEach((version) => {
      formattedVersions[version.platform] = {
        latestVersion: version.latestVersion,
        minRequiredVersion: version.minRequiredVersion,
        releaseNotes: version.releaseNotes,
        downloadUrl: version.downloadUrl,
        releaseDate: version.releaseDate,
        isForced: version.isForced,
        lastUpdated: version.updatedAt,
      }
    })

    res.json({
      versions: formattedVersions,
      lastUpdated: new Date().toISOString(),
      server: 'Railway',
      environment: process.env.NODE_ENV || 'production',
      totalPlatforms: versions.length,
    })
  } catch (error) {
    console.error('Error in version-info endpoint:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  }
})

/**
 * Endpoint para actualizar versiones (protegido)
 */
app.post(
  '/api/update-version',
  strictLimiter,
  requireApiKey,
  updateVersionValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { platform, version, minRequired, releaseNotes, isForced, downloadUrl } = req.body

      const versionData = {
        latestVersion: sanitizeVersion(version),
        ...(minRequired && { minRequiredVersion: sanitizeVersion(minRequired) }),
        ...(releaseNotes !== undefined && { releaseNotes }),
        ...(downloadUrl && { downloadUrl }),
        ...(isForced !== undefined && { isForced }),
      }

      const updatedVersion = await versionService.updateVersion(platform, versionData)

      console.log(`Version updated for ${platform}:`, updatedVersion.latestVersion)

      res.json({
        success: true,
        platform,
        updatedVersion: {
          latestVersion: updatedVersion.latestVersion,
          minRequiredVersion: updatedVersion.minRequiredVersion,
          releaseNotes: updatedVersion.releaseNotes,
          downloadUrl: updatedVersion.downloadUrl,
          isForced: updatedVersion.isForced,
          releaseDate: updatedVersion.releaseDate,
        },
      })
    } catch (error) {
      console.error('Error updating version:', error)
      res.status(500).json({
        error: 'Failed to update version',
        code: 'UPDATE_ERROR',
      })
    }
  }
)

/**
 * Endpoint para crear API keys (súper protegido)
 */
app.post(
  '/api/admin/create-api-key',
  strictLimiter,
  requireApiKey,
  createApiKeyValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, apiKey, expiresAt } = req.body

      const createdKey = await authUtils.createApiKey(
        name,
        apiKey,
        expiresAt ? new Date(expiresAt) : null
      )

      res.json({
        success: true,
        apiKey: {
          id: createdKey.id,
          name: createdKey.name,
          createdAt: createdKey.createdAt,
          expiresAt: createdKey.expiresAt,
        },
      })
    } catch (error) {
      console.error('Error creating API key:', error)
      res.status(500).json({
        error: 'Failed to create API key',
        code: 'CREATE_KEY_ERROR',
      })
    }
  }
)

/**
 * Endpoint para listar API keys (protegido)
 */
app.get('/api/admin/api-keys', requireApiKey, async (req, res) => {
  try {
    const apiKeys = await authUtils.listApiKeys()
    res.json({ apiKeys })
  } catch (error) {
    console.error('Error listing API keys:', error)
    res.status(500).json({
      error: 'Failed to list API keys',
      code: 'LIST_KEYS_ERROR',
    })
  }
})

/**
 * Webhook para eventos de GitHub
 */
app.post('/api/github-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = req.headers['x-github-event']
    const payload = JSON.parse(req.body.toString())

    console.log(`Received GitHub event: ${event}`)

    // Registrar el webhook event
    await prisma.webhookEvent.create({
      data: {
        eventType: event,
        payload,
      },
    })

    if (event === 'push' && payload.ref === 'refs/heads/main') {
      const newVersion = await fetchVersionFromPackageJson()

      if (newVersion) {
        const currentAndroid = await versionService.getVersionInfo('android')

        if (!currentAndroid || newVersion !== currentAndroid.latestVersion) {
          console.log(`New version detected: ${newVersion}`)

          await Promise.all([
            versionService.updateVersion('android', { latestVersion: newVersion }),
            versionService.updateVersion('ios', { latestVersion: newVersion }),
          ])

          await triggerBuild(newVersion)
        }
      }
    } else if (event === 'release' && payload.action === 'published') {
      const release = payload.release
      const version = sanitizeVersion(release.tag_name.replace(/^v/, ''))

      console.log(`New release published: ${version}`)

      const updateData = {
        latestVersion: version,
        releaseNotes: release.body || 'Nueva versión disponible',
        releaseDate: new Date(release.published_at),
      }

      await Promise.all([
        versionService.updateVersion('android', updateData),
        versionService.updateVersion('ios', updateData),
      ])
    }

    res.status(200).json({ success: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * Health check
 */
app.get('/health', async (req, res) => {
  try {
    // Verificar conexión a la base de datos
    await prisma.$queryRaw`SELECT 1`

    const versions = await versionService.getAllVersions()
    const versionMap = {}
    versions.forEach((v) => {
      versionMap[v.platform] = v.latestVersion
    })

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      versions: versionMap,
      database: 'connected',
      environment: process.env.NODE_ENV || 'production',
    })
  } catch (error) {
    console.error('Health check failed:', error)
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
    })
  }
})

/**
 * 404 handler
 */
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl,
  })
})

/**
 * Error handler global
 */
app.use((error, req, res, _next) => {
  console.error('Unhandled error:', error)
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  })
})

// ================================
// TAREAS PROGRAMADAS
// ================================

// Verificar nuevas versiones cada hora
cron.schedule('0 * * * *', async () => {
  console.log('🔍 Checking for new versions...')

  try {
    const latestFromGitHub = await fetchLatestVersionFromGitHub()
    if (latestFromGitHub) {
      const currentAndroid = await versionService.getVersionInfo('android')

      if (!currentAndroid || latestFromGitHub.version !== currentAndroid.latestVersion) {
        console.log(`📦 Updating to version ${latestFromGitHub.version} from GitHub releases`)

        const updateData = {
          latestVersion: latestFromGitHub.version,
          releaseNotes: latestFromGitHub.releaseNotes,
          releaseDate: new Date(latestFromGitHub.releaseDate),
        }

        await Promise.all([
          versionService.updateVersion('android', updateData),
          versionService.updateVersion('ios', updateData),
        ])
      }
    }
  } catch (error) {
    console.error('Error in scheduled version check:', error)
  }
})

// Limpiar logs antiguos cada día a las 2 AM
cron.schedule('0 2 * * *', () => {
  console.log('🧹 Cleaning old logs...')
  void cleanOldLogs(30) // Mantener logs por 30 días
})

// ================================
// INICIALIZACIÓN
// ================================

async function initializeServer() {
  try {
    // Conectar a la base de datos
    await prisma.$connect()
    console.log('✅ Database connected')

    // Inicializar versiones por defecto
    await versionService.initializeDefaultVersions()

    // Iniciar el servidor
    app.listen(PORT, () => {
      console.log(`🚀 Tu Cop Wallet Version API running on port ${PORT}`)
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'production'}`)
      console.log(`🔒 API authentication: ${process.env.API_KEY ? 'enabled' : 'disabled'}`)

      // Log de versiones actuales
      void versionService
        .getAllVersions()
        .then((versions) => {
          versions.forEach((v) => {
            console.log(`📱 ${v.platform.toUpperCase()}: ${v.latestVersion}`)
          })
        })
        .catch((error) => {
          console.error('Error getting versions for startup log:', error)
        })
    })
  } catch (error) {
    console.error('❌ Failed to initialize server:', error)
    process.exit(1)
  }
}

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

// Inicializar el servidor
if (require.main === module) {
  void initializeServer()
}

module.exports = app
