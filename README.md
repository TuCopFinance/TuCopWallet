# 🏦 TuCOP Wallet - Billetera Digital

TuCOP Wallet es una aplicación móvil React Native que proporciona servicios de billetera digital con funcionalidades avanzadas de gestión de versiones y actualizaciones automáticas.

## 📱 Características Principales

- **Billetera Digital Completa**: Gestión de transacciones y pagos
- **Sistema de Actualizaciones Inteligente**: Verificación automática desde backend propio
- **CI/CD Automatizado**: Despliegue automático a Play Store y TestFlight
- **Soporte Multi-Red**: Mainnet y Celo Sepolia (Testnet)
- **Arquitectura Moderna**: React Native con TypeScript

## 🛠️ Tecnologías

- **Frontend**: React Native + TypeScript
- **Backend**: Node.js + Express (Railway)
- **CI/CD**: GitHub Actions + Fastlane
- **Configuración**: Statsig Dynamic Config
- **Stores**: Google Play Store + Apple TestFlight
- **Infraestructura**: Railway Cloud Platform

## 📋 Requerimientos Mínimos

- **Node.js**: v20.17.0 (versión específica requerida)
- **NVM**: Para gestión de versiones de Node.js
- **JDK**: v17
- **Yarn**: v1.22 o superior
- **React Native CLI**: Última versión
- **Android Studio**: Para desarrollo Android
- **Xcode**: Para desarrollo iOS (solo macOS)

## 🚀 Instalación y Configuración

### 1. Instalar Node.js v20.17.0 con NVM

Primero, instala NVM (Node Version Manager) si no lo tienes:

```bash
# Para macOS/Linux
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reinicia tu terminal o ejecuta:
source ~/.bashrc  # o ~/.zshrc si usas zsh
```

Luego, instala y configura Node.js v20.17.0:

```bash
# Instalar Node.js v20.17.0
nvm install 20.17.0

# Establecer como versión por defecto
nvm alias default 20.17.0

# Verificar la versión instalada
node --version  # Debe mostrar v20.17.0
```

### 2. Clonar el Repositorio

```bash
git clone https://github.com/TuCopFinance/TuCopWallet.git
cd TuCopWallet
```

### 3. Instalar Dependencias

```bash
yarn install
```

### 4. Configurar Secrets

```bash
# Renombrar archivo de configuración
cp secrets.json.template secrets.json

# Editar secrets.json con tus configuraciones
```

### 5. Iniciar Emuladores

Antes de ejecutar la aplicación, necesitas iniciar el emulador correspondiente.

#### 📱 iOS Simulator (solo macOS)

**Opción 1: Inicio Automático**

```bash
npx react-native run-ios
# Abre automáticamente el simulador y ejecuta la app
```

**Opción 2: Abrir Simulador Primero**

```bash
open -a Simulator
```

**Opción 3: Especificar un Dispositivo**

```bash
# Listar dispositivos disponibles
xcrun simctl list devices

# Iniciar con dispositivo específico
npx react-native run-ios --simulator="iPhone 15 Pro"
```

**Opción 4: Usando xcrun Directamente**

```bash
# Iniciar simulador específico
xcrun simctl boot "iPhone 15 Pro"

# Abrir aplicación Simulator
open -a Simulator

# Ejecutar la app
npx react-native run-ios
```

#### 🤖 Android Emulator

**Opción A: Desde Android Studio**

1. Abre Android Studio
2. Ve a `Tools → Device Manager`
3. Selecciona un dispositivo y haz clic en el botón ▶️ (Play)

**Opción B: Desde Línea de Comandos**

```bash
# Listar emuladores disponibles
emulator -list-avds

# Iniciar emulador específico
emulator -avd <nombre_del_dispositivo>

# Ejemplo:
emulator -avd Pixel_API_29_AOSP_x86_64
```

**Nota**: Asegúrate de que el emulador esté completamente iniciado antes de ejecutar la aplicación.

### 6. Ejecutar la Aplicación

#### Android

```bash
# Desarrollo (Celo Sepolia testnet)
yarn dev:android

# Mainnet
yarn dev:android:mainnet

# Windows
yarn win:dev:android
```

#### iOS

```bash
# Desarrollo (Celo Sepolia testnet)
yarn dev:ios

# Mainnet
yarn dev:ios:mainnet
```

### 📱 Esquemas de iOS Disponibles

El proyecto incluye 6 esquemas de iOS para diferentes entornos:

#### **Esquemas por Red:**

