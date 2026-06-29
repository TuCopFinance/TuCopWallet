# Redux State Management

Single source of truth for the Redux store: slice inventory, contracts between modules, sagas, selectors, migrations, and patterns.

TuCop Wallet uses Redux Toolkit + Redux Saga, persisted via Redux Persist with file system storage. Source of truth for the live slice list: [src/redux/reducersList.ts](../../../src/redux/reducersList.ts).

---

## Store configuration

Location: [src/redux/store.ts](../../../src/redux/store.ts)

```typescript
const persistConfig = {
  key: 'root',
  version: 244,                    // bump when adding a migration
  storage: FSStorage(),
  stateReconciler: autoMergeLevel2,
  whitelist: [...],                // slices to persist
  migrate: createMigrate(migrations, { debug: false }),
}
```

---

## Slice inventory (32 total)

The inventory tracks every reducer wired into [reducersList.ts](../../../src/redux/reducersList.ts). For slices marked DEPRECATED, the code is still in the repo but the feature is not actively used; see linked archive.

### Core / lifecycle

| Slice         | Location                                                          | Purpose                             |
| ------------- | ----------------------------------------------------------------- | ----------------------------------- |
| `app`         | [src/app/reducers.ts](../../../src/app/reducers.ts)               | App state, loading, session         |
| `home`        | [src/home/reducers.ts](../../../src/home/reducers.ts)             | Home screen tabs + visibility state |
| `i18n`        | [src/i18n/slice.ts](../../../src/i18n/slice.ts)                   | Language selection                  |
| `networkInfo` | [src/networkInfo/reducer.ts](../../../src/networkInfo/reducer.ts) | Connectivity status                 |
| `alert`       | [src/alert/reducer.ts](../../../src/alert/reducer.ts)             | Banner alerts                       |

### Web3 / identity

| Slice           | Location                                                              | Purpose                    |
| --------------- | --------------------------------------------------------------------- | -------------------------- |
| `web3`          | [src/web3/reducer.ts](../../../src/web3/reducer.ts)                   | Wallet address, accounts   |
| `tokens`        | [src/tokens/slice.ts](../../../src/tokens/slice.ts)                   | Balances, prices, metadata |
| `walletConnect` | [src/walletConnect/reducer.ts](../../../src/walletConnect/reducer.ts) | DApp sessions              |
| `identity`      | [src/identity/reducer.ts](../../../src/identity/reducer.ts)           | Phone verification         |
| `account`       | [src/account/reducer.ts](../../../src/account/reducer.ts)             | User settings, preferences |

### Transactional

| Slice          | Location                                                        | Purpose                               |
| -------------- | --------------------------------------------------------------- | ------------------------------------- |
| `send`         | [src/send/reducers.ts](../../../src/send/reducers.ts)           | Send flow state                       |
| `transactions` | [src/transactions/slice.ts](../../../src/transactions/slice.ts) | Tx history                            |
| `recipients`   | [src/recipients/reducer.ts](../../../src/recipients/reducer.ts) | Contact list                          |
| `dollarsSpend` | [src/dollarsSpend/slice.ts](../../../src/dollarsSpend/slice.ts) | Multi-step USD spending orchestration |

### DeFi

| Slice       | Location                                                    | Purpose                     |
| ----------- | ----------------------------------------------------------- | --------------------------- |
| `swap`      | [src/swap/slice.ts](../../../src/swap/slice.ts)             | Token swap state            |
| `earn`      | [src/earn/slice.ts](../../../src/earn/slice.ts)             | Generic yield positions     |
| `neeru`     | [src/earn/neeru/slice.ts](../../../src/earn/neeru/slice.ts) | Neeru Vaults specific state |
| `positions` | [src/positions/slice.ts](../../../src/positions/slice.ts)   | DeFi position aggregator    |
| `jumpstart` | [src/jumpstart/slice.ts](../../../src/jumpstart/slice.ts)   | Referral / claim rewards    |
| `points`    | [src/points/slice.ts](../../../src/points/slice.ts)         | Points system               |

