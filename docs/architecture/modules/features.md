# Feature Modules

## Overview

TuCOP Wallet is organized into feature modules, each handling a specific
domain of functionality. This document covers the main features.

---

## Send (P2P Transfers)

Location: `src/send/` (33 files)

### Purpose

Send tokens to other users via address, phone number, or QR code.

### Key Files

| File                      | Purpose           |
| ------------------------- | ----------------- |
| `reducers.ts`             | Send flow state   |
| `saga.ts`                 | Transaction logic |
| `actions.ts`              | Redux actions     |
| `SendSelectRecipient.tsx` | Recipient picker  |
| `SendEnterAmount.tsx`     | Amount input      |
| `SendConfirmation.tsx`    | Confirm & sign    |

### Flow

```
SendSelectRecipient
    │
    ├── Enter address manually
    ├── Select from contacts
    ├── Scan QR code
    └── Search by phone (if verified)
         │
         ▼
    SendEnterAmount
         │
         ├── Select token (COPm, USDT, etc.)
         ├── Enter amount
         └── See balance & fees
              │
              ▼
    SendConfirmation
         │
         ├── Review details
         ├── Sign transaction
         └── Success/Error screen
```

### State Shape

```typescript
interface SendState {
  isSending: boolean
  lastUsedTokenId: string | null
  recentRecipients: Recipient[]
  encryptedComment?: string
}
```

---

## Swap (Token Exchange)

Location: `src/swap/` (15 files)

### Purpose

Exchange tokens using DEX aggregators (Uniswap, Ubeswap, etc.).

### Key Files

| File              | Purpose        |
| ----------------- | -------------- |
| `slice.ts`        | Swap state     |
| `saga.ts`         | Swap execution |
| `SwapScreen.tsx`  | Main swap UI   |
| `useSwapQuote.ts` | Quote fetching |

### Providers

1. **Uniswap** - Primary DEX
2. **Ubeswap** - Celo native DEX
3. **Squid Router** - Cross-chain aggregator

### Flow

```
SwapScreen
    │
    ├── Select input token
    ├── Select output token
    ├── Enter amount
    │     │
    │     ▼
    ├── Fetch quotes from providers
    ├── Show best rate
    │     │
    │     ▼
    ├── Approve token (if needed)
    └── Execute swap
```

---

## Earn (Yield Farming)

Location: `src/earn/` (20 files)

### Purpose

Deposit tokens into yield-generating protocols.

### Key Files

| File                     | Purpose             |
| ------------------------ | ------------------- |
| `slice.ts`               | Earn state          |
| `saga.ts`                | Deposit/withdraw    |
| `EarnHome.tsx`           | Yield opportunities |
| `EarnEnterAmount.tsx`    | Amount to deposit   |
| `EarnPoolInfoScreen.tsx` | Pool details        |

### Supported Protocols

- **Aave** - Lending protocol
- **Compound** - Lending protocol
- **Ubeswap LP** - Liquidity providing
- **Marranitos** - TuCOP staking (custom)

### State Shape

```typescript
interface EarnState {
  pools: Pool[]
  positions: Position[]
  isLoading: boolean
  selectedPool: Pool | null
}
```

---

## Gold (Digital Gold)

Location: `src/gold/` (15 files)

### Purpose

Buy and sell XAUt0 (Tether Gold) directly in the app.

### Key Files

| File                       | Purpose        |
| -------------------------- | -------------- |
| `slice.ts`                 | Gold state     |
| `saga.ts`                  | Buy/sell logic |
| `api.ts`                   | Price fetching |
| `useGoldQuote.ts`          | Quote hook     |
| `GoldHome.tsx`             | Gold dashboard |
| `GoldBuyEnterAmount.tsx`   | Buy amount     |
| `GoldBuyConfirmation.tsx`  | Confirm buy    |
| `GoldSellEnterAmount.tsx`  | Sell amount    |
| `GoldSellConfirmation.tsx` | Confirm sell   |
| `GoldPriceAlerts.tsx`      | Price alerts   |

### Flow

```
GoldHome
    │
    ├── Current gold price (CoinGecko)
    ├── User's XAUt0 balance
    ├── Price chart
    │
    ├── Buy Gold ──────────────────┐
    │                              │
    │   GoldBuyEnterAmount         │
    │        │                     │
    │        ├── Enter USDT amount │
    │        ├── See XAUt0 quote   │
    │        └── Fetch from Squid  │
    │             │                │
    │             ▼                │
    │   GoldBuyConfirmation        │
    │        │                     │
    │        ├── Review quote      │
    │        ├── Sign swap TX      │
    │        └── Success screen    │
    │                              │
    └── Sell Gold ─────────────────┘
         (reverse flow)
```

