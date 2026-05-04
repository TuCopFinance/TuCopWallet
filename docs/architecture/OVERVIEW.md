# TuCOP Wallet - Architecture Overview

## Quick Reference

| Aspecto        | Tecnología                 |
| -------------- | -------------------------- |
| **Framework**  | React Native 0.77.3        |
| **Lenguaje**   | TypeScript 5.x             |
| **State**      | Redux Toolkit + Redux Saga |
| **Navigation** | React Navigation 7.x       |
| **Blockchain** | Viem + Celo (L2)           |
| **Storage**    | Redux Persist (FSStorage)  |
| **Testing**    | Jest + Detox               |
| **CI/CD**      | GitHub Actions + Fastlane  |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              TuCOP Wallet                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │    Home     │  │    Send     │  │    Swap     │  │    Earn     │   │
│  │   Screen    │  │    Flow     │  │    Flow     │  │    Flow     │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │
│         │                │                │                │          │
│  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐   │
│  │                     React Navigation 7.x                       │   │
│  │              (Stack + BottomTab + BottomSheet)                 │   │
│  └────────────────────────────┬───────────────────────────────────┘   │
│                               │                                       │
│  ┌────────────────────────────┴───────────────────────────────────┐   │
│  │                     Redux Toolkit Store                         │   │
│  │  ┌─────────┐ ┌────────┐ ┌───────┐ ┌──────┐ ┌────────┐ ┌──────┐ │   │
│  │  │ tokens  │ │  send  │ │ swap  │ │ earn │ │buckspay│ │ gold │ │   │
│  │  └────┬────┘ └───┬────┘ └───┬───┘ └──┬───┘ └───┬────┘ └──┬───┘ │   │
│  └───────┼──────────┼──────────┼────────┼─────────┼─────────┼─────┘   │
│          │          │          │        │         │         │         │
│  ┌───────┴──────────┴──────────┴────────┴─────────┴─────────┴─────┐   │
│  │                       Redux Saga                                │   │
│  │            (Side Effects, API Calls, Blockchain TX)            │   │
│  └────────────────────────────┬───────────────────────────────────┘   │
│                               │                                       │
├───────────────────────────────┼───────────────────────────────────────┤
│                               │                                       │
│  ┌────────────────────────────┴───────────────────────────────────┐   │
│  │                         Viem Client                             │   │
│  │              (Wallet, Public Client, Gas Estimation)           │   │
│  └────────────────────────────┬───────────────────────────────────┘   │
│                               │                                       │
└───────────────────────────────┼───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                          Celo Network (L2)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │    COPm     │  │    USDT     │  │   XAUt0     │  │    CELO     │  │
│  │   (Mento)   │  │  (Tether)   │  │   (Gold)    │  │  (Native)   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── app/                    # App initialization, error handling
├── components/             # 150+ reusable UI components
├── navigator/              # Navigation configuration
│   ├── Navigator.tsx       # Main stack navigator
│   ├── TabNavigator.tsx    # Bottom tabs (Home, Send, Earn, Swap, Account)
│   └── Screens.ts          # Screen name constants
│
├── redux/                  # State management
│   ├── store.ts            # Store configuration
│   ├── reducers.ts         # Combined reducers
│   ├── reducersList.ts     # All 26 slices
│   ├── sagas.ts            # Root saga
│   └── migrations.ts       # State migrations (v244)
│
├── web3/                   # Blockchain core
│   ├── networkConfig.ts    # Token configs, chain IDs
│   └── contracts.ts        # Contract interactions
│
├── viem/                   # Viem utilities
│   ├── celoGasConfig.ts    # Celo L2 gas estimation
│   └── preparedTransactions.ts
│
├── tokens/                 # Token management
│   ├── slice.ts            # Token state
│   ├── selectors.ts        # Token selectors
│   └── saga.ts             # Token fetching
│
├── send/                   # P2P transfers (33 files)
├── swap/                   # DEX aggregator
├── earn/                   # Yield farming
├── buckspay/               # Colombia offramp
├── gold/                   # Digital gold (XAUt0)
├── subsidies/              # ReFi Colombia UBI
├── fiatExchanges/          # On/off ramps
├── points/                 # Rewards system
├── jumpstart/              # Referral rewards
│
├── onboarding/             # User registration
├── backup/                 # Seed phrase backup
├── keylessBackup/          # Cloud backup
├── pincode/                # PIN authentication
├── identity/               # Phone verification
│
├── account/                # Settings, profile
├── home/                   # Home screen, activity
├── dapps/                  # DApp connector
├── walletConnect/          # WalletConnect v2
├── nfts/                   # NFT support
│
├── analytics/              # Segment tracking
├── firebase/               # Push notifications
├── sentry/                 # Error reporting
├── statsig/                # Feature flags
│
├── styles/                 # Design tokens
├── icons/                  # 80+ SVG icons
├── i18n/                   # Internationalization
├── utils/                  # 55 utility functions
└── types/                  # Global TypeScript types
```

---

## Redux Store Structure

26 slices organizados por dominio:

```
store/
├── Core
│   ├── app           # App state, loading, errors
│   ├── i18n          # Language selection
│   ├── networkInfo   # Connectivity status
│   └── alert         # Banner alerts
│
├── Web3
│   ├── web3          # Wallet, accounts
│   ├── tokens        # Balances, prices
│   ├── walletConnect # DApp sessions
│   ├── identity      # Phone verification
│   └── account       # User settings
│
├── Transactions
│   ├── send          # P2P transfers
│   ├── transactions  # TX history
│   └── recipients    # Contact list
│
├── DeFi
│   ├── swap          # Token swaps
│   ├── earn          # Yield farming
│   ├── positions     # DeFi positions
│   ├── jumpstart     # Referral rewards
│   └── points        # Rewards points
│
├── Features
│   ├── buckspay      # Colombia offramp
│   ├── gold          # Digital gold
│   ├── nfts          # NFT collection
│   └── priceHistory  # Price charts
│
├── Fiat
│   ├── fiatExchanges # On/off ramps
│   ├── fiatConnect   # FiatConnect protocol
│   └── localCurrency # Currency conversion
│
└── Backup
    ├── imports       # Wallet import
    └── keylessBackup # Cloud backup