### Feature

| Slice          | Location                                                        | Purpose                                                                                             |
| -------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `gold`         | [src/gold/slice.ts](../../../src/gold/slice.ts)                 | Digital gold (XAUt0)                                                                                |
| `dapps`        | [src/dapps/slice.ts](../../../src/dapps/slice.ts)               | DApp discovery / list                                                                               |
| `nfts`         | [src/nfts/slice.ts](../../../src/nfts/slice.ts)                 | NFT collection                                                                                      |
| `priceHistory` | [src/priceHistory/slice.ts](../../../src/priceHistory/slice.ts) | Price charts                                                                                        |
| `buckspay`     | [src/buckspay/slice.ts](../../../src/buckspay/slice.ts)         | DEPRECATED. Colombia offramp. See [docs/archive/2026-06-buckspay/](../../archive/2026-06-buckspay/) |

### Fiat

| Slice           | Location                                                              | Purpose              |
| --------------- | --------------------------------------------------------------------- | -------------------- |
| `fiatExchanges` | [src/fiatExchanges/reducer.ts](../../../src/fiatExchanges/reducer.ts) | On / off ramps       |
| `fiatConnect`   | [src/fiatconnect/slice.ts](../../../src/fiatconnect/slice.ts)         | FiatConnect protocol |
| `localCurrency` | [src/localCurrency/reducer.ts](../../../src/localCurrency/reducer.ts) | Currency conversion  |

### Backup

| Slice           | Location                                                          | Purpose       |
| --------------- | ----------------------------------------------------------------- | ------------- |
| `imports`       | [src/import/reducer.ts](../../../src/import/reducer.ts)           | Wallet import |
| `keylessBackup` | [src/keylessBackup/slice.ts](../../../src/keylessBackup/slice.ts) | Cloud backup  |

### WRI primitives (shipped 2026-06)

Cross-cutting infrastructure introduced by the [Wallet Robustness Initiative](../../specs/2026-06-15-wallet-robustness-initiative-design.md).

| Slice                 | Location                                                                                    | Purpose                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `transactionInFlight` | [src/lib/useTransactionInFlight/slice.ts](../../../src/lib/useTransactionInFlight/slice.ts) | Generic in-flight transaction descriptor keyed by `flowId` |
| `sentTransactionLog`  | [src/viem/sentTransactionLog/slice.ts](../../../src/viem/sentTransactionLog/slice.ts)       | Idempotency log for `sendPreparedTransactions`             |

---

## Slice contracts (selected)

The eight most-referenced slices, with their state shape and public surface. For other slices, read the slice file directly; the contracts below are kept here because they are consumed across feature boundaries.

### Tokens slice

State shape:

```typescript
interface TokensState {
  tokenBalances: Record<string, StoredTokenBalance>
  loading: boolean
  error: string | null
}

interface StoredTokenBalance {
  tokenId: string // "celo-mainnet:0x..."
  address: string | null
  symbol: string // "COPm", "USDT", "USDm"
  name: string
  decimals: number // 18 for Mento, 6 for USDT/USDC/XAUt0
  networkId: NetworkId // "celo-mainnet"
  balance: string | null // wei string
  priceUsd?: string
  isNative?: boolean
  isFeeCurrency?: boolean
  isSwappable?: boolean
  isManuallyImported?: boolean
}
```

Public actions:

| Action               | Payload                              | When to use             |
| -------------------- | ------------------------------------ | ----------------------- |
| `fetchTokenBalances` | -                                    | Trigger balance refresh |
| `setTokenBalances`   | `Record<string, StoredTokenBalance>` | Set all balances        |
| `importToken`        | `StoredTokenBalance`                 | Add custom token        |

Public selectors:

