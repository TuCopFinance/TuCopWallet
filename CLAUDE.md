# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development
```bash
yarn dev:android          # Run on Android simulator/device
yarn dev:ios              # Run on iOS simulator/device
yarn dev:android:mainnet  # Run on mainnet (production data)
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
├── divviProtocol/       # Referral tracking (v2 integration)
└── refi/                # ReFi Medellín UBI integration
```

### State Management
- **Redux Toolkit** with strict TypeScript typing
- **Redux Saga** for async operations and side effects
- **Redux Persist** with file system storage and migrations (current version: 237)
- Key slices: `tokens`, `send`, `earn`, `swap`, `account`, `identity`, `web3`

### Navigation Architecture
- **React Navigation 7.x** with native stack and bottom tabs
- Main navigation flow: `src/navigator/Navigator.tsx`
- Tab navigation: `src/navigator/TabNavigator.tsx`
- Onboarding flow: `src/onboarding/registration/RegistrationNavigator.tsx`

### Blockchain Integration
- **Celo network** (mainnet and alfajores testnet)
- **Viem** for web3 interactions (replacing web3.js)
- **WalletConnect** for DApp connectivity
- Multi-network support with environment-based configuration

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

### Recent Important Changes
- **Divvi Protocol v2**: Updated referral tracking system
- **Version 1.107.0**: Current app version with enhanced CI/CD
- **Viem Migration**: Ongoing migration from web3.js to Viem for blockchain operations

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