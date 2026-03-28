# ADR-0011: Error Handling and Logging Strategy

## Status

Accepted

## Date

2024-12-01

## Context

TuCOP Wallet handles financial transactions where errors must be:

1. **Captured**: All errors logged for debugging
2. **Tracked**: Errors sent to monitoring service
3. **User-Friendly**: Clear messages shown to users
4. **Recoverable**: Guide users to resolution when possible

### Error Categories

| Category       | Example                     | Severity |
| -------------- | --------------------------- | -------- |
| **Network**    | API timeout, no connection  | Medium   |
| **Blockchain** | TX reverted, gas estimation | High     |
| **Validation** | Invalid address, amount     | Low      |
| **Auth**       | PIN failed, biometry error  | Medium   |
| **System**     | Out of memory, crash        | Critical |

## Decision

We use a multi-layer error handling strategy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ERROR HANDLING LAYERS                                 │
└─────────────────────────────────────────────────────────────────────────────┘

          ┌─────────────────────────────────────────────────────────────┐
          │                    Error Boundary (React)                   │
          │                    Catches render errors                    │
          └──────────────────────────┬──────────────────────────────────┘
                                     │
          ┌──────────────────────────▼──────────────────────────────────┐
          │                    Sentry SDK                               │
          │                    Captures all errors                      │
          └──────────────────────────┬──────────────────────────────────┘
                                     │
          ┌──────────────────────────▼──────────────────────────────────┐
          │                    Logger Utility                           │
          │                    Structured logging                       │
          └──────────────────────────┬──────────────────────────────────┘
                                     │
          ┌──────────────────────────▼──────────────────────────────────┐
          │                    User Error Display                       │
          │                    showErrorOrFallback()                    │
          └─────────────────────────────────────────────────────────────┘
```

### 1. Logger Utility

Central logging through `src/utils/Logger.ts`:

```typescript
// src/utils/Logger.ts
import * as Sentry from '@sentry/react-native'

class Logger {
  debug(tag: string, ...messages: any[]) {
    if (__DEV__) {
      console.log(`[${tag}]`, ...messages)
    }
  }

  info(tag: string, ...messages: any[]) {
    console.info(`[${tag}]`, ...messages)
    Sentry.addBreadcrumb({
      category: tag,
      message: messages.join(' '),
      level: 'info',
    })
  }

  warn(tag: string, ...messages: any[]) {
    console.warn(`[${tag}]`, ...messages)
    Sentry.addBreadcrumb({
      category: tag,
      message: messages.join(' '),
      level: 'warning',
    })
  }

  error(tag: string, message: string, error?: Error, extra?: object) {
    console.error(`[${tag}]`, message, error)

    Sentry.captureException(error ?? new Error(message), {
      tags: { component: tag },
      extra,
    })
  }
}

export default new Logger()
```

**Usage:**

```typescript
import Logger from 'src/utils/Logger'

const TAG = 'SendSaga'

Logger.debug(TAG, 'Preparing transaction', { amount, recipient })
Logger.info(TAG, 'Transaction submitted', txHash)
Logger.warn(TAG, 'Gas estimation retried')
Logger.error(TAG, 'Transaction failed', error, { txHash })
```

### 2. Sentry Integration

```typescript
// src/sentry/index.ts
import * as Sentry from '@sentry/react-native'

export function initializeSentry() {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: 0.2,
    beforeSend(event) {
      // Scrub sensitive data
      if (event.extra?.mnemonic) {
        delete event.extra.mnemonic
      }
      return event
    },
  })
}

// Set user context
export function setSentryUserContext(address: string) {
  Sentry.setUser({ id: address })
}

// Add breadcrumb
export function addBreadcrumb(category: string, message: string) {
  Sentry.addBreadcrumb({ category, message })
}
```

### 3. Error Boundary

```typescript
// src/app/ErrorBoundary.tsx
import * as Sentry from '@sentry/react-native'

class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    })
  }

  render() {
    if (this.state.hasError) {
      return <ErrorScreen onRetry={() => this.setState({ hasError: false })} />
    }
    return this.props.children
  }
}
```

### 4. User-Facing Errors

```typescript
// src/utils/showError.ts
export function showErrorOrFallback(error: Error | string, fallbackMessage?: string) {
  const message =
    typeof error === 'string' ? error : error.message || fallbackMessage || t('genericError')

  // Log to Sentry
  Logger.error('UI', 'Showing error to user', error instanceof Error ? error : undefined)

  // Show alert
  Alert.alert(t('error'), message, [{ text: t('ok'), style: 'default' }])
}
```

### 5. Saga Error Handling

```typescript
// Common pattern for sagas
function* safeSaga(action) {
  try {
    yield call(riskyOperation)
  } catch (error) {
    Logger.error(TAG, 'Operation failed', error)

    // Update UI state
    yield put(operationFailed(error.message))

    // Show user-friendly message
    yield call(showErrorOrFallback, error, t('operationFailed'))
  }
}
```

### 6. Network Error Handling

```typescript
// src/utils/fetch.ts
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: 30000,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return response
    } catch (error) {
      Logger.warn(TAG, `Fetch attempt ${i + 1} failed`, error)

      if (i === retries - 1) {
        throw error
      }

      // Exponential backoff
      await sleep(1000 * Math.pow(2, i))
    }
  }
}
```

### 7. Blockchain Error Handling

```typescript
// src/viem/prepareTransactions.ts
export function handleBlockchainError(error: Error): string {
  const message = error.message.toLowerCase()

  if (message.includes('insufficient funds')) {
    return t('insufficientBalance')
  }

  if (message.includes('gas required exceeds')) {
    return t('gasEstimationFailed')
  }

  if (message.includes('nonce too low')) {
    return t('transactionConflict')
  }

  if (message.includes('execution reverted')) {
    return t('transactionReverted')
  }

  return t('transactionFailed')
}
```

## Error Severity Levels

| Level     | When to Use           | Sentry Behavior         |
| --------- | --------------------- | ----------------------- |
| `debug`   | Development only      | Not sent                |
| `info`    | Normal operations     | Breadcrumb              |
| `warning` | Recoverable issues    | Breadcrumb              |
| `error`   | User-impacting errors | Exception               |
| `fatal`   | App crash             | Exception + Session End |

## Consequences

### Positive

- **Visibility**: All errors tracked in Sentry
- **Debugging**: Breadcrumbs show error context
- **User Experience**: Clear, localized error messages
- **Reliability**: Automatic retry for transient failures

### Negative

- **Performance**: Sentry adds ~50KB to bundle
- **Privacy**: Must scrub sensitive data before sending
- **Noise**: Need to tune sampling rates

### Rules

1. **Never `console.log`**: Always use `Logger`
2. **Never swallow errors**: At minimum, log them
3. **User messages**: Always localized via i18n
4. **Sensitive data**: Never log mnemonics, PINs, private keys
5. **Context**: Include relevant state in error extras

## Sentry Dashboard

Access at: https://sentry.io/

Key views:

- **Issues**: Grouped errors by type
- **Performance**: Transaction timing
- **Releases**: Error rates by version
- **User Feedback**: User-reported issues

## References

- [Sentry React Native SDK](https://docs.sentry.io/platforms/react-native/)
- [Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Logger Utility](../../src/utils/Logger.ts)
