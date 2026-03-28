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
- **React Native 0.77.3** with TypeScript (branch: feature/react-native-upgrade-0.77)
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
- Token configuration: `src/web3/networkConfig.ts`

### Token Ecosystem

#### Mento Stablecoins (Rebranding: cXXX → XXXm)
Mento Protocol rebranded all stablecoins from `cXXX` to `XXXm` format for multichain adoption.

| Token | Old Symbol | New Symbol | Celo Mainnet Address | Decimals |
|-------|------------|------------|---------------------|----------|
| Colombian Peso | cCOP | **COPm** | `0x8a567e2ae79ca692bd748ab832081c45de4041ea` | 18 |
| US Dollar | cUSD | USDm | `0x765de816845861e75a25fca122bb6898b8b1282a` | 18 |
| Euro | cEUR | EURm | `0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73` | 18 |
| Brazilian Real | cREAL | BRLm | `0xe8537a3d056da446677b9e9d6c5db704eaab4787` | 18 |
| Kenyan Shilling | cKES | KESm | `0x456a3d042c0dbd3db53d5489e98dfb038553b0d0` | 18 |
| Philippine Peso | PUSO | PHPm | `0x105d4a9306d2e55a71d2eb95b81553ae1dc20d7b` | 18 |
| West African CFA | eXOF | XOFm | `0x73f93dcc49cb8a239e2032663e9475dd5ef29a08` | 18 |
| Nigerian Naira | cNGN | NGNm | `0xe2702bd97ee33c88c8f6f92da3b733608aa76f71` | 18 |
| Japanese Yen | cJPY | JPYm | `0xc45ecf20f3cd864b32d9794d6f76814ae8892e20` | 18 |
| Swiss Franc | cCHF | CHFm | `0xb55a79f398e759e43c95b979163f30ec87ee131d` | 18 |
| South African Rand | cZAR | ZARm | `0x4c35853a3b4e647fd266f4de678dcc8fec410bf6` | 18 |
| British Pound | cGBP | GBPm | `0xccf663b1ff11028f0b19058d0f7b674004a40746` | 18 |
| Australian Dollar | cAUD | AUDm | `0x7175504c455076f15c04a2f90a8e352281f492f9` | 18 |
| Canadian Dollar | cCAD | CADm | `0xff4ab19391af240c311c54200a492233052b6325` | 18 |
| Ghanaian Cedi | cGHS | GHSm | `0xfaea5f3404bba20d3cc2f8c4b0a888f55a3c7313` | 18 |

