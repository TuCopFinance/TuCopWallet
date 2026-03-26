# TuCOP Wallet Version API

Robust and secure API for managing TuCOP Wallet mobile application versions, built with Express.js, Prisma, and PostgreSQL.

> **⚠️ IMPORTANT**: This API backend is located in the `railway-backend/` directory of the TuCOP Wallet project. Make sure to run all commands from this directory.

## 📊 Project Status

✅ **Implemented and Running**:

- Complete backend with Express.js and PostgreSQL
- Secure authentication with hashed API keys
- Database configured with Prisma ORM
- Public and protected endpoints
- Rate limiting and security headers
- Complete request logging
- GitHub integration (webhooks and auto-updates)
- Robust data validation
- Health checks and monitoring
- Initial setup script

🎯 **Current Version**: `1.0.0`
📅 **Last Updated**: January 2025
🏗️ **Ready for**: Development and Production

## 🚀 Features

- **PostgreSQL database** with Prisma ORM
- **Secure authentication** with hashed API keys
- **Rate limiting** to prevent abuse
- **Complete logging** of requests and events
- **Robust validation** of input data
- **GitHub integration** for automatic updates
- **Webhooks** for GitHub events
- **Health checks** and monitoring
- **Centralized error handling**
- **Compression** and performance optimizations

## ⚡ Quick Start

```bash
# 1. Navigate to the backend directory
cd railway-backend

# 2. Install dependencies
npm install

# 3. Configure environment variables (see configuration section)
cp .env.example .env
# Edit .env with your values

# 4. Set up database and generate client
npm run db:generate
npm run db:migrate

# 5. Initial setup (create first API key)
npm run setup

# 6. Start server
npm run dev
```

## 📋 Prerequisites

- **Node.js** 18.x or higher (tested with Node.js 20.x)
- **PostgreSQL** 13 or higher
- **GitHub account** with personal access token (optional for integration)

## 🛠️ Detailed Installation

### 1. Clone and install dependencies

```bash
# From the TuCOP Wallet project root directory
cd railway-backend
npm install
```

> **💡 Tip**: If you encounter Node.js version errors, the project supports Node.js >=18.x

### 2. Configure environment variables

Create a `.env` file with the following variables:

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
# GITHUB INTEGRATION (Optional)
# ================================
# GitHub Personal Access Token with 'repo' and 'workflow' permissions
GITHUB_TOKEN=ghp_your_github_personal_access_token_here
GITHUB_REPO=your-username/tu-cop-wallet-2

# ================================
# LOGGING CONFIGURATION
# ================================
LOG_RETENTION_DAYS=30
```

**Important variables:**

- **`DATABASE_URL`**: PostgreSQL connection string (required)
- **`API_KEY`**: API key for authentication (required)
- **`GITHUB_TOKEN`**: Token for GitHub integration (optional)
- **`ALLOWED_ORIGINS`**: Allowed domains for CORS (optional)

### 3. Set up the database

```bash
# Generate the Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# (Optional) Open Prisma Studio to manage data
npm run db:studio
```

### 4. Initial setup

```bash
# Run the setup script to create the first API key
npm run setup
```

This script:

- Verifies the database connection
- Creates the first admin API key
- Initializes default versions (Android and iOS: 1.102.1)
- Displays important configuration information

**⚠️ IMPORTANT**: Save the API key displayed in the console in a secure location.

### 5. Start the server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

The server will be available at `http://localhost:3000`

## 📡 API Endpoints

### Public

#### `GET /health`

Server and database health check.

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

Retrieves version information for the mobile application.

**Headers:**

- `x-platform`: `ios` | `android` (optional, default: `android`)
- `x-bundle-id`: App bundle ID (optional)
- `x-app-version`: Current app version (optional)

