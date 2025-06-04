#!/bin/bash

# Script para configurar CI/CD automático con Railway y GitHub
# Uso: ./scripts/setup-ci-cd.sh

set -e

echo "🚀 Configurando CI/CD para Tu Cop Wallet"
echo "========================================"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir mensajes coloreados
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Verificar dependencias
check_dependencies() {
    print_info "Verificando dependencias..."

    if ! command -v gh &> /dev/null; then
        print_error "GitHub CLI no está instalado. Instálalo desde: https://cli.github.com/"
        exit 1
    fi

    if ! command -v railway &> /dev/null; then
        print_warning "Railway CLI no está instalado. Instálalo desde: https://railway.app/cli"
        echo "Puedes continuar sin Railway CLI, pero tendrás que configurar Railway manualmente."
        read -p "¿Continuar? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    print_status "Dependencias verificadas"
}

# Configurar Railway
setup_railway() {
    print_info "Configurando Railway..."

    if command -v railway &> /dev/null; then
        echo "1. Autenticándose en Railway..."
        railway login

        echo "2. Inicializando proyecto..."
        cd railway-backend
        railway init

        echo "3. Configurando variables de entorno..."
        railway variables set NODE_ENV=production
        railway variables set GITHUB_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

        # Generar API key aleatoria
        API_KEY=$(openssl rand -hex 32)
        railway variables set API_KEY="$API_KEY"

        echo "4. Desplegando backend..."
        railway up

        # Obtener URL del deployment
        RAILWAY_URL=$(railway status --json | jq -r '.deployments[0].url' 2>/dev/null || echo "")
        if [ -z "$RAILWAY_URL" ]; then
            echo "No se pudo obtener la URL automáticamente."
            read -p "Ingresa la URL de tu deployment de Railway: " RAILWAY_URL
        fi

        echo "Railway URL: $RAILWAY_URL"
        cd ..

        print_status "Railway configurado correctamente"
        echo "API Key generada: $API_KEY"
        echo "Guarda esta API key para configurar GitHub Secrets"
    else
        print_warning "Railway CLI no disponible. Configura manualmente:"
        echo "1. Ve a https://railway.app"
        echo "2. Crea un nuevo proyecto con template Node.js"
        echo "3. Sube los archivos de railway-backend/"
        echo "4. Configura las variables de entorno necesarias"
    fi
}

# Configurar GitHub Secrets
setup_github_secrets() {
    print_info "Configurando GitHub Secrets..."

    echo "Configurando secrets necesarios para CI/CD..."

    # Verificar si el usuario está autenticado en GitHub
    if ! gh auth status &> /dev/null; then
        print_info "Autenticándose en GitHub..."
        gh auth login
    fi

    # Lista de secrets requeridos
    declare -A secrets=(
        ["SECRETS_PASSWORD"]="Contraseña para descifrar archivos de secretos"
        ["GOOGLE_PLAY_JSON_KEY"]="JSON key para Google Play Store"
        ["APPLE_CONNECT_KEY_ID"]="Apple Connect API Key ID"
        ["APPLE_CONNECT_ISSUER_ID"]="Apple Connect Issuer ID"
        ["APPLE_CONNECT_CERTIFICATE_PATH"]="Ruta del certificado de Apple"
        ["RAILWAY_API_URL"]="URL de tu API en Railway"
        ["RAILWAY_API_KEY"]="API Key para autenticar con Railway"
        ["SLACK_WEBHOOK_URL"]="Webhook URL para notificaciones de Slack (opcional)"
    )

    for secret in "${!secrets[@]}"; do
        echo ""
        echo "Configurando secret: $secret"
        echo "Descripción: ${secrets[$secret]}"

        if [ "$secret" = "RAILWAY_API_KEY" ] && [ ! -z "$API_KEY" ]; then
            # Usar la API key generada automáticamente
            echo "$API_KEY" | gh secret set "$secret"
            print_status "Secret $secret configurado automáticamente"
        elif [ "$secret" = "RAILWAY_API_URL" ] && [ ! -z "$RAILWAY_URL" ]; then
            # Usar la URL de Railway obtenida automáticamente
            echo "$RAILWAY_URL" | gh secret set "$secret"
            print_status "Secret $secret configurado automáticamente"
        else
            # Pedir al usuario que ingrese el valor
            read -p "Ingresa el valor para $secret (o presiona Enter para omitir): " -s secret_value
            echo

            if [ ! -z "$secret_value" ]; then
                echo "$secret_value" | gh secret set "$secret"
                print_status "Secret $secret configurado"
            else
                print_warning "Secret $secret omitido - configúralo manualmente después"
            fi
        fi
    done

    print_status "GitHub Secrets configurados"
}

# Configurar webhook de GitHub
setup_github_webhook() {
    print_info "Configurando webhook de GitHub..."

    if [ ! -z "$RAILWAY_URL" ]; then
        WEBHOOK_URL="$RAILWAY_URL/api/github-webhook"

        # Crear webhook usando GitHub CLI
        gh api repos/:owner/:repo/hooks \
            --method POST \
            --field name='web' \
            --field active=true \
            --field config[url]="$WEBHOOK_URL" \
            --field config[content_type]='json' \
            --field events[]='push' \
            --field events[]='release' \
            --field events[]='repository_dispatch'

        print_status "Webhook configurado: $WEBHOOK_URL"
    else
        print_warning "No se pudo configurar el webhook automáticamente"
        echo "Configúralo manualmente en GitHub:"
        echo "1. Ve a Settings > Webhooks en tu repositorio"
        echo "2. Añade webhook con URL: [TU_RAILWAY_URL]/api/github-webhook"
        echo "3. Selecciona eventos: push, release, repository_dispatch"
    fi
}

