# ADR-0009: Testing Strategy

## Status

Accepted

## Date

2024-12-01

## Context

TuCOP Wallet handles financial transactions and user funds, requiring high
confidence in code correctness. We needed a comprehensive testing strategy
covering:

1. Unit tests for business logic
2. Component tests for UI behavior
3. Integration tests for Redux flows
4. End-to-end tests for critical user journeys

### Testing Challenges

- **Blockchain Interactions**: Need to mock Viem/chain calls
- **Redux Sagas**: Async flows require special testing patterns
- **React Native**: Component testing differs from web React
- **Feature Flags**: Tests must account for Statsig gates
- **Native Modules**: Camera, biometrics need mocking

## Decision

We use a **Testing Pyramid** approach:

```
                    ┌───────────────┐
                    │    E2E        │  ← Detox (critical flows)
                    │   (few)       │
                    ├───────────────┤
                    │  Integration  │  ← Jest (Redux, Sagas)
                    │   (some)      │
                    ├───────────────┤
                    │    Unit       │  ← Jest (utilities, hooks)
                    │   (many)      │
                    └───────────────┘
```

### Technology Stack

| Layer       | Tool                         | Purpose                     |
| ----------- | ---------------------------- | --------------------------- |
| Unit        | Jest                         | Functions, utilities, hooks |
| Component   | React Native Testing Library | UI components               |
| Integration | Jest + Redux                 | Sagas, reducers, selectors  |
| E2E         | Detox                        | Full user flows             |

### Key Patterns

#### 1. Unit Tests

```typescript
// utils.test.ts
describe('calculateMinOutput', () => {
  it('applies slippage correctly', () => {
    const amount = BigInt(1000000)
    const slippage = 0.5 // 0.5%

    const result = calculateMinOutput(amount, slippage)

    expect(result).toBe(BigInt(995000))
  })
})
```

#### 2. Component Tests

```typescript
// TokenBalanceItem.test.tsx
import { render, fireEvent } from '@testing-library/react-native'

describe('TokenBalanceItem', () => {
  it('displays token balance and symbol', () => {
    const { getByText } = render(
      <TokenBalanceItem token={mockCOPmToken} />
    )

    expect(getByText('100.00')).toBeTruthy()
    expect(getByText('Pesos')).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <TokenBalanceItem token={mockCOPmToken} onPress={onPress} />
    )

    fireEvent.press(getByTestId('token-item'))

    expect(onPress).toHaveBeenCalled()
  })
})
```

#### 3. Redux Saga Tests

```typescript
// saga.test.ts
import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'

describe('sendPaymentSaga', () => {
  it('sends transaction and updates state', () => {
    return expectSaga(sendPaymentSaga, sendPaymentAction)
      .withState(mockState)
      .provide([
        [matchers.call.fn(signAndSendTransaction), ['0xhash']],
        [matchers.call.fn(waitForTransactionReceipt), { status: 'success' }],
      ])
      .put(sendPaymentSuccess({ amount, tokenId }))
      .run()
  })

  it('handles transaction failure', () => {
    return expectSaga(sendPaymentSaga, sendPaymentAction)
      .withState(mockState)
      .provide([[matchers.call.fn(signAndSendTransaction), throwError(new Error('Failed'))]])
      .put(sendPaymentFailure())
      .run()
  })
})
```

#### 4. Selector Tests

```typescript
// selectors.test.ts
describe('sortedTokensWithBalanceSelector', () => {
  it('sorts tokens by USD balance descending', () => {
    const state = {
      tokens: {
        tokenBalances: {
          'celo-mainnet:0x...copm': { balance: '1000', priceUsd: '0.00025' },
          'celo-mainnet:0x...usdt': { balance: '10', priceUsd: '1.0' },
        },
      },
    }

    const result = sortedTokensWithBalanceSelector(state, ['celo-mainnet'])

    expect(result[0].symbol).toBe('USDT') // $10 > $0.25
    expect(result[1].symbol).toBe('COPm')
  })
})
```

#### 5. E2E Tests (Detox)

```typescript
// send.e2e.ts
describe('Send Flow', () => {
  beforeAll(async () => {
    await device.launchApp()
    await loginWithPIN('123456')
  })

  it('should complete send flow', async () => {
    // Navigate to send
    await element(by.id('send-button')).tap()

    // Enter recipient
    await element(by.id('recipient-input')).typeText('0x1234...')
    await element(by.id('continue-button')).tap()

    // Enter amount
    await element(by.id('amount-input')).typeText('100')
    await element(by.id('continue-button')).tap()

    // Confirm
    await element(by.id('confirm-button')).tap()

    // Verify success
    await expect(element(by.text('Transaction Sent'))).toBeVisible()
  })
})
```

### Mocking Strategy

#### Blockchain Mocks

```typescript
// __mocks__/viem.ts
export const publicClient = {
  readContract: jest.fn(),
  waitForTransactionReceipt: jest.fn(),
  getBalance: jest.fn(),
}

export const walletClient = {
  sendTransaction: jest.fn(),
  signMessage: jest.fn(),
}
```

#### Native Module Mocks

```typescript
// jest.setup.js
jest.mock('react-native-keychain', () => ({
  getSupportedBiometryType: jest.fn(() => 'FaceID'),
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
}))

jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({
    getToken: jest.fn(() => 'mock-token'),
    onMessage: jest.fn(),
  }),
}))
```

#### Feature Flag Mocks

```typescript
jest.mock('src/statsig', () => ({
  getFeatureGate: jest.fn((gate) => {
    const gates = {
      show_gold_feature: true,
      show_buckspay: true,
    }
    return gates[gate] ?? false
  }),
}))
```

### Coverage Targets

| Type       | Target | Current |
| ---------- | ------ | ------- |
| Statements | 70%    | ~65%    |
| Branches   | 60%    | ~55%    |
| Functions  | 70%    | ~60%    |
| Lines      | 70%    | ~65%    |

## Consequences

### Positive

- **Confidence**: High test coverage for critical paths
- **Regression Prevention**: Tests catch breaking changes
- **Documentation**: Tests serve as usage examples
- **Refactoring Safety**: Can refactor with confidence

### Negative

- **Maintenance**: Tests require updates with code changes
- **Slow E2E**: Detox tests take 10-15 minutes
- **Mock Complexity**: Blockchain mocks can be fragile

### Best Practices Established

1. **Test Behavior, Not Implementation**: Focus on what code does, not how
2. **Meaningful Names**: `it('should display error when balance insufficient')`
3. **Arrange-Act-Assert**: Clear test structure
4. **One Assertion Per Test**: When possible, for clarity
5. **Mock at Boundaries**: Mock external services, not internal modules

## Commands

```bash
# Run all unit tests
yarn test

# Run with coverage
yarn test --coverage

# Run specific file
yarn test src/send/saga.test.ts

# Watch mode
yarn test:watch

# E2E tests
yarn e2e:test:android
yarn e2e:test:ios
```

## References

- [Jest Documentation](https://jestjs.io/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Detox Documentation](https://wix.github.io/Detox/)
- [Redux Saga Test Plan](https://github.com/jfairbank/redux-saga-test-plan)