| Selector                          | Parameters           | Returns          | Use case            |
| --------------------------------- | -------------------- | ---------------- | ------------------- |
| `tokensByIdSelector`              | `state, networkIds?` | `TokenBalances`  | Get all tokens      |
| `tokensListSelector`              | `state, networkIds`  | `TokenBalance[]` | List for UI         |
| `sortedTokensWithBalanceSelector` | `state, networkIds`  | `TokenBalance[]` | Sorted by value     |
| `feeCurrenciesSelector`           | `state, networkId`   | `TokenBalance[]` | Gas payment options |
| `swappableFromTokensSelector`     | `state, networkId`   | `TokenBalance[]` | Swap sources        |

Hooks: `useTokenInfo(tokenId)`, `useTokensInfo(tokenIds[])`, `useTotalTokenBalance()`.

---

### Send slice

State shape:

```typescript
interface SendState {
  isSending: boolean
  recentRecipients: Recipient[]
  recentPayments: PaymentInfo[]
  lastUsedTokenId?: string
  encryptedComment: string | null
  isEncryptingComment: boolean
}
```

Public actions: `sendPayment`, `sendPaymentSuccess`, `sendPaymentFailure`, `updateLastUsedCurrency`.

Public selectors: `isSendingSelector`, `recentRecipientsSelector`, `lastUsedTokenIdSelector`.

---

### Swap slice

State shape:

```typescript
interface SwapState {
  fromTokenId: string | null
  toTokenId: string | null
  fromAmount: string
  swapStatus: 'idle' | 'quoting' | 'approving' | 'swapping' | 'success' | 'error'
  quote: SwapQuote | null
  error: string | null
}

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

Public actions: `setSwapTokens`, `setSwapAmount`, `executeSwap`, `swapCompleted`, `swapFailed`.

Public selectors: `swapStatusSelector`, `swapQuoteSelector`, `swapFromTokenSelector`, `swapToTokenSelector`.

---

### Gold slice

State shape:

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
```

Public actions: `fetchGoldPrice`, `setGoldPrice`, `createPriceAlert`, `deletePriceAlert`, `buyGold`, `sellGold`.

Public selectors: `goldPriceUsdSelector`, `goldPriceCopSelector`, `goldPriceChange24hSelector`, `goldAlertsSelector`, `xaut0BalanceSelector`.

---

### Identity slice

State shape:

```typescript
interface IdentityState {
  addressToE164Number: Record<string, string>
  e164NumberToAddress: Record<string, AddressMapping>
  addressToVerificationStatus: Record<string, RecipientVerificationStatus>
  secureSendPhoneNumberMapping: Record<string, SecureSendState>
  importContactsProgress: ImportContactsStatus
}
```

Public actions: `fetchAddressesAndValidationStatus`, `validateRecipientAddress`, `importContacts`, `requireSecureSend`.

Public selectors: `e164NumberToAddressSelector`, `addressToVerificationStatusSelector`, `secureSendPhoneNumberMappingSelector`, `importContactsProgressSelector`.

---

### Account slice

State shape:

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

Public actions: `setName`, `setPhoneNumber`, `acceptTerms`, `setPincodeType`, `onboardingComplete`, `toggleHideBalances`.

Public selectors: `nameSelector`, `e164PhoneNumberSelector`, `onboardingCompletedSelector`, `hideBalancesSelector`, `acceptedTermsSelector`.

---

### transactionInFlight slice (WRI primitive)

Keyed by `flowId: string`. The canonical descriptor of any in-flight transaction across send / swap / gold / dollarsSpend / earn / jumpstart / buckspay / subsidies.

```typescript
interface InFlightDescriptor {
  flowId: string
  flowKind:
    | 'send'
    | 'swap'
    | 'gold-buy'
    | 'gold-sell'
    | 'dollars-spend'
    | 'earn-deposit'
    | 'earn-withdraw'
    | 'buckspay-offramp'
    | 'jumpstart-reclaim'
    | 'subsidies-claim'
  status:
    | 'idle'
    | 'preparing'
    | 'pin-required'
    | 'signing'
    | 'broadcasting'
    | 'pending-confirmation'
    | 'success'
    | 'error'
  startedAt: number
  lastErrorClass: ErrorClass | null
  // additional flow-specific fields
}
```

