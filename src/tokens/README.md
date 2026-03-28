# Tokens Module

## Overview

The Tokens module manages all token-related functionality: balances, prices,
metadata, and UI display. It's the central source of truth for what tokens
the user owns and their values.

## Directory Structure

```
src/tokens/
├── README.md                  # This file
├── slice.ts                   # Redux state
├── saga.ts                    # Balance fetching
├── selectors.ts               # Redux selectors (600+ lines)
├── hooks.ts                   # React hooks
├── utils.ts                   # Utility functions
├── types.ts                   # TypeScript types
├── constants.ts               # Module constants
├── TabWallet.tsx              # Main wallet tab
├── TokenDetails.tsx           # Token detail screen
├── TokenImport.tsx            # Import custom token
├── AssetList.tsx              # Token list component
├── TokenBalanceItem.tsx       # Single token row
├── PositionItem.tsx           # DeFi position row
├── AssetTabBar.tsx            # Tokens/Positions tabs
├── SegmentedControl.tsx       # iOS-style tabs
├── TokenDetailsMoreActions.tsx # Token action menu
├── PositionIcon.tsx           # Position icon
└── PasteButton.tsx            # Clipboard paste
```

## State Shape

```typescript
interface TokensState {
  tokenBalances: Record<string, StoredTokenBalance>
  loading: boolean
  error: string | null
}

interface StoredTokenBalance {
  tokenId: string // "celo-mainnet:0x..."
  address: string | null
  symbol: string
  name: string
  decimals: number
  networkId: NetworkId
  balance: string | null // Stored as string
  priceUsd?: string
  historicalPricesUsd?: Record<string, number>
  isNative?: boolean
  isFeeCurrency?: boolean
  isSwappable?: boolean
  isManuallyImported?: boolean
}

// Runtime type (after selector transformation)
interface TokenBalance extends BaseToken {
  balance: BigNumber // Converted to BigNumber
  priceUsd: BigNumber | null
  lastKnownPriceUsd: BigNumber | null
}
```

## Token ID Format

```typescript
// Mainnet: "celo-mainnet:0x{lowercase_address}"
const COPM_TOKEN_ID = 'celo-mainnet:0x8a567e2ae79ca692bd748ab832081c45de4041ea'

// Testnet: "celo-sepolia:0x{lowercase_address}"
const COPM_TESTNET_ID = 'celo-sepolia:0x5f8d55c3627d2dc0a2b4afa798f877242f382f67'

// Native token (no address)
const CELO_TOKEN_ID = 'celo-mainnet:native'
```

## Key Selectors

| Selector                          | Returns          | Purpose              |
| --------------------------------- | ---------------- | -------------------- |
| `tokensByIdSelector`              | `TokenBalances`  | All tokens by ID     |
| `tokensListSelector`              | `TokenBalance[]` | List for networks    |
| `totalTokenBalanceSelector`       | `BigNumber`      | Portfolio total      |
| `sortedTokensWithBalanceSelector` | `TokenBalance[]` | Sorted by USD value  |
| `feeCurrenciesSelector`           | `TokenBalance[]` | Gas payment options  |
| `swappableFromTokensSelector`     | `TokenBalance[]` | Swap source tokens   |
| `cashInTokensSelector`            | `TokenBalance[]` | On-ramp tokens       |
| `cashOutTokensSelector`           | `TokenBalance[]` | Off-ramp tokens      |
| `importedTokensSelector`          | `TokenBalance[]` | User-imported tokens |

## Key Hooks

```typescript
// Get single token info
const usdt = useTokenInfo(networkConfig.usdtTokenId)

// Get multiple tokens
const tokens = useTokensInfo([tokenId1, tokenId2])

// Get total balance in local currency
const total = useTotalTokenBalance()

// Convert amounts
const localAmount = useTokenToLocalAmount(tokenAmount, tokenId)
const tokenAmount = useLocalToTokenAmount(localAmount, tokenId)

// Convenience hooks
const copm = useCOPm()
const usdt = useUSDT()
```

## Saga Flow

```typescript
function* fetchTokenBalancesSaga() {
  const address = yield select(walletAddressSelector)
  const networkIds = getSupportedNetworkIdsForTokenBalances()

  // Fetch from backend API
  const response = yield call(fetchTokenBalancesForAddress, address)

  // Convert to storage format
  const tokenBalances = convertToStoredFormat(response)

  // Fetch imported token balances via on-chain calls
  const importedBalances = yield call(fetchImportedTokenBalances)

  yield put(
    setTokenBalances({
      ...tokenBalances,
      ...importedBalances,
    })
  )
}
```

## UI Display Rules

**IMPORTANT**: Never show technical symbols to users:

| Internal         | User Display |
| ---------------- | ------------ |
| COPm             | **Pesos**    |
| USDT, USDC, USDm | **Dólares**  |
| CELO             | CELO         |
| XAUt0            | **Oro**      |

## Fee Currency Priority

When selecting gas payment currency:

1. CELO (native)
2. COPm / cCOP
3. USDm / cUSD
4. USDC
5. USDT

## Token Actions

From TokenDetails screen:

| Action   | Description                |
| -------- | -------------------------- |
| Send     | Transfer token             |
| Swap     | Exchange for another token |
| Add      | Buy with fiat (cash-in)    |
| Withdraw | Sell for fiat (cash-out)   |
| More     | Additional options menu    |

## Sorting Functions

```typescript
// Sort by USD balance (descending)
sortByUsdBalance(token1, token2)

// Custom sort: Stables first, then CELO, then by balance
sortFirstStableThenCeloThenOthersByUsdBalance()

// Sort for cash in/out with configurable order
sortCicoTokens(tokens, { preferredOrder: ['COPm', 'USDT'] })
```

## Allowed Tokens

Currently only COPm and USDT are allowed:

```typescript
// constants.ts
const ALLOWED_TOKEN_IDS = [networkConfig.copmTokenId, networkConfig.usdtTokenId]
```

## Analytics Events

| Event                  | When                        |
| ---------------------- | --------------------------- |
| `wallet_tab_opened`    | User opens wallet tab       |
| `token_details_opened` | User taps on token          |
| `token_send_started`   | User starts send from token |
| `token_swap_started`   | User starts swap from token |
| `token_imported`       | User imports custom token   |

## Performance Optimizations

1. **Memoized Selectors**: All selectors use `reselect` with custom memoization
2. **Lazy BigNumber Conversion**: Only convert when accessed
3. **Price Staleness**: Track `lastKnownPriceUsd` for stale data fallback
4. **Batch Updates**: Single dispatch for all token balances

## Related Documentation

- [Features Documentation](../../docs/architecture/modules/features.md)
- [Blockchain Integration](../../docs/architecture/modules/blockchain.md)
- [Send Module](../send/README.md)
- [Swap Module](../swap/README.md)
