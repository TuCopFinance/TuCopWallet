# S5: useTransactionInFlight final API

**Status:** APPROVED
**Date:** 2026-06-16
**Branch:** `spike/wri-s5-tx-in-flight` (NOT merged; throwaway)
**Outcome branch (merged):** `spike/wri-s5-tx-in-flight-outcome`

## Summary

The hook satisfies all three target features (Swap, DollarsSpend, BucksPay)
with the two pre-agreed extension points and no additional escape hatches.
The hook's surface evolved across four iterations (v1 to v4), driven by
three prototype integrations on the throwaway branch.

## Final TypeScript signatures

### `src/lib/useTransactionInFlight/types.ts`

```ts
import type { NetworkId } from 'src/transactions/types'
import type { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'

export type FlowKind =
  | 'swap'
  | 'dollarsSpend'
  | 'send'
  | 'buckspay'
  | 'earn'
  | 'gold'
  | 'jumpstart'
  | 'subsidy'

export type InFlightStatus =
  | 'idle'
  | 'preparing'
  | 'awaiting-pin'
  | 'submitting'
  | 'pending-confirmation'
  | 'progress' // multi-step only
  | 'succeeded'
  | 'partial-failure' // multi-step only
  | 'failed'

export interface ErrorClass {
  kind:
    | 'gas-insufficient'
    | 'slippage'
    | 'revert'
    | 'rpc-timeout'
    | 'user-rejected'
    | 'connectivity'
    | 'app-backgrounded'
    | 'unknown'
  message: string
  retryable: boolean
}

export interface InFlightDescriptor {
  flowId: string
  flowKind: FlowKind
  steps: number // 1 for single-step flows
  currentStep: number // 0-indexed
  status: InFlightStatus
  preparedTransactions: SerializableTransactionRequest[]
  networkId: NetworkId
  lastErrorClass?: ErrorClass
  retryCount: number
  startedAt: number
  // Multi-step: per-step accounting for partial-failure UI.
  completedStepIndices?: number[]
  failedStepIndex?: number | null
  // Optional feature-private blob carried along with the descriptor.
  // E.g. swap stores maxSlippagePercentage; subsidy stores recipientPhone hash.
  pollContext?: Record<string, unknown>
}
```

### `src/lib/useTransactionInFlight/useTransactionInFlight.ts`

```ts
// --- Action creators (saga-friendly) ---
export const inFlightStart = createAction<StartPayload>('inFlight/start')
export const inFlightAdvance = createAction<AdvancePayload>('inFlight/advance')
export const inFlightFail = createAction<FailPayload>('inFlight/fail')
export const inFlightRetry = createAction<RetryPayload>('inFlight/retry')
export const inFlightAbort = createAction<AbortPayload>('inFlight/abort')

// --- Extension point 1: customPoll ---
export type CustomPoll = (descriptor: InFlightDescriptor) => Promise<InFlightStatus | null>

// --- Extension point 2: retryClassifier ---
export type RetryClassifier = (error: unknown) => ErrorClass

// --- Hook ---
export interface UseTransactionInFlightArgs {
  scopeToFlowKind?: InFlightDescriptor['flowKind']
  customPoll?: CustomPoll
  retryClassifier?: RetryClassifier
}

export interface RetryOptions {
  freshPreparedTransactions?: SerializableTransactionRequest[]
  featureMetadataPatch?: Record<string, unknown>
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
  retry: (flowId: string, opts?: RetryOptions) => void
  abort: (flowId: string) => void
  classifyError: (error: unknown) => ErrorClass
}

export function useTransactionInFlight(
  args?: UseTransactionInFlightArgs
): UseTransactionInFlightResult
```

## Extension points (pre-agreed by spec section 5.S5)

1. **`customPoll`**: passed at hook init via `UseTransactionInFlightArgs`.
   Called when the descriptor enters `pending-confirmation`. Returns the
   next `InFlightStatus` or `null` to keep polling.
   Used by BucksPay (24h webhook polling for offramp finalization).

2. **`retryClassifier`**: passed at hook init via `UseTransactionInFlightArgs`.
   Maps a raw error to an `ErrorClass`. Determines whether retry is offered
   and how the failure is labelled in the UI.
   Used by Swap (slippage vs revert vs RPC timeout) and BucksPay
   (POLLING_TIMEOUT vs API connectivity vs on-chain revert).

A `classifyError(error)` helper is exposed on the hook result so feature
code (and feature sagas, via a small wrapper) can derive `ErrorClass`
before dispatching `fail()`.

## Integration evidence

All three prototypes compile against v4 with NO further hook changes.
Tests pass for the three affected modules (65 tests, 0 failures, see
verification below).

