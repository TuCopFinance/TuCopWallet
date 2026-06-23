<!-- markdownlint-disable MD032 MD040 MD060 -->

# Wallet Robustness Initiative — Plan 01: Track A (Foundations — 8 Reusable Abstractions)

**Status:** SHIPPED. All 8 reusable primitives merged into `Development`: error taxonomy ([src/lib/errors/](../../src/lib/errors/)), retry helper ([src/lib/retry/retry.ts](../../src/lib/retry/retry.ts)), `PinRequiredGate` ([src/components/PinRequiredGate.tsx](../../src/components/PinRequiredGate.tsx)), `useTransactionInFlight` keystone ([src/lib/useTransactionInFlight/](../../src/lib/useTransactionInFlight/)) with persistence migration v249, `ConfirmationSheet` + `TransactionProgressSheet` + `TransactionResultSheet` ([src/components/](../../src/components/)), `DeepLinkRecovery` ([src/app/DeepLinkRecovery.tsx](../../src/app/DeepLinkRecovery.tsx)). Original checkboxes left untouched as historical record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the 8 reusable primitives identified in the wallet-wide audit, so that subsequent feature migrations in Tracks B, C, and D can drop into a shared abstraction instead of reimplementing the same patterns per feature.

**Architecture:** Each abstraction is a separate PR against `Development`. Order is dictated by dependency, not alphabet. Most abstractions land as React hooks + supporting Redux pieces + typed TypeScript surface. The hook `useTransactionInFlight` was validated against three feature integrations in S5; this plan adopts the v4 API directly.

**Tech Stack:** viem 2.24.1, Redux Toolkit 2.4, redux-saga 1.3, @gorhom/bottom-sheet 4.6, react-native-reanimated 3.17, @react-native-community/netinfo, react-i18next.

**Source spec:** [docs/specs/2026-06-15-wallet-robustness-initiative-design.md](../specs/2026-06-15-wallet-robustness-initiative-design.md) section 6.
**Source spike:** [docs/spikes/s5-tx-in-flight-api.md](../spikes/s5-tx-in-flight-api.md) (APPROVED — defines the canonical hook API).

