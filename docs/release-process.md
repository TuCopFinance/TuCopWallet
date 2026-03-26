# 🚀 Step-by-Step Process for a New Release - TuCOP Wallet

## 📋 Process Overview

This document describes the complete process for generating a new version of TuCOP Wallet using our automated CI/CD system.

---

## 🔧 Initial Preparation

### 1. Verify Project State

```bash
# Switch to the main branch
git checkout main

# Pull the latest changes
git pull origin main

# Verify there are no pending changes
git status
```

### 2. Run Verifications

```bash
# Run tests
yarn test

# Verify linting
yarn lint

# Verify TypeScript compilation
yarn build:ts

# Verify everything is working
yarn dev:android  # Or yarn dev:ios to test
```

---

## 🎯 Generating a New Version

### Option A: Automatic (Recommended)

#### For Bug Fixes (Patch)

```bash
# Increments 1.100.0 → 1.100.1
yarn version --patch
```

#### For New Features (Minor)

```bash
# Increments 1.100.0 → 1.101.0
yarn version --minor
```

#### For Breaking Changes (Major)

```bash
# Increments 1.100.0 → 2.0.0
yarn version --major
```

### Option B: Manual

#### 1. Edit package.json

```json
{
  "name": "tucop-wallet",
  "version": "1.117.0" // ← Change here
  // ...
}
```

#### 2. Commit and Tag

```bash
git add package.json
git commit -m "chore: bump version to 1.117.0"
git tag v1.117.0
```

---

## 📤 Deployment

### 1. Push to GitHub

```bash
# Push with tags (triggers CI/CD automatically)
git push origin main --follow-tags
```

### 2. Verify CI/CD Activation

```bash
# View running workflows
gh run list

# View details of a specific workflow
gh run view [run-id]
```

---

## ⚡ Automated Process (What happens after the push)

### 1. Change Detection

- ✅ GitHub Actions detects a change in `package.json`
- ✅ The `auto-build.yml` workflow is triggered
- ✅ The version change is validated

### 2. Version Bump (if needed)

- ✅ `yarn pre-deploy` is executed if there was no manual change
- ✅ The build number is updated automatically
- ✅ Changes are committed automatically

### 3. Android Build

- ✅ Compiled for **mainnet** and **testnet**
- ✅ AAB (Android App Bundle) is generated
- ✅ Uploaded to **Google Play Store (Internal Track)**
- ✅ Artifact is saved on GitHub

### 4. iOS Build

- ✅ Compiled for **mainnet** and **testnet**
- ✅ IPA is generated
- ✅ Uploaded to **TestFlight**
- ✅ Artifact is saved on GitHub

### 5. Backend Update

- ✅ Railway backend is updated automatically
- ✅ New version is available for update verification
- ✅ `minRequiredVersion` is configured if needed

### 6. Notifications

- ✅ A **GitHub Release** is created automatically
- ✅ A **Slack** notification is sent (if configured)
- ✅ Release documentation is updated

---

## 🔍 Process Verification

### 1. Verify Backend Is Updated

```bash
# Verify version on the backend
curl -H "X-Platform: android" -H "X-Bundle-ID: org.tucop" \
  https://tucopwallet-production.up.railway.app/api/app-version

# Expected response:
# {
#   "latestVersion": "1.117.0",
#   "minRequiredVersion": "1.95.0",
#   "isForced": false,
#   "downloadUrl": "https://play.google.com/store/apps/details?id=org.tucop"
# }
```

### 2. Verify GitHub Actions

```bash
# View list of workflows
gh run list

# View logs of a specific workflow
gh run view [run-id] --log
```

### 3. Verify Releases

```bash
# View created releases
gh release list

# View details of a release
gh release view v1.117.0
```

### 4. Verify Deployments

#### Google Play Store

