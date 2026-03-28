# Earn Module

## Overview

The Earn module enables users to deposit tokens into yield-generating
protocols and earn passive income. It supports multiple DeFi protocols
on Celo.

## Directory Structure

```
src/earn/
├── README.md                    # This file
├── slice.ts                     # Redux state
├── saga.ts                      # Deposit/withdraw logic
├── EarnHome.tsx                 # Yield opportunities list
├── EarnEnterAmount.tsx          # Amount input
├── EarnConfirmationScreen.tsx   # Confirm deposit
├── EarnInfoScreen.tsx           # Pool information
├── poolInfoScreen/
│   └── EarnPoolInfoScreen.tsx   # Detailed pool info
├── marranitos/
│   └── MarranitoStaking.tsx     # TuCOP custom staking
├── types.ts                     # TypeScript types
└── selectors.ts                 # Redux selectors
```

## User Flow

### Deposit

```
EarnHome → EarnPoolInfoScreen → EarnEnterAmount → EarnConfirmationScreen → Success
```

1. **EarnHome**: Browse available yield opportunities
2. **EarnPoolInfoScreen**: View pool details (APY, TVL, risks)
3. **EarnEnterAmount**: Enter deposit amount
4. **EarnConfirmationScreen**: Review and confirm
5. **Success**: Tokens deposited, position created

### Withdraw

```
EarnHome (positions) → EarnPoolInfoScreen → Withdraw flow → Success
```

## State Shape

```typescript
interface EarnState {
  // Available pools
  pools: Pool[]
  poolsLoading: boolean
  poolsError: string | null

  // User positions
  positions: Position[]
  positionsLoading: boolean

  // Current flow
  selectedPool: Pool | null
  depositStatus: 'idle' | 'depositing' | 'success' | 'error'
  withdrawStatus: 'idle' | 'withdrawing' | 'success' | 'error'
}

interface Pool {
  id: string
  protocol: string // 'aave', 'compound', 'ubeswap', 'marranitos'
  token: string // Token to deposit
  apy: number // Annual percentage yield
  tvl: string // Total value locked
  riskLevel: 'low' | 'medium' | 'high'
  contractAddress: string
}

interface Position {
  poolId: string
  depositedAmount: string
  currentValue: string
  earnedRewards: string
  depositedAt: number
}
```

## Supported Protocols

### 1. Aave

Lending protocol - deposit tokens, earn interest from borrowers.

```typescript
interface AavePool {
  protocol: 'aave'
  aToken: string // Receipt token
  underlying: string // Deposited token
  supplyApy: number
  borrowApy: number
}
```

### 2. Compound

Similar to Aave, lending/borrowing.

### 3. Ubeswap LP

Provide liquidity to trading pairs, earn trading fees.

```typescript
interface UbeswapPool {
  protocol: 'ubeswap'
  token0: string
  token1: string
  lpToken: string
  farmRewards: string // UBE token
}
```

### 4. Marranitos (TuCOP Custom)

TuCOP's custom staking mechanism.

```typescript
interface MarranitoPool {
  protocol: 'marranitos'
  stakingToken: string
  rewardToken: string
  lockPeriod: number // Days
}
```

## Saga Flows

### Deposit to Pool

```typescript
function* depositSaga(action) {
  const { poolId, amount } = action.payload
  const pool = yield select(poolByIdSelector(poolId))

  yield put(setDepositStatus('depositing'))

  try {
    // Approve token spending
    const approveTx = yield call(prepareApprove, {
      token: pool.token,
      spender: pool.contractAddress,
      amount,
    })
    yield call(sendTransaction, approveTx)

    // Deposit to pool
    const depositTx = yield call(prepareDeposit, {
      pool,
      amount,
    })
    yield call(sendTransaction, depositTx)

    yield put(depositCompleted({ poolId, amount }))

    // Refresh positions
    yield put(fetchPositions())
  } catch (error) {
    yield put(depositFailed(error.message))
  }
}
```

### Withdraw from Pool

```typescript
function* withdrawSaga(action) {
  const { poolId, amount } = action.payload

  yield put(setWithdrawStatus('withdrawing'))

  const withdrawTx = yield call(prepareWithdraw, { poolId, amount })
  yield call(sendTransaction, withdrawTx)

  yield put(withdrawCompleted({ poolId, amount }))
  yield put(fetchPositions())
}
```

### Fetch APY Data

```typescript
function* fetchPoolsSaga() {
  yield put(setPoolsLoading(true))

  // Fetch from multiple protocols
  const [aavePools, compoundPools, ubeswapPools] = yield all([
    call(fetchAavePools),
    call(fetchCompoundPools),
    call(fetchUbeswapPools),
  ])

  yield put(setPools([...aavePools, ...compoundPools, ...ubeswapPools]))
}
```

## Risk Levels

| Level  | Description                    | Examples       |
| ------ | ------------------------------ | -------------- |
| Low    | Established protocols, audited | Aave, Compound |
| Medium | Newer protocols, some risk     | Ubeswap farms  |
| High   | Experimental, impermanent loss | New LP pools   |

## APY Calculation

```typescript
// Simple APY display
function formatApy(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`
}

// Compound APY from daily rate
function dailyToApy(dailyRate: number): number {
  return Math.pow(1 + dailyRate, 365) - 1
}
```

## UI Components

### Pool Card

```typescript
<PoolCard
  pool={pool}
  onPress={() => navigate(Screens.EarnPoolInfoScreen, { poolId: pool.id })}
>
  <Text>{pool.token} - {formatApy(pool.apy)} APY</Text>
  <Text>TVL: ${formatCurrency(pool.tvl)}</Text>
  <RiskBadge level={pool.riskLevel} />
</PoolCard>
```

### Position Card

```typescript
<PositionCard position={position}>
  <Text>Deposited: {position.depositedAmount}</Text>
  <Text>Current Value: {position.currentValue}</Text>
  <Text>Rewards: +{position.earnedRewards}</Text>
</PositionCard>
```

## Analytics Events

| Event                     | When                |
| ------------------------- | ------------------- |
| `earn_home_viewed`        | User opens earn tab |
| `earn_pool_selected`      | User taps on pool   |
| `earn_deposit_started`    | User starts deposit |
| `earn_deposit_completed`  | Deposit successful  |
| `earn_withdraw_completed` | Withdraw successful |

## Error Handling

| Error                | Handling              |
| -------------------- | --------------------- |
| Insufficient balance | Show balance error    |
| Pool full            | Show capacity warning |
| TX failed            | Show retry option     |
| Slippage (LP)        | Show slippage warning |

## Related Documentation

- [Features Documentation](../../docs/architecture/modules/features.md)
- [Aave Documentation](https://docs.aave.com/)
- [Ubeswap Documentation](https://docs.ubeswap.org/)
