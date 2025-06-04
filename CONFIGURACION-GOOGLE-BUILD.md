# 🔧 Configuración Completa para Build Automático con Google

## 📋 Resumen

Para que el build de GitHub con Google se haga automáticamente, necesitas configurar varios servicios y obtener credenciales específicas. Esta guía te llevará paso a paso.

## 🏗️ Arquitectura del Sistema

```
GitHub Actions → Google Cloud → Play Store/TestFlight
     ↓              ↓              ↓
   Secrets      Service Account   App Upload
```

## 📝 Lista Completa de Datos Necesarios

### **1. GitHub Secrets (Obligatorios)**

Estos van en: `GitHub Repository → Settings → Secrets and variables → Actions`

#### **Android (Google Play Store)**

```bash
GOOGLE_PLAY_JSON_KEY          # Service Account JSON para Play Store
SECRETS_PASSWORD              # Password para desencriptar archivos de firma
```

#### **iOS (Apple TestFlight)**

```bash
APPLE_CONNECT_KEY_ID          # ID de la API Key de App Store Connect
APPLE_CONNECT_ISSUER_ID       # Issuer ID de App Store Connect
APPLE_CONNECT_CERTIFICATE_PATH # Ruta al archivo .p8 (AuthKey)
```

#### **Notificaciones y Railway**

```bash
SLACK_WEBHOOK_URL             # URL del webhook de Slack (opcional)
RAILWAY_API_URL               # URL de tu backend Railway
RAILWAY_API_KEY               # API Key para Railway
```

### **2. Google Cloud Platform (Android)**

#### **Crear Service Account**

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Ve a `IAM & Admin → Service Accounts`
4. Clic en `Create Service Account`
5. Nombre: `github-actions-play-store`
6. Descripción: `Service account para GitHub Actions - Play Store uploads`

#### **Configurar Permisos**

1. En la consola de Google Play, ve a `Setup → API access`
2. Clic en `Link a project` y selecciona tu proyecto GCP
3. Ve a `Service accounts` y encuentra tu service account
4. Clic en `Grant access`
5. Asigna permisos:
   - **Release manager**: Para subir builds
   - **View app information**: Para leer metadata

#### **Descargar JSON Key**

1. En GCP Console, ve a tu service account
2. Clic en `Keys → Add Key → Create new key`
3. Selecciona `JSON` y descarga
4. **Importante**: Este JSON va en `GOOGLE_PLAY_JSON_KEY`

### **3. Apple Developer (iOS)**

#### **Crear API Key**

