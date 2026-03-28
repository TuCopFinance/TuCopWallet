# Gold Module (Digital Gold - XAUt0)

## Overview

The Gold module enables users to buy and sell XAUt0 (Tether Gold) directly
in the app using USDT as the payment method.

## Directory Structure

```
src/gold/
├── README.md                  # This file
├── slice.ts                   # Redux state
├── saga.ts                    # Side effects (buy/sell logic)
├── api.ts                     # Price fetching (CoinGecko)
├── useGoldQuote.ts            # Quote hook (Squid Router)
├── types.ts                   # TypeScript types
├── GoldInfoScreen.tsx         # Educational intro
├── GoldHome.tsx               # Dashboard
├── GoldBuyEnterAmount.tsx     # Buy amount input
├── GoldBuyConfirmation.tsx    # Buy confirmation
├── GoldSellEnterAmount.tsx    # Sell amount input
├── GoldSellConfirmation.tsx   # Sell confirmation
├── GoldPriceAlerts.tsx        # Price alert management
└── selectors.ts               # Redux selectors
```

## User Flow

### Buy Gold

```
GoldHome → GoldBuyEnterAmount → GoldBuyConfirmation → Success
```

1. **GoldHome**: View gold price, balance, and options
2. **GoldBuyEnterAmount**: Enter USDT amount to spend
3. **GoldBuyConfirmation**: Review quote and confirm swap
4. **Success**: Transaction complete, balance updated

### Sell Gold

```
GoldHome → GoldSellEnterAmount → GoldSellConfirmation → Success
```

## State Shape

```typescript
interface GoldState {
  // Price data
  priceUsd: number | null
  priceCop: number | null
  priceChange24h: number | null
  lastUpdated: number | null

  // Loading states
  isLoadingPrice: boolean
  isLoadingQuote: boolean

  // Error state
  error: string | null

  // Price alerts
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

## Token Configuration

```typescript
// XAUt0 on Celo Mainnet
const XAUT0_ADDRESS = '0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff'
const XAUT0_DECIMALS = 6
const XAUT0_TOKEN_ID = 'celo-mainnet:0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff'

// 1 XAUt0 = 1 troy ounce of gold
```

## Quote Provider

Using **Squid Router** for USDT ↔ XAUt0 swaps:

```typescript
// src/gold/useGoldQuote.ts
async function getGoldQuote(params: QuoteParams) {
  const response = await fetch('https://api.squidrouter.com/v1/route', {
    method: 'POST',
    headers: {
      'x-integrator-id': SQUID_INTEGRATOR_ID,
    },
    body: JSON.stringify({
      fromChain: 42220, // Celo
      fromToken: USDT_ADDRESS,
      fromAmount: params.usdtAmount,
      toChain: 42220,
      toToken: XAUT0_ADDRESS,
      slippage: 0.5,
      toAddress: params.userAddress,
    }),
  })

  return response.json()
}
```

## Saga Flows

### Buy Gold

```typescript
function* buyGoldSaga(action) {
  const { usdtAmount, quoteData } = action.payload

  yield put(setGoldStatus('buying'))

  // Execute swap via prepared transactions
  const txHash = yield call(sendPreparedTransactions, quoteData.transactionRequest)

  yield put(goldPurchased({ txHash, amount: quoteData.toAmount }))

  // Refresh balances
  yield put(refreshTokenBalances())
}
```

### Sell Gold

```typescript
function* sellGoldSaga(action) {
  const { xautAmount, quoteData } = action.payload

  yield put(setGoldStatus('selling'))

  const txHash = yield call(sendPreparedTransactions, quoteData.transactionRequest)

  yield put(goldSold({ txHash, amount: xautAmount }))

  yield put(refreshTokenBalances())
}
```

### Fetch Price

```typescript
function* fetchGoldPrice() {
  const data = yield call(
    fetch,
    'https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd,cop&include_24hr_change=true'
  )

  yield put(
    setGoldPrice({
      priceUsd: data['tether-gold'].usd,
      priceCop: data['tether-gold'].cop,
      priceChange24h: data['tether-gold'].usd_24h_change,
    })
  )
}
```

## UI Display Rules

| Internal | UI (Spanish)   | UI (English) |
| -------- | -------------- | ------------ |
| XAUt0    | Oro Digital    | Digital Gold |
| Balance  | Tengo X oz     | I have X oz  |
| Price    | Precio del oro | Gold Price   |

## Price Alerts

Local notification system for price alerts:

```typescript
// Check alerts on price update
function* checkPriceAlerts(currentPrice: number) {
  const alerts = yield select(activeAlertsSelector)

  for (const alert of alerts) {
    const triggered =
      (alert.direction === 'above' && currentPrice >= alert.targetPrice) ||
      (alert.direction === 'below' && currentPrice <= alert.targetPrice)

    if (triggered) {
      yield call(showLocalNotification, {
        title: 'Alerta de precio del oro',
        body: `El oro está en $${currentPrice.toFixed(2)} USD`,
      })

      yield put(deactivateAlert(alert.id))
    }
  }
}
```

## Feature Flag

```typescript
import { getFeatureGate } from 'src/statsig'

const showGold = getFeatureGate('show_gold_feature')
```

## Analytics Events

| Event                    | When                      |
| ------------------------ | ------------------------- |
| `gold_home_viewed`       | User opens gold dashboard |
| `gold_buy_started`       | User starts buy flow      |
| `gold_buy_quote_fetched` | Quote received            |
| `gold_buy_confirmed`     | User confirms purchase    |
| `gold_buy_completed`     | Transaction success       |
| `gold_sell_completed`    | Sell transaction success  |
| `gold_alert_created`     | New price alert           |

## Error Handling

| Error             | Handling                     |
| ----------------- | ---------------------------- |
| No USDT balance   | Show "Need USDT to buy gold" |
| No XAUt0 balance  | Hide sell option             |
| Quote failed      | Show retry button            |
| TX failed         | Show error with reason       |
| Slippage exceeded | Show slippage warning        |

## Related Documentation

- [ADR-0007: Digital Gold](../../docs/adr/0007-digital-gold-xaut0.md)
- [Gold Plan](../../tasks/plans/xaut0-digital-gold.md)
- [Tether Gold](https://gold.tether.to/)