| Feature                                                                 | Existing LOC            | Prototype overhead added | Estimated post-migration LOC                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swap (`src/swap/SwapScreen.tsx` + `slice.ts` + `saga.ts` related state) | 1373 + 106 + 335 = 1814 | +14 LOC shadow wiring    | -120 LOC (status / `currentSwap` / `swapStatus` plumbing removed from screen; slice's SwapTask collapsed into in-flight descriptor)                                                           |
| DollarsSpend (`src/dollarsSpend/saga.ts`)                               | 154                     | +35 LOC shadow wiring    | -25 LOC (multiSwapStepSucceeded / multiSwapStepFailed / multiSwapCompleted collapse into `advance()` / `fail()`; `MultiSwapProgressSheet` consumes `current.status` instead of its own slice) |
| BucksPay (`src/buckspay/saga.ts`)                                       | 206                     | +30 LOC shadow wiring    | -40 LOC (`pollStatusSaga` becomes `customPoll`; `resumeTrackingSaga` reads in-flight descriptor instead of bucksPay slice; `BucksPayStatus` screen no longer needs its own selectors)         |

**Verification:**

```text
$ yarn build:ts           # passes
$ yarn lint               # passes
$ yarn test --testPathPattern 'swap/SwapScreen|dollarsSpend/saga|buckspay/saga'
  PASS src/dollarsSpend/saga.test.ts
  PASS src/buckspay/saga.test.ts
  PASS src/swap/SwapScreen.test.tsx
  Tests: 65 passed, 65 total
```

## Gaps captured during prototyping

- [s5-gaps-swap.txt](s5-gaps-swap.txt) — 6 gaps (A1-A6); 1 already resolved without API change, 5 drove v2 changes.
- [s5-gaps-dollarsSpend.txt](s5-gaps-dollarsSpend.txt) — 6 gaps (B1-B6); 3 drove v3 changes (action creator exports), 3 resolved with documentation.
- [s5-gaps-buckspay.txt](s5-gaps-buckspay.txt) — 6 gaps (C1-C6); 2 drove the v4 extension points (customPoll, retryClassifier), 4 resolved with the saga-channel pattern.

## Evolution trail

| Iteration | Trigger                      | What changed                                                                                                                                                                            |
| --------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1        | Initial skeleton             | bare `start/advance/retry/abort`                                                                                                                                                        |
| v2        | Swap gaps A1, A2, A5, A6     | added `fail()`, `RetryOptions.freshPreparedTransactions`, moved `flowKind` from hook args to `start()` so one hook hosts multiple kinds (e.g. SwapScreen can fire swap OR dollarsSpend) |
| v3        | DollarsSpend gaps B1, B2, B5 | exported `inFlightStart/Advance/Fail/Retry/Abort` action creators for saga `put()` access; documented multi-step advance pattern; documented nested flow rule                           |
| v4        | BucksPay gaps C1-C5          | added the two pre-agreed extension points: `customPoll` and `retryClassifier`; added `classifyError()` result helper                                                                    |

## Verdict

**APPROVED.** The v4 API satisfies all three integration cases with only the
two pre-agreed extension points (`customPoll`, `retryClassifier`) plus the
standard hook surface. No third escape hatch was needed.

## Implications for Track A

- Spec section 6.1.4 updated with the final type signatures.
- Track A's `useTransactionInFlight` production PR uses this branch as a
  starting reference. Production work needs:

  1. Real `src/redux/inFlightSlice.ts` reducer that handles the five
     action creators.
  2. A small `inFlightSaga.ts` that owns the polling tick scheduler
     (delegates to `customPoll` registered via a saga-channel registry
     keyed by `flowKind` — see s5-gaps-buckspay.txt GAP C3).
  3. Unit tests for the reducer and the hook (jest + @testing-library/react).
  4. Per-feature retryClassifier implementations:
     - `src/swap/inFlightClassifier.ts` (slippage / revert / RPC)
     - `src/buckspay/inFlightClassifier.ts` (POLLING_TIMEOUT / connectivity / revert)
     - `src/dollarsSpend/inFlightClassifier.ts` (delegates to swap classifier per step)

- Migration plan per feature (one PR each, in order):
  1. Land the slice + hook + tests (no feature uses it yet).
  2. Migrate Swap (smallest blast radius, single-step).
  3. Migrate BucksPay (proves customPoll + retryClassifier end-to-end).
  4. Migrate DollarsSpend (proves multi-step + partial-failure).
  5. Migrate Send / Earn / Gold / Jumpstart / Subsidy (uses the same patterns).
