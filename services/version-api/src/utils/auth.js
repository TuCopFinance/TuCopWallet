const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

/**
 * Genera un hash seguro para una API key
 * @param {string} apiKey - La API key en texto plano
 * @returns {Promise<string>} - La API key hasheada
 */
async function hashApiKey(apiKey) {
  const saltRounds = 12
  return await bcrypt.hash(apiKey, saltRounds)
}

/**
 * Verifica si una API key es válida
 * @param {string} apiKey - La API key a verificar
 * @returns {Promise<boolean>} - true si es válida, false si no
 */
async function validateApiKey(apiKey) {
  if (!apiKey) {
    return false
  }

  try {
    // Buscar todas las API keys activas
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    })

    // Verificar la API key contra cada hash en la base de datos
    for (const storedKey of apiKeys) {
      const isValid = await bcrypt.compare(apiKey, storedKey.hashedKey)
      if (isValid) {
        // Actualizar la fecha de último uso
        await prisma.apiKey.update({
          where: { id: storedKey.id },
          data: { lastUsedAt: new Date() },
        })
        return true
      }
    }

    return false
  } catch (error) {
    console.error('Error validating API key:', error)
    return false
  }
}

/**
 * Crea una nueva API key en la base de datos
 * @param {string} name - Nombre descriptivo para la API key
 * @param {string} apiKey - La API key en texto plano
 * @param {Date|null} expiresAt - Fecha de expiración opcional
 * @returns {Promise<Object>} - La API key creada
 */
async function createApiKey(name, apiKey, expiresAt = null) {
  const hashedKey = await hashApiKey(apiKey)

  return await prisma.apiKey.create({
    data: {
      name,
      hashedKey,
      expiresAt,
    },
  })
}

/**
 * Desactiva una API key
 * @param {string} id - ID de la API key a desactivar
 * @returns {Promise<Object>} - La API key actualizada
 */
async function deactivateApiKey(id) {
  return await prisma.apiKey.update({
    where: { id },
    data: { isActive: false },
  })
}

/**
 * Lista todas las API keys (sin mostrar el hash)
 * @returns {Promise<Array>} - Lista de API keys
 */
async function listApiKeys() {
  return await prisma.apiKey.findMany({
    select: {
      id: true,
      name: true,
      isActive: true,
      lastUsedAt: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

module.exports = {
  hashApiKey,
  validateApiKey,
  createApiKey,
  deactivateApiKey,
  listApiKeys,
}
