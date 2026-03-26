# 🚀 Proceso Paso a Paso para Nueva Versión - TuCOP Wallet

## 📋 Resumen del Proceso

Este documento describe el proceso completo para generar una nueva versión de TuCOP Wallet usando nuestro sistema CI/CD automatizado.

---

## 🔧 Preparación Inicial

### 1. Verificar Estado del Proyecto

```bash
# Cambiar a la rama principal
git checkout main

# Actualizar con los últimos cambios
git pull origin main

# Verificar que no hay cambios pendientes
git status
```

### 2. Ejecutar Verificaciones

```bash
# Ejecutar tests
yarn test

# Verificar linting
yarn lint

# Verificar compilación TypeScript
yarn build:ts

# Verificar que todo esté funcionando
yarn dev:android  # O yarn dev:ios para probar
```

---

## 🎯 Generación de Nueva Versión

### Opción A: Automático (Recomendado)

#### Para Bug Fixes (Patch)

```bash
# Incrementa 1.100.0 → 1.100.1
yarn version --patch
```

#### Para Nuevas Features (Minor)

```bash
# Incrementa 1.100.0 → 1.101.0
yarn version --minor
```

#### Para Breaking Changes (Major)

```bash
# Incrementa 1.100.0 → 2.0.0
yarn version --major
```

### Opción B: Manual

#### 1. Editar package.json

```json
{
  "name": "@valora/wallet",
  "version": "1.103.0" // ← Cambiar aquí
  // ...
}
```

#### 2. Commit y Tag

```bash
git add package.json
git commit -m "chore: bump version to 1.103.0"
git tag v1.103.0
```

---

## 📤 Despliegue

### 1. Push a GitHub

```bash
# Push con tags (activa CI/CD automáticamente)
git push origin main --follow-tags
```

### 2. Verificar Activación del CI/CD

```bash
# Ver workflows en ejecución
gh run list

# Ver detalles de un workflow específico
gh run view [run-id]
```

---

## ⚡ Proceso Automático (Lo que sucede tras el push)

### 1. Detección de Cambios

- ✅ GitHub Actions detecta cambio en `package.json`
- ✅ Se activa el workflow `auto-build.yml`
- ✅ Se valida que la versión cambió

### 2. Bump de Versión (si es necesario)

- ✅ Se ejecuta `yarn pre-deploy` si no hubo cambio manual
- ✅ Se actualiza build number automáticamente
- ✅ Se hace commit automático de cambios

### 3. Build Android

- ✅ Se compila para **mainnet** y **testnet (Celo Sepolia)**
- ✅ Se genera AAB (Android App Bundle)
- ✅ Se sube a **Google Play Store (Internal Track)**
- ✅ Se guarda artifact en GitHub

### 4. Build iOS

- ✅ Se compila para **mainnet** y **testnet (Celo Sepolia)**
- ✅ Se genera IPA
- ✅ Se sube a **TestFlight**
- ✅ Se guarda artifact en GitHub

### 5. Actualización del Backend

- ✅ Railway backend se actualiza automáticamente
- ✅ Nueva versión disponible para verificación de actualizaciones
- ✅ Se configura `minRequiredVersion` si es necesario

### 6. Notificaciones

- ✅ Se crea **GitHub Release** automáticamente
- ✅ Se envía notificación a **Slack** (si está configurado)
- ✅ Se actualiza documentación de release

---

## 🔍 Verificación del Proceso

### 1. Verificar Backend Actualizado

```bash
# Verificar versión en el backend
curl -H "X-Platform: android" -H "X-Bundle-ID: org.tucop" \
  https://tucopwallet-production.up.railway.app/api/app-version

# Respuesta esperada:
# {
#   "latestVersion": "1.103.0",
#   "minRequiredVersion": "1.95.0",
#   "isForced": false,
#   "downloadUrl": "https://play.google.com/store/apps/details?id=org.tucop"
# }
```

### 2. Verificar GitHub Actions

```bash
# Ver lista de workflows
gh run list

# Ver logs de un workflow específico
gh run view [run-id] --log
```

### 3. Verificar Releases

```bash
# Ver releases creados
gh release list

# Ver detalles de un release
gh release view v1.103.0
```

### 4. Verificar Deployments

#### Google Play Store

