# Swap Module

## Overview

The Swap module enables users to exchange one token for another using
DEX aggregators. It fetches quotes from multiple providers and executes
swaps with the best available rate.

## Directory Structure

```
src/swap/
├── README.md                          # This file
├── slice.ts                           # Redux state
├── saga.ts                            # Swap execution
├── SwapScreen.tsx                     # Main swap UI
├── useSwapQuote.ts                    # Quote fetching hook
├── types.ts                           # TypeScript types
├── selectors.ts                       # Redux selectors
└── getSwapTxsAnalyticsProperties.ts   # Analytics helpers
```

## User Flow

```
SwapScreen
    │
    ├── Select input token (e.g., USDT)
    ├── Select output token (e.g., COPm)
    ├── Enter amount
    │
    ▼
Fetch quotes from providers
    │
    ▼
Display best quote
    │
    ▼
User taps "Swap"
    │
    ▼
[If needed] Approve token spending
    │
    ▼
Execute swap transaction
    │
    ▼
Success / Update balances
```

## State Shape

```typescript
interface SwapState {
  // Input state
  fromToken: string | null
  toToken: string | null
  fromAmount: string

  // Quote state
  quote: SwapQuote | null
  quoteLoading: boolean
  quoteError: string | null

  // Swap execution
  swapStatus: 'idle' | 'approving' | 'swapping' | 'success' | 'error'
  swapError: string | null
  swapTxHash: string | null

  // Settings
  slippageTolerance: number // Default: 0.5%
}

interface SwapQuote {
  provider: string
  fromAmount: string
  toAmount: string
  toAmountMin: string // After slippage
  priceImpact: number
  estimatedGas: string
  route: SwapRoute
  transactions: PreparedTransaction[]
}
```

## Quote Providers

### 1. Uniswap (Primary)

```typescript
const UNISWAP_ROUTER = '0x...'

async function getUniswapQuote(params: QuoteParams) {
  // Query Uniswap V3 quoter contract
}
```

### 2. Ubeswap (Celo Native)

```typescript
const UBESWAP_ROUTER = '0x...'

async function getUbeswapQuote(params: QuoteParams) {
  // Query Ubeswap router
}
```

### 3. Squid Router (Cross-chain)

```typescript
async function getSquidQuote(params: QuoteParams) {
  const response = await fetch('https://api.squidrouter.com/v1/route', {
    method: 'POST',
    headers: { 'x-integrator-id': INTEGRATOR_ID },
    body: JSON.stringify(params),
  })
  return response.json()
}
```

## Quote Aggregation

```typescript
async function getBestQuote(params: QuoteParams): Promise<SwapQuote> {
  // Fetch from all providers in parallel
  const quotes = await Promise.allSettled([
    getUniswapQuote(params),
    getUbeswapQuote(params),
    getSquidQuote(params),
  ])

  // Filter successful quotes
  const validQuotes = quotes.filter((q) => q.status === 'fulfilled').map((q) => q.value)

  // Return best output amount
  return validQuotes.sort((a, b) => BigInt(b.toAmount) - BigInt(a.toAmount))[0]
}
```

## Saga Flows

### Execute Swap

```typescript
function* executeSwapSaga(action) {
  const { quote, userAddress } = action.payload

  try {
    // Check allowance
    const allowance = yield call(checkAllowance, {
      token: quote.fromToken,
      owner: userAddress,
      spender: quote.router,
    })

    // Approve if needed
    if (BigInt(allowance) < BigInt(quote.fromAmount)) {
      yield put(setSwapStatus('approving'))

      const approveTx = yield call(prepareApprove, {
        token: quote.fromToken,
        spender: quote.router,
        amount: quote.fromAmount,
      })

      yield call(sendTransaction, approveTx)
    }

    // Execute swap
    yield put(setSwapStatus('swapping'))

    const swapTx = yield call(sendTransaction, quote.transactions[0])

    yield put(swapCompleted({ txHash: swapTx.hash }))

    // Refresh balances
    yield put(refreshTokenBalances())
  } catch (error) {
    yield put(swapFailed(error.message))
  }
}
```

## Token Pairs

Common swap pairs in TuCOP:

| From  | To    | Use Case                  |
| ----- | ----- | ------------------------- |
| USDT  | COPm  | Convert dollars to pesos  |
| COPm  | USDT  | Convert pesos to dollars  |
| USDT  | XAUt0 | Buy gold                  |
| XAUt0 | USDT  | Sell gold                 |
| CELO  | USDT  | Convert gas to stablecoin |
| CELO  | COPm  | Convert gas to pesos      |

## Slippage Settings

```typescript
const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0, 3.0] // Percentages
const DEFAULT_SLIPPAGE = 0.5

function calculateMinOutput(amount: bigint, slippage: number): bigint {
  return (amount * BigInt(Math.floor((100 - slippage) * 100))) / 10000n
}
```

## Price Impact Warning

```typescript
const PRICE_IMPACT_WARNING = 1.0 // Yellow warning
const PRICE_IMPACT_SEVERE = 5.0 // Red warning, confirm dialog

function getPriceImpactSeverity(impact: number): 'low' | 'medium' | 'high' {
  if (impact >= PRICE_IMPACT_SEVERE) return 'high'
  if (impact >= PRICE_IMPACT_WARNING) return 'medium'
  return 'low'
}
```

## Error Handling

| Error                  | Handling                  |
| ---------------------- | ------------------------- |
| Insufficient balance   | Show balance error        |
| Insufficient liquidity | Show "Try smaller amount" |
| Slippage exceeded      | Show slippage warning     |
| TX failed              | Show retry option         |
| Approval failed        | Show approval error       |

## Analytics Events

| Event                  | Properties                           |
| ---------------------- | ------------------------------------ |
| `swap_screen_opened`   | fromToken, toToken                   |
| `swap_quote_requested` | fromToken, toToken, amount           |
| `swap_quote_received`  | provider, toAmount, priceImpact      |
| `swap_confirmed`       | fromToken, toToken, amount, provider |
| `swap_completed`       | txHash, fromAmount, toAmount         |
| `swap_failed`          | error, fromToken, toToken            |

## Performance Optimizations

1. **Debounced quotes**: Wait 500ms after input before fetching
2. **Parallel fetching**: Query all providers simultaneously
3. **Quote caching**: Cache quotes for 30 seconds
4. **Background refresh**: Update quote every 15 seconds

## Related Documentation

- [Swap Flow Diagram](../../docs/architecture/diagrams/flow-swap.md)
- [Uniswap Integration](https://docs.uniswap.org/)
- [Squid Router](https://docs.squidrouter.com/)