- **`MobileStack-alfajores`**: Red de prueba (legacy scheme name)

  - Nombre: "TuCop Alfajores"
  - Red: Celo Sepolia (testnet)
  - Uso: Pruebas con tokens de testnet

- **`MobileStack-mainnet`**: Red principal de producción

  - Nombre: "TuCop"
  - Red: Celo mainnet
  - Uso: Versión de producción

- **`MobileStack-test`**: Configuración de pruebas
  - Nombre: "Mento (test)"
  - Uso: Pruebas de configuración

#### **Esquemas de Desarrollo:**

- **`MobileStack-alfajoresdev`**: Desarrollo en testnet ⭐ **Recomendado**

  - Nombre: "TuCoP Wallet (Alfajores)"
  - Red: Celo Sepolia (testnet)
  - Características: Configuración de desarrollo, sin Sentry
  - Uso: **Desarrollo principal**

- **`MobileStack-mainnetdev`**: Desarrollo en mainnet

  - Red: Mainnet con configuración de desarrollo
  - Uso: Pruebas avanzadas

- **`MobileStack-*nightly`**: Builds automáticos nocturnos

#### **Selección de Esquema:**

- **Para Desarrollo**: `MobileStack-alfajoresdev` (entorno seguro de testnet)
- **Para Pruebas**: `MobileStack-alfajores` (testnet con configuración de producción)
- **Para Producción**: `MobileStack-mainnet` (red real)

Cada esquema carga un archivo `.env.*` correspondiente que configura endpoints, nombres y características.

## 🔧 Scripts Disponibles

### Desarrollo

```bash
yarn dev:android          # Ejecutar en Android
yarn dev:ios              # Ejecutar en iOS
yarn win:dev:android       # Ejecutar en Android (Windows)
```

### Testing y Calidad

```bash
yarn test                  # Ejecutar tests
yarn lint                  # Verificar linting
yarn build:ts              # Compilar TypeScript
```

### Versioning

```bash
yarn version --patch       # Incrementar versión patch (1.0.0 → 1.0.1)
yarn version --minor       # Incrementar versión minor (1.0.0 → 1.1.0)
yarn version --major       # Incrementar versión major (1.0.0 → 2.0.0)
yarn pre-deploy           # Preparar para despliegue
```

## 🏗️ Arquitectura del Sistema

### Frontend (React Native)

```
src/
├── components/           # Componentes reutilizables
├── screens/             # Pantallas de la aplicación
├── navigation/          # Configuración de navegación
├── utils/               # Utilidades y helpers
│   ├── appUpdateChecker.ts    # Verificación de actualizaciones
│   └── versionCheck.ts        # Comparación de versiones
├── hooks/               # Custom hooks
│   └── useAppUpdateChecker.ts # Hook de actualizaciones
└── types/               # Definiciones de tipos TypeScript
```

### Backend (Railway)

```
railway-backend/
├── src/
│   ├── routes/          # Endpoints de la API
│   ├── services/        # Lógica de negocio
│   └── utils/           # Utilidades del backend
├── package.json         # Dependencias del backend
└── railway.json         # Configuración de Railway
```

### CI/CD

```
.github/
└── workflows/
    └── auto-build.yml   # Pipeline de CI/CD automatizado
```

## 🔄 Sistema de Actualizaciones

### Verificación Automática

La aplicación verifica automáticamente nuevas versiones cada 24 horas usando nuestro backend en Railway:

- **Endpoint**: `https://tucopwallet-production.up.railway.app/api/app-version`
- **Fallback**: Statsig Dynamic Config
- **Persistencia**: Actualizaciones descartadas se recuerdan

### Tipos de Actualización

- **Forzada**: Bloquea la app hasta actualizar
- **Opcional**: Permite continuar usando la app
- **Silenciosa**: Solo notifica disponibilidad

## 🚀 Proceso de Nueva Versión

### Método Rápido

```bash
# 1. Incrementar versión
yarn version --patch

# 2. Push (activa CI/CD automáticamente)
git push origin main --follow-tags
```

### Lo que Sucede Automáticamente

1. **GitHub Actions** detecta el cambio de versión
2. **Compila** para Android e iOS (mainnet + testnet)
3. **Despliega** a Google Play Store (Internal) y TestFlight
4. **Actualiza** el backend de Railway
5. **Crea** GitHub Release automáticamente
6. **Notifica** el resultado

**Tiempo total**: 45-60 minutos (solo 5 minutos de trabajo manual)

📖 **Guía Completa**: Ver [docs/release-process.md](./docs/release-process.md)

## 🌐 URLs y Endpoints

