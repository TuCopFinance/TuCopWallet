# Xcode Cloud Configuration

This directory contains Xcode Cloud workflow configurations for the TuCop Wallet app.

## Workflows

### main.yml - Production Build
- **Trigger**: Commits to `main` branch
- **Scheme**: MobileStack-mainnet
- **Purpose**: Production builds for App Store release
- **Configuration**: Release

### alfajores.yml - Testnet Build
- **Trigger**: Commits to `develop` branch or `feature/*` branches
- **Scheme**: MobileStack-alfajores
- **Purpose**: Testnet builds for internal testing
- **Configuration**: Release

## Build Steps

Both workflows execute the following steps:

1. **Install Dependencies**
   - Runs `pod install` to install CocoaPods dependencies
   - Updates repository to ensure latest pod versions

2. **Strip Bitcode**
   - Executes `fix_bitcode_ios.sh` to remove bitcode from OpenSSL and Persona2 frameworks
   - Required for App Store submission (Apple no longer accepts bitcode since Xcode 14)

## CI Scripts

The following CI scripts are executed automatically:

- **ci_scripts/ci_post_clone.sh**: Runs after code checkout
  - Updates CocoaPods
  - Installs dependencies
  - Strips bitcode from frameworks
  - Verifies bitcode removal

- **ci_scripts/ci_pre_xcodebuild.sh**: Runs before xcodebuild
  - Configures code signing settings

## Code Signing

Both workflows use **Automatic Code Signing** with:
- **Team ID**: QZUQHFSF4H (TuCop Finance LLC)
- **Style**: Automatic

Ensure the following are configured in App Store Connect:
1. Valid iOS Distribution Certificate
2. App Store Provisioning Profile for `com.tucopfinance.app`

## Xcode Version

- **Xcode 16.0.0** (or later)

## Environment Variables

- `DEVELOPMENT_TEAM`: QZUQHFSF4H
- `CODE_SIGN_STYLE`: Automatic

## Troubleshooting

### Build fails with exit code 75
- Code signing issue - verify certificates and provisioning profiles in App Store Connect
- Ensure Automatic signing is enabled in Xcode Cloud workflow

### Bitcode validation errors
- The `fix_bitcode_ios.sh` script should handle this automatically
- If errors persist, manually run the script and verify frameworks are bitcode-free

### RCT-Folly compilation errors
- Fixed in Podfile with Xcode 16 compatibility patches
- Ensures proper C++17 standard and preprocessor definitions