```json
{
  "latestVersion": "1.102.1",
  "minRequiredVersion": "1.95.0",
  "releaseNotes": "Performance improvements and bug fixes",
  "downloadUrl": "https://play.google.com/store/apps/details?id=org.tucop",
  "releaseDate": "2024-01-01T00:00:00.000Z",
  "isForced": false,
  "requiresUpdate": true,
  "platform": "android",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `GET /api/version-info`

Detailed information for all platforms.

```json
{
  "versions": {
    "ios": {
      "latestVersion": "1.102.1",
      "minRequiredVersion": "1.95.0",
      "releaseNotes": "Performance improvements",
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

### Protected (Require API Key)

Include the API key in the `x-api-key` header or in the body as `apiKey`.

#### `POST /api/update-version`

Updates the version for a platform.

```json
{
  "platform": "android",
  "version": "1.103.0",
  "minRequired": "1.95.0",
  "releaseNotes": "New feature added",
  "isForced": false,
  "downloadUrl": "https://play.google.com/store/apps/details?id=org.tucop"
}
```

#### `POST /api/admin/create-api-key`

Creates a new API key.

```json
{
  "name": "CI/CD Key",
  "apiKey": "your-64-character-secure-api-key-here",
  "expiresAt": "2025-01-01T00:00:00.000Z"
}
```

#### `GET /api/admin/api-keys`

Lists all API keys (without showing the hash).

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

Webhook for GitHub events (push, release, etc.).

## 🔒 Security

### API Keys

- API keys are stored hashed with bcrypt (12 salt rounds)
- Key expiration support
- API key usage logging
- Strict rate limiting for administrative endpoints

### Rate Limiting

- **General**: 100 requests/15min per IP
- **Administrative**: 10 requests/15min per IP
- Rate limit headers included in responses

### Security Headers

- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options, X-Content-Type-Options, etc.

### Validation

- Strict input validation with express-validator
- Version sanitization to prevent injection
- URL and date format validation

## 📊 Logging and Monitoring

### Request Logging

All requests are recorded in the database with:

- HTTP method and endpoint
- Platform and User-Agent
- IP address and response time
- HTTP status code

### Webhook Events

All webhook events are stored for auditing:

- Event type and full payload
- Processing status and errors
- Reception and processing timestamps

### Automatic Cleanup

- Logs are automatically cleaned up after 30 days
- Scheduled task that runs daily at 2 AM

## 🔄 GitHub Integration

### Token Configuration

1. Create a Personal Access Token on GitHub with permissions:

   - `repo` (full repository access)
   - `workflow` (to trigger automatic builds)

2. Configure webhook on GitHub:
   - URL: `https://your-api-domain.com/api/github-webhook`
   - Content type: `application/json`
   - Events: `Push`, `Releases`

### Features

- **Automatic detection** of new versions in `package.json`
- **Automatic update** when releases are published
- **Automatic build triggering** via repository dispatch
- **Synchronization** every hour via cron job

## 🏗️ Architecture

```
railway-backend/
├── src/
│   ├── middleware/          # Custom middleware
│   │   ├── auth.js         # API key authentication
│   │   └── logging.js      # Request logging
│   ├── services/           # Business logic
│   │   └── versionService.js # Version management
│   ├── utils/              # Utilities
│   │   └── auth.js         # Authentication functions
│   └── validators/         # Validators
│       └── version.js      # Data validation
├── scripts/
│   └── setup.js           # Initial setup script
├── prisma/
│   └── schema.prisma      # Database schema
├── index.js               # Main server
└── package.json
```

## 🗄️ Database Schema

### `app_versions`

Stores the versions for each platform.

### `api_keys`

Manages authentication API keys.

### `request_logs`

Logs of all HTTP requests.

### `webhook_events`

Events received from GitHub webhooks.

## 🚀 Deployment on Railway

### Required Environment Variables

```bash
DATABASE_URL=postgresql://...
API_KEY=your-secure-api-key
GITHUB_TOKEN=ghp_...
GITHUB_REPO=your-username/tu-cop-wallet-2
```

### Build and Deploy

Railway automatically detects the Node.js project and runs:

1. `npm install`
2. `npm run build` (generates Prisma client)
3. `npm start` (runs migrations and starts server)

## 🧪 Testing

```bash
# Run linter
npm run lint

# Auto-fix lint errors
npm run lint:fix

# Tests (to be implemented)
npm test
```

## 📚 Available Scripts

- `npm start` - Start in production (with migrations)
- `npm run dev` - Start in development with nodemon
- `npm run setup` - Initial setup
- `npm run build` - Generate Prisma client
- `npm run db:migrate` - Run migrations
- `npm run db:reset` - Reset the database
- `npm run db:studio` - Open Prisma Studio
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix lint errors

## 🆘 Troubleshooting

### Error: "Missing script: start"

If you run `npm start` from the project root directory instead of the `railway-backend/` directory:

```bash
# ❌ Incorrect (from tu-cop-wallet-2/)
npm start

# ✅ Correct (from railway-backend/)
cd railway-backend
npm start
```

### Node.js version error

If you get errors about incompatible Node.js versions:

```bash
# Check your Node.js version
node --version

# The project supports Node.js >=18.x (tested with 20.x)
# If you have a lower version, update Node.js
```

### Database connection error

1. **Verify `DATABASE_URL`**:

   ```bash
   # Verify that the URL is correctly configured
   echo $DATABASE_URL
   ```

2. **PostgreSQL not running**:

   ```bash
   # Verify that PostgreSQL is running
   # macOS with Homebrew:
   brew services start postgresql

   # Linux/Ubuntu:
   sudo systemctl start postgresql
   ```

3. **Apply migrations**:
   ```bash
   npm run db:migrate
   ```

### Authentication error

1. **API key not found**:

   ```bash
   # Create a new API key
   npm run setup
   ```

2. **Authentication format**:

   ```bash
   # Use x-api-key header
   curl -H "x-api-key: your-api-key-here" http://localhost:3000/api/admin/api-keys

   # Or in the request body
   curl -X POST http://localhost:3000/api/update-version \
     -H "Content-Type: application/json" \
     -d '{"apiKey": "your-api-key-here", "platform": "android", "version": "1.103.0"}'
   ```

### Error: "Prisma Client not generated"

```bash
# Generate the Prisma client
npm run db:generate

# Or run full setup
npm run db:migrate
```

### Rate limiting

1. **Too many requests**:

   - **General**: Maximum 100 requests/15min per IP
   - **Admin**: Maximum 10 requests/15min per IP

2. **Solutions**:
   - Wait 15 minutes for the limit to reset
   - Use different IPs for testing
   - Implement backoff in your client

### Port in use

```bash
# Error: EADDRINUSE :::3000
# Change port in .env
PORT=3001

# Or kill the process using the port
lsof -ti:3000 | xargs kill -9
```

## 📖 Usage Examples

### Check version (public)

```bash
# Get version for Android
curl -H "x-platform: android" \
     -H "x-app-version: 1.103.0" \
     http://localhost:3000/api/app-version

# Response:
{
  "latestVersion": "1.102.1",
  "minRequiredVersion": "1.95.0",
  "requiresUpdate": true,
  "isForced": false,
  "downloadUrl": "https://play.google.com/store/apps/details?id=org.tucop"
}
```

### Update version (requires API key)

```bash
curl -X POST http://localhost:3000/api/update-version \
  -H "Content-Type: application/json" \
  -H "x-api-key: c6b499bd78225a2274f35565095d6eddcb7955e9df466b5bbcd1deff3740345b" \
  -d '{
    "platform": "android",
    "version": "1.103.0",
    "minRequired": "1.95.0",
    "releaseNotes": "New feature added",
    "isForced": false
  }'
```

### Health check

```bash
curl http://localhost:3000/health

# Response:
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

### Create new API key

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

## 📄 License

MIT License - See LICENSE file for details.

## 👥 Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

**TuCOP Wallet Version API** - Robust and secure version management for mobile applications.