1. Ir a [Google Play Console](https://play.google.com/console)
2. Seleccionar TuCOP Wallet
3. Ir a **Release → Testing → Internal testing**
4. Verificar que la nueva versión esté disponible

#### TestFlight

1. Ir a [App Store Connect](https://appstoreconnect.apple.com)
2. Seleccionar TuCOP Wallet
3. Ir a **TestFlight**
4. Verificar que la nueva build esté disponible

---

## 🚨 Casos Especiales

### Hotfix Urgente

```bash
# 1. Crear branch de hotfix
git checkout -b hotfix/1.103.0

# 2. Hacer cambios críticos
# ... editar archivos ...
git add .
git commit -m "fix: critical security issue"

# 3. Push del hotfix
git push origin hotfix/1.103.0

# 4. Merge a main
git checkout main
git merge hotfix/1.103.0

# 5. Versionar y desplegar
yarn version --patch
git push origin main --follow-tags

# 6. Limpiar branch
git branch -d hotfix/1.103.0
git push origin --delete hotfix/1.103.0
```

### Build Manual (Sin cambio de versión)

```bash
# Disparar build manual con GitHub CLI
gh api repos/:owner/:repo/dispatches \
  --method POST \
  --field event_type='auto-build' \
  --field client_payload='{"version":"1.103.0","reason":"manual-build"}'
```

### Rollback de Versión

```bash
# 1. Revertir commit de versión
git revert HEAD

# 2. Actualizar backend manualmente
curl -X POST "https://tucopwallet-production.up.railway.app/api/update-version" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "both",
    "version": "1.100.0",
    "releaseNotes": "Rollback to previous version",
    "apiKey": "[TU_API_KEY]"
  }'

# 3. Push del rollback
git push origin main
```

---

## 📊 Monitoreo y Logs

### Railway Backend

```bash
# Ver logs del backend
cd railway-backend
railway logs

# Verificar health del backend
curl https://tucopwallet-production.up.railway.app/health
```

### GitHub Actions

```bash
# Ver workflows activos
gh run list --limit 10

# Ver logs en tiempo real
gh run watch [run-id]
```

### Verificar Actualizaciones en la App

```bash
# La app verifica automáticamente cada 24 horas
# Para forzar verificación, reiniciar la app o usar:
# NavigatorWrapper.tsx → useAppUpdateChecker con checkOnAppStart: true
```

---

## ⏱️ Tiempos Estimados

| Proceso               | Tiempo Estimado   |
| --------------------- | ----------------- |
| **Preparación**       | 5-10 minutos      |
| **Versioning**        | 1-2 minutos       |
| **Android Build**     | 15-20 minutos     |
| **iOS Build**         | 20-25 minutos     |
| **Play Store Upload** | 5-10 minutos      |
| **TestFlight Upload** | 10-15 minutos     |
| **Backend Update**    | 1-2 minutos       |
| **Total**             | **45-60 minutos** |

---

## 🎯 Checklist de Nueva Versión

### Antes del Release

- [ ] ✅ Tests pasando
- [ ] ✅ Linting sin errores
- [ ] ✅ Build TypeScript exitoso
- [ ] ✅ Cambios documentados
- [ ] ✅ Release notes preparadas

### Durante el Release

- [ ] ✅ Versión incrementada correctamente
- [ ] ✅ Push con tags realizado
- [ ] ✅ GitHub Actions activado
- [ ] ✅ Builds iniciados

### Después del Release

- [ ] ✅ Backend actualizado
- [ ] ✅ Play Store deployment exitoso
- [ ] ✅ TestFlight deployment exitoso
- [ ] ✅ GitHub Release creado
- [ ] ✅ Notificaciones enviadas
- [ ] ✅ Documentación actualizada

---

## 🆘 Troubleshooting

### Build Falla

1. **Verificar secrets de GitHub**

   ```bash
   gh secret list
   ```

2. **Revisar logs de GitHub Actions**

   ```bash
   gh run view [run-id] --log
   ```

3. **Verificar certificados**
   - Android: Google Play JSON key
   - iOS: Apple Connect certificates

### Backend No Responde

1. **Verificar logs de Railway**

   ```bash
   cd railway-backend && railway logs
   ```

2. **Verificar variables de entorno**

   ```bash
   railway variables
   ```

3. **Verificar conectividad**
   ```bash
   curl https://tucopwallet-production.up.railway.app/health
   ```

### App No Detecta Actualizaciones

1. **Verificar configuración en NavigatorWrapper**

   ```typescript
   useBackend: true // Debe estar en true
   ```

2. **Verificar URL del backend**

   ```typescript
   // En appUpdateChecker.ts
   'https://tucopwallet-production.up.railway.app/api/app-version'
   ```
