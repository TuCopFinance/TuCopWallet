# TuCOP Wallet Version API

API robusta y segura para gestionar versiones de la aplicación móvil TuCOP Wallet, construida con Express.js, Prisma y PostgreSQL.

> **⚠️ IMPORTANTE**: Este API backend se encuentra en el directorio `railway-backend/` del proyecto TuCOP Wallet. Asegúrate de ejecutar todos los comandos desde este directorio.

## 📊 Estado del Proyecto

✅ **Implementado y Funcionando**:

- Backend completo con Express.js y PostgreSQL
- Autenticación segura con API keys hasheadas
- Base de datos configurada con Prisma ORM
- Endpoints públicos y protegidos
- Rate limiting y headers de seguridad
- Logging completo de requests
- Integración con GitHub (webhooks y auto-updates)
- Validación robusta de datos
- Health checks y monitoreo
- Script de configuración inicial

🎯 **Versión Actual**: `1.0.0`
📅 **Última Actualización**: Enero 2025
🏗️ **Listo para**: Desarrollo y Producción

## 🚀 Características

- **Base de datos PostgreSQL** con Prisma ORM
- **Autenticación segura** con API keys hasheadas
- **Rate limiting** para prevenir abuso
- **Logging completo** de requests y eventos
- **Validación robusta** de datos de entrada
- **Integración con GitHub** para actualizaciones automáticas
- **Webhooks** para eventos de GitHub
- **Health checks** y monitoreo
- **Manejo de errores** centralizado
- **Compresión** y optimizaciones de rendimiento

## ⚡ Inicio Rápido

```bash
# 1. Navegar al directorio del backend
cd railway-backend

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno (ver sección de configuración)
cp .env.example .env
# Editar .env con tus valores

# 4. Configurar base de datos y generar cliente
npm run db:generate
npm run db:migrate

# 5. Configuración inicial (crear primera API key)
npm run setup

# 6. Iniciar servidor
npm run dev
```

## 📋 Prerequisitos

- **Node.js** 18.x o superior (probado con Node.js 20.x)
- **PostgreSQL** 13 o superior
- **Cuenta de GitHub** con token de acceso personal (opcional para integración)

## 🛠️ Instalación Detallada

### 1. Clonar e instalar dependencias

```bash
# Desde el directorio raíz del proyecto TuCOP Wallet
cd railway-backend
npm install
```

> **💡 Tip**: Si tienes errores de versión de Node.js, el proyecto soporta Node.js >=18.x

### 2. Configurar variables de entorno

Crea un archivo `.env` con las siguientes variables:

```bash
# ================================
# DATABASE CONFIGURATION
# ================================
# PostgreSQL connection string
DATABASE_URL="postgresql://username:password@localhost:5432/tu_cop_wallet_versions?schema=public"

# ================================
# SERVER CONFIGURATION
# ================================
PORT=3000
NODE_ENV=production

# ================================
# SECURITY CONFIGURATION
# ================================
# Super secret API key (minimum 32 characters)
# Generate with: openssl rand -hex 32
API_KEY=your-super-secret-api-key-here-minimum-32-characters-long

# Allowed origins for CORS (comma-separated)
ALLOWED_ORIGINS=https://your-frontend-domain.com

# ================================
# GITHUB INTEGRATION (Opcional)
# ================================
# GitHub Personal Access Token with 'repo' and 'workflow' permissions
GITHUB_TOKEN=ghp_your_github_personal_access_token_here
GITHUB_REPO=your-username/tu-cop-wallet-2

# ================================
# LOGGING CONFIGURATION
# ================================
LOG_RETENTION_DAYS=30
```

**Variables importantes:**

- **`DATABASE_URL`**: Conexión a PostgreSQL (requerida)
- **`API_KEY`**: Clave de API para autenticación (requerida)
- **`GITHUB_TOKEN`**: Token para integración con GitHub (opcional)
- **`ALLOWED_ORIGINS`**: Dominios permitidos para CORS (opcional)