Public hook: `useTransactionInFlight(flowId)` returns `{ inFlight, start, advance, retry, abort }`.

Actions for saga consumption: `inFlightStart`, `inFlightAdvance`, `inFlightRetry`, `inFlightAbort`.

See [docs/research/s5-tx-in-flight-api.md](../../research/s5-tx-in-flight-api.md) for the canonical v4 API spec.

---

### sentTransactionLog slice (WRI primitive)

Per-flow log of broadcast transactions. Used by `sendPreparedTransactions` to short-circuit reentry: if a transaction with the same `(flowId, index, nonce)` is already in the log, the saga waits for confirmation instead of re-broadcasting.

```typescript
interface SentTxRecord {
  flowId: string
  index: number
  nonce: number
  hash: string
  status: 'pending' | 'confirmed' | 'failed'
}
```

Public actions: `recordSent`, `markConfirmed`, `markFailed`, `clearFlow`.

---

### BucksPay slice (DEPRECATED)

Module is inactive since June 2026. Code in [src/buckspay/](../../../src/buckspay/) still compiles; selectors and actions are unchanged from when it shipped. Full archived docs: [docs/archive/2026-06-buckspay/](../../archive/2026-06-buckspay/).

---

## Migrations

Location: [src/redux/migrations.ts](../../../src/redux/migrations.ts). Current version: **244**.

Migrations run when `persistConfig.version` increases. Pattern:

```typescript
export const migrations: MigrationManifest = {
  // ... existing
  245: (state) => ({
    ...state,
    newSlice: {
      /* initial state */
    },
  }),
}
```

Then bump `version: 245` in `store.ts`.

Rules:

1. Always provide defaults for added state.
2. Never delete persisted data without a migration that preserves what matters.
3. Test migrations against fixtures of real user state.
4. Document breaking changes in migration comments.

---

## Sagas

Location: [src/redux/sagas.ts](../../../src/redux/sagas.ts).

Root saga composition:

```typescript
export function* rootSaga() {
  yield spawn(appSaga)
  yield spawn(tokensSaga)
  yield spawn(sendSaga)
  yield spawn(swapSaga)
  yield spawn(earnSaga)
  yield spawn(goldSaga)
  yield spawn(buckspaySaga)
  // ...
}
```

Patterns used throughout:

**Watch pattern**:

```typescript
export function* watchSendPayment() {
  yield takeLeading(sendPayment.type, sendPaymentSaga)
}
```

**External API call**:

```typescript
function* fetchTokenPrices() {
  try {
    const prices = yield call(api.getPrices)
    yield put(setPrices(prices))
  } catch (error) {
    yield put(setPricesError(error.message))
  }
}
```

**Blockchain transaction** (post-WRI pattern):

```typescript
function* sendTransaction({ payload }: PayloadAction<SendParams>) {
  const { flowId } = payload
  yield put(inFlightStart({ flowId, flowKind: 'send' }))
  const tx = yield call(prepareTransaction, payload)
  yield put(inFlightAdvance({ flowId, status: 'signing' }))
  const hash = yield call(sendPreparedTransactions, [tx], flowId)
  yield put(inFlightAdvance({ flowId, status: 'pending-confirmation' }))
  yield call(waitForConfirmation, hash)
  yield put(inFlightAdvance({ flowId, status: 'success' }))
}
```

---

## Selectors

Use the `useAppSelector` typed hook, not raw `useSelector`:

```typescript
import { useAppSelector } from 'src/redux/hooks'
import { tokensByIdSelector } from 'src/tokens/selectors'

function MyComponent() {
  const tokens = useAppSelector(tokensByIdSelector)
}
```

Create memoized selectors with `createSelector` for derived data:

```typescript
export const tokensSelector = (state: RootState) => state.tokens.tokens

export const sortedTokensSelector = createSelector([tokensSelector], (tokens) =>
  Object.values(tokens).sort((a, b) => b.balance - a.balance)
)

export const tokenByIdSelector = (tokenId: string) =>
  createSelector([tokensSelector], (tokens) => tokens[tokenId])
```

