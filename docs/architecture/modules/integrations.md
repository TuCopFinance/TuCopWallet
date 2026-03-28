# External Integrations

## Overview

TuCOP Wallet integrates with various external services for functionality
beyond basic wallet operations.

---

## BucksPay (Colombia Offramp)

### Purpose

Convert COPm to COP and send to Colombian bank accounts.

### API Documentation

See `docs/buckspay-api.md` for full OpenAPI 3.0 specification.

### Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  TuCOP App  │────▶│  Backend Proxy  │────▶│ BucksPay API│
└─────────────┘     └─────────────────┘     └─────────────┘
       │                    │
       │                    │ Webhooks
       │                    ▼
       │            ┌─────────────────┐
       └───────────▶│    Redux Store  │
                    └─────────────────┘
```

### Key Endpoints

| Endpoint                   | Purpose            |
| -------------------------- | ------------------ |
| `POST /api/v1/quote`       | Get exchange quote |
| `POST /api/v1/transfer`    | Initiate transfer  |
| `GET /api/v1/transfer/:id` | Check status       |
| `POST /webhook`            | Status updates     |

### Implementation

```typescript
// src/buckspay/api.ts
export async function createTransfer(params: TransferParams) {
  const response = await fetch(`${BUCKSPAY_API}/transfer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  return response.json()
}
```

---

## Divvi Protocol (Referrals)

### Purpose

On-chain referral tracking and rewards.

### Documentation

See `docs/divvi-integration.md` for implementation details.

### How It Works

1. User A shares referral link
2. User B installs app via link
3. App registers referral on-chain
4. User A earns rewards from User B's activity

### Smart Contract

```solidity
// Simplified interface
interface IDivviRegistry {
  function registerReferral(address referrer, address referee) external;
  function getReferrer(address user) external view returns (address);
  function claimRewards(address user) external;
}
```

---

## Squid Router (Cross-chain Swaps)

### Purpose

DEX aggregator for token swaps and cross-chain transfers.

### Usage

```typescript
// src/gold/useGoldQuote.ts
async function getGoldQuote(usdtAmount: string) {
  const response = await fetch('https://api.squidrouter.com/v1/route', {
    method: 'POST',
    headers: { 'x-integrator-id': SQUID_INTEGRATOR_ID },
    body: JSON.stringify({
      fromChain: 42220, // Celo
      fromToken: USDT_ADDRESS,
      fromAmount: usdtAmount,
      toChain: 42220,
      toToken: XAUT_ADDRESS,
      slippage: 0.5,
    }),
  })
  return response.json()
}
```

---

## CoinGecko (Price Data)

### Purpose

Real-time token prices and historical data.

### Endpoints Used

| Endpoint                   | Purpose           |
| -------------------------- | ----------------- |
| `/simple/price`            | Current prices    |
| `/coins/{id}/market_chart` | Historical prices |

### Implementation

```typescript
// src/tokens/saga.ts
const COINGECKO_API = 'https://api.coingecko.com/api/v3'

export async function fetchPrices(coinIds: string[]) {
  const response = await fetch(
    `${COINGECKO_API}/simple/price?` + `ids=${coinIds.join(',')}&` + `vs_currencies=usd,cop`
  )
  return response.json()
}
```

### Rate Limits

- Free tier: 50 calls/minute
- Pro API available for higher limits

---

## Segment (Analytics)

### Purpose

Event tracking and user analytics.

### Documentation

See `src/analytics/README.md` for event conventions.

### Implementation

```typescript
// src/analytics/AppAnalytics.ts
import analytics from '@segment/analytics-react-native'

export function track(event: string, properties?: object) {
  analytics.track(event, {
    ...properties,
    timestamp: Date.now(),
  })
}

export function identify(userId: string, traits?: object) {
  analytics.identify(userId, traits)
}
```

### Key Events

| Event            | When                |
| ---------------- | ------------------- |
| `app_opened`     | App launch          |
| `send_started`   | Begin send flow     |
| `send_completed` | Transaction success |
| `swap_completed` | Swap success        |
| `gold_purchased` | Gold buy success    |

---

## Sentry (Error Tracking)

### Purpose

Crash reporting and error monitoring.

### Configuration

```typescript
// src/sentry/index.ts
import * as Sentry from '@sentry/react-native'

Sentry.init({
  dsn: SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,
  attachStacktrace: true,
})

export function captureException(error: Error, context?: object) {
  Sentry.captureException(error, { extra: context })
}
```

### Usage

```typescript
try {
  await sendTransaction(tx)
} catch (error) {
  captureException(error, { txData: tx })
  throw error
}
```

---

## Firebase (Push Notifications)

### Purpose

Push notifications for transaction updates, promotions.

### Setup

```typescript
// src/firebase/index.ts
import messaging from '@react-native-firebase/messaging'

export async function requestPermission() {
  const status = await messaging().requestPermission()
  return status === messaging.AuthorizationStatus.AUTHORIZED
}

export async function getToken() {
  return await messaging().getToken()
}
```

### Notification Types

| Type                    | Purpose           |
| ----------------------- | ----------------- |
| `transaction_received`  | Incoming payment  |
| `transaction_confirmed` | TX confirmation   |
| `price_alert`           | Gold price alert  |
| `promo`                 | Marketing message |

---

## Statsig (Feature Flags)

### Purpose

Feature gating and A/B testing.

### Configuration

```typescript
// src/statsig/index.ts
import { Statsig } from 'statsig-react-native'

await Statsig.initialize(STATSIG_SDK_KEY, {
  userID: walletAddress,
  custom: {
    country: 'CO',
    appVersion: APP_VERSION,
  },
})

export function getFeatureGate(gate: string): boolean {
  return Statsig.checkGate(gate)
}
```

### Current Feature Gates

| Gate                | Description      |
| ------------------- | ---------------- |
| `show_gold_feature` | Digital gold UI  |
| `show_buckspay`     | BucksPay offramp |
| `show_points`       | Points system    |
| `show_earn`         | Yield farming    |

---

## WalletConnect (DApp Connectivity)

### Purpose

Connect to DApps from external websites.

### Version

WalletConnect v2 (Relay Protocol)

### Implementation

```typescript
// src/walletConnect/client.ts
import { WalletConnectClient } from '@walletconnect/client'

const client = await WalletConnectClient.init({
  projectId: WALLETCONNECT_PROJECT_ID,
  metadata: {
    name: 'TuCOP Wallet',
    description: 'Colombian crypto wallet',
    url: 'https://tucop.co',
    icons: ['https://tucop.co/icon.png'],
  },
})
```

### Supported Methods

| Method                | Purpose            |
| --------------------- | ------------------ |
| `personal_sign`       | Sign message       |
| `eth_signTypedData`   | EIP-712 signatures |
| `eth_sendTransaction` | Send transaction   |

---

## Phone Verification Service

### Purpose

Verify phone numbers for identity and social features.

### Architecture

```
App → Twilio SMS → Backend API → Wallet linking
```

### Endpoints

| Endpoint               | Purpose       |
| ---------------------- | ------------- |
| `POST /verify/start`   | Send SMS code |
| `POST /verify/confirm` | Verify code   |
| `GET /verify/status`   | Check status  |

---

## Best Practices

1. **API Keys** - Store in environment variables, never commit
2. **Rate Limits** - Implement backoff and caching
3. **Error Handling** - Always catch and log API errors
4. **Timeouts** - Set reasonable timeouts (10-30s)
5. **Retries** - Implement exponential backoff
6. **Monitoring** - Log API performance to Sentry
