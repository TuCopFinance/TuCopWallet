# Manual Upload Guide - TuCop Wallet to App Store

## ✅ What We've Fixed

All iOS build issues are now resolved:

1. ✅ **Bitcode removed** - OpenSSL and Persona2 frameworks are bitcode-free
2. ✅ **Xcode 16 compatibility** - RCT-Folly compilation errors fixed
3. ✅ **Build configuration** - Podfile properly configured

## 📦 Manual Archive & Upload Process

### Step 1: Prepare the Build

Before archiving, ensure bitcode is stripped (do this after each `pod install`):

```bash
cd /Users/osx/Projects/TuCop/TuCopWallet/ios
./fix_bitcode_ios.sh
```

You should see:

```
✅ Persona2 is bitcode-free
✅ OpenSSL is bitcode-free
```

### Step 2: Clean Build Folder

Clean everything to ensure a fresh build:

```bash
# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/MobileStack-*

# Clean build folder in project
rm -rf ios/build ios/DerivedData
```

Or in Xcode: **Product → Clean Build Folder** (⇧⌘K)

### Step 3: Open Xcode

```bash
open ios/MobileStack.xcworkspace
```

### Step 4: Select Scheme & Device

In Xcode toolbar:

1. **Scheme**: Select the environment you want to build:

   - `MobileStack-mainnet` → Production (App Store)
   - `MobileStack-testnet` → Testnet (Celo Sepolia, for testing)
   - `MobileStack-mainnetnightly` → Nightly mainnet build

2. **Destination**: Select **Any iOS Device (arm64)**

### Step 5: Archive

1. Menu: **Product → Archive** (or ⌃⌘A)
2. Wait for the build to complete (5-10 minutes)
3. If successful, the **Organizer** window opens automatically

### Step 6: Distribute to App Store

In the **Organizer** window:

1. Select your archive from the list
2. Click **Distribute App** button
3. Choose **App Store Connect**
4. Click **Next**
5. Choose **Upload**
6. Click **Next**
7. **Signing**:
   - ✅ Select **Automatically manage signing**
   - Team: **TuCop Finance LLC (QZUQHFSF4H)**
8. Click **Upload**
9. Review the summary and click **Upload**

### Step 7: Wait for Processing

1. Upload completes in 2-5 minutes
2. Go to [App Store Connect](https://appstoreconnect.apple.com)
3. Navigate to: **Apps → TuCop → TestFlight** (or **App Store**)
4. Wait 10-30 minutes for Apple to process the build
5. You'll receive an email when processing is complete

## 🔧 If Build Fails

### Common Issues & Solutions

#### 1. Bitcode Validation Error

```
Invalid Executable. The executable contains bitcode.
```

**Solution**:

```bash
cd ios
./fix_bitcode_ios.sh
```

Then archive again.

#### 2. Code Signing Error

```
No signing certificate "iOS Distribution" found
```

**Solution**:

- Go to Xcode → Settings → Accounts
- Select your Apple ID
- Click "Manage Certificates"
- Click "+" → "Apple Distribution"
- Try archiving again

#### 3. Provisioning Profile Error

```
No profiles for 'com.tucopfinance.app' were found
```

**Solution**:

- In Xcode, select the project
- Go to **Signing & Capabilities** tab
- Ensure **Automatically manage signing** is checked
- Select Team: **TuCop Finance LLC**
- Xcode will create/download the profile

#### 4. RCT-Folly Compilation Error

```
No template named 'unary_function' in namespace 'std'
```

**Solution**: Already fixed in Podfile! If you see this:

```bash
cd ios
pod install
./fix_bitcode_ios.sh
```

## 📋 Pre-Archive Checklist

Before each archive, verify:

- [ ] Latest code pulled from git
- [ ] `yarn build:ts` passes (TypeScript compilation)
- [ ] Version number updated in Xcode (if needed)
- [ ] Build number incremented
- [ ] Bitcode stripped (`./fix_bitcode_ios.sh`)
- [ ] Correct scheme selected (mainnet for production)
- [ ] Destination set to "Any iOS Device (arm64)"

## 🚀 After Successful Upload

### TestFlight Distribution

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. **Apps → TuCop → TestFlight**
3. Wait for build to appear (10-30 min)
4. Add build to testing group
5. Add testers if needed
6. Distribute

### App Store Submission

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. **Apps → TuCop → App Store**
3. Click **+ Version** or **Prepare for Submission**
4. Fill in release notes and metadata
5. Select the build you just uploaded
6. Click **Submit for Review**

## 📝 Version & Build Numbers

- **Version**: Displayed to users (e.g., 1.107.0)

  - Update in Xcode: Project Settings → General → Version

- **Build**: Internal tracking (must be unique for each upload)
  - Update in Xcode: Project Settings → General → Build
  - Must increment for each upload to App Store Connect

## 🔄 Quick Commands Reference

```bash
# Full rebuild process
cd /Users/osx/Projects/TuCop/TuCopWallet

# 1. Clean
rm -rf ~/Library/Developer/Xcode/DerivedData/MobileStack-*
rm -rf ios/build

# 2. Update dependencies (if needed)
cd ios && pod install && cd ..

# 3. Strip bitcode
cd ios && ./fix_bitcode_ios.sh && cd ..

# 4. TypeScript check (optional)
yarn build:ts

# 5. Open Xcode
open ios/MobileStack.xcworkspace

# Then: Product → Archive in Xcode
```

## 📞 Support

If you encounter issues not covered here:

1. Check build logs in Xcode
2. Verify certificates in App Store Connect
3. Ensure all frameworks are bitcode-free

---

**Last Updated**: October 7, 2025
**Xcode Version**: 16.0.1
**React Native**: 0.72.15
