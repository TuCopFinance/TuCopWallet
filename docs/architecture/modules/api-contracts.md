# API Contracts Between Redux Slices

## Overview

This document defines the contracts between Redux slices - the actions,
selectors, and data shapes that modules use to communicate.

## Core Contracts

### Tokens Slice

**Location:** `src/tokens/slice.ts`

#### State Shape

```typescript
interface TokensState {
  tokenBalances: Record<string, StoredTokenBalance>
  loading: boolean
  error: string | null
}

interface StoredTokenBalance {
  tokenId: string // "celo-mainnet:0x..."
  address: string | null // Contract address
  symbol: string // "COPm", "USDT"
  name: string // "Colombian Peso"
  decimals: number // 18, 6
  networkId: NetworkId // "celo-mainnet"
  balance: string | null // Wei string
  priceUsd?: string // USD price string
  isNative?: boolean
  isFeeCurrency?: boolean
  isSwappable?: boolean
  isManuallyImported?: boolean
}
```

#### Public Actions

| Action               | Payload                              | When to Use             |
| -------------------- | ------------------------------------ | ----------------------- |
| `fetchTokenBalances` | -                                    | Trigger balance refresh |
| `setTokenBalances`   | `Record<string, StoredTokenBalance>` | Set all balances        |
| `importToken`        | `StoredTokenBalance`                 | Add custom token        |

#### Public Selectors

| Selector                          | Parameters           | Returns          | Use Case            |
| --------------------------------- | -------------------- | ---------------- | ------------------- |
| `tokensByIdSelector`              | `state, networkIds?` | `TokenBalances`  | Get all tokens      |
| `tokensListSelector`              | `state, networkIds`  | `TokenBalance[]` | List for UI         |
| `sortedTokensWithBalanceSelector` | `state, networkIds`  | `TokenBalance[]` | Sorted by value     |
| `feeCurrenciesSelector`           | `state, networkId`   | `TokenBalance[]` | Gas payment options |
| `swappableFromTokensSelector`     | `state, networkId`   | `TokenBalance[]` | Swap sources        |

#### Hooks

| Hook                   | Parameters   | Returns                         |
| ---------------------- | ------------ | ------------------------------- |
| `useTokenInfo`         | `tokenId`    | `TokenBalance \| undefined`     |
| `useTokensInfo`        | `tokenIds[]` | `(TokenBalance \| undefined)[]` |
| `useTotalTokenBalance` | -            | `BigNumber \| null`             |

---

### Send Slice

**Location:** `src/send/reducers.ts`

#### State Shape

```typescript
interface SendState {
  isSending: boolean
  recentRecipients: Recipient[]
  recentPayments: PaymentInfo[]
  lastUsedTokenId?: string
  encryptedComment: string | null
  isEncryptingComment: boolean
}

interface PaymentInfo {
  timestamp: number
  amount: string
  tokenId: string
  recipientAddress: string
}
```

#### Public Actions

| Action                   | Payload               | When to Use         |
| ------------------------ | --------------------- | ------------------- |
| `sendPayment`            | `SendPaymentPayload`  | Initiate send       |
| `sendPaymentSuccess`     | `{ amount, tokenId }` | Mark success        |
| `sendPaymentFailure`     | -                     | Mark failure        |
| `updateLastUsedCurrency` | `tokenId`             | Remember preference |

```typescript
interface SendPaymentPayload {
  recipient: Recipient & { address: string }
  amount: BigNumber
  tokenId: string
  preparedTransactions: PreparedTransaction[]
  comment?: string
}
```

#### Public Selectors

| Selector                   | Returns       | Use Case               |
| -------------------------- | ------------- | ---------------------- |
| `isSendingSelector`        | `boolean`     | Disable UI during send |
| `recentRecipientsSelector` | `Recipient[]` | Show recent contacts   |
| `lastUsedTokenIdSelector`  | `string?`     | Pre-select token       |

---

### Swap Slice

**Location:** `src/swap/slice.ts`

#### State Shape

```typescript
interface SwapState {
  fromTokenId: string | null
  toTokenId: string | null
  fromAmount: string
  swapStatus: SwapStatus
  quote: SwapQuote | null
  error: string | null
}

type SwapStatus = 'idle' | 'quoting' | 'approving' | 'swapping' | 'success' | 'error'

interface SwapQuote {
  provider: string
  fromAmount: string
  toAmount: string
  toAmountMin: string
  priceImpact: number
  estimatedGas: string
  transactions: PreparedTransaction[]
}
```

