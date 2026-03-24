const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/**
 * Middleware para registrar todas las peticiones en la base de datos
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now()

  // Obtener información de la petición
  const requestInfo = {
    method: req.method,
    endpoint: req.originalUrl || req.url,
    platform: req.headers['x-platform'] || null,
    userAgent: req.headers['user-agent'] || null,
    ipAddress: req.ip || req.connection.remoteAddress || null,
  }

  // Override del res.end para capturar el tiempo de respuesta y código de estado
  const originalEnd = res.end
  res.end = function (...args) {
    const responseTime = Date.now() - startTime
    const statusCode = res.statusCode

    // Registrar en la base de datos de forma asíncrona (no bloquear la respuesta)
    setImmediate(async () => {
      try {
        await prisma.requestLog.create({
          data: {
            ...requestInfo,
            responseTime,
            statusCode,
          },
        })
      } catch (error) {
        console.error('Error logging request:', error)
      }
    })

    // Llamar al método original
    originalEnd.apply(this, args)
  }

  next()
}

/**
 * Middleware para limpiar logs antiguos (llamar periódicamente)
 */
const cleanOldLogs = async (daysToKeep = 30) => {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const deletedCount = await prisma.requestLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    })

    console.log(`🧹 Cleaned ${deletedCount.count} old request logs`)
  } catch (error) {
    console.error('Error cleaning old logs:', error)
  }
}

module.exports = {
  requestLogger,
  cleanOldLogs,
}
