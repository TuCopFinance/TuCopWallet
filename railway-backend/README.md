# TuCOP Wallet Version API

API robusta y segura para gestionar versiones de la aplicación móvil TuCOP Wallet, construida con Express.js, Prisma y PostgreSQL.

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

## 📋 Prerequisitos

- Node.js 18.x o superior
- PostgreSQL 13 o superior
- Cuenta de GitHub con token de acceso personal

## 🛠️ Instalación

### 1. Clonar e instalar dependencias

```bash
cd railway-backend
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env` basado en `.env.example`:

```bash
# DATABASE
DATABASE_URL="postgresql://username:password@localhost:5432/tu_cop_wallet_versions?schema=public"

# SERVER
PORT=3000
NODE_ENV=production

# SECURITY
API_KEY=your-super-secret-api-key-here-minimum-32-chars
ALLOWED_ORIGINS=https://your-frontend-domain.com

# GITHUB INTEGRATION
GITHUB_TOKEN=your-github-personal-access-token
GITHUB_REPO=your-username/tu-cop-wallet-2

# LOGGING
LOG_RETENTION_DAYS=30
```

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
- Inicializa las versiones por defecto
- Muestra información importante de configuración

### 5. Iniciar el servidor

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

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

### Error de conexión a base de datos

1. Verificar que `DATABASE_URL` esté correctamente configurada
2. Asegurar que PostgreSQL esté ejecutándose
3. Ejecutar `npm run db:migrate` para aplicar migraciones

### Error de autenticación

1. Verificar que la API key esté configurada correctamente
2. Usar el header `x-api-key` o el campo `apiKey` en el body
3. Ejecutar `npm run setup` para crear una nueva API key

### Rate limiting

1. Verificar que no se estén haciendo demasiadas peticiones
2. Usar diferentes IPs para testing si es necesario
3. Los límites se resetean cada 15 minutos

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
