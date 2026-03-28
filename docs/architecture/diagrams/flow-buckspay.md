# BucksPay Flow Diagram

## Overview

BucksPay is the Colombia-specific offramp that converts COPm (Colombian Peso
stablecoin) to COP and sends to Colombian bank accounts.

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BUCKSPAY OFFRAMP FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Select     │    │  Enter Bank  │    │   Confirm    │    │   Status     │
│   Offramp    │───▶│   Details    │───▶│  & Sign TX   │───▶│  Tracking    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
 User selects       Enter amount,        Review quote,        Track status:
  BucksPay          bank, account         sign COPm            pending →
  provider          number, type          transfer           processing →
                                                               completed
```

## Detailed User Flow

```
                    ┌─────────────────────┐
                    │    FiatExchange     │
                    │    CashOutScreen    │
                    └──────────┬──────────┘
                               │
                               │ User selects "Withdraw to bank"
                               ▼
                    ┌─────────────────────┐
                    │ SelectOfframpProvider│
                    │ (shows BucksPay)    │
                    └──────────┬──────────┘
                               │
                               │ User selects BucksPay
                               ▼
                    ┌─────────────────────┐
                    │  BucksPayBankForm   │
                    │                     │
                    │  ┌───────────────┐  │
                    │  │ Amount (COPm) │  │
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │ Select Bank   │  │
                    │  │ - Bancolombia │  │
                    │  │ - Davivienda  │  │
                    │  │ - BBVA        │  │
                    │  │ - Nequi       │  │
                    │  │ - Daviplata   │  │
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │Account Number │  │
                    │  └───────────────┘  │
                    │  ┌───────────────┐  │
                    │  │ Account Type  │  │
                    │  │ ○ Savings     │  │
                    │  │ ○ Checking    │  │
                    │  └───────────────┘  │
                    └──────────┬──────────┘
                               │
                               │ User taps "Continue"
                               ▼
                    ┌─────────────────────┐
                    │  Fetch Quote from   │
                    │  BucksPay API       │
                    │                     │
                    │  POST /api/v1/quote │
                    │  { amount, currency}│
                    └──────────┬──────────┘
                               │
                               │ Quote received
                               ▼
                    ┌─────────────────────┐
                    │  BucksPayConfirm    │
                    │                     │
                    │  Amount: 100,000    │
                    │  Fee: -1,500        │
                    │  ─────────────────  │
                    │  You receive:       │
                    │  98,500 COP         │
                    │                     │
                    │  Bank: Bancolombia  │
                    │  Account: ***7890   │
                    │                     │
                    │  [Confirm & Send]   │
                    └──────────┬──────────┘
                               │
                               │ User confirms
                               ▼
                    ┌─────────────────────┐
                    │   PIN Verification  │
                    └──────────┬──────────┘
                               │
                               │ PIN correct
                               ▼
        ┌──────────────────────┴──────────────────────┐
        │                                             │
        ▼                                             ▼
┌───────────────────┐                     ┌───────────────────┐
│ Prepare COPm      │                     │ Register Transfer │
│ Transfer TX       │                     │ with BucksPay     │
│                   │                     │                   │
│ to: BUCKSPAY_WALLET│                    │ POST /api/v1/     │
│ amount: 100,000   │                     │   transfer        │
└────────┬──────────┘                     └────────┬──────────┘
         │                                         │
         │ Sign & Send                             │
         ▼                                         │
┌───────────────────┐                              │
│ Transaction       │                              │
│ Submitted         │                              │
│                   │                              │
│ txHash: 0x...     │──────────────────────────────┘
└────────┬──────────┘           (txHash sent to BucksPay)
         │
         ▼
┌───────────────────┐
│  BucksPayStatus   │
│                   │
│  ┌─────────────┐  │
│  │  PENDING    │  │◄─────────────┐
│  │  Waiting    │  │              │
│  │  for TX     │  │              │
│  └─────────────┘  │              │
│        │          │              │
│        ▼          │        Poll every
│  ┌─────────────┐  │        30 seconds
│  │ PROCESSING  │  │              │
│  │ BucksPay    │  │              │
│  │ received    │  │──────────────┘
│  │ COPm        │  │
│  └─────────────┘  │
│        │          │
│        ▼          │
│  ┌─────────────┐  │
│  │ COMPLETED   │  │
│  │             │  │
│  │ COP sent    │  │
│  │ to bank     │  │
│  │ account     │  │
│  └─────────────┘  │
└───────────────────┘
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│               │        │               │        │               │
│   TuCOP App   │───────▶│ TuCOP Backend │───────▶│ BucksPay API  │
│               │        │  (Proxy)      │        │               │
└───────┬───────┘        └───────────────┘        └───────┬───────┘
        │                                                  │
        │                                                  │
        ▼                                                  ▼
┌───────────────┐                                 ┌───────────────┐
│  Celo Chain   │                                 │  Colombian    │
│               │                                 │  Banking      │
│ COPm Transfer │                                 │  Network      │
│ to BucksPay   │                                 │  (ACH)        │
│ Hot Wallet    │                                 │               │
└───────────────┘                                 └───────────────┘
```

## API Integration

### 1. Get Quote

```typescript
POST /api/v1/quote
{
  "amount": "100000",
  "currency": "COPm"
}