**Git workflow:** `feature/wri-<short>` branches off `Development`. Full automation. Conventional commits in English. NEVER --no-verify. NEVER mention testnet (locked decision #11).

**Dependency order (must merge in this sequence):**

1. Error taxonomy
2. Retry helper with exponential backoff
3. PinRequiredGate (depends on Track B Task 5 if already shipped)
4. useTransactionInFlight (uses the error taxonomy and retry helper)
5. ConfirmationSheet
6. TransactionProgressSheet (uses useTransactionInFlight)
7. TransactionResultSheet (uses error taxonomy)
8. DeepLinkRecovery (uses useTransactionInFlight)

Tracks B / C / D rebase onto each abstraction as it lands.

---

## Task 1: Error taxonomy (`src/lib/errors/`)

A single source of truth for blockchain-transaction error classification, consumed everywhere a transaction can fail.

**Files:**

- Create: `src/lib/errors/types.ts`
- Create: `src/lib/errors/classify.ts`
- Create: `src/lib/errors/index.ts`
- Create: `src/lib/errors/classify.test.ts`

- [ ] **Step 1: Branch + failing test**

```bash
git checkout Development && git pull
git checkout -b feature/wri-error-taxonomy
```

Create `src/lib/errors/classify.test.ts`:

```ts
import { classifyError, ErrorClass } from './classify'

describe('classifyError', () => {
  it('classifies "insufficient funds" as gas-insufficient', () => {
    const c = classifyError(new Error('insufficient funds for gas'))
    expect(c.kind).toBe('gas-insufficient')
    expect(c.retryable).toBe(false)
  })

  it('classifies "execution reverted: slippage" as slippage', () => {
    const c = classifyError(new Error('execution reverted: slippage'))
    expect(c.kind).toBe('slippage')
    expect(c.retryable).toBe(true)
  })

  it('classifies network errors as rpc-timeout retryable', () => {
    const c = classifyError(new Error('Network request failed'))
    expect(c.kind).toBe('rpc-timeout')
    expect(c.retryable).toBe(true)
  })

  it('falls back to unknown for unrecognized errors', () => {
    const c = classifyError(new Error('something weird'))
    expect(c.kind).toBe('unknown')
    expect(c.retryable).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
yarn test src/lib/errors/classify.test.ts
```

- [ ] **Step 3: Implement types**

Create `src/lib/errors/types.ts`:

```ts
export type ErrorKind =
  | 'gas-insufficient'
  | 'slippage'
  | 'revert'
  | 'rpc-timeout'
  | 'user-rejected'
  | 'connectivity'
  | 'app-backgrounded'
  | 'nonce-conflict'
  | 'unknown'

export interface ErrorClass {
  kind: ErrorKind
  message: string
  retryable: boolean
  raw?: unknown
}
```

- [ ] **Step 4: Implement classifier**

Create `src/lib/errors/classify.ts`:

```ts
import type { ErrorClass } from './types'

const PATTERNS: Array<[RegExp, ErrorClass['kind'], boolean]> = [
  [/insufficient funds/i, 'gas-insufficient', false],
  [/slippage|price moved|min.{0,3}received/i, 'slippage', true],
  [/execution reverted/i, 'revert', false],
  [/timeout|deadline|timed out/i, 'rpc-timeout', true],
  [/user rejected|user denied|user cancel/i, 'user-rejected', false],
  [/network request failed|fetch failed/i, 'rpc-timeout', true],
  [/nonce.{0,15}(low|conflict|too low)/i, 'nonce-conflict', true],
]

export function classifyError(err: unknown): ErrorClass {
  const message = err instanceof Error ? err.message : String(err)
  for (const [pattern, kind, retryable] of PATTERNS) {
    if (pattern.test(message)) {
      return { kind, message, retryable, raw: err }
    }
  }
  return { kind: 'unknown', message, retryable: true, raw: err }
}
```

- [ ] **Step 5: Index export**

Create `src/lib/errors/index.ts`:

```ts
export type { ErrorClass, ErrorKind } from './types'
export { classifyError } from './classify'
```

- [ ] **Step 6: Tests pass, build clean**

```bash
yarn test src/lib/errors
yarn build:ts && yarn lint
```

- [ ] **Step 7: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "feat(errors): add blockchain error taxonomy"
git push -u origin feature/wri-error-taxonomy
export GH_TOKEN="$(security find-generic-password -a tucop-finance-classic -s GITHUB_TOKEN -w)"
gh pr create --base Development --title "feat(errors): add blockchain error taxonomy" --body "Single source of truth for transaction error classification. Used by useTransactionInFlight, TransactionResultSheet, and feature retry logic. ErrorClass has kind, message, retryable, raw fields."
gh pr merge --auto --squash --delete-branch
```

---

## Task 2: Retry helper with exponential backoff

A generic retry utility consumed by the saga layer and by the per-feature retry logic.

**Files:**

- Create: `src/lib/retry/retry.ts`
- Create: `src/lib/retry/retry.test.ts`

- [ ] **Step 1: Branch + test**

```bash
git checkout Development && git pull
git checkout -b feature/wri-retry-helper
```

Test:

```ts
import { retryWithBackoff } from './retry'

it('retries 3 times then succeeds on 4th', async () => {
  let n = 0
  const fn = jest.fn().mockImplementation(() => {
    n++
    if (n < 4) throw new Error('transient')
    return 'ok'
  })
  const result = await retryWithBackoff(fn, { maxAttempts: 5, baseMs: 1 })
  expect(result).toBe('ok')
  expect(fn).toHaveBeenCalledTimes(4)
})

it('throws after maxAttempts', async () => {
  const fn = jest.fn().mockRejectedValue(new Error('permanent'))
  await expect(retryWithBackoff(fn, { maxAttempts: 2, baseMs: 1 })).rejects.toThrow('permanent')
})
```

- [ ] **Step 2: Implement**

```ts
export interface RetryOpts {
  maxAttempts: number
  baseMs: number
  shouldRetry?: (err: unknown, attempt: number) => boolean
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) throw err
      if (attempt === opts.maxAttempts - 1) break
      const jitter = Math.random() * opts.baseMs
      await new Promise((r) => setTimeout(r, opts.baseMs * 2 ** attempt + jitter))
    }
  }
  throw lastErr
}
```

- [ ] **Step 3: Verify, PR, auto-merge** (same template as Task 1).

---

## Task 3: PinRequiredGate

A React wrapper that ensures the PIN cache is held for the duration of the wrapped flow. Releases on unmount. Composes with the transactional cache from Plan 02 Task 5.

**Files:**

- Create: `src/components/PinRequiredGate.tsx`
- Create: `src/components/PinRequiredGate.test.tsx`

- [ ] **Step 1: Branch + test + implement + PR**

(Standard pattern: branch, write a test that mounts the gate and verifies `pinTransactional` is called, write the component, verify, PR, auto-merge.)

The component shape:

```tsx
import React, { useEffect } from 'react'
import { useSelector } from 'src/redux/hooks'
import { walletAddressSelector } from 'src/web3/selectors'
import { pinTransactional, endTransactional } from 'src/pincode/PasswordCache'