### 3. Configurar la base de datos

```bash
# Generar el cliente de Prisma
npm run db:generate

# Ejecutar las migraciones
npm run db:migrate

# (Opcional) Abrir Prisma Studio para administrar datos
npm run db:studio
```

### 4. Configuración inicial

```bash
# Ejecutar el script de setup para crear la primera API key
npm run setup
```

Este script:

- Verifica la conexión a la base de datos
- Crea la primera API key de administrador
- Inicializa las versiones por defecto (Android e iOS: 1.102.1)
- Muestra información importante de configuración

**⚠️ IMPORTANTE**: Guarda la API key que se muestra en la consola en un lugar seguro.

### 5. Iniciar el servidor

```bash
# Desarrollo (con hot reload)
npm run dev

# Producción
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 📡 API Endpoints

### Públicos

#### `GET /health`

Health check del servidor y base de datos.

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "versions": {
    "ios": "1.102.1",
    "android": "1.102.1"
  },
  "database": "connected",
  "environment": "production"
}
```

#### `GET /api/app-version`

Obtiene información de versión para la aplicación móvil.

**Headers:**

- `x-platform`: `ios` | `android` (opcional, default: `android`)
- `x-bundle-id`: ID del bundle de la app (opcional)
- `x-app-version`: Versión actual de la app (opcional)

```json
{
  "latestVersion": "1.102.1",
  "minRequiredVersion": "1.95.0",
  "releaseNotes": "Mejoras de rendimiento y corrección de errores",
  "downloadUrl": "https://play.google.com/store/apps/details?id=org.tucop",
  "releaseDate": "2024-01-01T00:00:00.000Z",
  "isForced": false,
  "requiresUpdate": true,
  "platform": "android",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `GET /api/version-info`

Información detallada de todas las plataformas.

```json
{
  "versions": {
    "ios": {
      "latestVersion": "1.102.1",
      "minRequiredVersion": "1.95.0",
      "releaseNotes": "Mejoras de rendimiento",
      "downloadUrl": "https://apps.apple.com/app/tucop-wallet/id1234567890",
      "releaseDate": "2024-01-01T00:00:00.000Z",
      "isForced": false,
      "lastUpdated": "2024-01-01T00:00:00.000Z"
    },
    "android": {
      /* ... */
    }
  },
  "lastUpdated": "2024-01-01T00:00:00.000Z",
  "server": "Railway",
  "environment": "production",
  "totalPlatforms": 2
}
```

### Protegidos (Requieren API Key)

Incluir la API key en el header `x-api-key` o en el body como `apiKey`.

#### `POST /api/update-version`

Actualiza la versión de una plataforma.

```json
{
  "platform": "android",
  "version": "1.103.0",
  "minRequired": "1.95.0",
  "releaseNotes": "Nueva funcionalidad agregada",
  "isForced": false,
  "downloadUrl": "https://play.google.com/store/apps/details?id=org.tucop"
}
```

#### `POST /api/admin/create-api-key`

Crea una nueva API key.

```json
{
  "name": "CI/CD Key",
  "apiKey": "your-64-character-secure-api-key-here",
  "expiresAt": "2025-01-01T00:00:00.000Z"
}
```

#### `GET /api/admin/api-keys`

Lista todas las API keys (sin mostrar el hash).

```json
{
  "apiKeys": [
    {
      "id": "clx123...",
      "name": "Initial Admin Key",
      "isActive": true,
      "lastUsedAt": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": null
    }
  ]
}
```

### Webhooks

#### `POST /api/github-webhook`

Webhook para eventos de GitHub (push, release, etc.).

## 🔒 Seguridad

### API Keys

- Las API keys se almacenan hasheadas con bcrypt (12 salt rounds)
- Soporte para expiración de keys
- Logging de uso de API keys
- Rate limiting estricto para endpoints administrativos

### Rate Limiting

- **General**: 100 requests/15min por IP
- **Administrativos**: 10 requests/15min por IP
- Headers de rate limit incluidos en respuestas

### Headers de Seguridad

- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options, X-Content-Type-Options, etc.

### Validación

- Validación estricta de entrada con express-validator
- Sanitización de versiones para prevenir injection
- Validación de URLs y formatos de fecha

## 📊 Logging y Monitoreo

### Request Logging

Todos los requests se registran en la base de datos con:

- Método HTTP y endpoint
- Plataforma y User-Agent
- IP address y tiempo de respuesta
- Código de estado HTTP

### Webhook Events

Todos los eventos de webhook se almacenan para auditoría:

- Tipo de evento y payload completo
- Estado de procesamiento y errores
- Timestamps de recepción y procesamiento

### Cleanup Automático

- Los logs se limpian automáticamente después de 30 días
- Tarea programada que se ejecuta diariamente a las 2 AM

## 🔄 Integración con GitHub

### Configuración del Token

1. Crear un Personal Access Token en GitHub con permisos:

   - `repo` (acceso completo al repositorio)
   - `workflow` (para disparar builds automáticos)

2. Configurar webhook en GitHub:
   - URL: `https://your-api-domain.com/api/github-webhook`
   - Content type: `application/json`
   - Eventos: `Push`, `Releases`

