#!/usr/bin/env node

/**
 * Script de inicialización para TuCOP Wallet Version API
 * Este script configura la primera API key y inicializa la base de datos
 */

const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const { createApiKey } = require('../src/utils/auth')

const prisma = new PrismaClient()

async function generateSecureApiKey() {
  return crypto.randomBytes(32).toString('hex')
}

async function setup() {
  try {
    console.log('🚀 Iniciando configuración de TuCOP Wallet Version API...\n')

    // Verificar conexión a la base de datos
    console.log('📡 Verificando conexión a la base de datos...')
    await prisma.$connect()
    console.log('✅ Conexión exitosa a la base de datos\n')

    // Verificar si ya existen API keys
    const existingKeys = await prisma.apiKey.findMany()

    if (existingKeys.length > 0) {
      console.log('⚠️  Ya existen API keys en la base de datos:')
      existingKeys.forEach((key, index) => {
        console.log(`   ${index + 1}. ${key.name} (${key.isActive ? 'Activa' : 'Inactiva'})`)
      })

      const readline = require('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const createNew = await new Promise((resolve) => {
        rl.question('\n¿Deseas crear una nueva API key? (y/N): ', (answer) => {
          rl.close()
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
        })
      })

      if (!createNew) {
        console.log('❌ Configuración cancelada')
        await prisma.$disconnect()
        process.exit(0)
      }
    }

    // Generar nueva API key
    console.log('🔑 Generando nueva API key...')
    const apiKey = await generateSecureApiKey()
    const keyName = 'Initial Admin Key'

    // Crear la API key en la base de datos
    await createApiKey(keyName, apiKey)

    console.log('✅ API key creada exitosamente!\n')
    console.log('🔐 INFORMACIÓN DE AUTENTICACIÓN:')
    console.log('================================')
    console.log(`Nombre: ${keyName}`)
    console.log(`API Key: ${apiKey}`)
    console.log('================================\n')

    console.log('⚠️  IMPORTANTE:')
    console.log('   - Guarda esta API key en un lugar seguro')
    console.log('   - No la compartas y no la subas a repositorios')
    console.log('   - Úsala en el header "x-api-key" para autenticarte')
    console.log('   - También puedes usarla como variable de entorno API_KEY\n')

    // Verificar versiones por defecto
    console.log('📱 Inicializando versiones por defecto...')
    const versionService = require('../src/services/versionService')
    await versionService.initializeDefaultVersions()

    const versions = await versionService.getAllVersions()
    console.log('✅ Versiones inicializadas:')
    versions.forEach((v) => {
      console.log(`   📱 ${v.platform.toUpperCase()}: ${v.latestVersion}`)
    })

    console.log('\n🎉 ¡Configuración completada exitosamente!')
    console.log('\n🚀 Para iniciar el servidor ejecuta:')
    console.log('   npm start')
    console.log('\n📚 Endpoints disponibles:')
    console.log('   GET  /health                    - Health check')
    console.log('   GET  /api/app-version          - Verificar versiones (público)')
    console.log('   GET  /api/version-info         - Información detallada (público)')
    console.log('   POST /api/update-version       - Actualizar versión (requiere API key)')
    console.log('   POST /api/admin/create-api-key - Crear nueva API key (requiere API key)')
    console.log('   GET  /api/admin/api-keys       - Listar API keys (requiere API key)\n')
  } catch (error) {
    console.error('❌ Error durante la configuración:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Ejecutar el setup si se llama directamente
if (require.main === module) {
  void setup()
}

module.exports = { setup }
