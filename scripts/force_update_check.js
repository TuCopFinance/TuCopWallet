// Script para forzar una verificación de actualización
// Este script simula eliminar el timestamp de la última verificación

const AsyncStorage = require('@react-native-async-storage/async-storage')

async function forceUpdateCheck() {
  try {
    console.log('🔄 Forcing update check by clearing last check timestamp...')

    // Eliminar el timestamp de la última verificación
    await AsyncStorage.removeItem('lastUpdateCheckTimestamp')

    console.log('✅ Last update check timestamp cleared')
    console.log('📱 Next app launch should trigger update check')
  } catch (error) {
    console.error('💥 Error clearing timestamp:', error)
  }
}

// Solo para referencia - este script no se puede ejecutar directamente
// porque AsyncStorage solo funciona en React Native
console.log('📝 This is a reference script for React Native AsyncStorage operations')
console.log('📝 To force update check, clear AsyncStorage key: "lastUpdateCheckTimestamp"')