### Funcionalidades

- **Detección automática** de nuevas versiones en `package.json`
- **Actualización automática** cuando se publican releases
- **Trigger de builds** automáticos via repository dispatch
- **Sincronización** cada hora via cron job

## 🏗️ Arquitectura

```
railway-backend/
├── src/
│   ├── middleware/          # Middleware personalizado
│   │   ├── auth.js         # Autenticación con API keys
│   │   └── logging.js      # Logging de requests
│   ├── services/           # Lógica de negocio
│   │   └── versionService.js # Gestión de versiones
│   ├── utils/              # Utilidades
│   │   └── auth.js         # Funciones de autenticación
│   └── validators/         # Validadores
│       └── version.js      # Validación de datos
├── scripts/
│   └── setup.js           # Script de configuración inicial
├── prisma/
│   └── schema.prisma      # Esquema de base de datos
├── index.js               # Servidor principal
└── package.json
```

## 🗄️ Esquema de Base de Datos

### `app_versions`

Almacena las versiones de cada plataforma.

### `api_keys`

Gestiona las API keys de autenticación.

### `request_logs`

Logs de todas las peticiones HTTP.

### `webhook_events`

Eventos recibidos de GitHub webhooks.

## 🚀 Deployment en Railway

### Variables de Entorno Requeridas

```bash
DATABASE_URL=postgresql://...
API_KEY=your-secure-api-key
GITHUB_TOKEN=ghp_...
GITHUB_REPO=your-username/tu-cop-wallet-2
```

### Build y Deploy

Railway detecta automáticamente el proyecto Node.js y ejecuta:

1. `npm install`
2. `npm run build` (genera cliente Prisma)
3. `npm start` (ejecuta migraciones y inicia servidor)

## 🧪 Testing

```bash
# Ejecutar linter
npm run lint

# Corregir errores de lint automáticamente
npm run lint:fix

# Tests (a implementar)
npm test
```

## 📚 Scripts Disponibles

- `npm start` - Inicia en producción (con migraciones)
- `npm run dev` - Inicia en desarrollo con nodemon
- `npm run setup` - Configuración inicial
- `npm run build` - Genera cliente Prisma
- `npm run db:migrate` - Ejecuta migraciones
- `npm run db:reset` - Resetea la base de datos
- `npm run db:studio` - Abre Prisma Studio
- `npm run lint` - Ejecuta ESLint
- `npm run lint:fix` - Corrige errores de lint

## 🆘 Troubleshooting

### Error: "Missing script: start"

Si ejecutas `npm start` desde el directorio raíz del proyecto en lugar del directorio `railway-backend/`:

```bash
# ❌ Incorrecto (desde tu-cop-wallet-2/)
npm start

# ✅ Correcto (desde railway-backend/)
cd railway-backend
npm start
```