**Resources:**
- [Mento Protocol](https://www.mento.org/)
- [Mento Stablecoins](https://www.mento.org/stablecoins)
- [Mento Forum](https://forum.mento.org/)
- [Rebranding Proposal](https://forum.celo.org/t/mento-stablecoin-rebranding-and-strategic-evolution/12639)

#### Non-Mento Stablecoins (USDT, USDC)
These are native stablecoins issued by Tether and Circle directly on Celo (NOT bridged).

| Token | Symbol | Celo Mainnet Address | Decimals | Notes |
|-------|--------|---------------------|----------|-------|
| Tether USD | **USDT** | `0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e` | 6 | Primary for swaps |
| USD Coin | **USDC** | `0xceba9300f2b948710d2653dd7b07f33a8b32118c` | 6 | Circle native (Feb 2024) |

**Future Plan:** Dólares = USDT + USDm + USDC (por ahora solo USDT activo)

#### Digital Gold
| Token | Symbol | Celo Mainnet Address | Decimals | Notes |
|-------|--------|---------------------|----------|-------|
| Tether Gold | XAUt0 | `0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff` | 6 | 1 token = 1 troy oz |

#### Native Token
| Token | Symbol | Celo Mainnet Address | Decimals |
|-------|--------|---------------------|----------|
| Celo | CELO | `0x471ece3750da237f93b8e339c536989b8978a438` | 18 |

#### TuCop Primary Tokens
Los tokens principales usados en TuCop:

1. **COPm** - Peso Colombiano (Mento) - Token principal para usuarios colombianos
2. **USDT** - Dólares para swaps y transferencias internacionales
3. **CELO** - Token nativo de la red

**Nota:** La app soporta pago de gas en stablecoins (no solo CELO).

#### UI Display Rules (IMPORTANTE)
**A nivel de usuario SIEMPRE mostrar nombres amigables, NO símbolos técnicos:**

| Interno (código) | UI (usuario) | Notas |
|------------------|--------------|-------|
| COPm | **Pesos** | Nunca mostrar "COPm" al usuario |
| USDT, USDC, USDm | **Dólares** | Agrupar como "Dólares" |
| CELO | CELO | Mantener nombre técnico |
| XAUt0 | **Oro** | Mostrar como "Oro Digital" |

**Regla:** El usuario promedio no necesita saber que usa COPm o USDT. Solo ve "Pesos" y "Dólares".

#### Token IDs Format
```typescript
// Mainnet format: "celo-mainnet:0x{address}"
const COPM_TOKEN_ID = "celo-mainnet:0x8a567e2ae79ca692bd748ab832081c45de4041ea"
const USDT_TOKEN_ID = "celo-mainnet:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e"

// Testnet (Celo Sepolia) format: "celo-sepolia:0x{address}"
const COPM_TOKEN_ID_TESTNET = "celo-sepolia:0x5f8d55c3627d2dc0a2b4afa798f877242f382f67"
```

#### Important Token Rules
- **NEVER** use old `cXXX` symbol names in new code - always use `XXXm`
- **ALWAYS** use lowercase addresses in token IDs
- **DECIMALS**: Mento tokens = 18, USDT/USDC = 6, XAUt0 = 6
- Token configuration is in `src/web3/networkConfig.ts`

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

- **`MobileStack-testnet`**: Celo Sepolia testnet
  - Display Name: "TuCop Celo Sepolia"
  - Features: Shows testnet banner, Sentry enabled
  - Use for: Testing with testnet tokens

- **`MobileStack-testnetdev`**: Celo Sepolia testnet dev
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

- `MobileStack-testnetnightly (unused)` — nightly CI disabled
- `MobileStack-mainnetnightly (unused)` — nightly CI disabled
- `MobileStack-test (unused)` — legacy Mento test config

#### **Scheme Selection Guidelines:**

- **For Development**: Use `MobileStack-testnetdev` (safe Celo Sepolia testnet)
- **For Testing**: Use `MobileStack-testnet` (Celo Sepolia with production-like settings)
- **For Production**: Use `MobileStack-mainnet` (real network and tokens)

Each scheme loads a corresponding `.env.*` file that configures network endpoints, display names, bundle IDs, and feature flags.

### Android Build Configuration

- **AGP**: 8.5.1 | **Gradle**: 8.10.2 | **Kotlin**: 2.0.21
- **NDK**: 26.1.10909125 | **Build Tools**: 35.0.0
- **Min SDK**: 24 | **Target/Compile SDK**: 35
- **Hermes**: enabled | **ProGuard/R8**: enabled in release
- **New Architecture**: disabled (`newArchEnabled=false`)
- **MainActivity/MainApplication**: Kotlin (required for RN 0.77.x with Old Arch)
- **SoLoader**: Uses `OpenSourceMergedSoMapping` (fixes libreact_featureflagsjni.so crash)
- **16 KB page size**: Supported via AGP 8.5.1 + `useLegacyPackaging = true`
- **Release build**: `cd android && ./gradlew bundleMainnetRelease`
- **AAB output**: `android/app/build/outputs/bundle/mainnetRelease/app-mainnet-release.aab`
- **Signing**: `tucop.keystore` (alias: `tucop`), password via `KEYSTORE_PASSWORD` env var

### Recent Important Changes

- **Version 1.118.0**: Current app version (build code: 1021081754)
- **React Native 0.77.3 Upgrade**: With Kotlin MainActivity/MainApplication + OpenSourceMergedSoMapping fix
- **AGP 8.5.1 Upgrade**: For Google Play 16 KB page size compliance
- **BucksPay Offramp**: Native COPm → COP bank transfer integration via BucksPay API
- **COPm Token**: Renamed from cCOP to COPm across the app
- **ReFi Colombia Subsidies**: UBI/subsidy claims via `src/subsidies/`
- **Divvi Protocol v2**: Referral tracking system
- **Celo Sepolia**: Active testnet (chain ID 11142220, replaces deprecated Alfajores)
- **Scheme rename**: iOS schemes renamed from alfajores → testnet

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
