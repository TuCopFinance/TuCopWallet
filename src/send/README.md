# Send Module

## Overview

The Send module is the core feature that handles cryptocurrency transactions within
TuCop Wallet. It manages the complete send flow from recipient selection through
payment confirmation and execution on the Celo blockchain.

## Directory Structure

```
src/send/
├── README.md                              # This file
├── reducers.ts                            # Redux state
├── actions.ts                             # Redux actions
├── saga.ts                                # Transaction execution
├── selectors.ts                           # Redux selectors
├── hooks.ts                               # Recipient search hooks
├── types.ts                               # TypeScript types
├── utils.ts                               # QR & deeplink handling
├── SendSelectRecipient.tsx                # Recipient selection screen
├── SendEnterAmount.tsx                    # Amount input screen
├── SendConfirmation.tsx                   # Confirmation screen
├── EnterAmount.tsx                        # Reusable amount component
├── ValidateRecipientAccount.tsx           # Secure send validation
├── ValidateRecipientIntro.tsx             # Secure send intro
├── SelectRecipientButtons.tsx             # QR & contact buttons
├── SendSelectRecipientSearchInput.tsx     # Search input
├── InviteRewardsCard.tsx                  # Referral rewards card
├── PasteAddressButton.tsx                 # Clipboard paste
└── usePrepareSendTransactions.ts          # Transaction preparation
```

## User Flow

```
SendSelectRecipient → SendEnterAmount → SendConfirmation → Success
```

1. **SendSelectRecipient**: Search contacts, recent recipients, or enter address
2. **SendEnterAmount**: Enter amount, select token, see fees
3. **SendConfirmation**: Review details, confirm transaction
4. **Success**: Transaction sent, balance updated

## State Shape

```typescript
interface SendState {
  isSending: boolean
  recentRecipients: Recipient[] // Last 8 recipients (deduped)
  recentPayments: PaymentInfo[] // Last 24h (compliance)
  inviteRewardsVersion: string // v4=NFT, v5=cUSD, else=NONE
  lastUsedTokenId?: string // Remember preferred token
  encryptedComment: string | null
  isEncryptingComment: boolean
}
```

## Recipient Types

The module handles 4 recipient types:

| Type        | Format             | Example       |
| ----------- | ------------------ | ------------- |
| PhoneNumber | E.164              | +573001234567 |
| Contact     | Device contact     | "Juan García" |
| Address     | Ethereum address   | 0x1234...abcd |
| Nomspace    | Decentralized name | juan.nom      |

## Saga Flows

### Send Payment

```typescript
function* sendPaymentSaga(action) {
  const { recipient, amount, tokenId, preparedTransaction } = action.payload

  // Create standby transaction for optimistic UI
  yield call(addStandbyTransaction, {
    context: { id: uniqueId },
    type: 'sent',
    status: 'pending',
  })

  // Send transaction
  const txHashes = yield call(
    sendPreparedTransactions,
    [preparedTransaction],
    networkId,
    feeCurrencies
  )

  // Wait for receipt
  const receipt = yield call(publicClient.waitForTransactionReceipt, {
    hash: txHashes[0],
  })

  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted')
  }

  yield put(sendPaymentSuccess({ amount, tokenId }))
  yield put(refreshTokenBalances())
}
```

## Transaction Preparation

```typescript
// usePrepareSendTransactions.ts
function usePrepareSendTransactions({ amount, token, recipientAddress, feeCurrencies }) {
  // Debounced to avoid excessive calculations
  // Prepares ERC-20 or native transfer
  // Calculates gas with multiple fee currency options
  // Returns PreparedTransaction[]
}
```

## Recipient Search

```typescript
// hooks.ts
function useMergedSearchRecipients(searchQuery) {
  // Combines from multiple sources:
  // 1. Resolved recipients (API lookup)
  // 2. Recent recipients (Redux)
  // 3. Device contacts
  // 4. Unique address match
  // Priority: resolved > recent > contacts > unique
  // Deduplicates by phone number and address
}
```

## QR Code Handling

```typescript
// utils.ts
function handleSendPaymentData(data) {
  // Parses payment URI: celo://wallet/pay?address=0x...&amount=100&token=COPm
  // Extracts: address, amount, currency, token
  // Navigates to SendEnterAmount or SendConfirmation
}
```

## Fee Currencies

Users can pay gas fees in multiple currencies:

1. CELO (native)
2. COPm (Colombian Peso)
3. USDm / cUSD
4. USDC
5. USDT

## Analytics Events

| Event                        | When                                 |
| ---------------------------- | ------------------------------------ |
| `send_select_recipient_back` | User goes back from recipient screen |
| `send_amount_continue`       | User continues from amount screen    |
| `send_confirm`               | User confirms transaction            |
| `send_tx_complete`           | Transaction successful               |
| `send_tx_error`              | Transaction failed                   |

## Error Handling

| Error                | Handling                       |
| -------------------- | ------------------------------ |
| No address found     | Show "Recipient has no wallet" |
| Insufficient balance | Disable send button            |
| Transaction reverted | Show error with retry          |
| PIN cancelled        | Silent cancel                  |
| Network error        | Show user-friendly message     |

## Key Constants

```typescript
const RECENT_RECIPIENTS_TO_STORE = 8
const TYPING_DEBOUNCE_MILLISECONDS = 300
const FETCH_TRANSACTIONS_DEBOUNCE_MS = 250
const RECENT_PAYMENTS_WINDOW = 24 * 60 * 60 * 1000 // 24 hours
```

## Secure Send

For recipients with multiple addresses, validation is required:

```
Multiple addresses for phone?
├── No  → Send directly
└── Yes → Validation required
    ├── Last 4 digits unique? → Partial validation (4 chars)
    └── Not unique → Full validation (42 chars)
```

## Related Documentation

- [Send Flow Diagram](../../docs/architecture/diagrams/flow-send.md)
- [Tokens Module](../tokens/README.md)
- [Identity Module](../identity/README.md)
