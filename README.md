# TuCOP Wallet

TuCOP Wallet is a React Native mobile application that provides digital wallet services on the Celo network, focused on the Colombian market. It features COPm (Colombian Peso stablecoin) management, automatic version updates, and a fully automated CI/CD pipeline.

## Key Features

- **Digital Wallet**: Send, receive, and manage COPm and USDT on Celo
- **BucksPay Offramp**: Convert COPm to COP via bank transfer
- **Staking & Earn**: Yield farming and staking (Marranitos)
- **Token Swaps**: DEX aggregator-powered swaps
- **Automatic Updates**: Backend-driven version checking with forced/optional updates
- **Automated CI/CD**: Push-to-deploy pipeline for Play Store and TestFlight

## Tech Stack

| Layer          | Technology                           |
| -------------- | ------------------------------------ |
| **Frontend**   | React Native 0.72.15 + TypeScript    |
| **State**      | Redux Toolkit + Redux Saga           |
| **Navigation** | React Navigation 7.x                 |
| **Blockchain** | Viem (Celo network)                  |
| **Backend**    | Node.js + Express (Railway)          |
| **CI/CD**      | GitHub Actions + Fastlane            |
| **Stores**     | Google Play Store + Apple TestFlight |

## Prerequisites

- **Node.js**: v20.17.0 (use NVM — `nvm use 20.17.0`)
- **Yarn**: v1.22+
- **JDK**: v17 (for Android)
- **Android Studio**: For Android builds and emulators
- **Xcode**: Latest version (for iOS, macOS only)

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/TuCopFinance/TuCopWallet.git
cd TuCopWallet
nvm use 20.17.0
yarn install

# 2. Configure secrets
cp secrets.json.template secrets.json
# Edit secrets.json with your API keys

# 3. Run on Android (testnet)
yarn dev:android