Response:
{
  "rate": 1.0,
  "fee": 1500,
  "total": 98500,
  "expiresAt": "2024-01-01T12:05:00Z"
}
```

### 2. Create Transfer

```typescript
POST /api/v1/transfer
{
  "amount": "100000",
  "bank": "bancolombia",
  "accountNumber": "1234567890",
  "accountType": "savings",
  "txHash": "0x..."
}

Response:
{
  "id": "transfer_abc123",
  "status": "pending",
  "createdAt": "2024-01-01T12:00:00Z"
}
```

### 3. Check Status

```typescript
GET /api/v1/transfer/transfer_abc123

Response:
{
  "id": "transfer_abc123",
  "status": "completed",  // pending | processing | completed | failed
  "txHash": "0x...",
  "completedAt": "2024-01-01T12:30:00Z"
}
```

## Redux State Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              REDUX STATE                                     │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────┐
                    │      bucksPaySlice      │
                    │                         │
                    │  status: 'idle'         │
                    │  currentTransfer: null  │
                    │  recentTransfers: []    │
                    │  error: null            │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
  createTransfer()      setTransferStatus()     transferCompleted()
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ status:       │     │ status:       │     │ status:       │
│  'loading'    │────▶│  'loading'    │────▶│  'success'    │
│               │     │               │     │               │
│ currentTx:    │     │ currentTx:    │     │ currentTx:    │
│  { pending }  │     │  {processing} │     │  {completed}  │
└───────────────┘     └───────────────┘     └───────────────┘
```

## Saga Flow

```typescript
function* createTransferSaga(action) {
  const { amount, bank, accountNumber, accountType } = action.payload

  try {
    // 1. Prepare COPm transfer transaction
    const tx = yield call(prepareCopmTransfer, {
      to: BUCKSPAY_HOT_WALLET,
      amount,
    })

    // 2. Sign and send transaction
    const txHash = yield call(signAndSendTransaction, tx)

    // 3. Register with BucksPay API
    const transfer = yield call(bucksPayApi.createTransfer, {
      amount,
      bank,
      accountNumber,
      accountType,
      txHash,
    })

    yield put(transferCreated(transfer))

    // 4. Start polling for status
    yield fork(pollTransferStatus, transfer.id)
  } catch (error) {
    yield put(transferFailed(error.message))
  }
}

function* pollTransferStatus(transferId: string) {
  while (true) {
    const transfer = yield call(bucksPayApi.getTransfer, transferId)

    yield put(updateTransferStatus(transfer))

    if (transfer.status === 'completed' || transfer.status === 'failed') {
      break
    }

    yield delay(30000) // Poll every 30 seconds
  }
}
```

## Supported Banks

| Bank            | Code          | Type           |
| --------------- | ------------- | -------------- |
| Bancolombia     | `bancolombia` | Traditional    |
| Davivienda      | `davivienda`  | Traditional    |
| BBVA Colombia   | `bbva`        | Traditional    |
| Banco de Bogotá | `bogota`      | Traditional    |
| Nequi           | `nequi`       | Digital Wallet |
| Daviplata       | `daviplata`   | Digital Wallet |

## Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR SCENARIOS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────┐
│  Error Type       │     Handling
├───────────────────┼─────────────────────────────────────────────────────────
│ Insufficient      │ → Show "Not enough COPm" error before confirmation
│ Balance           │
├───────────────────┼─────────────────────────────────────────────────────────
│ Invalid Bank      │ → Show validation error on form
│ Details           │
├───────────────────┼─────────────────────────────────────────────────────────
│ Quote Expired     │ → Auto-refresh quote, show updated amounts
│                   │
├───────────────────┼─────────────────────────────────────────────────────────
│ TX Failed         │ → Show error, COPm not deducted, allow retry
│ (on-chain)        │
├───────────────────┼─────────────────────────────────────────────────────────
│ Transfer Failed   │ → BucksPay refunds COPm automatically
│ (BucksPay)        │   Show status and support contact
├───────────────────┼─────────────────────────────────────────────────────────
│ Network Error     │ → Retry with exponential backoff
│                   │   Show "Trying again..." message
└───────────────────┴─────────────────────────────────────────────────────────
```

## Key Files

| File                                | Purpose             |
| ----------------------------------- | ------------------- |
| `src/buckspay/BucksPayBankForm.tsx` | Bank details input  |
| `src/buckspay/BucksPayConfirm.tsx`  | Confirmation screen |
| `src/buckspay/BucksPayStatus.tsx`   | Status tracking     |
| `src/buckspay/api.ts`               | BucksPay API client |
| `src/buckspay/saga.ts`              | Async operations    |
| `src/buckspay/slice.ts`             | Redux state         |
| `src/buckspay/types.ts`             | TypeScript types    |

## Related Documentation

- [BucksPay Module](../../../src/buckspay/README.md)
- [BucksPay API](../../buckspay-api.md)
- [ADR-0005: BucksPay Offramp](../../adr/0005-buckspay-offramp.md)
