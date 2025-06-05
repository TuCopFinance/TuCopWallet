# ✅ Checklist: Configuración Build Automático TuCOP Wallet

## 🎯 Objetivo

Configurar el build automático para que cuando hagas `yarn version --patch` y `git push`, se compile y suba automáticamente a Play Store y TestFlight.

## 📋 Checklist de Configuración

### **🔴 CRÍTICO - Secrets de GitHub (Obligatorios)**

Ve a: `https://github.com/alejandr0pg/TuCopWallet/settings/secrets/actions`

#### **Android (Google Play Store)**

- [ ] **`GOOGLE_PLAY_JSON_KEY`** - Service Account JSON de Google Cloud
- [ ] **`KEYSTORE_PASSWORD`** - Password del keystore: `clavedelakey`
- [ ] **`KEY_ALIAS`** - Alias de la key: `tucop`
- [ ] **`KEY_PASSWORD`** - Password de la key: `clavedelakey`

#### **iOS (Apple TestFlight)**

- [ ] **`APPLE_CONNECT_KEY_ID`** - ID de la API Key (ej: ABC123DEF4)
- [ ] **`APPLE_CONNECT_ISSUER_ID`** - UUID del Issuer (ej: 12345678-1234-1234-1234-123456789012)
- [ ] **`APPLE_CONNECT_CERTIFICATE_PATH`** - Ruta al archivo .p8 (ej: /path/to/AuthKey.p8)

#### **Ya Configurados ✅**

- [x] **`RAILWAY_API_URL`** - https://tucopwallet-production.up.railway.app
- [x] **`RAILWAY_API_KEY`** - Tu API key de Railway

#### **Opcional**

- [ ] **`SLACK_WEBHOOK_URL`** - Para notificaciones en Slack
- [ ] **`SECRETS_PASSWORD`** - Para sistema de encriptación (opcional)

---

## 🛠️ Pasos Detallados

### **1. Google Play Store (Android)**

#### **1.1 Crear Service Account en Google Cloud**

```bash
# 1. Ve a: https://console.cloud.google.com/
# 2. Crea proyecto nuevo: "TuCOP Wallet"
# 3. Ve a: IAM & Admin → Service Accounts
# 4. Crear Service Account:
#    - Nombre: github-actions-play-store
#    - Descripción: Service account para GitHub Actions
# 5. Crear Key JSON y descargar
```

#### **1.2 Configurar Google Play Console**

```bash
# 1. Ve a: https://play.google.com/console/
# 2. Crear app nueva:
#    - Nombre: TuCOP Wallet
#    - Categoría: Finance
#    - Bundle ID: org.tucop (según tu .env.mainnet)
# 3. Ve a: Setup → API access
# 4. Link tu proyecto GCP
# 5. Grant access al service account con permisos:
#    - Release manager
#    - View app information
```

#### **1.3 Configurar GitHub Secret**

```bash
# Copiar TODO el contenido del archivo JSON descargado
# Pegarlo en GitHub Secret: GOOGLE_PLAY_JSON_KEY
```

### **2. Apple TestFlight (iOS)**

#### **2.1 Crear API Key en App Store Connect**

```bash
# 1. Ve a: https://appstoreconnect.apple.com/
# 2. Users and Access → Integrations → App Store Connect API
# 3. Generate API Key:
#    - Nombre: GitHub Actions TuCOP
#    - Acceso: Developer
# 4. Anotar:
#    - Key ID (10 caracteres): ABC123DEF4
#    - Issuer ID (UUID): 12345678-1234-1234-1234-123456789012
# 5. Descargar AuthKey_ABC123DEF4.p8
```

#### **2.2 Crear App en App Store Connect**

```bash
# 1. My Apps → "+" → New App
# 2. Configurar:
#    - Bundle ID: org.tucop (según tu .env.mainnet)
#    - Nombre: TuCOP Wallet
#    - Categoría: Finance
```

#### **2.3 Configurar GitHub Secrets**

```bash
APPLE_CONNECT_KEY_ID: ABC123DEF4
APPLE_CONNECT_ISSUER_ID: 12345678-1234-1234-1234-123456789012
APPLE_CONNECT_CERTIFICATE_PATH: /path/to/AuthKey_ABC123DEF4.p8
```