### Aplicación en Tiendas

- **Android**: [Google Play Store](https://play.google.com/store/apps/details?id=org.tucop)
- **iOS**: [App Store](https://apps.apple.com/app/tucop-wallet/id1234567890)

### Backend API

- **Producción**: `https://tucopwallet-production.up.railway.app`
- **Health Check**: `/health`
- **Versión de App**: `/api/app-version`
- **Info de Versión**: `/api/version-info`

### Repositorios

- **Principal**: `https://github.com/TuCopFinance/TuCopWallet`
- **Railway Backend**: Incluido en este repositorio

## 🔐 Variables de Entorno

### GitHub Secrets

```bash
RAILWAY_API_URL=https://tucopwallet-production.up.railway.app
RAILWAY_API_KEY=tu_api_key_aqui
GOOGLE_PLAY_JSON_KEY=contenido_del_json_key
APPLE_CONNECT_API_KEY=tu_apple_api_key
```

### Railway Variables

```bash
NODE_ENV=production
GITHUB_REPO=TuCopFinance/TuCopWallet
API_KEY=tu_api_key_segura
GITHUB_TOKEN=tu_github_token
```

## 📊 Monitoreo y Logs

### Backend (Railway)

```bash
# Ver logs en tiempo real
cd railway-backend && railway logs

# Verificar estado
curl https://tucopwallet-production.up.railway.app/health
```

### CI/CD (GitHub Actions)

```bash
# Ver workflows
gh run list

# Ver logs de un workflow
gh run view [run-id] --log
```

### Verificar Actualizaciones

```bash
# Consultar versión actual
curl -H "X-Platform: android" -H "X-Bundle-ID: org.tucop" \
  https://tucopwallet-production.up.railway.app/api/app-version
```

## 🧪 Testing

### Ejecutar Tests

```bash
yarn test                 # Todos los tests
yarn test:unit           # Tests unitarios
yarn test:integration    # Tests de integración
yarn test:e2e            # Tests end-to-end
```

### Coverage

```bash
yarn test:coverage       # Generar reporte de cobertura
```

## 📱 Desarrollo

### Estructura de Branches

- **main**: Rama principal (producción)
- **develop**: Rama de desarrollo
- **feature/\***: Nuevas características
- **hotfix/\***: Correcciones urgentes

### Flujo de Trabajo

1. Crear feature branch desde `develop`
2. Desarrollar y hacer commits
3. Crear Pull Request a `develop`
4. Merge a `main` para release
5. Versionar y desplegar automáticamente

## 🆘 Troubleshooting

### Problemas Comunes

#### Build Falla

```bash
# Limpiar cache
yarn clean
yarn install

# Verificar configuración
yarn build:ts
```

#### Actualizaciones No Funcionan

```bash
# Verificar backend
curl https://tucopwallet-production.up.railway.app/health

# Verificar configuración en NavigatorWrapper.tsx
useBackend: true
```

#### CI/CD No Se Activa

```bash
# Verificar secrets
gh secret list

# Verificar workflow
gh run list
```

### Logs Útiles

```bash
# React Native
npx react-native log-android
npx react-native log-ios

# Metro Bundler
yarn start --reset-cache

# Railway Backend
railway logs --tail
```

## 🤝 Contribución

### Configuración para Contribuidores

1. Fork del repositorio
2. Crear branch de feature
3. Seguir convenciones de código
4. Escribir tests para nuevas funcionalidades
5. Crear Pull Request con descripción detallada

### Convenciones

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`)
- **Código**: ESLint + Prettier
- **TypeScript**: Strict mode habilitado
- **Tests**: Jest + React Native Testing Library

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver [LICENSE](./LICENSE) para más detalles.

## 📞 Soporte

- **Issues**: [GitHub Issues](https://github.com/TuCopFinance/TuCopWallet/issues)
- **Documentación**: Ver carpeta `/docs`
- **Wiki**: [GitHub Wiki](https://github.com/TuCopFinance/TuCopWallet/wiki)

---

## 🎯 Estado del Proyecto

- ✅ **Sistema de Actualizaciones**: Completamente funcional
- ✅ **CI/CD Pipeline**: Automatizado y probado
- ✅ **Backend Railway**: Desplegado y monitoreado
- ✅ **Despliegue a Tiendas**: Automático
- ✅ **Documentación**: Completa y actualizada

**Versión Actual**: 1.116.0
**Última Actualización**: Marzo 2026
**Estado**: 🟢 Producción Estable

---

**¡Desarrollado con ❤️ por el equipo de TuCOP Finance!**
