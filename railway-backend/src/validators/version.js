const { body, header, validationResult } = require('express-validator')

/**
 * Validaciones para el endpoint de actualización de versión
 */
const updateVersionValidation = [
  body('platform')
    .isIn(['ios', 'android'])
    .withMessage('Platform must be either "ios" or "android"'),

  body('version')
    .matches(/^\d+\.\d+\.\d+$/)
    .withMessage('Version must be in format x.y.z (e.g., 1.2.3)'),

  body('minRequired')
    .optional()
    .matches(/^\d+\.\d+\.\d+$/)
    .withMessage('Min required version must be in format x.y.z'),

  body('releaseNotes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Release notes must be less than 1000 characters'),

  body('isForced').optional().isBoolean().withMessage('isForced must be a boolean'),

  body('downloadUrl').optional().isURL().withMessage('Download URL must be a valid URL'),
]

/**
 * Validaciones para headers de plataforma
 */
const platformHeaderValidation = [
  header('x-platform')
    .optional()
    .isIn(['ios', 'android'])
    .withMessage('x-platform header must be either "ios" or "android"'),
]

/**
 * Validaciones para crear API key
 */
const createApiKeyValidation = [
  body('name')
    .isLength({ min: 3, max: 100 })
    .withMessage('API key name must be between 3 and 100 characters'),

  body('apiKey').isLength({ min: 32 }).withMessage('API key must be at least 32 characters long'),

  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiration date must be a valid ISO 8601 date'),
]

/**
 * Middleware para manejar errores de validación
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array(),
    })
  }

  next()
}

/**
 * Sanitiza la entrada de versión para evitar injection
 */
const sanitizeVersion = (version) => {
  // Remover caracteres no válidos y mantener solo números y puntos
  return version.replace(/[^0-9.]/g, '')
}

/**
 * Valida que una versión sea mayor que otra
 */
const validateVersionOrder = (newVersion, currentVersion) => {
  const parseVersion = (v) => v.split('.').map(Number)
  const newV = parseVersion(newVersion)
  const currentV = parseVersion(currentVersion)

  for (let i = 0; i < Math.max(newV.length, currentV.length); i++) {
    const newPart = newV[i] || 0
    const currentPart = currentV[i] || 0

    if (newPart > currentPart) return true
    if (newPart < currentPart) return false
  }

  return false // Son iguales
}

module.exports = {
  updateVersionValidation,
  platformHeaderValidation,
  createApiKeyValidation,
  handleValidationErrors,
  sanitizeVersion,
  validateVersionOrder,
}