1. Ve a [App Store Connect](https://appstoreconnect.apple.com/)
2. Ve a `Users and Access → Integrations → App Store Connect API`
3. Clic en `Generate API Key`
4. Nombre: `GitHub Actions TuCOP`
5. Acceso: `Developer` (mínimo para subir builds)

#### **Obtener Datos**

```bash
# Después de crear la API Key:
APPLE_CONNECT_KEY_ID="ABC123DEF4"        # Key ID (10 caracteres)
APPLE_CONNECT_ISSUER_ID="12345678-..."   # Issuer ID (UUID)
# Descargar AuthKey_ABC123DEF4.p8 y subirlo a tu repositorio
```

#### **Configurar Certificados**

1. En Xcode, ve a `Preferences → Accounts`
2. Agrega tu Apple ID de desarrollador
3. Selecciona tu equipo y clic en `Manage Certificates`
4. Crea certificados de desarrollo y distribución si no existen

### **4. Archivos de Firma (Android) - CONFIGURACIÓN ACTUAL**

#### **Keystore Existente (Ya Configurado)**

Tu proyecto ya tiene configurado el keystore en `android/app/build.gradle`:

```gradle
signingConfigs {
    release {
      storeFile file('tucop.keystore')
      storePassword System.getenv("KEYSTORE_PASSWORD") ?: 'clavedelakey'
      keyAlias System.getenv("KEY_ALIAS") ?: 'tucop'
      keyPassword System.getenv("KEY_PASSWORD") ?: 'clavedelakey'
    }
}
```

**Datos de tu keystore actual:**

- **Archivo**: `tucop.keystore` ✅ (existe en `android/app/`)
- **Store Password**: `clavedelakey`
- **Key Alias**: `tucop`
- **Key Password**: `clavedelakey`

#### **⚠️ IMPORTANTE - Seguridad del Keystore**

Ahora el keystore usa variables de entorno con fallback a los valores actuales. Para CI/CD, agrega estos GitHub Secrets:

```bash
KEYSTORE_PASSWORD=clavedelakey
KEY_ALIAS=tucop
KEY_PASSWORD=clavedelakey
```

#### **Sistema de Encriptación (Recomendado)**

```bash
# Si quieres usar el sistema de encriptación del proyecto:
SECRETS_PASSWORD="tu_password_seguro_para_encriptar"

# Esto permitirá encriptar archivos sensibles como:
yarn keys:encrypt   # Encriptar tucop.keystore y otros archivos
yarn keys:decrypt   # Desencriptar en CI/CD
```

## 🛠️ Configuración Paso a Paso

### **Paso 1: Google Play Console**

1. **Crear App en Play Console**

   ```
   - Ve a Google Play Console
   - Clic en "Create app"
   - Nombre: "TuCOP Wallet"
   - Categoría: Finance
   - Tipo: App
   - Bundle ID: org.tucop (según tu .env.mainnet)
   ```

2. **Configurar Internal Testing**

   ```
   - Ve a Release → Testing → Internal testing
   - Clic en "Create new release"
   - Sube un APK/Bundle inicial manualmente
   - Agrega testers internos
   ```

3. **Habilitar API Access**
   ```
   - Ve a Setup → API access
   - Acepta términos y condiciones
   - Link tu proyecto GCP
   ```

### **Paso 2: App Store Connect**

1. **Crear App**

   ```
   - Ve a App Store Connect
   - Clic en "My Apps" → "+"
   - Bundle ID: org.tucop (debe coincidir con tu proyecto)
   - Nombre: "TuCOP Wallet"
   ```

2. **Configurar TestFlight**
   ```
   - Ve a tu app → TestFlight
   - Agrega testers internos
   - Configura grupos de prueba
   ```

### **Paso 3: GitHub Secrets**

```bash
# Ir a tu repositorio GitHub
# Settings → Secrets and variables → Actions
# Agregar cada secret:

# Android - Keystore (Valores actuales de tu proyecto)
KEYSTORE_PASSWORD: clavedelakey
KEY_ALIAS: tucop
KEY_PASSWORD: clavedelakey

# Android - Google Play
GOOGLE_PLAY_JSON_KEY: [Contenido completo del JSON de service account]

# Opcional - Sistema de encriptación
SECRETS_PASSWORD: [Password para encriptar/desencriptar archivos]

# iOS
APPLE_CONNECT_KEY_ID: ABC123DEF4
APPLE_CONNECT_ISSUER_ID: 12345678-1234-1234-1234-123456789012
APPLE_CONNECT_CERTIFICATE_PATH: /path/to/AuthKey.p8

# Railway (ya configurados)
RAILWAY_API_URL: https://tucopwallet-production.up.railway.app
RAILWAY_API_KEY: [Tu API key de Railway]

# Slack (opcional)
SLACK_WEBHOOK_URL: https://hooks.slack.com/services/...
```

### **Paso 4: Archivos del Proyecto**

#### **Android - Configuración Actual**

Tu `android/app/build.gradle` ya está configurado con:

```gradle
android {
    namespace "xyz.mobilestack"
    defaultConfig {
        applicationId project.env.get("APP_BUNDLE_ID")  // = org.tucop
        versionName "1.100.0"
        // ... otras configuraciones
    }

    signingConfigs {
        release {
          storeFile file('tucop.keystore')
          storePassword System.getenv("KEYSTORE_PASSWORD") ?: 'clavedelakey'
          keyAlias System.getenv("KEY_ALIAS") ?: 'tucop'
          keyPassword System.getenv("KEY_PASSWORD") ?: 'clavedelakey'
        }
    }
}
```

#### **iOS - Configuración**

```bash
# ios/MobileStack.xcworkspace debe estar configurado con:
# - Bundle ID correcto (org.tucop)
# - Signing configurado para tu equipo
# - Provisioning profiles automáticos habilitados
```

## 🚀 Proceso de Build Automático

### **Trigger del Build**

```bash
# Cualquiera de estos eventos activa el build:
1. Push a main con cambios en package.json
2. Crear un release en GitHub
3. Repository dispatch manual
```

### **Flujo Completo**

```
1. Detectar cambios de versión
2. Bump version automático (si es necesario)
3. Build Android (mainnet + alfajores)
4. Build iOS (mainnet + alfajores)
5. Deploy a Play Store Internal
6. Deploy a TestFlight
7. Notificar Railway
8. Crear GitHub Release
9. Notificación Slack
```

## 🔍 Verificación y Testing

### **Verificar Configuración**

```bash
# 1. Verificar secrets en GitHub
# Ve a Settings → Secrets → Actions
# Confirma que todos los secrets están configurados

# 2. Test manual del workflow
# Ve a Actions → Auto Build & Deploy
# Clic en "Run workflow"

# 3. Verificar logs
# Revisa cada step del workflow para errores
```

### **Troubleshooting Común**

#### **Android Issues**

```bash
# Error: "Google Play API not enabled"
# Solución: Habilitar Google Play Developer API en GCP

# Error: "Invalid keystore"
# Solución: Verificar que tucop.keystore existe en android/app/

# Error: "Insufficient permissions"
# Solución: Verificar permisos del service account en Play Console

# Error: "Keystore password incorrect"
# Solución: Verificar que KEYSTORE_PASSWORD = 'clavedelakey'

# Error: "Bundle ID mismatch"
# Solución: Verificar que APP_BUNDLE_ID = org.tucop en .env files
```

#### **iOS Issues**

```bash
# Error: "Invalid API key"
# Solución: Verificar APPLE_CONNECT_KEY_ID e ISSUER_ID

# Error: "Certificate not found"
# Solución: Verificar que AuthKey.p8 está en la ruta correcta

# Error: "Provisioning profile"
# Solución: Habilitar "Automatically manage signing" en Xcode

# Error: "Bundle ID not found"
# Solución: Crear app con Bundle ID org.tucop en App Store Connect
```

## 📊 Monitoreo y Mantenimiento

### **Métricas a Monitorear**

- ✅ **Tasa de éxito**: Builds exitosos vs fallidos
- ✅ **Tiempo de build**: Android ~15min, iOS ~25min
- ✅ **Uploads exitosos**: Play Store + TestFlight
- ✅ **Notificaciones**: Railway + Slack funcionando

### **Mantenimiento Regular**

- 🔄 **Renovar API keys**: Apple keys expiran anualmente
- 🔄 **Actualizar certificados**: Certificados iOS expiran
- 🔄 **Revisar permisos**: Service accounts y accesos
- 🔄 **Actualizar dependencias**: Fastlane, GitHub Actions

## 📚 Referencias Útiles

- [Google Play Console API](https://developers.google.com/android-publisher)
- [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
- [Fastlane Documentation](https://docs.fastlane.tools/)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

## ⚠️ Seguridad

### **Mejores Prácticas**

- ✅ **Nunca** commits credenciales en el código
- ✅ **Usa** GitHub Secrets para datos sensibles
- ✅ **Rota** API keys regularmente
- ✅ **Limita** permisos al mínimo necesario
- ✅ **Monitorea** accesos y builds

### **Archivos Sensibles**

```bash
# Estos archivos NUNCA deben estar en el repositorio:
- google-play-service-account.json
- tucop.keystore (si no está encriptado)
- AuthKey_*.p8
- .env con credenciales

# En su lugar, usa:
- GitHub Secrets
- Archivos encriptados con yarn keys:encrypt
- Variables de entorno en CI/CD
```

### **✅ ESTADO ACTUAL - Tu Configuración**

**Keystore Android:**

- ✅ Archivo `tucop.keystore` existe en `android/app/`
- ✅ Configuración actualizada para usar variables de entorno
- ✅ Bundle ID correcto: `org.tucop`

**Pendiente:**

- ⚠️ Configurar Google Play Console con Bundle ID `org.tucop`
- ⚠️ Configurar App Store Connect con Bundle ID `org.tucop`
- ⚠️ Agregar GitHub Secrets para keystore

---

**Creado para**: TuCOP Wallet Build Automation
**Fecha**: Enero 2025
**Versión**: 1.2.0 - Corregido Bundle ID a org.tucop