export function PinRequiredGate({ children }: { children: React.ReactNode }) {
  const address = useSelector(walletAddressSelector)
  useEffect(() => {
    if (!address) return
    pinTransactional(address)
    return () => endTransactional(address)
  }, [address])
  return <>{children}</>
}
```

---

## Task 4: useTransactionInFlight hook (canonical Track A keystone)

This is the keystone abstraction. The S5 spike produced the v4 API verbatim; this task implements it cleanly with tests and documentation.

**Files:**

- Create: `src/lib/useTransactionInFlight/types.ts` (final from S5)
- Create: `src/lib/useTransactionInFlight/slice.ts`
- Create: `src/lib/useTransactionInFlight/selectors.ts`
- Create: `src/lib/useTransactionInFlight/useTransactionInFlight.ts` (final v4 hook)
- Create: `src/lib/useTransactionInFlight/actions.ts` (saga-friendly action creators)
- Create: `src/lib/useTransactionInFlight/useTransactionInFlight.test.tsx`
- Modify: `src/redux/reducers.ts` (add the slice)
- Modify: `src/redux/migrations.ts` (v241 migration adding the empty slice)
- Modify: `src/redux/store.ts` (persist whitelist; transform that scrubs volatile fields)

The full type signatures, hook signature, and action creators are recorded verbatim in [`docs/spikes/s5-tx-in-flight-api.md`](../spikes/s5-tx-in-flight-api.md). Copy the signatures from the S5 outcome doc.

- [ ] **Step 1: Branch + tests**

```bash
git checkout Development && git pull
git checkout -b feature/wri-use-transaction-in-flight
```

Tests cover: state transitions (idle → preparing → submitting → progress → succeeded), partial-failure path (preparing → submitting → progress → partial-failure → retry path), customPoll integration, retryClassifier integration, multi-step flow (steps: 3, advance through each).

- [ ] **Step 2: Implement types** verbatim from S5 outcome doc.

- [ ] **Step 3: Implement slice** as a Redux Toolkit slice keyed by `flowId`.

- [ ] **Step 4: Implement selectors** for `currentByFlow`, `byFlowId`, `flowsInStatus`.

- [ ] **Step 5: Implement hook** with the v4 API:

```ts
export interface UseTransactionInFlightArgs {
  scopeToFlowKind?: FlowKind
  customPoll?: (descriptor: InFlightDescriptor) => Promise<InFlightStatus | null>
  retryClassifier?: (error: unknown) => ErrorClass
}

