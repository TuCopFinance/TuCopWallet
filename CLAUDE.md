# TuCopWallet

React Native 0.77.3 crypto wallet on Celo network.

---

## Commands

```bash
yarn dev:android          # Run on Android
yarn dev:ios              # Run on iOS (may need direct Xcode build)
yarn build:ts             # TypeScript check - REQUIRED
yarn lint                 # ESLint - REQUIRED
yarn test                 # Unit tests
yarn knip --no-gitignore  # Dead code detection
```

---

## Architecture

- **React Native 0.77.3** + TypeScript
- **Redux Toolkit** + Redux Saga
- **React Navigation 7.x**
- **Viem** for blockchain (Celo network)
- **Jest** + Detox for testing

### Key Directories

```text
src/
├── components/      # Reusable UI
├── redux/           # State (slices, sagas, migrations v238)
├── navigator/       # Navigation config
├── web3/            # Blockchain, networkConfig.ts
├── tokens/          # Token management
├── send/            # Send money
├── buckspay/        # COPm → COP offramp
├── earn/            # Yield/staking
├── swap/            # Token swapping
└── subsidies/       # ReFi Colombia UBI
```

---

## Critical Rules

### UI Display (IMPORTANTE)

| Code           | Show to User |
| -------------- | ------------ |
| COPm           | **Pesos**    |
| USDT/USDC/USDm | **Dólares**  |
| XAUt0          | **Oro**      |

### Code Standards

- NEVER use old `cXXX` symbols → use `XXXm`
- Use `Logger.ts`, not console.log
- Use i18n for user-facing strings
- Use `useAppSelector`/`useAppDispatch` for Redux

---

## Component Patterns

- Wrap screens in `SafeAreaView`
- Import colors/spacing from `src/styles/`
- Follow patterns in `src/components/`
- Feature flags via Statsig

---

## Common Gotchas

- Metro cache: `yarn start --reset-cache`
- iOS simulator: Clean build folder, restart simulator
- Redux persistence: Increment migration version when changing state
- Check `patches/` for RN version workarounds

---

## Version Info

- **App**: 1.118.0 (build: 1021081759)
- **Network**: Celo mainnet + Celo Sepolia (testnet)
- **Node**: 20.17.0 required

---

## Extended Documentation

@.claude/rules/tokens.md - Token ecosystem & addresses
@.claude/rules/ios-build.md - iOS schemes & troubleshooting
@.claude/rules/android-build.md - Android config & SoLoader fix
@.claude/rules/railway.md - Backend services
@.claude/rules/ci-cd.md - CI checks & Knip
