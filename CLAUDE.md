# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development
```bash
yarn dev:android          # Run on Android simulator/device
yarn dev:ios              # Run on iOS simulator/device (may have React Native CLI issues)
yarn dev:android:mainnet  # Run on mainnet (production data)

# iOS Development - Alternative Methods (if yarn dev:ios fails)
# Method 1: Direct Xcode build and run
xcodebuild -workspace ios/MobileStack.xcworkspace -scheme MobileStack-mainnet -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build
xcrun simctl install <SIMULATOR_ID> <PATH_TO_APP>
xcrun simctl launch <SIMULATOR_ID> org.tucop

# Method 2: Find simulator ID and use direct build
xcrun simctl list devices | grep "iPhone 15 Pro"  # Get simulator ID
xcodebuild -workspace ios/MobileStack.xcworkspace -scheme MobileStack-mainnet -configuration Debug -destination 'platform=iOS Simulator,id=<SIMULATOR_ID>' build install
```

### Testing
```bash
yarn test                 # Run unit tests
yarn test:watch           # Run tests in watch mode
yarn e2e:test:android     # Run E2E tests on Android
```

### Building & Verification
```bash
yarn build:ts             # TypeScript compilation check
yarn build:metro          # Metro bundler build
yarn release-build:android # Create release build
```

### Code Quality
```bash
yarn lint                 # Run ESLint
yarn format               # Run Prettier
yarn type-check           # TypeScript type checking
```

## Project Architecture

### Core Technology Stack
- **React Native 0.72.15** with TypeScript
- **Redux Toolkit** with Redux Saga for state management
- **React Navigation 7.x** for navigation
- **Viem** for blockchain interactions (Celo network)
- **Jest** with React Native Testing Library + Detox for E2E testing

### Key Directory Structure
```
src/
├── app/                  # App initialization, error handling
├── components/          # Reusable UI components
├── redux/               # Redux store, reducers, sagas, migrations
├── navigator/           # Navigation configuration
├── web3/                # Blockchain interactions, contracts
├── viem/                # Viem-specific utilities
├── tokens/              # Token management, balances
├── send/                # Send money functionality
├── earn/                # Yield farming and staking
├── swap/                # Token swapping
├── fiatExchanges/       # On/off ramp integrations
├── backup/              # Wallet backup and recovery
├── identity/            # User identity and verification
├── onboarding/          # User onboarding flows
├── account/             # Account management and settings
├── buckspay/            # BucksPay offramp (COPm → COP bank transfer)
├── subsidies/           # ReFi Colombia UBI/subsidy claims
├── divviProtocol/       # Referral tracking (v2 integration)
├── points/              # Points/rewards system
├── jumpstart/           # Jumpstart referral rewards
├── nfts/                # NFT support and display
└── dapps/               # DApp connector and catalog
```

### State Management
- **Redux Toolkit** with strict TypeScript typing
- **Redux Saga** for async operations and side effects
- **Redux Persist** with file system storage and migrations (current version: 238)
- Key slices: `tokens`, `send`, `earn`, `swap`, `account`, `identity`, `web3`, `buckspay`

### Navigation Architecture
- **React Navigation 7.x** with native stack and bottom tabs
- Main navigation flow: `src/navigator/Navigator.tsx`
- Tab navigation: `src/navigator/TabNavigator.tsx`
- Onboarding flow: `src/onboarding/registration/RegistrationNavigator.tsx`

### Blockchain Integration
- **Celo network** only (mainnet + Celo Sepolia testnet; Alfajores is deprecated)
- **Viem** for web3 interactions
- **WalletConnect** for DApp connectivity
- Key token: COPm (Colombian Peso stablecoin on Celo, renamed from cCOP)

### Component Patterns
- Use `useAppSelector` and `useAppDispatch` for Redux
- Use `useTranslation` for internationalization
- Wrap screens in `SafeAreaView` for iOS compatibility
- Import colors and spacing from `src/styles/`

### Testing Strategy
- Unit tests with Jest and React Native Testing Library
- E2E tests with Detox for critical user flows
- Component snapshot testing
- Redux saga testing patterns

### Environment Configuration
- Multiple environment files (`.env.mainnet`, `.env.mainnetnightly`)
- Runtime configuration via `src/config.ts`
- Feature flags via Statsig integration

### iOS Build Schemes
The project has 7 iOS build schemes. Only 4 are active — the rest are marked unused.