export interface UseTransactionInFlightResult {
  current: InFlightDescriptor | null
  start: (
    descriptor: Omit<
      InFlightDescriptor,
      'flowId' | 'currentStep' | 'status' | 'retryCount' | 'startedAt'
    >
  ) => string
  advance: (flowId: string, toStatus: InFlightStatus, patch?: Partial<InFlightDescriptor>) => void
  fail: (flowId: string, errorClass: ErrorClass) => void
  retry: (
    flowId: string,
    opts?: {
      freshPreparedTransactions?: SerializableTransactionRequest[]
      featureMetadataPatch?: Record<string, unknown>
    }
  ) => void
  abort: (flowId: string) => void
  classifyError: (error: unknown) => ErrorClass
}
```

- [ ] **Step 6: Action creators** for saga consumption:

```ts
export const inFlightStart = createAction<InFlightDescriptor>('inFlight/start')
export const inFlightAdvance = createAction<{
  flowId: string
  toStatus: InFlightStatus
  patch?: Partial<InFlightDescriptor>
}>('inFlight/advance')
export const inFlightFail = createAction<{ flowId: string; errorClass: ErrorClass }>(
  'inFlight/fail'
)
export const inFlightRetry = createAction<{
  flowId: string
  freshPreparedTransactions?: SerializableTransactionRequest[]
  featureMetadataPatch?: Record<string, unknown>
}>('inFlight/retry')
export const inFlightAbort = createAction<{ flowId: string }>('inFlight/abort')
```

- [ ] **Step 7: Wire into store + migration v241**

- [ ] **Step 8: Tests pass + PR + auto-merge**

---

## Task 5: ConfirmationSheet

A reusable bottom-sheet that displays the "review + confirm + cancel" UI consistently across all transactional features.

**Files:**

- Create: `src/components/ConfirmationSheet.tsx`
- Create: `src/components/ConfirmationSheet.test.tsx`

- [ ] **Step 1: Implement**

```tsx
import React from 'react'
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { View, Text } from 'react-native'

export interface ConfirmationSheetProps {
  visible: boolean
  noun:
    | 'cambio'
    | 'envio'
    | 'retiro a pesos'
    | 'deposito'
    | 'retiro'
    | 'compra de oro'
    | 'venta de oro'
    | 'reclamo'
    | 'operacion'
  reviewRows: Array<{ label: string; value: React.ReactNode }>
  onConfirm: () => void
  onCancel: () => void
  confirmDisabled?: boolean
}