### Error de versión de Node.js

Si obtienes errores sobre versiones incompatibles de Node.js:

```bash
# Verificar tu versión de Node.js
node --version

# El proyecto soporta Node.js >=18.x (probado con 20.x)
# Si tienes una versión menor, actualiza Node.js
```

### Error de conexión a base de datos

1. **Verificar `DATABASE_URL`**:

   ```bash
   # Verificar que la URL esté correctamente configurada
   echo $DATABASE_URL
   ```

2. **PostgreSQL no ejecutándose**:

   ```bash
   # Verificar que PostgreSQL esté corriendo
   # macOS con Homebrew:
   brew services start postgresql

   # Linux/Ubuntu:
   sudo systemctl start postgresql
   ```

3. **Aplicar migraciones**:
   ```bash
   npm run db:migrate
   ```

### Error de autenticación

1. **API key no encontrada**:

   ```bash
   # Crear nueva API key
   npm run setup
   ```

2. **Formato de autenticación**:

   ```bash
   # Usar header x-api-key
   curl -H "x-api-key: your-api-key-here" http://localhost:3000/api/admin/api-keys

   # O en el body de la petición
   curl -X POST http://localhost:3000/api/update-version \
     -H "Content-Type: application/json" \
     -d '{"apiKey": "your-api-key-here", "platform": "android", "version": "1.103.0"}'
   ```

### Error: "Prisma Client not generated"

```bash
# Generar el cliente Prisma
npm run db:generate

# O ejecutar setup completo
npm run db:migrate
```

### Rate limiting

1. **Demasiadas peticiones**:

   - **General**: Máximo 100 requests/15min por IP
   - **Admin**: Máximo 10 requests/15min por IP

2. **Soluciones**:
   - Esperar 15 minutos para que se resetee el límite
   - Usar diferentes IPs para testing
   - Implementar backoff en tu cliente

### Puerto en uso

```bash
# Error: EADDRINUSE :::3000
# Cambiar puerto en .env
PORT=3001

# O matar proceso que usa el puerto
lsof -ti:3000 | xargs kill -9
```

## 📖 Ejemplos de Uso

### Verificar versión (público)

```bash
# Obtener versión para Android
curl -H "x-platform: android" \
     -H "x-app-version: 1.103.0" \
     http://localhost:3000/api/app-version

# Respuesta:
{
  "latestVersion": "1.102.1",
  "minRequiredVersion": "1.95.0",
  "requiresUpdate": true,
  "isForced": false,
  "downloadUrl": "https://play.google.com/store/apps/details?id=org.tucop"
}
```

### Actualizar versión (requiere API key)

```bash
curl -X POST http://localhost:3000/api/update-version \
  -H "Content-Type: application/json" \
  -H "x-api-key: c6b499bd78225a2274f35565095d6eddcb7955e9df466b5bbcd1deff3740345b" \
  -d '{
    "platform": "android",
    "version": "1.103.0",
    "minRequired": "1.95.0",
    "releaseNotes": "Nueva funcionalidad agregada",
    "isForced": false
  }'
```

### Health check

```bash
curl http://localhost:3000/health

# Respuesta:
{
  "status": "healthy",
  "uptime": 3600,
  "versions": {
    "ios": "1.102.1",
    "android": "1.102.1"
  },
  "database": "connected"
}
```

### Crear nueva API key

```bash
curl -X POST http://localhost:3000/api/admin/create-api-key \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-existing-api-key" \
  -d '{
    "name": "CI/CD Key",
    "apiKey": "new-64-character-secure-api-key-here-minimum-32-chars-long",
    "expiresAt": "2025-12-31T23:59:59.000Z"
  }'
```

## 📄 Licencia

MIT License - Ver archivo LICENSE para detalles.

## 👥 Contribuir

1. Fork el proyecto
2. Crear branch para feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

---

**TuCOP Wallet Version API** - Gestión robusta y segura de versiones para aplicaciones móviles.