#### Public Actions

| Action          | Payload        | When to Use      |
| --------------- | -------------- | ---------------- |
| `setSwapTokens` | `{ from, to }` | Set token pair   |
| `setSwapAmount` | `string`       | Set input amount |
| `executeSwap`   | `SwapQuote`    | Execute swap     |
| `swapCompleted` | `{ txHash }`   | Mark success     |
| `swapFailed`    | `string`       | Mark failure     |

#### Public Selectors

| Selector                | Returns         | Use Case          |
| ----------------------- | --------------- | ----------------- |
| `swapStatusSelector`    | `SwapStatus`    | Show progress     |
| `swapQuoteSelector`     | `SwapQuote?`    | Display quote     |
| `swapFromTokenSelector` | `TokenBalance?` | Input token info  |
| `swapToTokenSelector`   | `TokenBalance?` | Output token info |

---

### Gold Slice

**Location:** `src/gold/slice.ts`

#### State Shape

```typescript
interface GoldState {
  priceUsd: number | null
  priceCop: number | null
  priceChange24h: number | null
  lastUpdated: number | null
  isLoadingPrice: boolean
  error: string | null
  alerts: PriceAlert[]
}

interface PriceAlert {
  id: string
  targetPrice: number
  direction: 'above' | 'below'
  isActive: boolean
  createdAt: number
}
```

#### Public Actions

| Action             | Payload                | When to Use   |
| ------------------ | ---------------------- | ------------- |
| `fetchGoldPrice`   | -                      | Refresh price |
| `setGoldPrice`     | `{ usd, cop, change }` | Update price  |
| `createPriceAlert` | `{ price, direction }` | Add alert     |
| `deletePriceAlert` | `alertId`              | Remove alert  |
| `buyGold`          | `{ amount, quote }`    | Execute buy   |
| `sellGold`         | `{ amount, quote }`    | Execute sell  |

#### Public Selectors

| Selector                     | Returns        | Use Case       |
| ---------------------------- | -------------- | -------------- |
| `goldPriceUsdSelector`       | `number?`      | Display price  |
| `goldPriceCopSelector`       | `number?`      | Local currency |
| `goldPriceChange24hSelector` | `number?`      | Show change    |
| `goldAlertsSelector`         | `PriceAlert[]` | List alerts    |
| `xaut0BalanceSelector`       | `BigNumber`    | User's gold    |

---

### Identity Slice

**Location:** `src/identity/reducer.ts`

#### State Shape

```typescript
interface IdentityState {
  addressToE164Number: Record<string, string>
  e164NumberToAddress: Record<string, AddressMapping>
  addressToVerificationStatus: Record<string, RecipientVerificationStatus>
  secureSendPhoneNumberMapping: Record<string, SecureSendState>
  importContactsProgress: ImportContactsStatus
}

interface AddressMapping {
  addresses: string[]
  lastUpdated: number
}

enum RecipientVerificationStatus {
  UNVERIFIED = 0,
  VERIFIED = 1,
  UNKNOWN = 2,
}
```

#### Public Actions

| Action                              | Payload            | When to Use       |
| ----------------------------------- | ------------------ | ----------------- |
| `fetchAddressesAndValidationStatus` | `e164Number`       | Lookup phone      |
| `validateRecipientAddress`          | `{ phone, input }` | Validate address  |
| `importContacts`                    | -                  | Start import      |
| `requireSecureSend`                 | `{ phone, type }`  | Enable validation |

#### Public Selectors

| Selector                               | Returns  | Use Case          |
| -------------------------------------- | -------- | ----------------- |
| `e164NumberToAddressSelector`          | `Record` | Phone lookup      |
| `addressToVerificationStatusSelector`  | `Record` | Check verified    |
| `secureSendPhoneNumberMappingSelector` | `Record` | Secure send state |
| `importContactsProgressSelector`       | `Status` | Import progress   |

---

### Account Slice

**Location:** `src/account/slice.ts`

#### State Shape