export function ConfirmationSheet(props: ConfirmationSheetProps) {
  // composition of bottom sheet + review rows + confirm button (triggers pre-flight modal of section 6.1.10c)
  // ...
}
```

The pre-flight advisory modal from spec 6.1.10c is integrated as a confirm-side effect: tapping confirm shows the advisory modal first, then proceeds to `onConfirm` on user agreement.

- [ ] **Step 2: Test, PR, auto-merge**

---

## Task 6: TransactionProgressSheet (uses useTransactionInFlight)

The shared progress UI that consumes the `current` descriptor from `useTransactionInFlight` and renders the appropriate state.

**Files:**

- Create: `src/components/TransactionProgressSheet.tsx`
- Create: `src/components/TransactionProgressSheet.test.tsx`

- [ ] **Step 1: Implement**

The sheet observes the in-flight descriptor and switches its UI based on `status`:

- `preparing` → "Preparando tu {noun}..."
- `awaiting-pin` → "Confirma tu PIN para continuar"
- `submitting` → "Enviando tu {noun} a la red..."
- `pending-confirmation` → "Esperando confirmacion de la red..."
- `progress` (multi-step) → "Paso {currentStep + 1} de {steps}"
- `succeeded` → success state (briefly, then auto-dismiss to result sheet)
- `partial-failure` → transition to PartialSuccess / Result sheet

Subscribes to `useConnectivityState` (Plan 02 Task 7). On `isConnected = false`, overlays the yellow connectivity banner per spec 6.1.10c.

- [ ] **Step 2: Test, PR, auto-merge**

---

## Task 7: TransactionResultSheet (uses error taxonomy)

The shared end-state UI. Consumes `lastErrorClass` from the descriptor and the connectivity history to render the warm + empathetic root-cause message from spec section 6.1.10.e.

**Files:**

- Create: `src/components/TransactionResultSheet.tsx`
- Create: `src/components/TransactionResultSheet.test.tsx`
- Modify: `locales/es-419/translation.json` (full table from spec 6.1.10.e)

- [ ] **Step 1: Implement** the mapping table from the spec verbatim.

- [ ] **Step 2: Test, PR, auto-merge**

---

## Task 8: DeepLinkRecovery (composes everything above)

Final piece: the foreground-mount banner that scans for unresolved in-flight descriptors and prompts the user to resume.

This task is implemented in Track B Plan 02 Task 6 (since Track B needs it for the bug fix). Plan 01 just confirms the composition: `DeepLinkRecovery` reads from the `useTransactionInFlight` store (Task 4), uses the error taxonomy (Task 1), and shows a `TransactionResultSheet` (Task 7) when the user taps the banner.

- [ ] **Step 1: Verify integration** in Plan 02 Task 6's PR uses these Track A primitives (cross-track coordination).

- [ ] **Step 2: No standalone PR for Task 8 in Plan 01.**

---

## Track A → Tracks B / C / D migration plan

After Task 4 (useTransactionInFlight) lands on `Development`, the per-feature migrations begin. Each migration is its own PR:

- `feature/wri-migrate-swap-to-in-flight`
- `feature/wri-migrate-dollarsSpend-to-in-flight`
- `feature/wri-migrate-buckspay-to-in-flight`
- `feature/wri-migrate-earn-to-in-flight`
- `feature/wri-migrate-gold-to-in-flight`
- `feature/wri-migrate-send-to-in-flight`
- `feature/wri-migrate-jumpstart-to-in-flight`
- `feature/wri-migrate-subsidies-to-in-flight`

Each migration:

1. Replaces the per-feature in-flight state (if any) with `useTransactionInFlight`.
2. Replaces the per-feature confirmation UI with `<ConfirmationSheet />` if not too feature-specific.
3. Replaces the per-feature progress UI with `<TransactionProgressSheet />`.
4. Replaces the per-feature result UI with `<TransactionResultSheet />`.
5. Plugs into the error taxonomy via `retryClassifier`.

The migrations land sequentially to avoid merge conflicts. Order matches the table above.

---

## Self-Review

### Spec coverage check

| Spec section                     | Plan task                           |
| -------------------------------- | ----------------------------------- |
| 6.1.1 (error taxonomy)           | Task 1                              |
| 6.1.2 (retry helper)             | Task 2                              |
| 6.1.3 (PinRequiredGate)          | Task 3                              |
| 6.1.4 (useTransactionInFlight)   | Task 4 (verbatim from S5)           |
| 6.1.5 (ConfirmationSheet)        | Task 5                              |
| 6.1.6 (TransactionProgressSheet) | Task 6                              |
| 6.1.7 (TransactionResultSheet)   | Task 7                              |
| 6.1.8 (DeepLinkRecovery)         | Task 8 (composed in Plan 02 Task 6) |

### Placeholder scan

No TBD / TODO / FIXME. Tests show pseudo-code that matches existing project patterns (`expectSaga`, `render` from RNTL).

### Type / API consistency

`InFlightDescriptor`, `InFlightStatus`, `ErrorClass`, `FlowKind`, hook signature — all sourced verbatim from `docs/spikes/s5-tx-in-flight-api.md`. Action creator names (`inFlightStart`, etc.) consistent between the actions file and saga callers.

### Open concerns

- Task 4's persist transform must scrub `lastErrorClass.raw` (which may be a non-serializable Error object) before persistence. The transform on rehydrate sets `lastErrorClass.raw = null`. Document this in the slice tests.
- Task 5's `ConfirmationSheet` integration with the pre-flight advisory modal (6.1.10c) is intertwined with Plan 02 Task 7. Coordinate via shared component path.