---

## Hooks

Location: [src/redux/hooks.ts](../../../src/redux/hooks.ts). Always use the typed versions:

```typescript
import { useAppSelector, useAppDispatch } from 'src/redux/hooks'

const balance = useAppSelector(balanceSelector)
const dispatch = useAppDispatch()
```

---

## Testing

Reducers:

```typescript
import { reducer, setBalance } from 'src/tokens/slice'

describe('tokens reducer', () => {
  it('sets balance', () => {
    const initial = { tokens: {} }
    const action = setBalance({ tokenId: 'abc', balance: '100' })
    const result = reducer(initial, action)
    expect(result.tokens['abc'].balance).toBe('100')
  })
})
```

Sagas:

```typescript
import { expectSaga } from 'redux-saga-test-plan'
import { sendPaymentSaga } from 'src/send/saga'

describe('sendPaymentSaga', () => {
  it('sends payment successfully', () => {
    return expectSaga(sendPaymentSaga, sendPayment({ to: '0x...', amount: '10' }))
      .provide([
        [call(prepareTransaction, ...), mockTx],
        [call(signAndSend, mockTx), '0xhash'],
      ])
      .put(setSendStatus('success'))
      .run()
  })
})
```

See [ADR-0009](../../adr/0009-testing-strategy.md) for the full testing strategy.

---

## Cross-module patterns

### 1. Token balance refresh after a transactional flow

```typescript
yield put(fetchTokenBalances())

yield takeLatest(fetchTokenBalancesSuccess, function* () {
  // react to new balances
})
```

### 2. Transaction completion broadcast

```typescript
yield put(
  transactionCompleted({
    type: 'send',
    txHash,
    tokenId,
    amount,
  })
)

yield takeLatest(transactionCompleted, function* (action) {
  if (action.payload.type === 'send') {
    // refresh UI, log analytics
  }
})
```

### 3. Feature flag gating

```typescript
import { getFeatureGate } from 'src/statsig'

if (getFeatureGate('show_gold_feature')) {
  yield put(fetchGoldPrice())
}
```

See [ADR-0010](../../adr/0010-feature-flags-statsig.md) for the Statsig flag taxonomy.

### 4. Error broadcasting (post-WRI)

Errors flow through the error taxonomy from [src/lib/errors/](../../../src/lib/errors/) and surface via `TransactionResultSheet`. Generic alerts still go through the `alert` slice:

```typescript
yield put(
  showError({
    type: 'transaction',
    message: t('sendFailed'),
    error,
  })
)

yield takeLatest(showError, function* (action) {
  Logger.error(action.payload.type, action.payload.message, action.payload.error)
  yield call(showErrorOrFallback, action.payload.message)
})
```

---

## Type exports

Each slice exports its types from a sibling `types.ts`:

```typescript
// src/tokens/types.ts
export interface TokenBalance {
  /* ... */
}
export interface StoredTokenBalance {
  /* ... */
}
export type TokenBalances = Record<string, TokenBalance>

// Consumed elsewhere
import type { TokenBalance } from 'src/tokens/types'
```

---

## Best practices

1. **Use Redux Toolkit `createSlice`** for new slices. No legacy `createReducer` patterns in new code.
2. **Normalize state**. Keep state flat, key by id, derive lists with selectors.
3. **Memoize derived data** with `createSelector`.
4. **Type everything**: action payloads, state shapes, selectors.
5. **Test sagas** with `redux-saga-test-plan`.
6. **Migrate on every breaking change** to persisted state. Bump `version` in `store.ts`.

---

## Related

- [Module dependencies](dependencies.md)
- [Module health snapshot](health.md)
- [ADR-0002 - Redux Saga over Thunk](../../adr/0002-redux-saga-over-thunk.md)
- [ADR-0009 - Testing strategy](../../adr/0009-testing-strategy.md)
- [WRI design - in-flight + idempotency](../../specs/2026-06-15-wallet-robustness-initiative-design.md)
