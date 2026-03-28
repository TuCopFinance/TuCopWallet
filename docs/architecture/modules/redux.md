# Redux State Management

## Overview

TuCOP Wallet uses **Redux Toolkit** with **Redux Saga** for state management.
The store is persisted using **Redux Persist** with file system storage.

## Store Configuration

Location: `src/redux/store.ts`

```typescript
// Key configuration
const persistConfig = {
  key: 'root',
  version: 244,  // Increment when adding migrations
  storage: FSStorage(),
  stateReconciler: autoMergeLevel2,
  whitelist: [...],  // Slices to persist
  migrate: createMigrate(migrations, { debug: false }),
}
```

## Slices (26 total)

### Core Slices

| Slice         | Location                     | Purpose                     |
| ------------- | ---------------------------- | --------------------------- |
| `app`         | `src/app/reducers.ts`        | App state, loading, session |
| `i18n`        | `src/i18n/slice.ts`          | Language selection          |
| `networkInfo` | `src/networkInfo/reducer.ts` | Connectivity                |
| `alert`       | `src/alert/reducer.ts`       | Banner alerts               |

### Web3 Slices

| Slice           | Location                       | Purpose                    |
| --------------- | ------------------------------ | -------------------------- |
| `web3`          | `src/web3/reducer.ts`          | Wallet address, accounts   |
| `tokens`        | `src/tokens/slice.ts`          | Balances, prices, metadata |
| `walletConnect` | `src/walletConnect/reducer.ts` | DApp sessions              |
| `identity`      | `src/identity/reducer.ts`      | Phone verification         |
| `account`       | `src/account/reducer.ts`       | User settings, preferences |

### Transaction Slices

| Slice          | Location                    | Purpose         |
| -------------- | --------------------------- | --------------- |
| `send`         | `src/send/reducers.ts`      | Send flow state |
| `transactions` | `src/transactions/slice.ts` | TX history      |
| `recipients`   | `src/recipients/reducer.ts` | Contact list    |

### DeFi Slices

| Slice       | Location                 | Purpose          |
| ----------- | ------------------------ | ---------------- |
| `swap`      | `src/swap/slice.ts`      | Token swap state |
| `earn`      | `src/earn/slice.ts`      | Yield farming    |
| `positions` | `src/positions/slice.ts` | DeFi positions   |
| `jumpstart` | `src/jumpstart/slice.ts` | Referral rewards |
| `points`    | `src/points/slice.ts`    | Points system    |

### Feature Slices

| Slice          | Location                    | Purpose          |
| -------------- | --------------------------- | ---------------- |
| `buckspay`     | `src/buckspay/slice.ts`     | Colombia offramp |
| `gold`         | `src/gold/slice.ts`         | Digital gold     |
| `nfts`         | `src/nfts/slice.ts`         | NFT collection   |
| `priceHistory` | `src/priceHistory/slice.ts` | Price charts     |

### Fiat Slices

| Slice           | Location                       | Purpose              |
| --------------- | ------------------------------ | -------------------- |
| `fiatExchanges` | `src/fiatExchanges/reducer.ts` | On/off ramps         |
| `fiatConnect`   | `src/fiatconnect/slice.ts`     | FiatConnect protocol |
| `localCurrency` | `src/localCurrency/reducer.ts` | Currency conversion  |

### Backup Slices

| Slice           | Location                     | Purpose       |
| --------------- | ---------------------------- | ------------- |
| `imports`       | `src/import/reducer.ts`      | Wallet import |
| `keylessBackup` | `src/keylessBackup/slice.ts` | Cloud backup  |

### Protocol Slices

| Slice           | Location                     | Purpose           |
| --------------- | ---------------------------- | ----------------- |
| `divviProtocol` | `src/divviProtocol/slice.ts` | Referral tracking |

---

## Migrations

Location: `src/redux/migrations.ts`

Migrations run when `persistConfig.version` increases. Current version: **244**.

### Adding a Migration

```typescript
// In migrations.ts
export const migrations: MigrationManifest = {
  // ... existing migrations
  245: (state) => {
    return {
      ...state,
      newSlice: {
        // initial state for new slice
      },
    }
  },
}

// In store.ts - update version
version: 245,
```

### Migration Guidelines

1. Always provide default values for new state
2. Never delete persisted data without migration
3. Test migrations with existing user data
4. Document breaking changes in migration comments

---

## Sagas

Location: `src/redux/sagas.ts`

Root saga combines all feature sagas:

```typescript
export function* rootSaga() {
  yield spawn(appSaga)
  yield spawn(tokensSaga)
  yield spawn(sendSaga)
  yield spawn(swapSaga)
  yield spawn(earnSaga)
  yield spawn(goldSaga)
  yield spawn(buckspaySaga)
  // ... etc
}
```

### Saga Patterns

**Watch Pattern:**

```typescript
export function* watchSendPayment() {
  yield takeLeading(sendPayment.type, sendPaymentSaga)
}
```

**Call External API:**

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

**Blockchain Transaction:**

```typescript
function* sendTransaction(action: PayloadAction<SendParams>) {
  const { to, amount, tokenId } = action.payload

  yield put(setSendStatus('preparing'))

  const tx = yield call(prepareTransaction, { to, amount, tokenId })

  yield put(setSendStatus('signing'))

  const hash = yield call(signAndSend, tx)

  yield put(setSendStatus('success'))
  yield put(addTransaction({ hash, ...action.payload }))
}
```

---

## Selectors

### Using Selectors

```typescript
import { useAppSelector } from 'src/redux/hooks'
import { tokensByIdSelector } from 'src/tokens/selectors'

function MyComponent() {
  const tokens = useAppSelector(tokensByIdSelector)
  // ...
}
```

### Creating Selectors

```typescript
// Simple selector
export const tokensSelector = (state: RootState) => state.tokens.tokens

// Memoized selector
export const sortedTokensSelector = createSelector([tokensSelector], (tokens) =>
  Object.values(tokens).sort((a, b) => b.balance - a.balance)
)

// Parameterized selector
export const tokenByIdSelector = (tokenId: string) =>
  createSelector([tokensSelector], (tokens) => tokens[tokenId])
```

---

## Hooks

Location: `src/redux/hooks.ts`

```typescript
import { useAppSelector, useAppDispatch } from 'src/redux/hooks'

// Use these instead of raw useSelector/useDispatch
const balance = useAppSelector(balanceSelector)
const dispatch = useAppDispatch()
```

---

## Testing

### Testing Reducers

```typescript
import { reducer, setBalance } from 'src/tokens/slice'

describe('tokens reducer', () => {
  it('should set balance', () => {
    const initial = { tokens: {} }
    const action = setBalance({ tokenId: 'abc', balance: '100' })
    const result = reducer(initial, action)
    expect(result.tokens['abc'].balance).toBe('100')
  })
})
```

### Testing Sagas

```typescript
import { expectSaga } from 'redux-saga-test-plan'
import { sendPaymentSaga } from 'src/send/saga'

describe('sendPaymentSaga', () => {
  it('should send payment successfully', () => {
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

---

## Best Practices

1. **Use Redux Toolkit** - Always use `createSlice` for new slices
2. **Normalize State** - Keep state flat, use IDs as keys
3. **Memoize Selectors** - Use `createSelector` for derived data
4. **Type Everything** - Define action payloads and state types
5. **Test Sagas** - Use `redux-saga-test-plan` for saga tests
6. **Add Migrations** - Never change state structure without migration