```typescript
interface AccountState {
  name: string | null
  pictureUri: string | null
  defaultCountryCode: string | null
  e164PhoneNumber: string | null
  acceptedTerms: boolean
  pincodeType: PincodeType
  onboardingCompleted: boolean
  recoveryPhraseInOnboardingStatus: RecoveryPhraseStatus
  hideBalances: boolean
}
```

#### Public Actions

| Action               | Payload       | When to Use        |
| -------------------- | ------------- | ------------------ |
| `setName`            | `string`      | Update name        |
| `setPhoneNumber`     | `e164`        | After verification |
| `acceptTerms`        | -             | Terms accepted     |
| `setPincodeType`     | `PincodeType` | PIN set            |
| `onboardingComplete` | -             | Onboarding done    |
| `toggleHideBalances` | -             | Privacy toggle     |

#### Public Selectors

| Selector                      | Returns   | Use Case     |
| ----------------------------- | --------- | ------------ |
| `nameSelector`                | `string?` | Display name |
| `e164PhoneNumberSelector`     | `string?` | User's phone |
| `onboardingCompletedSelector` | `boolean` | Check status |
| `hideBalancesSelector`        | `boolean` | Privacy mode |
| `acceptedTermsSelector`       | `boolean` | Terms check  |

---

### BucksPay Slice

**Location:** `src/buckspay/slice.ts`

#### State Shape

```typescript
interface BucksPayState {
  status: 'idle' | 'loading' | 'success' | 'error'
  currentTransfer: Transfer | null
  recentTransfers: Transfer[]
  error: string | null
}

interface Transfer {
  id: string
  amount: string
  bank: string
  accountNumber: string
  accountType: 'savings' | 'checking'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  txHash: string | null
  createdAt: number
}
```

#### Public Actions

| Action                 | Payload          | When to Use      |
| ---------------------- | ---------------- | ---------------- |
| `createTransfer`       | `TransferParams` | Start withdrawal |
| `updateTransferStatus` | `Transfer`       | Update from poll |
| `transferCompleted`    | `Transfer`       | Mark success     |
| `transferFailed`       | `string`         | Mark failure     |

#### Public Selectors

| Selector                  | Returns      | Use Case        |
| ------------------------- | ------------ | --------------- |
| `bucksPayStatusSelector`  | `string`     | Show status     |
| `currentTransferSelector` | `Transfer?`  | Active transfer |
| `recentTransfersSelector` | `Transfer[]` | History         |

---

## Cross-Module Communication Patterns

### Pattern 1: Token Balance Refresh

When a module needs updated balances:

```typescript
// After successful send
yield put(fetchTokenBalances())

// Listen for balance updates
yield takeLatest(fetchTokenBalancesSuccess, function* () {
  // React to new balances
})
```

### Pattern 2: Transaction Completion

Notify other modules of transactions:

```typescript
// Send saga
yield put(
  transactionCompleted({
    type: 'send',
    txHash,
    tokenId,
    amount,
  })
)

// Other modules can listen
yield takeLatest(transactionCompleted, function* (action) {
  if (action.payload.type === 'send') {
    // Update UI, refresh data
  }
})
```

### Pattern 3: Feature Flag Gates

Check flags before operations:

```typescript
import { getFeatureGate } from 'src/statsig'

if (getFeatureGate('show_gold_feature')) {
  yield put(fetchGoldPrice())
}
```

### Pattern 4: Error Broadcasting

Share errors across modules:

```typescript
// Generic error action
yield put(
  showError({
    type: 'transaction',
    message: t('sendFailed'),
    error,
  })
)

// Error handler saga
yield takeLatest(showError, function* (action) {
  Logger.error(action.payload.type, action.payload.message, action.payload.error)
  yield call(showErrorOrFallback, action.payload.message)
})
```

## Type Exports

Each slice should export its types:

```typescript
// src/tokens/types.ts
export interface TokenBalance { ... }
export interface StoredTokenBalance { ... }
export type TokenBalances = Record<string, TokenBalance>

// src/send/types.ts
export interface Recipient { ... }
export interface PaymentInfo { ... }
export interface SendPaymentPayload { ... }

// Used by other modules
import type { TokenBalance } from 'src/tokens/types'
import type { Recipient } from 'src/send/types'
```

## Related Documentation

- [Redux Documentation](./redux.md)
- [Module Dependencies](./dependencies.md)
- [Testing Strategy](../../adr/0009-testing-strategy.md)
