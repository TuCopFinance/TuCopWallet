# 🚀 CI/CD Setup Checklist

## ✅ GitHub Secrets (Settings → Secrets and variables → Actions)

### API/Server

- [ ] `RAILWAY_API_URL` - Your Railway server URL
- [ ] `RAILWAY_API_KEY` - API key for authentication

### Android

- [ ] `GOOGLE_PLAY_JSON_KEY` - Google Play service account JSON
- [ ] `KEYSTORE_PASSWORD` - Release keystore password
- [ ] `KEY_ALIAS` - Signing key alias
- [ ] `KEY_PASSWORD` - Signing key password

### iOS

- [ ] `APPLE_CONNECT_KEY_ID` - App Store Connect API Key ID
- [ ] `APPLE_CONNECT_ISSUER_ID` - App Store Connect Issuer ID
- [ ] `APPLE_CONNECT_CERTIFICATE_PATH` - Path to the certificate

### Notifications

- [ ] `SLACK_WEBHOOK_URL` - Slack webhook for notifications
- [ ] `SECRETS_PASSWORD` - Password for secrets decryption (if applicable)

## ✅ Repository Files

### Android

- [ ] `android/app/tucop.keystore` - Production keystore
- [ ] `android/app/debug.keystore` - Debug keystore
- [ ] `android/gradle.properties` - With VERSION_CODE configured
- [ ] `.env.mainnet` - Environment variables for production
- [ ] `.env.testnet` - Environment variables for testnet

### iOS

- [ ] `ios/TuCopWallet.xcworkspace` - Configured workspace
- [ ] `ios/Podfile` - Updated dependencies
- [ ] Signing certificates configured in Xcode

### General

- [ ] `package.json` - With `pre-deploy` script if it exists
- [ ] `yarn.lock` - Updated and committed
- [ ] `.gitignore` - Excludes sensitive files

## ✅ Server Configuration

### Required Endpoint

- [ ] `POST /api/update-version` implemented
- [ ] Accepts JSON with defined structure
- [ ] Handles Bearer token authentication
- [ ] Responds with status 200/201 on success

### Expected payload structure:

```json
{
  "platform": "both|android|ios",
  "version": "1.108.0",
  "buildNumber": "1704729600",
  "android": { "success": true, "buildTime": "ISO-date" },
  "ios": { "success": true, "buildTime": "ISO-date" },
  "releaseNotes": "Build description...",
  "commit": "commit-hash",
  "branch": "branch-name",
  "workflow": "workflow-run-id"
}
```

## ✅ Store Configuration

### Google Play Console

- [ ] App created in Google Play Console
- [ ] Service Account with upload permissions
- [ ] Internal testing track configured
- [ ] App Bundle enabled

### App Store Connect

- [ ] App registered in App Store Connect
- [ ] Valid distribution certificates
- [ ] TestFlight configured
- [ ] API Key with upload permissions

## ✅ Verification

### Local Tests

- [ ] `cd android && ./gradlew bundleMainnetRelease` works
- [ ] `cd ios && pod install` works without errors
- [ ] Environment variables load correctly

### GitHub Actions

- [ ] Workflow runs on push to main
- [ ] Android builds complete successfully
- [ ] iOS builds complete successfully
- [ ] Server notifications work
- [ ] Artifacts are uploaded correctly

### Notifications

- [ ] Slack receives bot messages
- [ ] Server receives and processes webhooks
- [ ] GitHub releases are created automatically

## 🚨 Common Troubleshooting

### Android

- **Gradle error:** Verify Java 11 and Gradle 8.7
- **Keystore not found:** Verify paths and secrets (falls back to debug.keystore in CI)
- **Autolinking:** Do NOT use `-x generateAutolinkingPackageList` (Gradle 8.7 fails if the task does not exist)

### iOS

- **Pod install fails:** Update CocoaPods and Xcode
- **Invalid certificates:** Renew in Apple Developer
- **Archive fails:** Verify code signing settings

### API

- **401 Unauthorized:** Verify RAILWAY_API_KEY
- **404 Not Found:** Verify RAILWAY_API_URL
- **Timeout:** Verify server connectivity

## 📞 Support

If any step fails:

1. Review workflow logs in GitHub Actions
2. Verify that all secrets are configured
3. Test builds locally first
4. Verify connectivity with external APIs
