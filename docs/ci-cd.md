# 🚀 Sistema CI/CD Automático - Tu Cop Wallet

## ¿Qué hace este sistema?

Este sistema automatiza completamente el proceso de compilación, versionado y distribución de tu app React Native:

### ✅ **Funcionalidades Principales**

1. **Detección Automática de Cambios**

   - Detecta cuando cambias la versión en `package.json`
   - Escucha pushes a la rama `main`
   - Responde a la creación de releases en GitHub

2. **Versionado Automático**

   - Incrementa automáticamente la versión si no se especifica
   - Actualiza archivos de build de Android e iOS
   - Mantiene sincronizados todos los archivos de versión

3. **Compilación Automática**

   - Compila para Android (Play Store Bundle)
   - Compila para iOS (TestFlight Archive)
   - Soporta múltiples environments (mainnet, testnet)

4. **Distribución Automática**

   - Sube automáticamente a Play Store (Internal Track)
   - Sube automáticamente a TestFlight
   - Crea releases en GitHub con artefactos

5. **Backend de Versiones**

   - API en Railway para gestionar versiones
   - Endpoint para que la app verifique actualizaciones
   - Webhook para sincronizar con GitHub

6. **Notificaciones**
   - Notificaciones en Slack del estado de builds
   - Logs detallados en GitHub Actions
   - Monitoreo en tiempo real

## 🏗️ **Arquitectura del Sistema**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Desarrollador │    │     GitHub      │    │     Railway     │
│                 │    │                 │    │                 │
│ 1. Push a main  │───▶│ 2. GitHub       │───▶│ 3. Webhook      │
│                 │    │    Actions      │    │    recibido     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Play Store    │◀───│ 4. Build &      │    │ 5. Actualizar   │
│   TestFlight    │    │    Deploy       │    │    versiones    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Slack       │◀───│ 6. Crear        │    │ 7. App verifica │
│ Notificación    │    │    Release      │    │    actualizaciones│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 **Configuración Rápida**

### Paso 1: Ejecutar Script de Configuración

```bash
./scripts/setup-ci-cd.sh
```

Este script automáticamente:

- ✅ Configura Railway con el backend
- ✅ Configura GitHub Secrets
- ✅ Configura webhooks
- ✅ Actualiza la configuración de la app
- ✅ Genera documentación

### Paso 2: Configurar Certificados

Necesitas configurar estos secrets en GitHub:

```bash
# Para Android
GOOGLE_PLAY_JSON_KEY="{...}"  # JSON key de Google Play Console

# Para iOS
APPLE_CONNECT_KEY_ID="ABC123"
APPLE_CONNECT_ISSUER_ID="def456-..."
APPLE_CONNECT_CERTIFICATE_PATH="/path/to/cert.p8"

# Para descifrar secretos del proyecto
SECRETS_PASSWORD="tu-password"
```

### Paso 3: Probar el Sistema

```bash
# Cambiar versión y hacer push
yarn version --patch
git add .
git commit -m "chore: bump version"
git push origin main

# O disparar build manual
gh api repos/:owner/:repo/dispatches \
  --method POST \
  --field event_type='auto-build' \
  --field client_payload='{"version":"1.101.0"}'
```

## 📱 **Cómo Funciona la Verificación de Actualizaciones**

### En la App

```typescript
// La app verifica automáticamente cada 24 horas
const { updateInfo, isChecking } = useAppUpdateChecker({
  useBackend: true, // Usa Railway backend
  checkOnAppStart: true,
  checkOnAppResume: true,
})

// Si hay actualización, muestra diálogo automáticamente
if (updateInfo?.hasUpdate) {
  // Diálogo nativo con opciones "Actualizar" / "Más tarde"
}
```

### En el Backend (Railway)

```javascript
// Endpoint que consulta la app
GET /api/app-version
Headers: X-Platform: ios|android

Response:
{
  "latestVersion": "1.101.0",
  "minRequiredVersion": "1.95.0",
  "releaseNotes": "Nuevas funcionalidades...",
  "isForced": false,
  "downloadUrl": "https://apps.apple.com/..."
}
```

## 🔄 **Flujo de Trabajo Típico**

### Desarrollo Normal

1. Desarrollas features normalmente
2. Haces push a `main`
3. **Si no cambió la versión**: No pasa nada
4. **Si cambió la versión**: Se dispara build automático

### Release Nueva Versión

1. Cambias versión: `yarn version --minor`
2. Haces push: `git push origin main`
3. **GitHub Actions automáticamente**:
   - ✅ Detecta cambio de versión
   - ✅ Actualiza archivos de build
   - ✅ Compila Android e iOS
   - ✅ Sube a Play Store y TestFlight
   - ✅ Actualiza backend de Railway
   - ✅ Crea release en GitHub
   - ✅ Notifica en Slack

### Build Manual

```bash
# Disparar build sin cambiar código
gh api repos/:owner/:repo/dispatches \
  --method POST \
  --field event_type='auto-build' \
  --field client_payload='{"version":"1.101.0"}'
```

## 🛠️ **Comandos Útiles**

### Verificar Estado del Backend

```bash
curl https://tu-railway-url.railway.app/health
```

### Actualizar Versión Manualmente

```bash
curl -X POST "https://tu-railway-url.railway.app/api/update-version" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "both",
    "version": "1.101.0",
    "releaseNotes": "Nueva versión manual",
    "apiKey": "tu-api-key"
  }'
```

### Ver Logs de Railway

```bash
railway logs
```

### Ver Estado de GitHub Actions

```bash
gh run list
gh run view [run-id]
```

## 📊 **Monitoreo y Debugging**

### Logs Importantes

1. **GitHub Actions**: Ve a la pestaña "Actions" en GitHub
2. **Railway**: `railway logs` o dashboard web
3. **App**: Logs en Flipper/Metro
4. **Stores**: App Store Connect / Google Play Console

### Problemas Comunes

#### ❌ Build falla en GitHub Actions

```bash
# Verificar secrets
gh secret list

# Ver logs detallados
gh run view [run-id] --log
```

#### ❌ Backend no responde

```bash
# Verificar estado
curl https://tu-railway-url.railway.app/health

# Ver logs
railway logs --tail
```

#### ❌ App no detecta actualizaciones

```bash
# Verificar endpoint
curl -H "X-Platform: ios" https://tu-railway-url.railway.app/api/app-version

# Verificar configuración en NavigatorWrapper
grep "useBackend" src/navigator/NavigatorWrapper.tsx
```

## 🔐 **Seguridad**

### Variables de Entorno Protegidas

- ✅ API keys en GitHub Secrets
- ✅ Certificados encriptados
- ✅ Tokens con permisos mínimos
- ✅ Webhook con validación

### Mejores Prácticas

- 🔒 Nunca commitear secrets
- 🔒 Rotar API keys regularmente
- 🔒 Usar permisos mínimos necesarios
- 🔒 Monitorear accesos sospechosos

## 🎯 **Próximos Pasos**

1. **Configurar notificaciones de Slack**
2. **Añadir tests automáticos antes del build**
3. **Configurar staging environment**
4. **Añadir métricas de performance**
5. **Configurar rollback automático**

## 🆘 **Soporte**

Si tienes problemas:

1. **Revisa los logs** en GitHub Actions y Railway
2. **Verifica la configuración** con el script de setup
3. **Consulta la documentación** en `CI-CD-SETUP.md`
4. **Abre un issue** en GitHub con logs detallados

---

**¡Tu sistema de CI/CD está listo para automatizar todo el proceso de release! 🚀**