# 4. Run on iOS (testnet)
yarn dev:ios
```

For detailed setup instructions, see [docs/wallet-setup.md](docs/wallet-setup.md).

## Project Structure

```text
TuCopWallet/
│
│── .github/                        # GitHub configuration & CI/CD
│   ├── ISSUE_TEMPLATE/             #   Issue templates (bug, feature, task)
│   ├── actions/yarn-install/       #   Reusable GitHub Action: yarn install
│   ├── scripts/                    #   CI helper scripts (14 files)
│   │   ├── createAppVersionPr.ts   #     Auto-version PR creation
│   │   ├── generateReleaseNotes.ts #     Release notes generator
│   │   ├── preBuildChecks.ts       #     Pre-build validation
│   │   ├── setAppEnv.ts            #     Environment setup for CI
│   │   └── ...                     #     Auto-approve, auto-merge, E2E upload, etc.
│   ├── workflows/                  #   GitHub Actions workflows (10 files)
│   │   ├── build.yml               #     Android/iOS build pipeline
│   │   ├── check.yml               #     Lint + type-check
│   │   ├── test.yml                #     Unit tests
│   │   ├── e2e-android.yml         #     E2E Android
│   │   ├── e2e-ios.yml             #     E2E iOS
│   │   ├── e2e-main.yml            #     E2E on main branch
│   │   ├── e2e-pr.yml              #     E2E on pull requests
│   │   └── ...                     #     Translation checks, semantic PR, faucet balance
│   ├── CODEOWNERS                  #   Code ownership rules
│   ├── CONTRIBUTING.md             #   → Redirects to /CONTRIBUTING.md
│   ├── SETUP_CHECKLIST.md          #   CI/CD secrets & certificates checklist
│   └── pull_request_template.md    #   PR template
│
├── android/                        # Android native project (AGP 8.5.1, Gradle 8.7)
├── ios/                            # iOS native project (Xcode workspace, 7 schemes)
│
├── src/                            # Application source code (1,345 files, 50 modules)
│   │
│   │── app/                        #   App init, error handling, deep links, upgrade screen
│   │── components/                 #   153 shared UI components (Button, Dialog, Toast, etc.)
│   │── navigator/                  #   React Navigation (Stack + BottomTabs, 24 files)
│   │── redux/                      #   Store, reducers, sagas, migrations (v238)
│   │── styles/                     #   Design tokens: colors, fonts, spacing, accessibility
│   │── icons/                      #   81+ SVG icon components + Lottie animations
│   │── i18n/                       #   Internationalization setup, OTA translations
│   │── images/                     #   SVG image components (Logo, Blob, Celebration, etc.)
│   │── types/                      #   Global TypeScript declarations
│   │── utils/                      #   55 utility functions (Logger, formatting, crypto, etc.)
│   │
│   │── web3/                       #   Wallet/key management, network config, contracts
│   │── viem/                       #   Viem clients, gas estimation, Celo L2 optimization
│   │── tokens/                     #   Token management, balances, selectors (32 files)
│   │── abis/                       #   Smart contract ABIs (ERC20, staking, subsidies)
│   │── positions/                  #   DeFi position tracking and balances
│   │── priceHistory/               #   Token price charts
│   │── localCurrency/              #   Local currency conversion (COP)
│   │
│   │── send/                       #   P2P transfers (33 files)
│   │── swap/                       #   Token swapping via DEX aggregators
│   │── earn/                       #   Yield farming, staking, Marranitos (34 files)
│   │── buckspay/                   #   BucksPay offramp (COPm → COP bank transfer)
│   │── fiatExchanges/              #   On/off ramp (Bidali, Simplex, Coinbase, 42 files)
│   │── fiatconnect/                #   FiatConnect protocol integration (25 files)
│   │── in-house-liquidity/         #   Internal liquidity client
│   │── subsidies/                  #   ReFi Colombia UBI/subsidy claims
│   │── refi/                       #   ReFi Medellin UBI contract
│   │
│   │── identity/                   #   Phone verification, contacts, secure send
│   │── verify/                     #   Phone number verification screens
│   │── backup/                     #   Seed phrase backup & recovery
│   │── keylessBackup/              #   Cloud-based keyless backup (Google/Apple + SMS)
│   │── onboarding/                 #   New user registration flows
│   │── account/                    #   Settings, profile, security, KYC (46 files)
│   │── pincode/                    #   PIN code management & authentication
│   │── storage/                    #   Keychain storage abstraction
│   │── import/                     #   Wallet import from seed phrase
│   │
│   │── points/                     #   Points/rewards system (21 files)
│   │── jumpstart/                  #   Jumpstart referral rewards (22 files)
│   │── invite/                     #   Invite/referral modals
│   │── nfts/                       #   NFT support and display
│   │── dapps/                      #   DApp connector and catalog
│   │── dappsExplorer/              #   DApp discovery and search
│   │── walletConnect/              #   WalletConnect v2 integration
│   │── webview/                    #   In-app WebView screens
│   │
│   │── home/                       #   Home screen, activity feed, notifications (34 files)
│   │── celoNews/                   #   Celo news feed
│   │── alert/                      #   Alert banner system
│   │── notifications/              #   Notification list
│   │── language/                   #   Language selection screen
│   │── qrcode/                     #   QR code scanning and generation
│   │── recipients/                 #   Recipient management and resolution
│   │── transactions/               #   Transaction management and feed
│   │── nameGenerator/              #   Display name generation
│   │── shared/                     #   Shared utilities (disconnect banner)
│   │
│   │── analytics/                  #   Event tracking (AppAnalytics, Events, Properties)
│   │── firebase/                   #   Firebase: notifications, dynamic links, remote config
│   │── sentry/                     #   Sentry error reporting
│   │── statsig/                    #   Feature flags via Statsig
│   │── networkInfo/                #   Network connectivity monitoring
│   │── hooks/                      #   App-level hooks (update checker)
│   │
│   │── config.ts                   #   Runtime config from react-native-config
│   │── flags.ts                    #   Feature flags
│   │── index.d.ts                  #   Global type declarations
│   └── missingGlobals.ts          #   Polyfills for React Native
│
├── locales/                        # Translation files (15 locales)
│   ├── base/translation.json       #   Base translation keys
│   ├── en-US/translation.json      #   English (primary)
│   ├── es-419/translation.json     #   Spanish Latin America (primary)
│   ├── de/, fr-FR/, it-IT/         #   German, French, Italian
│   ├── pl-PL/, pt-BR/, ru-RU/     #   Polish, Portuguese, Russian
│   ├── th-TH/, tr-TR/, uk-UA/     #   Thai, Turkish, Ukrainian
│   ├── vi-VN/, zh-CN/             #   Vietnamese, Chinese (Simplified)
│   └── index.ts                    #   Locale loader
│
├── assets/                         # Static assets
│   ├── fonts/                      #   Inter (4 weights) + RedHatDisplay (7 weights)
│   └── images/                     #   App images
│
├── patches/                        # patch-package patches (13 patches)
│   ├── react-native+0.72.15.patch  #   Core RN patch
│   ├── @react-native+gradle-plugin+0.72.11.patch  # Kotlin/Gradle 8.7 fix
│   └── ...                         #   11 more dependency patches
│
├── services/                       # Backend microservices (Railway)
│   ├── README.md                   #   Services overview
│   ├── version-api/                #   App version management (→ railway-backend/)
│   ├── buckspay-webhook/           #   BucksPay proxy (Express, keeps creds server-side)
│   ├── api-wallet-tlf/             #   Phone verification OTP service
│   └── twilio-service/             #   Keyless backup SMS service
│
├── railway-backend/                # Version API source (Express + Prisma + PostgreSQL)
│   ├── index.js                    #   Server entry point
│   ├── prisma/                     #   DB schema + migrations
│   └── src/                        #   Middleware, services, validators
│
├── docs/                           # Project documentation
│   ├── README.md                   #   Documentation index
│   ├── wallet-setup.md             #   Development setup guide
│   ├── release-process.md          #   Step-by-step release workflow
│   ├── ci-cd.md                    #   CI/CD pipeline architecture
│   ├── celo-gas-optimization.md    #   Celo L2 gas fee optimization
│   ├── phone-verification.md       #   Integrated phone verification design
│   ├── buckspay-implementation.md  #   BucksPay offramp implementation
│   ├── buckspay-api.md             #   BucksPay API reference (OpenAPI 3.0)
│   ├── connecting-dapps.md         #   WalletConnect v2 DApp guide
│   ├── deeplinks.md                #   Deep linking specification
│   ├── releases.md                 #   Release reference
│   ├── syncing-forks.md            #   Upstream fork sync guide (historical)
│   └── archive/                    #   Legacy Mobile Stack documentation
│       ├── runbook.md              #     Original framework setup runbook
│       ├── wallet.md               #     Original Valora wallet docs
│       └── watching-assets.mdx     #     Legacy token registration
│
├── e2e/                            # End-to-end tests (Detox)
│   ├── src/                        #   16 spec files + usecases/ + utils/
│   ├── scripts/                    #   E2E helper scripts
│   └── conf/                       #   AVD configurations
│
├── test/                           # Test utilities
│   ├── RootStateSchema.json        #   Redux state schema
│   ├── schemas.ts                  #   Schema definitions
│   ├── values.ts                   #   Test fixtures
│   └── utils.ts                    #   Test helpers
│
├── __mocks__/                      # Jest mocks (38 files)
│
├── fastlane/                       # Fastlane build automation
│   ├── Fastfile                    #   Build lanes
│   └── metadata/                   #   Store listings (en-US, es-419 + screenshots)
│
├── scripts/                        # Build and utility scripts (27 files)
│   ├── setup-ci-cd.sh              #   CI/CD setup
│   ├── key_placer.sh               #   Signing key placement
│   ├── pre-deploy.sh               #   Pre-deployment checks
│   ├── verify_locales.sh           #   Locale file validation
│   ├── force_update_check.js       #   Version check testing
│   └── ...                         #   Deep link testing, Android tools, E2E, hooks, etc.
│
├── .editorconfig                   # Editor formatting rules
├── .eslintrc.js                    # ESLint configuration
├── .gitattributes                  # Git attributes
├── .gitignore                      # Git ignore rules
├── .nvmrc                          # Node version (v20.17.0)
├── .prettierrc.js                  # Prettier configuration
├── .watchmanconfig                 # Watchman configuration
├── Gemfile                         # Ruby gems (Fastlane)
├── app.json                        # React Native app name
├── babel.config.js                 # Babel transpiler config
├── codecov.yml                     # Code coverage config
├── crowdin.yml                     # Translation platform (Crowdin)
├── index.js                        # App entry point
├── jest.config.js                  # Jest test config
├── knip.ts                         # Dead code detector config
├── metro.config.js                 # Metro bundler config
├── package.json                    # Dependencies and scripts
├── react-native.config.js          # React Native CLI config
├── renovate.json5                  # Dependency update automation
├── secrets.json.enc                # Encrypted secrets (CI)
├── secrets.json.template           # Secrets template
├── tsconfig.json                   # TypeScript config
├── yarn.lock                       # Dependency lockfile
│
├── CLAUDE.md                       # AI development guidance
├── CONTRIBUTING.md                 # Contribution guidelines
├── SECURITY.md                     # Security and vulnerability policy
├── MANUAL_UPLOAD_GUIDE.md          # Manual App Store upload instructions
└── LICENSE                         # MIT License
```

## Available Scripts

### Development

```bash
yarn dev:android              # Run on Android (testnet)
yarn dev:android:mainnet      # Run on Android (mainnet)
yarn dev:ios                  # Run on iOS (testnet)
yarn dev:ios:mainnet          # Run on iOS (mainnet)
```

### Testing & Quality

```bash
yarn test                     # Run unit tests
yarn test:watch               # Run tests in watch mode
yarn lint                     # Run ESLint
yarn build:ts                 # TypeScript compilation check
```

### Versioning & Release

```bash
yarn version --patch          # Bump patch (1.0.0 → 1.0.1)
yarn version --minor          # Bump minor (1.0.0 → 1.1.0)
yarn version --major          # Bump major (1.0.0 → 2.0.0)
```

## iOS Build Schemes

| Scheme                   | Network      | Display Name             | Use For                 |
| ------------------------ | ------------ | ------------------------ | ----------------------- |
| `MobileStack-testnetdev` | Celo Sepolia | TuCop (Celo Sepolia dev) | **Primary development** |
| `MobileStack-testnet`    | Celo Sepolia | TuCop Celo Sepolia       | Testing                 |
| `MobileStack-mainnet`    | Celo mainnet | TuCop                    | Production              |
| `MobileStack-mainnetdev` | Celo mainnet | TuCop (dev)              | Advanced testing        |

> **Testnet**: Celo Sepolia (chain ID 11142220). See [Celo Sepolia Docs](https://docs.celo.org/tooling/testnets/celo-sepolia).

## Android Build Configuration

| Component          | Version |
| ------------------ | ------- |
| AGP                | 8.5.1   |
| Gradle             | 8.7     |
| Kotlin             | 1.9.22  |
| Min SDK            | 24      |
| Target/Compile SDK | 35      |
| Hermes             | Enabled |

Release build: `cd android && ./gradlew bundleMainnetRelease`

## Network Configuration

|          | Mainnet                            | Celo Sepolia (testnet)                                  |
| -------- | ---------------------------------- | ------------------------------------------------------- |
| Chain ID | 42220                              | 11142220                                                |
| RPC      | `https://forno.celo.org/`          | `https://forno.celo-sepolia.celo-testnet.org/`          |
| Explorer | [celoscan.io](https://celoscan.io) | [sepolia.celoscan.io](https://sepolia.celoscan.io/)     |
| Faucet   | —                                  | [faucet.celo.org](https://faucet.celo.org/celo-sepolia) |

## Backend Services

All backend services are hosted on Railway:

| Service                | Purpose                                     | URL                                               |
| ---------------------- | ------------------------------------------- | ------------------------------------------------- |
| **Version API**        | App version management, forced updates      | `tucopwallet-production.up.railway.app`           |
| **BucksPay Proxy**     | Offramp API proxy (keeps creds server-side) | `buckspay-webhook-production-ad81.up.railway.app` |
| **Phone Verification** | OTP-based phone-wallet linking              | `api-wallet-tlf-production.up.railway.app`        |
| **Keyless Backup**     | SMS + cloud-based mnemonic backup           | `twilio-service.up.railway.app`                   |

## Release Process

```bash
# 1. Bump version
yarn version --patch

# 2. Push (triggers CI/CD automatically)
git push origin main --follow-tags
```

The CI/CD pipeline automatically:

1. Detects the version change
2. Builds Android (AAB) and iOS (IPA)
3. Uploads to Play Store (Internal) and TestFlight
4. Updates the Railway version backend
5. Creates a GitHub Release

See [docs/release-process.md](docs/release-process.md) and [docs/ci-cd.md](docs/ci-cd.md) for detailed procedures.

## Documentation

Full documentation index: [docs/README.md](docs/README.md)

| Category         | Documents                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| **Setup**        | [wallet-setup.md](docs/wallet-setup.md), [SETUP_CHECKLIST.md](.github/SETUP_CHECKLIST.md)                      |
| **Release**      | [release-process.md](docs/release-process.md), [ci-cd.md](docs/ci-cd.md), [releases.md](docs/releases.md)      |
| **Technical**    | [celo-gas-optimization.md](docs/celo-gas-optimization.md), [phone-verification.md](docs/phone-verification.md) |
| **Integrations** | [buckspay-api.md](docs/buckspay-api.md), [connecting-dapps.md](docs/connecting-dapps.md)                       |
| **Backend**      | [railway-backend/README.md](railway-backend/README.md), [services/README.md](services/README.md)               |

## URLs & Links

| Resource                 | URL                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------- |
| **Android (Play Store)** | [Google Play](https://play.google.com/store/apps/details?id=org.tucop)             |
| **iOS (App Store)**      | [App Store](https://apps.apple.com/app/tucop-wallet/id1234567890)                  |
| **Backend API**          | `https://tucopwallet-production.up.railway.app`                                    |
| **Repository**           | [github.com/TuCopFinance/TuCopWallet](https://github.com/TuCopFinance/TuCopWallet) |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Follow code conventions (ESLint + Prettier, Conventional Commits)
4. Write tests for new functionality
5. Open a Pull Request with a detailed description

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

## Troubleshooting

| Problem             | Solution                                 |
| ------------------- | ---------------------------------------- |
| Metro cache issues  | `yarn start --reset-cache`               |
| Metro port in use   | `lsof -ti:8081 \| xargs kill -9`         |
| iOS build fails     | Clean build folder: Cmd+Shift+K in Xcode |
| Android build fails | Verify JDK 17 and Android SDK setup      |
| TypeScript errors   | `yarn build:ts` to check                 |
| Node version issues | `nvm use 20.17.0`                        |

## Fork Origin

TuCOP Wallet is forked from [mobilestack-mento](https://github.com/mobilestack-xyz/mobilestack-mento), a fully-developed Celo stablecoin wallet built on the [Mobile Stack](https://github.com/mobilestack-xyz) framework by [Valora](https://valora.xyz). We chose `mobilestack-mento` (rather than the bare `mobilestack-runtime` framework) because it was already a working wallet with Celo integration, stablecoin support, and production-ready infrastructure — giving us a solid foundation to build Colombia-specific features on top (COPm, BucksPay, ReFi subsidies).

```text
valora-inc/wallet (original Valora wallet)
  └── mobilestack-runtime (framework extraction)
        ├── mobilestack-mento ← TuCOP forked from here
        ├── mobilestack-beefy
        └── mobilestack-shefi
```

> **Note**: The entire [mobilestack-xyz](https://github.com/mobilestack-xyz) organization was **archived in January 2026** (all repos read-only). TuCOP Wallet is now independently maintained. Original framework documentation is preserved in [docs/archive/](docs/archive/).

For historical reference on syncing with the upstream fork, see [docs/syncing-forks.md](docs/syncing-forks.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

**Current Version**: 1.117.0 | **Last Updated**: March 2026 | **Status**: Production
