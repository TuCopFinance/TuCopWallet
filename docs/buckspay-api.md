# BucksPay External API Documentation

**Base URL**: `https://api.buckspay.xyz`
**Version**: 2.0.0 (OAS 3.0)
**Description**: B2B API for third-party integrations with BucksPay crypto offramp.

---

## Authentication

All endpoints except registration require two headers:

| Header         | Type   | Description                                                 |
| -------------- | ------ | ----------------------------------------------------------- |
| `X-API-Key`    | string | Your API key (returned at registration)                     |
| `X-API-Secret` | string | Your API secret (returned at registration, shown only once) |

## Supported Networks

| Network ID | Chain     | Token                  | Crypto   | Currency |
| ---------- | --------- | ---------------------- | -------- | -------- |
| 0          | Base      | USDC                   | usdc     | USD      |
| 1          | Avalanche | USDC                   | usdc     | USD      |
| 4          | Polygon   | USDT                   | usdt     | USD      |
| **6**      | **Celo**  | **COPm** (CCOP in API) | **ccop** | **COP**  |
| 7          | Lisk      | USDC                   | usdc     | USD      |

## Receiver Wallet

All token transfers must be sent to:

```
0xB731D9D3840F5C237CB7CD091f6e0ff5f6562Dd0
```

## Webhooks

When a transaction is completed, BucksPay sends a `POST` request to your registered webhook URL.

- Includes `X-BucksPay-Signature` header containing an HMAC-SHA256 signature of the JSON body
- Signed with your `webhookSecret`
- Verify this signature to ensure authenticity

## Rate Limits

100 requests per minute per API key.

---

## Endpoints

### 1. `POST /external` — Register a new integration

Creates a new external integration. Returns API credentials that must be saved securely.
The `apiSecret` is only shown once and cannot be recovered.

**Authentication**: None (public endpoint)

**Request Body** (required):

```json
{
  "name": "My Commerce",
  "webhook": "https://mysite.com/webhook"
}
```

**Responses**:

| Code | Description                      |
| ---- | -------------------------------- |
| 201  | Integration created successfully |
| 400  | Invalid input                    |

**201 Response**:

```json
{
  "message": "INTEGRATION_CREATED",
  "apiKey": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "apiSecret": "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
  "webhookSecret": "1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b3c4d5e6f1a2b"
}
```

**400 Response** (example: `invalidName`):

```json
{
  "message": "INVALID_NAME"
}
```

**400 Response** (example: `invalidWebhook`):

```json
{
  "message": "INVALID_WEBHOOK_URL"
}
```

---

### 2. `POST /external/transaction` — Submit a transaction

Submits a crypto transaction for offramp processing. The transaction hash is verified on-chain:

- Receipt must exist
- Status must be success
- Sender must match
- Receiver must be the BucksPay receiver wallet
- At least 3 block confirmations are required

**Headers**: `X-API-Key`, `X-API-Secret` (required)

**Request Body** (required):

```json
{
  "address": "0x742a5D0e0DE58d9c864bE3F57e3d9E44A60BAF8B",
  "trxHash": "0x7d12e4396c93c8cee2b9050b4e65e5303f9c8f9e07ed15057425b66fc6b4371d",
  "network": 0,
  "type": "transfer",
  "number": "123456789",
  "bankName": "Chase Bank",
  "bankCountry": "US",
  "nationalCurrency": "USD"
}
```

**Fields**:

| Field              | Type    | Required | Description                                                 |
| ------------------ | ------- | -------- | ----------------------------------------------------------- |
| `address`          | string  | yes      | Sender wallet address                                       |
| `trxHash`          | string  | yes      | On-chain transaction hash (transfer to BucksPay wallet)     |
| `network`          | integer | yes      | Network ID (0=Base, 1=Avalanche, 4=Polygon, 6=Celo, 7=Lisk) |
| `type`             | string  | yes      | Payment type (e.g., `"transfer"`)                           |
| `number`           | string  | yes      | Recipient bank account number                               |
| `bankName`         | string  | yes      | Recipient bank name                                         |
| `bankCountry`      | string  | no       | Recipient bank country code                                 |
| `nationalCurrency` | string  | no       | Target fiat currency                                        |

