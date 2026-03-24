const { validateApiKey } = require('../utils/auth')

/**
 * Middleware para validar API keys en rutas protegidas
 */
const requireApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.body.apiKey || req.query.apiKey

    if (!apiKey) {
      return res.status(401).json({
        error: 'API key is required',
        code: 'MISSING_API_KEY',
      })
    }

    const isValid = await validateApiKey(apiKey)

    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid or expired API key',
        code: 'INVALID_API_KEY',
      })
    }

    // Si llegamos aquí, la API key es válida
    next()
  } catch (error) {
    console.error('Error in API key validation middleware:', error)
    return res.status(500).json({
      error: 'Internal server error during authentication',
      code: 'AUTH_ERROR',
    })
  }
}

/**
 * Middleware opcional para validar API key si está presente
 */
const optionalApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.body.apiKey || req.query.apiKey

    if (apiKey) {
      const isValid = await validateApiKey(apiKey)
      req.isAuthenticated = isValid
    } else {
      req.isAuthenticated = false
    }

    next()
  } catch (error) {
    console.error('Error in optional API key validation:', error)
    req.isAuthenticated = false
    next()
  }
}

module.exports = {
  requireApiKey,
  optionalApiKey,
}