```

---

## Navigation Architecture

```
RootStack (BottomSheetNavigator)
│
├── MainModal (ModalStackNavigator)
│   │
│   ├── Main (MainStackNavigator)
│   │   ├── TabNavigator
│   │   │   ├── Home (TabHome)
│   │   │   ├── Send (SendSelectRecipient)
│   │   │   ├── Earn (EarnHome)
│   │   │   ├── Swap (SwapScreen)
│   │   │   └── Account (SettingsMenu)
│   │   │
│   │   ├── sendScreens (5)
│   │   ├── swapScreens (1)
│   │   ├── earnScreens (5)
│   │   ├── goldScreens (7)
│   │   ├── bucksPayScreens (4)
│   │   ├── backupScreens (7)
│   │   ├── settingsScreens (25+)
│   │   ├── nuxScreens (8) - onboarding
│   │   └── ... 80+ screens total
│   │
│   └── modalAnimatedScreens
│       ├── PincodeEnter
│       ├── RegulatoryTerms
│       └── SelectCountry
│
└── nativeBottomSheets
    ├── WalletConnectRequest
    ├── DappShortcutTransactionRequest
    └── FiatExchangeCurrencyBottomSheet
```

---

## Token Ecosystem

### Mento Stablecoins (XXXm)

| Token | Address         | Decimals | UI Name   |
| ----- | --------------- | -------- | --------- |
| COPm  | `0x8a567e2a...` | 18       | "Pesos"   |
| USDm  | `0x765de816...` | 18       | "Dólares" |
| EURm  | `0xd8763cba...` | 18       | "Euros"   |
| BRLm  | `0xe8537a3d...` | 18       | "Reales"  |

### Other Tokens

| Token | Address         | Decimals | Notes         |
| ----- | --------------- | -------- | ------------- |
| USDT  | `0x48065fbb...` | 6        | Tether native |
| USDC  | `0xceba9300...` | 6        | Circle native |
| XAUt0 | `0xaf37e8b6...` | 6        | Tether Gold   |
| CELO  | `0x471ece37...` | 18       | Native token  |

### Token ID Format

```typescript
// Mainnet
'celo-mainnet:0x8a567e2ae79ca692bd748ab832081c45de4041ea'

// Testnet (Celo Sepolia)
'celo-sepolia:0x5f8d55c3627d2dc0a2b4afa798f877242f382f67'
```

---

## External Services

| Service          | Purpose            | Endpoint            |
| ---------------- | ------------------ | ------------------- |
| **Celo RPC**     | Blockchain         | forno.celo.org      |
| **BucksPay**     | COPm offramp       | api.buckspay.xyz    |
| **Squid Router** | Cross-chain swaps  | api.squidrouter.com |
| **CoinGecko**    | Price data         | api.coingecko.com   |
| **Segment**      | Analytics          | api.segment.io      |
| **Sentry**       | Error tracking     | sentry.io           |
| **Firebase**     | Push notifications | FCM                 |
| **Statsig**      | Feature flags      | statsig.com         |

---

## Build Configuration

### iOS Schemes

| Scheme                   | Network      | Use              |
| ------------------------ | ------------ | ---------------- |
| `MobileStack-testnetdev` | Celo Sepolia | **Development**  |
| `MobileStack-testnet`    | Celo Sepolia | Testing          |
| `MobileStack-mainnet`    | Celo Mainnet | **Production**   |
| `MobileStack-mainnetdev` | Celo Mainnet | Advanced testing |

### Android Flavors

| Flavor              | Network      | Bundle ID         |
| ------------------- | ------------ | ----------------- |
| `sepoliaTestnetdev` | Celo Sepolia | org.tucop.dev     |
| `sepoliaTestnet`    | Celo Sepolia | org.tucop.testnet |
| `mainnet`           | Celo Mainnet | org.tucop         |

### Environment Variables

```bash
.env.mainnet        # Production
.env.mainnetdev     # Dev on mainnet
.env.testnet        # Celo Sepolia
.env.testnetdev     # Dev on Sepolia
```

---

## Key Patterns

### Redux Hook Usage

```typescript
import { useAppSelector, useAppDispatch } from 'src/redux/hooks'

const balance = useAppSelector(tokensByIdSelector)
const dispatch = useAppDispatch()
```

### Translation

```typescript
import { useTranslation } from 'react-i18next'

const { t } = useTranslation()
<Text>{t('send.title')}</Text>
```

### Logging

```typescript
import Logger from 'src/utils/Logger'

Logger.info('Tag', 'Message')
Logger.error('Tag', 'Error', error)
// NEVER use console.log
```

### Screen Component

```typescript
function MyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* content */}
      </ScrollView>
    </SafeAreaView>
  )
}

MyScreen.navigationOptions = {
  headerShown: true,
  headerTitle: 'My Screen',
}
```

---

## Related Documentation

- [ADRs](../adr/) - Architecture Decision Records
- [Modules](./modules/) - Detailed module documentation
- [Diagrams](./diagrams/) - Flow diagrams
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines
