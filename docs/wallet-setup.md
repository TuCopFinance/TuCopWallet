# TuCOP Wallet - Setup Guide

> This project is forked from the Mobile Stack / Valora codebase. Setup instructions below are adapted for TuCOP Wallet.

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the wallet](#running-the-wallet)
- [Debugging](#debugging)

## Overview

TuCOP Wallet is a React Native mobile wallet focused on Celo (Colombia). It supports COPm (Colombian Peso stablecoin), staking, swaps, and fiat off-ramps via BucksPay.

## Prerequisites

- **Node.js**: v20.17.0 (use NVM)
- **Yarn**: v1.22+
- **JDK**: v17 (for Android)
- **Xcode**: Latest version (for iOS, macOS only)
- **Android Studio**: For Android development
- **Ruby**: For CocoaPods (iOS)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/TuCopFinance/TuCopWallet.git
cd TuCopWallet
nvm use 20.17.0
yarn install
```

### 2. Configure secrets

```bash
cp secrets.json.template secrets.json
# Edit secrets.json with your API keys
```

### 3. iOS setup (macOS only)

```bash
bundle install
cd ios && bundle exec pod install && cd ..
```

### 4. Android setup

Ensure Android Studio is installed with:

- Android SDK Platform 33
- Android SDK Build-Tools
- Android Emulator

## Running the wallet

### Android

```bash
yarn dev:android              # Development (testnet)
yarn dev:android:mainnet      # Production (mainnet)
```

### iOS

```bash
yarn dev:ios                  # Development (testnet)
```

If `yarn dev:ios` fails, use xcodebuild directly:

```bash
# Find simulator ID
xcrun simctl list devices | grep "iPhone 15 Pro"

# Build and install
xcodebuild -workspace ios/MobileStack.xcworkspace \
  -scheme MobileStack-testnetdev \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=<SIMULATOR_ID>' \
  build

xcrun simctl install <SIMULATOR_ID> <PATH_TO_APP>
xcrun simctl launch <SIMULATOR_ID> org.tucop
```

### iOS Build Schemes

| Scheme                   | Network                | Display Name             | Use for                 |
| ------------------------ | ---------------------- | ------------------------ | ----------------------- |
| `MobileStack-testnetdev` | Celo Sepolia (testnet) | TuCop (Celo Sepolia dev) | **Primary development** |
| `MobileStack-testnet`    | Celo Sepolia (testnet) | TuCop Celo Sepolia       | Testing                 |
| `MobileStack-mainnet`    | Celo mainnet           | TuCop                    | Production              |
| `MobileStack-mainnetdev` | Celo mainnet           | TuCop (dev)              | Advanced testing        |

> **Testnet**: Celo Sepolia (chain ID 11142220).
> Reference: [Celo Sepolia Docs](https://docs.celo.org/tooling/testnets/celo-sepolia)

## Debugging

### React Native

```bash
# Reset Metro cache
yarn start --reset-cache

# View logs
npx react-native log-android
npx react-native log-ios
```

### Build issues

- **Metro cache**: `yarn start --reset-cache`
- **iOS build**: Clean build folder in Xcode (Cmd+Shift+K)
- **Android build**: Check JDK 17 and Android SDK setup
- **TypeScript**: `yarn build:ts` to check for errors

## Testing

```bash
yarn test                     # Run unit tests
yarn test:watch               # Watch mode
yarn e2e:test:android         # E2E tests
```
