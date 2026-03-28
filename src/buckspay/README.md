# BucksPay Module

## Overview

BucksPay is the Colombia-specific offramp integration that allows users to
convert COPm (Colombian Peso stablecoin) to COP and send to Colombian bank
accounts.

## Directory Structure

```
src/buckspay/
├── README.md                # This file
├── slice.ts                 # Redux state
├── saga.ts                  # Side effects
├── api.ts                   # BucksPay API calls
├── types.ts                 # TypeScript types
├── BucksPayBankForm.tsx     # Bank details input
├── BucksPayConfirm.tsx      # Confirmation screen
├── BucksPayStatus.tsx       # Transaction status
└── selectors.ts             # Redux selectors
```

## User Flow

```
SelectOfframpProvider → BucksPayBankForm → BucksPayConfirm → BucksPayStatus
```

1. **SelectOfframpProvider**: User chooses BucksPay as offramp
2. **BucksPayBankForm**: Enter bank, account number, account type, amount
3. **BucksPayConfirm**: Review details, sign transaction
4. **BucksPayStatus**: Track withdrawal status (pending → processing → sent)

## State Shape

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

## API Integration

See `docs/buckspay-api.md` for full OpenAPI specification.

### Key Endpoints

```typescript
// Get quote
POST /api/v1/quote
{ amount: "100000", currency: "COPm" }
→ { rate: 1.0, fee: 1500, total: 98500 }

// Create transfer
POST /api/v1/transfer
{
  amount: "100000",
  bank: "bancolombia",
  accountNumber: "1234567890",
  accountType: "savings",
  txHash: "0x..."
}
→ { id: "transfer_123", status: "pending" }

// Check status
GET /api/v1/transfer/:id
→ { id: "transfer_123", status: "completed" }
```

## Supported Banks

- Bancolombia
- Davivienda
- BBVA Colombia
- Banco de Bogotá
- Nequi
- Daviplata

## Transaction Flow

```
1. User enters amount and bank details
         │
         ▼
2. App fetches quote from BucksPay API
         │
         ▼
3. User reviews and confirms
         │
         ▼
4. App prepares COPm transfer to BucksPay hot wallet
         │
         ▼
5. User signs transaction
         │
         ▼
6. App sends TX and creates transfer record
         │
         ▼
7. BucksPay receives COPm
         │
         ▼
8. BucksPay sends COP to user's bank (ACH)
         │
         ▼
9. Webhooks update status in app
```

## Saga Flows

### Create Transfer

```typescript
function* createTransferSaga(action) {
  const { amount, bank, accountNumber, accountType } = action.payload

  // 1. Prepare transaction
  const tx = yield call(prepareCopmTransfer, {
    to: BUCKSPAY_HOT_WALLET,
    amount,
  })

  // 2. Sign and send
  const txHash = yield call(signAndSend, tx)

  // 3. Register with BucksPay
  const transfer = yield call(bucksPayApi.createTransfer, {
    amount,
    bank,
    accountNumber,
    accountType,
    txHash,
  })

  yield put(transferCreated(transfer))
}
```

### Poll Status

```typescript
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

## Error Handling

| Error                | Handling              |
| -------------------- | --------------------- |
| Network error        | Retry with backoff    |
| Invalid bank details | Show validation error |
| Insufficient balance | Show balance error    |
| TX failed            | Refund automatically  |
| KYC required         | Redirect to KYC flow  |

## Feature Flag

```typescript
import { getFeatureGate } from 'src/statsig'

const showBucksPay = getFeatureGate('show_buckspay')
```

## Analytics Events

| Event                         | When                     |
| ----------------------------- | ------------------------ |
| `buckspay_started`            | User opens BucksPay flow |
| `buckspay_quote_fetched`      | Quote received           |
| `buckspay_transfer_created`   | Transfer submitted       |
| `buckspay_transfer_completed` | Transfer succeeded       |
| `buckspay_transfer_failed`    | Transfer failed          |

## Related Documentation

- [BucksPay API](../../docs/buckspay-api.md)
- [BucksPay Implementation](../../docs/buckspay-implementation.md)
- [ADR-0005: BucksPay](../../docs/adr/0005-buckspay-offramp.md)
