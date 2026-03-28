# Module Dependencies

## Overview

This document maps dependencies between modules in TuCOP Wallet to help
understand the codebase architecture and plan refactoring safely.

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MODULE DEPENDENCY GRAPH                              │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   app/      │
                              │  (entry)    │
                              └──────┬──────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
       │  navigator/ │       │   redux/    │       │  sentry/    │
       │             │       │   store     │       │             │
       └──────┬──────┘       └──────┬──────┘       └─────────────┘
              │                     │
    ┌─────────┴─────────┐          │
    │                   │          │
    ▼                   ▼          ▼
┌─────────┐       ┌─────────┐ ┌─────────────────────────────────────┐
│onboarding│      │ tabs/   │ │            FEATURE MODULES          │
│         │       │ home    │ │                                     │
└─────────┘       └────┬────┘ │  ┌────────┐ ┌────────┐ ┌────────┐  │
                       │      │  │ send/  │ │ swap/  │ │ earn/  │  │
                       │      │  └────┬───┘ └───┬────┘ └───┬────┘  │
                       │      │       │         │          │       │
                       │      │       └─────────┼──────────┘       │
                       │      │                 │                  │
                       │      │                 ▼                  │
                       │      │          ┌─────────────┐           │
                       │      │          │  tokens/    │           │
                       │      │          │  (central)  │           │
                       │      │          └──────┬──────┘           │
                       │      │                 │                  │
                       │      └─────────────────┼──────────────────┘
                       │                        │
                       ▼                        ▼
                ┌─────────────┐          ┌─────────────┐
                │ components/ │          │   viem/     │
                │  (shared)   │          │   web3/     │
                └─────────────┘          └─────────────┘
```

## Core Dependencies

### `src/tokens/` (Central Module)

**Depended on by:** Almost every feature module

```typescript
// Modules that import from tokens/
import { useTokenInfo } from 'src/tokens/hooks'
import { tokensByIdSelector } from 'src/tokens/selectors'

// Used by:
// - src/send/
// - src/swap/
// - src/earn/
// - src/gold/
// - src/fiatExchanges/
// - src/home/
```

**Dependencies:**

- `src/web3/` - Network configuration
- `src/viem/` - On-chain balance queries
- `src/localCurrency/` - Price conversion
- `src/redux/` - State management

### `src/viem/` (Blockchain Layer)

**Depended on by:** All modules that interact with blockchain

```typescript
// Modules that import from viem/
import { publicClient, walletClient } from 'src/viem'
import { prepareTransactions } from 'src/viem/prepareTransactions'

// Used by:
// - src/send/
// - src/swap/
// - src/earn/
// - src/gold/
// - src/transactions/
```

**Dependencies:**

- `src/web3/` - Network configuration
- `src/pincode/` - Transaction signing

### `src/redux/` (State Management)

**Depended on by:** Every module with state

```typescript
// Core exports
import { store } from 'src/redux/store'
import { persistor } from 'src/redux/store'

// Used by:
// - All feature modules
// - src/app/
// - src/navigator/
```

**Dependencies:**

- All slice modules
- `redux-persist`
- `redux-saga`

## Feature Module Dependencies

### `src/send/`

```
send/
├── depends on:
│   ├── tokens/       (token info, balances)
│   ├── viem/         (transaction preparation)
│   ├── identity/     (recipient lookup)
│   ├── fees/         (gas estimation)
│   ├── localCurrency/ (amount conversion)
│   └── analytics/    (event tracking)
│
└── depended on by:
    ├── home/         (send button)
    └── tokens/       (send from token detail)
```

### `src/swap/`

```
swap/
├── depends on:
│   ├── tokens/       (swappable tokens)
│   ├── viem/         (transaction execution)
│   ├── fees/         (gas estimation)
│   └── analytics/    (event tracking)
│
└── depended on by:
    ├── home/         (swap button)
    ├── tokens/       (swap from token detail)
    └── gold/         (uses swap infrastructure)
```

### `src/gold/`

```
gold/
├── depends on:
│   ├── tokens/       (XAUt0 balance)
│   ├── swap/         (shared quote logic)
│   ├── viem/         (transaction execution)
│   ├── localCurrency/ (price display)
│   └── analytics/    (event tracking)
│
└── depended on by:
    └── home/         (gold tab)