**Responses**:

| Code | Description           |
| ---- | --------------------- |
| 201  | Transaction created   |
| 400  | Validation error      |
| 401  | Authentication failed |
| 429  | Too many requests     |

**201 Response**:

```json
{
  "message": "TRANSACTION_CREATED",
  "code": "AB1C",
  "amount": 100.5,
  "network": 0,
  "status": "PENDING"
}
```

**400 Response** (example: `invalidAddress`):

```json
{
  "message": "INVALID_ADDRESS"
}
```

**400 Response** (example: `invalidTxHash`):

```json
{
  "message": "INVALID_TX_HASH"
}
```

**400 Response** (example: `invalidNetwork`):

```json
{
  "message": "INVALID_NETWORK"
}
```

**400 Response** (example: `duplicate`):

```json
{
  "message": "TRANSACTION_PROCESSED_ALREADY"
}
```

**400 Response** (example: `verificationFailed`):

```json
{
  "message": "VERIFICATION_FAILED",
  "error": "SENDER_MISMATCH"
}
```

**401 Response** (example: `invalidKey`):

```json
{
  "message": "INVALID_API_KEY"
}
```

**401 Response** (example: `invalidSecret`):

```json
{
  "message": "INVALID_API_SECRET"
}
```

**429 Response**:

```json
{
  "message": "TOO_MANY_REQUESTS"
}
```

---

### 3. `GET /external/transaction/{trxHash}` — Check transaction status

Returns the current status of a previously submitted transaction. Checks both pending requests (TrxReq) and active transactions (Trx).

**Path Parameters**:

| Name      | Type   | Required | Description                     |
| --------- | ------ | -------- | ------------------------------- |
| `trxHash` | string | yes      | The transaction hash to look up |

**Headers**: `X-API-Key`, `X-API-Secret` (required)

**Responses**:

| Code | Description           |
| ---- | --------------------- |
| 200  | Transaction status    |
| 401  | Authentication failed |
| 429  | Too many requests     |

**200 Response** (example: `pending`):