1. Go to [Google Play Console](https://play.google.com/console)
2. Select TuCOP Wallet
3. Go to **Release → Testing → Internal testing**
4. Verify that the new version is available

#### TestFlight

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select TuCOP Wallet
3. Go to **TestFlight**
4. Verify that the new build is available

---

## 🚨 Special Cases

### Urgent Hotfix

```bash
# 1. Create a hotfix branch
git checkout -b hotfix/1.117.1

# 2. Make critical changes
# ... edit files ...
git add .
git commit -m "fix: critical security issue"

# 3. Push the hotfix
git push origin hotfix/1.117.1

# 4. Merge into main
git checkout main
git merge hotfix/1.117.1

# 5. Version and deploy
yarn version --patch
git push origin main --follow-tags

# 6. Clean up branch
git branch -d hotfix/1.117.1
git push origin --delete hotfix/1.117.1
```

### Manual Build (Without version change)

```bash
# Trigger a manual build with GitHub CLI
gh api repos/:owner/:repo/dispatches \
  --method POST \
  --field event_type='auto-build' \
  --field client_payload='{"version":"1.117.0","reason":"manual-build"}'
```

### Version Rollback

```bash
# 1. Revert the version commit
git revert HEAD

# 2. Update the backend manually
curl -X POST "https://tucopwallet-production.up.railway.app/api/update-version" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "both",
    "version": "1.100.0",
    "releaseNotes": "Rollback to previous version",
    "apiKey": "[YOUR_API_KEY]"
  }'

# 3. Push the rollback
git push origin main
```

---

## 📊 Monitoring and Logs

### Railway Backend

```bash
# View backend logs
cd railway-backend
railway logs

# Verify backend health
curl https://tucopwallet-production.up.railway.app/health
```

### GitHub Actions

```bash
# View active workflows
gh run list --limit 10

# View logs in real time
gh run watch [run-id]
```

### Verify Updates in the App

```bash
# The app checks for updates automatically every 24 hours
# To force a check, restart the app or use:
# NavigatorWrapper.tsx → useAppUpdateChecker with checkOnAppStart: true
```

---

## ⏱️ Estimated Times

| Process               | Estimated Time    |
| --------------------- | ----------------- |
| **Preparation**       | 5-10 minutes      |
| **Versioning**        | 1-2 minutes       |
| **Android Build**     | 15-20 minutes     |
| **iOS Build**         | 20-25 minutes     |
| **Play Store Upload** | 5-10 minutes      |
| **TestFlight Upload** | 10-15 minutes     |
| **Backend Update**    | 1-2 minutes       |
| **Total**             | **45-60 minutes** |

---

## 🎯 New Version Checklist

### Before the Release

- [ ] ✅ Tests passing
- [ ] ✅ Linting with no errors
- [ ] ✅ TypeScript build successful
- [ ] ✅ Changes documented
- [ ] ✅ Release notes prepared

### During the Release

- [ ] ✅ Version incremented correctly
- [ ] ✅ Push with tags completed
- [ ] ✅ GitHub Actions triggered
- [ ] ✅ Builds started

### After the Release

- [ ] ✅ Backend updated
- [ ] ✅ Play Store deployment successful
- [ ] ✅ TestFlight deployment successful
- [ ] ✅ GitHub Release created
- [ ] ✅ Notifications sent
- [ ] ✅ Documentation updated

---

## 🆘 Troubleshooting

### Build Fails

1. **Verify GitHub secrets**

   ```bash
   gh secret list
   ```

2. **Review GitHub Actions logs**

   ```bash
   gh run view [run-id] --log
   ```

3. **Verify certificates**
   - Android: Google Play JSON key
   - iOS: Apple Connect certificates

### Backend Not Responding

1. **Check Railway logs**

   ```bash
   cd railway-backend && railway logs
   ```

2. **Check environment variables**

   ```bash
   railway variables
   ```

3. **Check connectivity**
   ```bash
   curl https://tucopwallet-production.up.railway.app/health
   ```

### App Does Not Detect Updates

1. **Verify configuration in NavigatorWrapper**

   ```typescript
   useBackend: true // Must be set to true
   ```

2. **Verify backend URL**

   ```typescript
   // In appUpdateChecker.ts
   'https://tucopwallet-production.up.railway.app/api/app-version'
   ```
