# TuCOP Wallet - Registro de Tareas

> Archivo unico de seguimiento. Toda tarea pasada, presente y futura se documenta aqui.

---

## COMPLETADO

### Migracion Alfajores -> Celo Sepolia

- [x] Core Network Config: chain ID 44787 -> 11142220, RPC, explorer URLs
- [x] NetworkId enum: `celo-alfajores` -> `celo-sepolia`
- [x] Viem chain import: `celoAlfajores` -> `celoSepolia`
- [x] Gas config: `CELO_ALFAJORES_ID` -> `CELO_SEPOLIA_ID`
- [x] Staging API URLs actualizadas
- [x] Token contract addresses verificadas en Celo Sepolia
- [x] Redux migrations para persisted state con old NetworkId
- [x] ~30 archivos de test actualizados (chain ID, eip155, imports)
- [x] Verificacion: tsc, tests, app conecta a Celo Sepolia, explorer links OK

### Rename Schemes alfajores -> testnet/sepoliaTestnet

- [x] iOS: `MobileStack-alfajores` -> `MobileStack-testnet`, idem dev
- [x] Env files: `.env.alfajores` -> `.env.testnet`, idem dev
- [x] Android flavors: `alfajores` -> `sepoliaTestnet`, idem dev/nightly
- [x] Fastlane lanes actualizadas
- [x] CI workflows actualizados
- [x] Scripts: key_placer, push, setup-ci-cd
- [x] Mocks y test config
- [x] Config code y networkConfig
- [x] Documentacion (README, CLAUDE.md)

### Android Framework Upgrade

- [x] AGP 8.1.1 -> 8.5.1
- [x] Gradle 8.7 (required by AGP 8.5.1)
- [x] Kotlin 1.9.22 (match Gradle 8.7 stdlib)
- [x] Target/Compile SDK 35 (Android 15)
- [x] 16 KB page size support (`useLegacyPackaging = true`)
- [x] RN 0.72 gradle plugin Kotlin patch para Gradle 8.7
- [x] `fix-android-gradle.sh` postinstall script (namespaces, buildFeatures, manifests)

### BucksPay Offramp

- [x] COPm -> COP bank transfer integration via BucksPay API
- [x] Railway proxy (`buckspay-webhook` service) para ocultar API keys
- [x] UI: flujo completo en `src/buckspay/`

### iOS Hotfixes (main, Oct 2025)

- [x] Sentry cleanup y bitcode stripping
- [x] prepareTransactions hotfix
- [x] project.pbxproj ajustes para App Store

### PR #35 - CI/CD Fixes (development -> main)

- [x] Merge main -> development (5 conflictos resueltos)
- [x] Verificacion local: TypeScript, lint (2 fixes), 3848 tests pass
- [x] Fix: Semantic PR title (conventional commits prefix)
- [x] Fix: Detox namespace error (`rm -rf node_modules/detox/android` en CI)
- [x] Fix: Flavor `testnet` -> `sepoliaTestnet` en workflows
- [x] Fix: Workspace/scheme iOS (`MobileStack` no `TuCopWallet`)
- [x] Fix: Versiones en release notes (RN 0.72.15, AGP 8.5.1, Java 11)
- [x] Fix: Signing config condicional en build.gradle (keystore fallback en CI)
- [x] Secrets `KEYSTORE_PASSWORD` y `KEY_ALIAS` pasados como env vars en workflows

---

## EN PROGRESO

### PR #35 - Pendiente CI

- [ ] Esperar resultado de CI tras push del fix de signing config
- [ ] Merge PR a main cuando CI pase

---

## PENDIENTE

### CI/CD - Keystore en GitHub (builds firmados)

- [ ] Codificar `tucop.keystore` en base64: `base64 -i android/app/tucop.keystore`
- [ ] Agregar secret `KEYSTORE_BASE64` en GitHub (Settings > Secrets > Actions)
- [ ] Agregar secret `KEYSTORE_PASSWORD` en GitHub
- [ ] Agregar paso en workflow que decodifica keystore antes del build:

  ```yaml
  - name: Decode keystore
    run: echo "$KEYSTORE_BASE64" | base64 -d > android/app/tucop.keystore
    env:
      KEYSTORE_BASE64: ${{ secrets.KEYSTORE_BASE64 }}
  ```

### CI/CD - Secrets restantes (ver .github/SETUP_CHECKLIST.md)

- [ ] `RAILWAY_API_URL` - URL del servidor Railway
- [ ] `RAILWAY_API_KEY` - API key para autenticacion
- [ ] `GOOGLE_PLAY_JSON_KEY` - Service account de Google Play
- [ ] `SLACK_WEBHOOK_URL` - Webhook de Slack para notificaciones
- [ ] Secrets de iOS (Apple Connect key, issuer, certificate) - cuando se habilite iOS CI

### Infraestructura

- [ ] Self-hosted macOS runner para E2E iOS tests (tenemos Mac disponible)
- [ ] Deploy automatico a Google Play via fastlane (`internal` track)
- [ ] Slack: crear webhook y configurar canal `#builds`
- [ ] Railway: verificar endpoint `POST /api/update-version` funciona

### Cleanup post-merge

- [ ] Eliminar branches obsoletas (local + remote):
  - `Framework-Refactoring`
  - `Framework-Deploy`
  - `Framework-Updates-iOS`
  - `feature/buckspay-API`
  - `framework-android`
  - `refactor/alfajores-to-sepolia`
- [ ] Verificar que `main` tiene todo el contenido tras merge
- [ ] Actualizar `.github/SETUP_CHECKLIST.md` (aun referencia `.env.alfajores` en main)