> **Testnet**: Celo Sepolia (chain ID 11142220). Alfajores is deprecated.
> Reference: [Celo Sepolia Docs](https://docs.celo.org/tooling/testnets/celo-sepolia)

#### **Active Schemes:**

- **`MobileStack-alfajores`**: Celo Sepolia testnet (legacy scheme name)
  - Display Name: "TuCop Celo Sepolia"
  - Features: Shows testnet banner, Sentry enabled
  - Use for: Testing with testnet tokens

- **`MobileStack-alfajoresdev`**: Celo Sepolia testnet dev (legacy scheme name)
  - Display Name: "TuCop (Celo Sepolia dev)"
  - Features: Dev settings enabled, debug keystore, no Sentry
  - Use for: **Primary development** (recommended)

- **`MobileStack-mainnet`**: Production environment with real tokens
  - Display Name: "TuCop"
  - Network: Celo mainnet
  - Use for: Production releases

- **`MobileStack-mainnetdev`**: Development builds on mainnet
  - Display Name: "TuCop (dev)"
  - Use for: Advanced testing with real network

#### **Unused Schemes (marked with "(unused)" suffix):**

- `MobileStack-alfajoresnightly (unused)` — nightly CI disabled
- `MobileStack-mainnetnightly (unused)` — nightly CI disabled
- `MobileStack-test (unused)` — legacy Mento test config

#### **Scheme Selection Guidelines:**

- **For Development**: Use `MobileStack-alfajoresdev` (safe Celo Sepolia testnet)
- **For Testing**: Use `MobileStack-alfajores` (Celo Sepolia with production-like settings)
- **For Production**: Use `MobileStack-mainnet` (real network and tokens)

Each scheme loads a corresponding `.env.*` file that configures network endpoints, display names, bundle IDs, and feature flags. Scheme filenames still use "alfajores" for legacy reasons — a full rename is planned.

### Recent Important Changes
- **Version 1.116.0**: Current app version
- **BucksPay Offramp**: Native COPm → COP bank transfer integration via BucksPay API
- **COPm Token**: Renamed from cCOP to COPm across the app
- **ReFi Colombia Subsidies**: UBI/subsidy claims via `src/subsidies/`
- **Divvi Protocol v2**: Referral tracking system
- **Celo Sepolia**: Active testnet (chain ID 11142220, replaces deprecated Alfajores)

### Development Notes
- Always run `yarn build:ts` before committing to catch TypeScript errors
- Use existing component patterns found in `src/components/`
- Follow Redux Toolkit slice patterns for new state management
- Test both iOS and Android when making UI changes
- Check `src/styles/` for existing design tokens before creating new ones
- Use `src/utils/Logger.ts` for logging instead of console.log
- Feature flags are managed via Statsig - check existing patterns before adding new ones

### Common Gotchas
- Metro bundler caching issues: Use `yarn start --reset-cache`
- iOS simulator issues: Clean build folder and restart simulator
- Android build issues: Check Java version and Android SDK setup
- Redux state persistence: Increment migration version when changing state structure
- React Native version-specific issues: Check patches/ directory for workarounds

### iOS Development Troubleshooting
- **React Native CLI Issues**: `yarn dev:ios` may fail with "unknown option '--configuration'" error
- **Bundle Identifier**: App uses `org.tucop` as bundle identifier
- **Build Path**: Built app located at `DerivedData/MobileStack-*/Build/Products/Debug-iphonesimulator/TuCop.app`
- **Simulator Management**: Use `xcrun simctl list devices` to find simulator IDs
- **App Launch Issues**: If app installs but won't launch, try direct installation with `xcrun simctl install` then `xcrun simctl launch`
- **Build vs Install**: Xcode build may succeed but require separate install step for simulator
- **App Crashes**: Check iOS simulator console and Metro bundler logs for crash details

### iOS Build Process
1. Ensure simulator is running: `open -a Simulator`
2. Build with Xcode: `xcodebuild -workspace ios/MobileStack.xcworkspace -scheme MobileStack-mainnet -configuration Debug -destination 'platform=iOS Simulator,id=<SIMULATOR_ID>' build`
3. Install to simulator: `xcrun simctl install <SIMULATOR_ID> <PATH_TO_APP>`
4. Launch app: `xcrun simctl launch <SIMULATOR_ID> org.tucop`
5. Check logs if crashes occur: iOS Simulator → Device → Console