```

### `src/earn/`

```
earn/
├── depends on:
│   ├── tokens/       (deposit tokens)
│   ├── viem/         (protocol interactions)
│   ├── positions/    (yield positions)
│   └── analytics/    (event tracking)
│
└── depended on by:
    └── home/         (earn tab)
```

### `src/buckspay/`

```
buckspay/
├── depends on:
│   ├── tokens/       (COPm balance)
│   ├── viem/         (transfer to hot wallet)
│   ├── analytics/    (event tracking)
│   └── web3/         (network config)
│
└── depended on by:
    └── fiatExchanges/ (offramp option)
```

## Identity & Verification Dependencies

### `src/identity/`

```
identity/
├── depends on:
│   ├── web3/         (wallet address)
│   ├── recipients/   (recipient types)
│   └── analytics/    (event tracking)
│
└── depended on by:
    ├── send/         (recipient lookup)
    ├── verify/       (phone verification)
    └── onboarding/   (contact import)
```

### `src/verify/`

```
verify/
├── depends on:
│   ├── identity/     (verification state)
│   ├── web3/         (wallet address)
│   ├── account/      (user account)
│   └── analytics/    (event tracking)
│
└── depended on by:
    └── onboarding/   (phone verification step)
```

## Shared Infrastructure

### `src/components/`

**Depended on by:** All UI modules

```typescript
// Common components
import { Button, Card, TextInput } from 'src/components'
import { TokenDisplay, TokenIcon } from 'src/components'
import { SafeAreaView, KeyboardAwareView } from 'src/components'
```

### `src/analytics/`

**Depended on by:** All feature modules

```typescript
// Event tracking
import { AppAnalytics } from 'src/analytics'
AppAnalytics.track(Events.send_payment_completed, { ... })
```

### `src/utils/`

**Depended on by:** All modules

```typescript
// Utility functions
import Logger from 'src/utils/Logger'
import { formatAmount, parseAmount } from 'src/utils/formatting'
```

## Circular Dependency Prevention

### Rules

1. **No circular imports** - Modules cannot import each other
2. **Shared types in types.ts** - Avoid importing for types
3. **Use selectors** - Don't import reducers directly
4. **Events over direct calls** - Use Redux actions for cross-module communication

### Anti-patterns to Avoid

```typescript
// ❌ BAD: Circular dependency
// tokens/saga.ts
import { refreshSendState } from 'src/send/actions'

// send/saga.ts
import { refreshTokenBalances } from 'src/tokens/slice'
```

```typescript
// ✅ GOOD: Event-based communication
// tokens/saga.ts
yield put(tokenBalancesRefreshed())

// send/saga.ts
takeLatest(tokenBalancesRefreshed, function* () {
  // React to token refresh
})
```

## Import Guidelines

### Allowed Import Directions

```
app/ ───────────▶ navigator/ ───────────▶ screens/
                      │
                      ▼
              ┌───────────────┐
              │ feature modules│
              │ (send, swap)   │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │ core modules   │
              │ (tokens, viem) │
              └───────┬───────┘
                      │
                      ▼
              ┌───────────────┐
              │ utils/         │
              │ components/    │
              └───────────────┘
```

### Importing Patterns

```typescript
// ✅ Feature module importing core module
import { useTokenInfo } from 'src/tokens/hooks'

// ✅ Core module importing utils
import Logger from 'src/utils/Logger'

// ❌ Core module importing feature module
import { swapSlice } from 'src/swap/slice' // Don't do this in tokens/

// ✅ Use types only (no runtime dependency)
import type { SwapQuote } from 'src/swap/types'
```

## Refactoring Impact Analysis

### High-Impact Modules

Changes to these modules affect many other modules:

| Module        | Dependents | Risk Level |
| ------------- | ---------- | ---------- |
| `tokens/`     | 15+        | 🔴 High    |
| `viem/`       | 12+        | 🔴 High    |
| `web3/`       | 10+        | 🔴 High    |
| `components/` | 20+        | 🟡 Medium  |
| `utils/`      | 25+        | 🟡 Medium  |

### Safe to Modify

Changes to these modules have limited impact:

| Module      | Dependents | Risk Level |
| ----------- | ---------- | ---------- |
| `gold/`     | 2          | 🟢 Low     |
| `buckspay/` | 2          | 🟢 Low     |
| `nfts/`     | 1          | 🟢 Low     |
| `points/`   | 2          | 🟢 Low     |

## Related Documentation

- [Redux Documentation](./redux.md)
- [Module Health](./health.md)
- [Architecture Overview](../OVERVIEW.md)