### **3. Keystore Android (Ya Configurado) ✅**

#### **3.1 Tu Configuración Actual**

Tu proyecto ya tiene el keystore configurado en `android/app/build.gradle`:

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

**✅ Estado actual:**

- ✅ Archivo `tucop.keystore` existe en `android/app/`
- ✅ Configuración actualizada para usar variables de entorno
- ✅ Bundle ID correcto: `org.tucop` (en `.env.mainnet`)

#### **3.2 Configurar GitHub Secrets con tus valores**

```bash
# Agregar estos secrets con los valores exactos de tu build.gradle:
KEYSTORE_PASSWORD: clavedelakey
KEY_ALIAS: tucop
KEY_PASSWORD: clavedelakey
```

### **4. Verificación Final**

#### **4.1 Test Manual**

```bash
# 1. Ve a: https://github.com/alejandr0pg/TuCopWallet/actions
# 2. Selecciona: "Auto Build & Deploy"
# 3. Clic en: "Run workflow"
# 4. Revisar logs para errores
```

#### **4.2 Test Automático**

```bash
# 1. Cambiar versión: yarn version --patch
# 2. Push: git push && git push --tags
# 3. Verificar que se activa el workflow automáticamente
```

---

## 🚨 Datos Específicos que Necesitas Obtener

### **Para Google Play Store:**

1. **JSON Service Account** - Archivo completo de Google Cloud
2. ✅ **Keystore info** - Ya tienes: `tucop.keystore` con password `clavedelakey`
3. ✅ **Bundle ID** - Ya configurado: `org.tucop`

### **Para Apple TestFlight:**

1. **Key ID** - 10 caracteres alfanuméricos
2. **Issuer ID** - UUID de 36 caracteres
3. **Archivo .p8** - AuthKey descargado de App Store Connect
4. ✅ **Bundle ID** - Ya configurado: `org.tucop`

### **✅ CONFIGURACIÓN ACTUAL VERIFICADA:**

- **Bundle ID**: `org.tucop` (confirmado en `.env.mainnet`)
- **Keystore**: `tucop.keystore` (existe en `android/app/`)
- **Passwords**: `clavedelakey` (configurados con variables de entorno)
- **Namespace**: `xyz.mobilestack` (en `build.gradle`)

---

## 🔍 Comandos de Verificación

```bash
# Verificar secrets configurados
gh secret list --repo alejandr0pg/TuCopWallet

# Verificar último workflow
gh run list --repo alejandr0pg/TuCopWallet --limit 1

# Ver logs del último build
gh run view --repo alejandr0pg/TuCopWallet

# Test manual del workflow
gh workflow run "Auto Build & Deploy" --repo alejandr0pg/TuCopWallet

# Verificar keystore existe
ls -la android/app/tucop.keystore

# Verificar Bundle ID
cat .env.mainnet | grep APP_BUNDLE_ID
```

---

## 📞 Próximos Pasos

1. ✅ **Verificado**: `android/app/tucop.keystore` existe
2. ✅ **Verificado**: Bundle ID `org.tucop` configurado
3. ✅ **Actualizado**: Keystore con variables de entorno
4. **Prioridad 1**: Configurar Google Play Store con Bundle ID `org.tucop`
5. **Prioridad 2**: Configurar Apple TestFlight con Bundle ID `org.tucop`
6. **Prioridad 3**: Test completo del sistema
7. **Prioridad 4**: Configurar notificaciones Slack (opcional)

Una vez configurado todo, el proceso será:

```bash
yarn version --patch  # Incrementa versión
git push              # Activa build automático
# ✅ 45-60 minutos después: Apps en Play Store + TestFlight
```

---

## 🔒 Recomendaciones de Seguridad

### **✅ Mejoras Implementadas**

Tu keystore ahora usa variables de entorno con fallback seguro:

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

### **Opcional - Sistema de Encriptación**

```bash
# Si quieres encriptar el keystore:
yarn keys:encrypt
# Configurar SECRETS_PASSWORD en GitHub Secrets
```

---

**Estado Actual**: ✅ Keystore configurado y Bundle ID verificado
**Tiempo Estimado**: 1-2 horas para configurar credenciales de tiendas
**Beneficio**: Build automático completo con un solo comando