```json
{
  "status": "PENDING",
  "transaction": {
    "code": "AB1C",
    "amount": 100.5,
    "valueCurrency": 100.5,
    "nationalCurrency": "USD",
    "cryptoCurrency": "usdc",
    "network": 0,
    "externalTrxHash": "0x7d12e4396c93c8cee...",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**200 Response** (example: `finished`):

```json
{
  "status": "FINISHED",
  "transaction": {
    "status": "FINISHED",
    "code": "AB1C",
    "amount": 100.5,
    "valueCurrency": 100.5,
    "nationalCurrency": "USD",
    "cryptoCurrency": "usdc",
    "network": 0,
    "externalTrxHash": "0x7d12e4396c93c8cee...",
    "certificate": "https://cdn.buckspay.com/receipts/abc123.jpg",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

**200 Response** (example: `notFound`):

```json
{
  "status": "NOT_FOUND"
}
```

**401 Response** (example: `invalidKey`):

```json
{
  "message": "INVALID_API_KEY"
}
```

**401 Response** (example: `invalidSecret`):

```json
{
  "message": "INVALID_API_SECRET"
}
```

**429 Response**:

```json
{
  "message": "TOO_MANY_REQUESTS"
}
```

---

### 4. `GET /external/check/{address}` — Verify if user exists

Checks if a blockchain address is registered as a user in BucksPay.

**Path Parameters**:

| Name      | Type   | Required | Description                           |
| --------- | ------ | -------- | ------------------------------------- |
| `address` | string | yes      | Ethereum address to check (0x format) |

**Headers**: `X-API-Key`, `X-API-Secret` (required)

**Responses**:

| Code | Description              |
| ---- | ------------------------ |
| 200  | User verification result |
| 400  | Invalid address format   |
| 401  | Authentication failed    |
| 429  | Too many requests        |

**200 Response** (example: `exists`):

```json
{
  "exists": true,
  "role": "USER"
}
```

**200 Response** (example: `notExists`):

```json
{
  "exists": false
}
```

**400 Response**:

```json
{
  "message": "INVALID_ADDRESS"
}
```

**401 Response** (example: `invalidKey`):

```json
{
  "message": "INVALID_API_KEY"
}
```

**401 Response** (example: `invalidSecret`):

```json
{
  "message": "INVALID_API_SECRET"
}
```

**429 Response**:

```json
{
  "message": "TOO_MANY_REQUESTS"
}
```

---

## Server

```
Base URL: https://api.buckspay.xyz/v1
```

All endpoint paths are relative to `/v1`.

---

## Schemas

### ErrorResponse

```typescript
{
  message: string    // Error code/message
  error?: string     // Additional error detail (optional)
}
```

### RegisterRequest

```typescript
{
  name: string // * required - Integration name (minLength: 3, maxLength: 100)
  webhook: string // * required - Webhook URL (format: uri)
}
```

### RegisterResponse

```typescript
{
  message: string // "INTEGRATION_CREATED"
  apiKey: string // API key for authentication (store securely)
  apiSecret: string // API secret (shown only once, store securely)
  webhookSecret: string // Secret for verifying webhook HMAC signatures (store securely)
}
```

### TransactionRequest

```typescript
{
  address: string          // * required - Sender's Ethereum address (pattern: ^0x[a-fA-F0-9]{40}$)
  trxHash: string          // * required - On-chain transaction hash (pattern: ^0x[a-fA-F0-9]{64}$)
  network: number          // * required - Network ID, enum: [0, 1, 4, 6, 7]
  type: string             // * required - Account type (e.g., "transfer", "qr")
  number: string           // * required - Bank account number
  bankName: string         // * required - Bank name
  bankCountry?: string     // Bank country (defaults to "Colombia")
  nationalCurrency?: string // Override national currency (defaults based on network)
}
```

### TransactionCreatedResponse

```typescript
{
  message: string // "TRANSACTION_CREATED"
  code: string // Transaction code for tracking (e.g., "AB1C")
  amount: number // Decoded token amount
  network: number // Network ID
  status: 'PENDING' // Always PENDING on creation
}
```

### TransactionStatusResponse

```typescript
{
  status: "PENDING" | "INPROGRESS" | "STARTED" | "PAYED" | "FINISHED"
  transaction: {
    status: string
    code: string
    amount: number
    valueCurrency: number
    nationalCurrency: string
    cryptoCurrency: string
    network: number
    externalTrxHash: string
    certificate?: string | null  // Receipt image URL (only when FINISHED)
    createdAt: string            // ISO 8601 datetime
    updatedAt: string            // ISO 8601 datetime
  }
}
```

### Transaction Status Lifecycle

```
PENDING → INPROGRESS → STARTED → PAYED → FINISHED
```

### NotFoundResponse

```typescript
{
  status: 'NOT_FOUND'
}
```

### UserExistsResponse

```typescript
{
  exists: true
  role: 'ADMIN' | 'USER' | 'FROG' | 'LIQUIDATOR'
}
```

### UserNotExistsResponse

```typescript
{
  exists: false
}
```

---

## Integration Flow for TuCOP Wallet (Celo/COPm)

> **Note**: BucksPay API uses "CCOP"/"ccop" as the crypto identifier. In the TuCOP app, this token is called **COPm** (renamed from cCOP).

### Native Offramp Flow:

1. **Check user**: `GET /external/check/{walletAddress}`
   - If `exists: false` → redirect to BucksPay WebView for registration
   - If `exists: true` → continue
2. **Collect bank details**: Show form for bank name, account number, country (Colombia)
3. **Send COPm**: Transfer COPm tokens to `0xB731D9D3840F5C237CB7CD091f6e0ff5f6562Dd0` on Celo (network 6)
4. **Wait for confirmations**: Need at least 3 block confirmations
5. **Submit transaction**: `POST /external/transaction` with trxHash, bank details, network=6
6. **Track status**: Poll `GET /external/transaction/{trxHash}` for status updates
7. **Webhook**: Receive completion notification at registered webhook URL
