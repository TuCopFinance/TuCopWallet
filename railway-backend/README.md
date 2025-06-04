# 🚀 Tu Cop Wallet - Backend de Versiones

API backend para gestionar versiones y actualizaciones de la app Tu Cop Wallet.

## 🏗️ Arquitectura

Este backend proporciona:

- ✅ **Endpoint de verificación de versiones** para la app móvil
- ✅ **Webhook para eventos de GitHub** (push, release, etc.)
- ✅ **API para actualización manual de versiones**
- ✅ **Tarea programada** para sincronizar con GitHub
- ✅ **Health check** para monitoreo

## 🚀 Configuración Rápida

### 1. Variables de Entorno

Copia `.env.example` a `.env` y configura:

```bash
cp .env.example .env
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Ejecutar en Desarrollo

```bash
npm run dev
```

### 4. Desplegar en Railway

```bash
railway login
railway link
railway up
```

## 📡 Endpoints de la API

### `GET /api/app-version`

Endpoint principal usado por la app móvil para verificar actualizaciones.

**Headers:**

- `X-Platform`: `ios` | `android`
- `X-Bundle-Id`: Bundle ID de la app (opcional)

**Respuesta:**

```json
{
  "latestVersion": "1.101.0",
  "minRequiredVersion": "1.95.0",
  "releaseNotes": "Nuevas funcionalidades y mejoras",
  "downloadUrl": "https://apps.apple.com/app/id1234567890",
  "releaseDate": "2024-01-15T10:30:00.000Z",
  "isForced": false,
  "platform": "ios",
  "bundleId": "xyz.mobilestack"
}
```

### `GET /api/version-info`

Información detallada de todas las versiones.

**Respuesta:**

```json
{
  "versions": {
    "ios": { ... },
    "android": { ... }
  },
  "lastUpdated": "2024-01-15T10:30:00.000Z",
  "server": "Railway",
  "environment": "production"
}
```

### `POST /api/update-version`

Actualizar versiones manualmente (requiere API key).

**Body:**

```json
{
  "platform": "both", // "ios" | "android" | "both"
  "version": "1.101.0",
  "minRequired": "1.95.0",
  "releaseNotes": "Nueva versión manual",
  "isForced": false,
  "apiKey": "tu-api-key"
}
```

### `POST /api/github-webhook`

Webhook para recibir eventos de GitHub (push, release, repository_dispatch).

### `GET /health`

Health check para monitoreo.

**Respuesta:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "versions": {
    "ios": "1.101.0",
    "android": "1.101.0"
  }
}
```

## 🔄 Integración con GitHub

### Eventos Soportados

1. **Push a main**: Detecta cambios de versión en `package.json`
2. **Release publicado**: Actualiza versiones con información del release
3. **Repository dispatch**: Builds manuales desde GitHub Actions

### Configurar Webhook

En tu repositorio de GitHub:

1. Ve a **Settings > Webhooks**
2. Añade webhook con URL: `https://tu-railway-url.railway.app/api/github-webhook`
3. Selecciona eventos: `push`, `release`, `repository_dispatch`
4. Content type: `application/json`

## 🕐 Tarea Programada

El backend verifica automáticamente cada hora si hay nuevas versiones en GitHub:

- Consulta la API de GitHub Releases
- Actualiza versiones si encuentra cambios
- Mantiene sincronizada la información

## 🛠️ Desarrollo

### Scripts Disponibles

```bash
npm run dev      # Ejecutar con nodemon
npm run start    # Ejecutar en producción
npm run lint     # Verificar código con ESLint
npm run lint:fix # Corregir errores de ESLint automáticamente
```

### Estructura del Proyecto

```
railway-backend/
├── index.js           # Servidor principal
├── package.json       # Dependencias y scripts
├── .env.example       # Variables de entorno de ejemplo
├── .eslintrc.js       # Configuración de ESLint
└── README.md          # Esta documentación
```

## 🔐 Seguridad

- ✅ **API Key**: Protege endpoints de actualización manual
- ✅ **CORS**: Configurado para permitir requests de la app
- ✅ **Helmet**: Headers de seguridad HTTP
- ✅ **Validación**: Validación de parámetros de entrada

## 📊 Monitoreo

### Logs

```bash
# En Railway
railway logs

# En desarrollo
npm run dev
```

### Health Check

```bash
curl https://tu-railway-url.railway.app/health
```

### Verificar Versiones

```bash
curl -H "X-Platform: ios" https://tu-railway-url.railway.app/api/app-version
```

## 🚨 Troubleshooting

### Backend no responde

1. Verificar variables de entorno
2. Revisar logs: `railway logs`
3. Verificar health check

### GitHub webhook no funciona

1. Verificar URL del webhook en GitHub
2. Verificar que los eventos estén seleccionados
3. Revisar logs de requests en Railway

### Versiones no se actualizan

1. Verificar GITHUB_TOKEN
2. Verificar GITHUB_REPO
3. Revisar permisos del token

## 🔗 Enlaces Útiles

- [Railway Dashboard](https://railway.app/dashboard)
- [GitHub API Documentation](https://docs.github.com/en/rest)
- [Express.js Documentation](https://expressjs.com/)

---

**¡Tu backend está listo para gestionar versiones automáticamente! 🎉**