# Actualizar configuración de la app
update_app_config() {
    print_info "Actualizando configuración de la app..."

    # Actualizar appUpdateChecker para usar backend
    if [ -f "src/navigator/NavigatorWrapper.tsx" ]; then
        sed -i.bak 's/useBackend: false/useBackend: true/' src/navigator/NavigatorWrapper.tsx
        print_status "Configuración de la app actualizada para usar backend"
    fi

    # Actualizar URL del backend en appUpdateChecker
    if [ ! -z "$RAILWAY_URL" ] && [ -f "src/utils/appUpdateChecker.ts" ]; then
        sed -i.bak "s|https://tu-backend.com/api/app-version|$RAILWAY_URL/api/app-version|" src/utils/appUpdateChecker.ts
        print_status "URL del backend actualizada en appUpdateChecker"
    fi
}

# Crear documentación
create_documentation() {
    print_info "Creando documentación..."

    cat > CI-CD-SETUP.md << EOF
# 🚀 Configuración CI/CD - Tu Cop Wallet

## Resumen del Sistema

Este proyecto está configurado con un sistema completo de CI/CD que automatiza:

- ✅ **Detección automática de cambios de versión**
- ✅ **Build automático para Android e iOS**
- ✅ **Despliegue a Play Store (Internal) y TestFlight**
- ✅ **Gestión de versiones con Railway backend**
- ✅ **Notificaciones en Slack**
- ✅ **Creación automática de releases en GitHub**

## Componentes

### 1. Railway Backend
- **URL**: $RAILWAY_URL
- **Endpoints**:
  - \`GET /api/app-version\` - Verificación de versiones para la app
  - \`POST /api/update-version\` - Actualización manual de versiones
  - \`POST /api/github-webhook\` - Webhook para eventos de GitHub
  - \`GET /health\` - Health check

### 2. GitHub Actions
- **Workflow**: \`.github/workflows/auto-build.yml\`
- **Triggers**:
  - Push a main con cambios en package.json
  - Creación de releases
  - Repository dispatch events
  - Cambios en código fuente

### 3. Fastlane
- **Android**: Build y upload a Play Store
- **iOS**: Build y upload a TestFlight
- **Environments**: mainnet, alfajores

## Flujo de Trabajo

1. **Desarrollador hace push a main**
2. **GitHub Actions detecta cambios**
3. **Se incrementa versión automáticamente (si es necesario)**
4. **Se compila para Android e iOS**
5. **Se despliega a tiendas de aplicaciones**
6. **Railway backend se actualiza con nueva versión**
7. **Se crea release en GitHub**
8. **Se envía notificación a Slack**

## Configuración Manual Adicional

### Secrets de GitHub Requeridos
$(for secret in "${!secrets[@]}"; do echo "- \`$secret\`: ${secrets[$secret]}"; done)

### Variables de Railway
- \`NODE_ENV=production\`
- \`GITHUB_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "tu-usuario/tu-repo")\`
- \`API_KEY=[GENERADA_AUTOMATICAMENTE]\`
- \`GITHUB_TOKEN=[TU_GITHUB_TOKEN]\`

## Comandos Útiles

### Disparar build manual:
\`\`\`bash
gh api repos/:owner/:repo/dispatches \\
  --method POST \\
  --field event_type='auto-build' \\
  --field client_payload='{"version":"1.101.0"}'
\`\`\`

### Verificar estado del backend:
\`\`\`bash
curl $RAILWAY_URL/health
\`\`\`

### Actualizar versión manualmente:
\`\`\`bash
curl -X POST "$RAILWAY_URL/api/update-version" \\
  -H "Content-Type: application/json" \\
  -d '{
    "platform": "both",
    "version": "1.101.0",
    "releaseNotes": "Nueva versión manual",
    "apiKey": "[TU_API_KEY]"
  }'
\`\`\`

## Monitoreo

- **Railway Logs**: \`railway logs\`
- **GitHub Actions**: Ve a la pestaña Actions en GitHub
- **App Store Connect**: Para iOS builds
- **Google Play Console**: Para Android builds

## Troubleshooting

### Build falla
1. Verificar secrets de GitHub
2. Revisar logs en GitHub Actions
3. Verificar certificados y perfiles de provisioning

### Backend no responde
1. Verificar logs en Railway: \`railway logs\`
2. Verificar variables de entorno
3. Verificar conectividad con GitHub API

### App no detecta actualizaciones
1. Verificar que \`useBackend: true\` en NavigatorWrapper
2. Verificar URL del backend en appUpdateChecker
3. Verificar respuesta del endpoint \`/api/app-version\`

EOF

    print_status "Documentación creada: CI-CD-SETUP.md"
}

# Función principal
main() {
    echo ""
    print_info "Iniciando configuración de CI/CD..."
    echo ""

    check_dependencies
    echo ""

    setup_railway
    echo ""

    setup_github_secrets
    echo ""

    setup_github_webhook
    echo ""

    update_app_config
    echo ""

    create_documentation
    echo ""

    print_status "🎉 ¡Configuración completada!"
    echo ""
    echo "Próximos pasos:"
    echo "1. Revisa y completa los GitHub Secrets faltantes"
    echo "2. Configura certificados de iOS y Android"
    echo "3. Haz un push a main para probar el sistema"
    echo "4. Revisa la documentación en CI-CD-SETUP.md"
    echo ""
    print_info "¡Tu sistema de CI/CD está listo! 🚀"
}

# Ejecutar función principal
main "$@"
