// Script de prueba para verificar el sistema de actualizaciones
const fetch = require('node-fetch')

async function testUpdateChecker() {
  console.log('🧪 Testing update checker...')

  try {
    const response = await fetch('https://tucopwallet-production.up.railway.app/api/app-version', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': 'ios',
        'X-Bundle-ID': 'org.tucop',
        'X-App-Version': '1.104.0',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    console.log('📊 Backend response:')
    console.log('  Current version: 1.104.0')
    console.log('  Latest version:', data.latestVersion)
    console.log('  Requires update:', data.requiresUpdate)
    console.log('  Is forced:', data.isForced)
    console.log('  Download URL:', data.downloadUrl)
    console.log('  Release notes:', data.releaseNotes)

    if (data.requiresUpdate) {
      console.log('✅ Update detection working correctly!')
    } else {
      console.log('❌ Update detection not working')
    }
  } catch (error) {
    console.error('💥 Error testing update checker:', error)
  }
}

testUpdateChecker()