### State Shape

```typescript
interface GoldState {
  priceUsd: number | null
  priceCop: number | null
  lastUpdated: number | null
  isLoading: boolean
  error: string | null
  alerts: PriceAlert[]
}
```

---

## BucksPay (Colombia Offramp)

Location: `src/buckspay/` (12 files)

### Purpose

Convert COPm to COP and send to Colombian bank accounts.

### Key Files

| File                   | Purpose            |
| ---------------------- | ------------------ |
| `slice.ts`             | BucksPay state     |
| `saga.ts`              | Withdrawal flow    |
| `api.ts`               | BucksPay API calls |
| `BucksPayBankForm.tsx` | Bank details input |
| `BucksPayConfirm.tsx`  | Confirm withdrawal |
| `BucksPayStatus.tsx`   | Transaction status |

### Flow

```
SelectOfframpProvider
    │
    └── Select BucksPay
         │
         ▼
    BucksPayBankForm
         │
         ├── Select bank
         ├── Enter account number
         ├── Enter account type
         └── Enter amount
              │
              ▼
    BucksPayConfirm
         │
         ├── Review details
         ├── See fees & rate
         ├── Send COPm to BucksPay
         └── Sign transaction
              │
              ▼
    BucksPayStatus
         │
         ├── Pending (processing)
         ├── Success (sent to bank)
         └── Failed (refunded)
```

### External API

See `docs/buckspay-api.md` for full OpenAPI spec.

---

## Subsidies (ReFi Colombia)

Location: `src/subsidies/` (5 files)

### Purpose

Claim UBI/subsidy payments from ReFi Colombia program.

### Flow

```
ReFiColombiaSubsidiesScreen
    │
    ├── Check eligibility (phone verification required)
    ├── Show available subsidies
    └── Claim subsidy
         │
         ├── Sign claim transaction
         └── Receive COPm
```

---

## Points (Rewards)

Location: `src/points/` (8 files)

### Purpose

Track and display user reward points from various activities.

### Activities that earn points

- Complete onboarding
- First transaction
- Refer a friend
- Use specific features

---

## Jumpstart (Referrals)

Location: `src/jumpstart/` (10 files)

### Purpose

Send referral links with pre-loaded funds.

### Flow

```
JumpstartEnterAmount
    │
    ├── Enter amount to gift
    ├── Select token
    │
    ▼
JumpstartSendConfirmation
    │
    ├── Create escrow transaction
    ├── Generate unique link
    │
    ▼
JumpstartShareLink
    │
    ├── Share via WhatsApp, SMS, etc.
    └── Recipient claims by installing app
```

---

## NFTs

Location: `src/nfts/` (8 files)

### Purpose

Display and manage NFTs owned by the user.

### Features

- View NFT gallery
- See NFT details
- Transfer NFTs (basic)

---

## DApps

Location: `src/dapps/` + `src/walletConnect/`

### Purpose

Connect to DApps via WalletConnect v2.

### Flow

```
DAppsScreen
    │
    ├── Browse featured DApps
    ├── Scan WalletConnect QR
    │
    ▼
WalletConnectRequest
    │
    ├── Review connection request
    ├── Approve/Reject
    │
    ▼
(DApp interaction via WebView or external browser)
```

---

## Feature Flags

Location: `src/statsig/`

Features are gated using Statsig:

```typescript
import { getFeatureGate } from 'src/statsig'

const isGoldEnabled = getFeatureGate(StatsigFeatureGates.SHOW_GOLD_FEATURE)

if (isGoldEnabled) {
  // Show gold feature
}
```

### Current Gates

| Gate                | Purpose             |
| ------------------- | ------------------- |
| `SHOW_GOLD_FEATURE` | Digital gold access |
| `SHOW_BUCKSPAY`     | Colombia offramp    |
| `SHOW_POINTS`       | Points system       |
| `SHOW_JUMPSTART`    | Referral feature    |

---

## Best Practices

1. **Feature isolation** - Keep features in separate directories
2. **Slice per feature** - Each feature has its own Redux slice
3. **Saga for side effects** - Use sagas for API/blockchain calls
4. **Feature gates** - Gate new features with Statsig
5. **Translations** - All strings in i18n
6. **Analytics** - Track key events per feature
