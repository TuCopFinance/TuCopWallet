# 🚀 Checklist de Configuración CI/CD

## ✅ GitHub Secrets (Settings → Secrets and variables → Actions)

### API/Servidor

- [ ] `RAILWAY_API_URL` - URL de tu servidor Railway
- [ ] `RAILWAY_API_KEY` - API key para autenticación

### Android

- [ ] `GOOGLE_PLAY_JSON_KEY` - JSON del service account de Google Play
- [ ] `KEYSTORE_PASSWORD` - Password del keystore de release
- [ ] `KEY_ALIAS` - Alias de la key de firma
- [ ] `KEY_PASSWORD` - Password de la key de firma

### iOS

- [ ] `APPLE_CONNECT_KEY_ID` - App Store Connect API Key ID
- [ ] `APPLE_CONNECT_ISSUER_ID` - App Store Connect Issuer ID
- [ ] `APPLE_CONNECT_CERTIFICATE_PATH` - Ruta al certificado

### Notificaciones

- [ ] `SLACK_WEBHOOK_URL` - Webhook de Slack para notificaciones
- [ ] `SECRETS_PASSWORD` - Password para decrypt de secrets (si aplica)

## ✅ Archivos del Repositorio

### Android

- [ ] `android/app/tucop.keystore` - Keystore de producción
- [ ] `android/app/debug.keystore` - Keystore de debug
- [ ] `android/gradle.properties` - Con VERSION_CODE configurado
- [ ] `.env.mainnet` - Variables de ambiente para producción
- [ ] `.env.testnet` - Variables de ambiente para testnet

### iOS

- [ ] `ios/TuCopWallet.xcworkspace` - Workspace configurado
- [ ] `ios/Podfile` - Dependencias actualizadas
- [ ] Certificados de firma configurados en Xcode

### General

- [ ] `package.json` - Con script `pre-deploy` si existe
- [ ] `yarn.lock` - Actualizado y committeado
- [ ] `.gitignore` - Excluye archivos sensibles

## ✅ Configuración del Servidor

### Endpoint requerido

- [ ] `POST /api/update-version` implementado
- [ ] Acepta JSON con estructura definida
- [ ] Maneja autenticación Bearer token
- [ ] Responde con status 200/201 en éxito

### Estructura del payload esperada:

```json
{
  "platform": "both|android|ios",
  "version": "1.108.0",
  "buildNumber": "1704729600",
  "android": { "success": true, "buildTime": "ISO-date" },
  "ios": { "success": true, "buildTime": "ISO-date" },
  "releaseNotes": "Descripción del build...",
  "commit": "commit-hash",
  "branch": "branch-name",
  "workflow": "workflow-run-id"
}
```

## ✅ Configuración de Tiendas

### Google Play Console

- [ ] App creada en Google Play Console
- [ ] Service Account con permisos de upload
- [ ] Internal testing track configurado
- [ ] App Bundle habilitado

### App Store Connect

- [ ] App registrada en App Store Connect
- [ ] Certificados de distribución válidos
- [ ] TestFlight configurado
- [ ] API Key con permisos de upload

## ✅ Verificación de Funcionamiento

### Pruebas locales

- [ ] `cd android && ./gradlew bundleMainnetRelease` funciona
- [ ] `cd ios && pod install` funciona sin errores
- [ ] Variables de ambiente se cargan correctamente

### GitHub Actions

- [ ] Workflow se ejecuta en push a main
- [ ] Builds de Android completan exitosamente
- [ ] Builds de iOS completan exitosamente
- [ ] Notificaciones al servidor funcionan
- [ ] Artefactos se suben correctamente

### Notificaciones

- [ ] Slack recibe mensajes del bot
- [ ] Servidor recibe y procesa webhooks
- [ ] GitHub releases se crean automáticamente

## 🚨 Troubleshooting Común

### Android

- **Error de Gradle:** Verificar Java 11 y Gradle 8.7
- **Keystore no encontrado:** Verificar rutas y secrets (fallback a debug.keystore en CI)
- **Autolinking:** NO usar `-x generateAutolinkingPackageList` (Gradle 8.7 falla si el task no existe)

### iOS

- **Pod install falla:** Actualizar CocoaPods y Xcode
- **Certificados inválidos:** Renovar en Apple Developer
- **Archive falla:** Verificar code signing settings

### API

- **401 Unauthorized:** Verificar RAILWAY_API_KEY
- **404 Not Found:** Verificar RAILWAY_API_URL
- **Timeout:** Verificar conectividad del servidor

## 📞 Soporte

Si algún step falla:

1. Revisar logs del workflow en GitHub Actions
2. Verificar que todos los secrets estén configurados
3. Probar builds localmente primero
4. Verificar conectividad con APIs externas
