# 🚀 Automated CI/CD System - Tu Cop Wallet

## What does this system do?

This system fully automates the build, versioning, and distribution process for your React Native app:

### ✅ **Key Features**

1. **Automatic Change Detection**

   - Detects when you change the version in `package.json`
   - Listens for pushes to the `main` branch
   - Responds to the creation of releases on GitHub

2. **Automatic Versioning**

   - Automatically increments the version if none is specified
   - Updates Android and iOS build files
   - Keeps all version files in sync

3. **Automatic Build**

   - Builds for Android (Play Store Bundle)
   - Builds for iOS (TestFlight Archive)
   - Supports multiple environments (mainnet, testnet)

4. **Automatic Distribution**

   - Automatically uploads to Play Store (Internal Track)
   - Automatically uploads to TestFlight
   - Creates GitHub releases with artifacts

5. **Version Backend**

   - Railway API to manage versions
   - Endpoint for the app to check for updates
   - Webhook to sync with GitHub

6. **Notifications**
   - Slack notifications for build status
   - Detailed logs in GitHub Actions
   - Real-time monitoring

## 🏗️ **System Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Developer    │    │     GitHub      │    │     Railway     │
│                 │    │                 │    │                 │
│ 1. Push to main │───▶│ 2. GitHub       │───▶│ 3. Webhook      │
│                 │    │    Actions      │    │    received     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │                        │
                               ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Play Store    │◀───│ 4. Build &      │    │ 5. Update       │
│   TestFlight    │    │    Deploy       │    │    versions     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │                        │
                               ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Slack       │◀───│ 6. Create       │    │ 7. App checks   │
│  Notification   │    │    Release      │    │    for updates  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 **Quick Setup**

### Step 1: Run the Setup Script

```bash
./scripts/setup-ci-cd.sh
```

This script automatically:

- ✅ Configures Railway with the backend
- ✅ Configures GitHub Secrets
- ✅ Configures webhooks
- ✅ Updates the app configuration
- ✅ Generates documentation

### Step 2: Configure Certificates

You need to configure these secrets in GitHub:

```bash
# For Android
GOOGLE_PLAY_JSON_KEY="{...}"  # JSON key from Google Play Console

# For iOS
APPLE_CONNECT_KEY_ID="ABC123"
APPLE_CONNECT_ISSUER_ID="def456-..."
APPLE_CONNECT_CERTIFICATE_PATH="/path/to/cert.p8"

# To decrypt project secrets
SECRETS_PASSWORD="your-password"
```

### Step 3: Test the System

```bash
# Change version and push
yarn version --patch
git add .
git commit -m "chore: bump version"
git push origin main

# Or trigger a manual build
gh api repos/:owner/:repo/dispatches \
  --method POST \
  --field event_type='auto-build' \
  --field client_payload='{"version":"1.101.0"}'
```

## 📱 **How Update Checking Works**

### In the App

```typescript
// The app automatically checks every 24 hours
const { updateInfo, isChecking } = useAppUpdateChecker({
  useBackend: true, // Uses Railway backend
  checkOnAppStart: true,
  checkOnAppResume: true,
})

// If there is an update, a dialog is shown automatically
if (updateInfo?.hasUpdate) {
  // Native dialog with "Update" / "Later" options
}
```

### In the Backend (Railway)

```javascript
// Endpoint queried by the app
GET /api/app-version
Headers: X-Platform: ios|android

Response:
{
  "latestVersion": "1.101.0",
  "minRequiredVersion": "1.95.0",
  "releaseNotes": "New features...",
  "isForced": false,
  "downloadUrl": "https://apps.apple.com/..."
}
```

## 🔄 **Typical Workflow**

### Normal Development

1. You develop features as usual
2. You push to `main`
3. **If the version did not change**: Nothing happens
4. **If the version changed**: An automatic build is triggered

### Releasing a New Version

1. Change the version: `yarn version --minor`
2. Push: `git push origin main`
3. **GitHub Actions automatically**:
   - ✅ Detects the version change
   - ✅ Updates build files
   - ✅ Builds for Android and iOS
   - ✅ Uploads to Play Store and TestFlight
   - ✅ Updates the Railway backend
   - ✅ Creates a GitHub release
   - ✅ Notifies via Slack

### Manual Build

```bash
# Trigger a build without changing code
gh api repos/:owner/:repo/dispatches \
  --method POST \
  --field event_type='auto-build' \
  --field client_payload='{"version":"1.101.0"}'
```

## 🛠️ **Useful Commands**

### Check Backend Status

```bash
curl https://tu-railway-url.railway.app/health
```

### Update Version Manually

```bash
curl -X POST "https://tu-railway-url.railway.app/api/update-version" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "both",
    "version": "1.101.0",
    "releaseNotes": "Manual new version",
    "apiKey": "your-api-key"
  }'
```

### View Railway Logs

```bash
railway logs
```

### View GitHub Actions Status

```bash
gh run list
gh run view [run-id]
```

## 📊 **Monitoring and Debugging**

### Important Logs

1. **GitHub Actions**: Go to the "Actions" tab on GitHub
2. **Railway**: `railway logs` or web dashboard
3. **App**: Logs in Flipper/Metro
4. **Stores**: App Store Connect / Google Play Console

### Common Issues

#### ❌ Build fails in GitHub Actions

```bash
# Check secrets
gh secret list

# View detailed logs
gh run view [run-id] --log
```

#### ❌ Backend not responding

```bash
# Check status
curl https://tu-railway-url.railway.app/health

# View logs
railway logs --tail
```

#### ❌ App does not detect updates

```bash
# Check endpoint
curl -H "X-Platform: ios" https://tu-railway-url.railway.app/api/app-version

# Check configuration in NavigatorWrapper
grep "useBackend" src/navigator/NavigatorWrapper.tsx
```

## 🔐 **Security**

### Protected Environment Variables

- ✅ API keys in GitHub Secrets
- ✅ Encrypted certificates
- ✅ Tokens with minimal permissions
- ✅ Webhook with validation

### Best Practices

- 🔒 Never commit secrets
- 🔒 Rotate API keys regularly
- 🔒 Use the minimum required permissions
- 🔒 Monitor suspicious access

## 🎯 **Next Steps**

1. **Configure Slack notifications**
2. **Add automated tests before the build**
3. **Configure a staging environment**
4. **Add performance metrics**
5. **Configure automatic rollback**

## 🆘 **Support**

If you run into issues:

1. **Check the logs** in GitHub Actions and Railway
2. **Verify the configuration** with the setup script
3. **Consult the documentation** in `CI-CD-SETUP.md`
4. **Open an issue** on GitHub with detailed logs

---

**Your CI/CD system is ready to automate the entire release process! 🚀**
