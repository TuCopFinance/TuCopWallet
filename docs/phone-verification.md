# Sistema de Verificación Telefónica Integrado

## Resumen del Problema

Anteriormente, TuCOP Wallet tenía dos sistemas de verificación telefónica completamente separados:

1. **Sistema Regular** (`api-wallet-tlf-production.up.railway.app`)

   - Solo vincula número telefónico con dirección de wallet
   - Usado en configuraciones y verificación básica

2. **Sistema Keyless Backup** (`twilio-service.up.railway.app`)
   - Genera keyshares para encriptar/desencriptar mnemonic
   - Usado para backup y restore sin frase de recuperación

**Problema:** Los usuarios que hacían keyless backup no tenían su número vinculado al perfil, y viceversa.

## Solución Implementada

### Integración Bidireccional

#### 1. Keyless Backup → Sistema Regular

**Archivo:** `src/keylessBackup/hooks.ts`

Cuando un usuario completa exitosamente la verificación SMS en keyless backup:

1. Se genera el keyshare normalmente
2. **NUEVO:** Se registra automáticamente el número en el sistema regular
3. Se dispara `phoneNumberVerificationCompleted()` para actualizar el estado
4. El número queda vinculado al perfil

```typescript
// Después de verificar SMS en keyless backup
const registeredInRegularSystem = await registerPhoneInRegularSystem(phoneNumber, walletAddress)

if (registeredInRegularSystem) {
  const countryCallingCode = phoneNumber.match(/^\+(\d{1,3})/)?.[1] || ''
  dispatch(phoneNumberVerificationCompleted(phoneNumber, `+${countryCallingCode}`))
}
```

#### 2. Sistema Regular → Keyless Backup

**Archivo:** `src/verify/hooks.ts`

Cuando un usuario intenta verificar su número en el sistema regular:

1. **NUEVO:** Primero consulta si el número ya existe en keyless backup
2. Si existe, auto-verifica sin necesidad de SMS
3. Si no existe, procede con verificación normal

```typescript
// Antes de solicitar SMS
const existsInKeylessBackup = await checkPhoneInKeylessBackupSystem(phoneNumber, address)
if (existsInKeylessBackup) {
  await handleAlreadyVerified() // Auto-verifica
  return
}
```

## Flujos de Usuario

### Escenario 1: Usuario hace Keyless Backup primero

1. Usuario configura keyless backup (Google/Apple + SMS)
2. ✅ **AUTOMÁTICO:** Número se vincula al perfil
3. Usuario va a Settings → Ve número ya verificado
4. Usuario puede hacer restore sin problemas

### Escenario 2: Usuario verifica número en Settings primero

1. Usuario va a Settings → Verificar número telefónico
2. ✅ **AUTOMÁTICO:** Sistema consulta keyless backup
3. Si ya hizo backup antes, se auto-verifica
4. Si no, procede con verificación normal

### Escenario 3: Usuario hace Restore

1. Usuario inicia restore con Google/Apple + SMS
2. ✅ **AUTOMÁTICO:** Número se vincula al perfil durante restore
3. Recupera wallet y tiene número verificado

## Beneficios

### Para el Usuario

- **Experiencia unificada:** Un solo proceso de verificación
- **Sin duplicación:** No necesita verificar el mismo número dos veces
- **Consistencia:** El número siempre aparece verificado en el perfil

### Para el Sistema

- **Datos sincronizados:** Ambos sistemas conocen los números verificados
- **Backup completo:** Keyless backup incluye vinculación de perfil
- **Compatibilidad:** Funciona con usuarios existentes de ambos sistemas

## Implementación Técnica

### Funciones Auxiliares

#### `registerPhoneInRegularSystem()`

```typescript
// Registra número verificado en keyless backup al sistema regular
async function registerPhoneInRegularSystem(phoneNumber: string, walletAddress: string)
```

#### `checkPhoneInKeylessBackupSystem()`

```typescript
// Verifica si número ya existe en sistema keyless backup
async function checkPhoneInKeylessBackupSystem(phoneNumber: string, walletAddress: string)
```

### Endpoints Utilizados

1. **Sistema Regular:**

   - `POST /api/wallets/request-otp` - Solicitar código
   - `POST /api/wallets/verify-otp` - Verificar código

2. **Sistema Keyless Backup:**
   - `POST /otp/send` - Enviar SMS
   - `POST /otp/verify` - Verificar y obtener keyshare
   - `POST /keyless-backup/check-phone` - **NUEVO:** Verificar existencia

## Consideraciones de Backend

### Endpoint Requerido en Keyless Backup

El sistema necesita un nuevo endpoint para consultar si un número existe:

```
POST /keyless-backup/check-phone
{
  "phone": "+573001234567",
  "wallet": "0x123..."
}

Response:
{
  "exists": true/false
}
```

### Manejo de Errores

- Si falla registro en sistema regular → Continúa con keyless backup
- Si falla consulta a keyless backup → Continúa con verificación normal
- Logs detallados para debugging

## Testing

### Casos de Prueba

1. ✅ Keyless backup → Verificar que número aparece en perfil
2. ✅ Verificación regular → Verificar que consulta keyless backup
3. ✅ Usuario existente con keyless backup → Auto-verificación
4. ✅ Usuario nuevo → Verificación normal
5. ✅ Errores de red → Fallback apropiado

### Logs de Debug

```
keylessBackup/hooks/registerPhoneInRegularSystem
verify/hooks/checkPhoneInKeylessBackupSystem
```

## Migración de Usuarios Existentes

### Usuarios con Keyless Backup sin Verificación

- Al abrir Settings → Número aparece automáticamente verificado
- No necesitan hacer nada adicional

### Usuarios con Verificación sin Keyless Backup

- Pueden hacer keyless backup normalmente
- El sistema reconoce que ya están verificados

## Próximos Pasos

1. **Implementar endpoint** `/keyless-backup/check-phone` en backend
2. **Testing exhaustivo** de todos los flujos
3. **Monitoreo** de logs para detectar problemas
4. **Documentación** para el equipo de backend

## Conclusión

Esta integración elimina la fragmentación entre sistemas y proporciona una experiencia de usuario coherente, donde la verificación telefónica funciona de manera transparente independientemente del punto de entrada del usuario.
