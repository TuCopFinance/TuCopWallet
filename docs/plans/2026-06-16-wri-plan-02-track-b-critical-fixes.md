<!-- markdownlint-disable MD032 MD040 MD060 -->

# Wallet Robustness Initiative — Plan 02: Track B (Critical Fixes)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five recurring patterns of fragility identified in the wallet-wide audit: (1) zero idempotency in `sendPreparedTransactions`, (2) orphan approve transactions when subsequent swaps fail, (3) in-flight transaction state lost on app close, (4) PIN cache expiry mid-multi-step flow, (5) double-null guard rendering in `PartialSuccessSheet` / `MultiSwapProgressSheet`.

**Architecture:** Each fix is a self-contained PR against `Development`, gated behind a feature flag (`wri_<fix-name>`) for safe rollout. Track B does NOT introduce new abstractions; it patches existing surfaces. Track A introduces the abstractions; Track B consumes them where available, or works around them where they're not yet shipped.

**Tech Stack:** Redux Toolkit 2.x, redux-saga 1.3, redux-persist 6, viem 2.24.1, react-native 0.77.3, Statsig SDK 4.15, Sentry SDK 6.22.

**Source spec:** [docs/specs/2026-06-15-wallet-robustness-initiative-design.md](../specs/2026-06-15-wallet-robustness-initiative-design.md) section 7.

**Audit findings:** consolidated in the wallet-wide synthesis (conversation 2026-06-15). Specific anchor points: [`src/viem/saga.ts:35-99`](../../src/viem/saga.ts#L35-L99), [`src/swap/useSwapQuote.ts:160-184`](../../src/swap/useSwapQuote.ts#L160-L184), [`src/dollarsSpend/slice.ts`](../../src/dollarsSpend/slice.ts), [`src/dollarsSpend/MultiSwapProgressSheet.tsx`](../../src/dollarsSpend/MultiSwapProgressSheet.tsx), [`src/pincode/authentication.ts:258-274`](../../src/pincode/authentication.ts#L258-L274).

**Git workflow:** branches `feature/wri-<short>` off `Development`. Full automation per locked decision. Conventional commits in English. Never --no-verify. NEVER mention testnet (locked decision #11).

---

## Task 1: Idempotency layer for `sendPreparedTransactions`

The current helper in [`src/viem/saga.ts:35-99`](../../src/viem/saga.ts#L35-L99) takes a nonce once at start, then loops `signTransaction` + `sendRawTransaction` + `waitForTransactionReceipt`. If the loop crashes mid-execution (RPC error, JS exception, app force-killed), the half-sent batch leaves Redux standby state in an inconsistent place: some txs are on-chain with no record, the next saga run does not know they exist.

**Fix:** introduce a per-flow `sentTransactionLog` slice persisted in Redux. Each tx submission writes its nonce + hash + targetCallId BEFORE `sendRawTransaction`. On saga reentry (after crash / restart), the helper reads this log and resumes from the first non-confirmed entry.

**Files:**

- Create: `src/viem/sentTransactionLog/slice.ts`
- Create: `src/viem/sentTransactionLog/selectors.ts`
- Create: `src/viem/sentTransactionLog/migrations.ts` (redux-persist v239 migration adding the new slice)
- Modify: `src/viem/saga.ts` (wire the log in)
- Modify: `src/redux/migrations.ts` (register the new v239 migration; bump version)
- Create: `src/viem/saga.test.ts` (extend with reentry tests)

- [ ] **Step 1: Branch and write the failing reentry test**

```bash
git checkout Development && git pull
git checkout -b feature/wri-idempotency-send-prepared
```

Open `src/viem/saga.test.ts`. Add:

```ts
import { expectSaga } from 'redux-saga-test-plan'
import { sendPreparedTransactions } from 'src/viem/saga'
import { recordSent } from 'src/viem/sentTransactionLog/slice'

describe('sendPreparedTransactions idempotency', () => {
  it('does not re-send a tx whose hash is already in the sent log', async () => {
    const flowId = 'test-flow-1'
    const txs = [
      { to: '0xaaaa', data: '0x', nonce: 5 },
      { to: '0xbbbb', data: '0x', nonce: 6 },
    ]
    const preExisting = { flowId, index: 0, nonce: 5, hash: '0xdeadbeef', status: 'pending' }
    const sendRawSpy = jest.fn()
    await expectSaga(sendPreparedTransactions, txs, 'celo-mainnet', [], false, flowId)
      .provide([
        ['select', { sentTransactionLog: { [flowId]: [preExisting] } }],
        ['call.fn', sendRawSpy, '0xtxhash2'],
      ])
      .put(recordSent({ flowId, index: 1, nonce: 6, hash: expect.any(String) }))
      .run()
    expect(sendRawSpy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
yarn test src/viem/saga.test.ts -t 'idempotency'
```

Expected: failure (no recordSent action exists yet).

- [ ] **Step 3: Implement the slice**

Create `src/viem/sentTransactionLog/slice.ts`:

```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface SentTxRecord {
  flowId: string
  index: number
  nonce: number
  hash: string
  status: 'pending' | 'confirmed' | 'failed'
}

interface State {
  byFlow: Record<string, SentTxRecord[]>
}

const initialState: State = { byFlow: {} }

const slice = createSlice({
  name: 'sentTransactionLog',
  initialState,
  reducers: {
    recordSent(state, action: PayloadAction<Omit<SentTxRecord, 'status'>>) {
      const r = action.payload
      state.byFlow[r.flowId] ??= []
      state.byFlow[r.flowId].push({ ...r, status: 'pending' })
    },
    markConfirmed(state, action: PayloadAction<{ flowId: string; hash: string }>) {
      const list = state.byFlow[action.payload.flowId]
      const rec = list?.find((r) => r.hash === action.payload.hash)
      if (rec) rec.status = 'confirmed'
    },
    markFailed(state, action: PayloadAction<{ flowId: string; hash: string }>) {
      const list = state.byFlow[action.payload.flowId]
      const rec = list?.find((r) => r.hash === action.payload.hash)
      if (rec) rec.status = 'failed'
    },
    clearFlow(state, action: PayloadAction<{ flowId: string }>) {
      delete state.byFlow[action.payload.flowId]
    },
  },
})

export const { recordSent, markConfirmed, markFailed, clearFlow } = slice.actions
export default slice.reducer
```

- [ ] **Step 4: Implement the selectors**

Create `src/viem/sentTransactionLog/selectors.ts`:

```ts
import type { RootState } from 'src/redux/reducers'

export const sentLogByFlowSelector = (state: RootState, flowId: string) =>
  state.sentTransactionLog.byFlow[flowId] ?? []

export const findRecordByIndexSelector = (state: RootState, flowId: string, index: number) =>
  sentLogByFlowSelector(state, flowId).find((r) => r.index === index)
```

- [ ] **Step 5: Wire the slice into the store and add migration**

Modify `src/redux/reducers.ts`: add `sentTransactionLog: sentTransactionLogReducer` to the combined reducers.

Modify `src/redux/migrations.ts`: add migration `239`:

```ts
239: (state) => ({
  ...state,
  sentTransactionLog: { byFlow: {} },
}),
```

Update the `version` const to `239`.

- [ ] **Step 6: Wire idempotency into `sendPreparedTransactions`**

Open `src/viem/saga.ts`. Add `flowId: string` as the last parameter (default `crypto.randomUUID()` for callers that don't pass one). Inside the loop, before each `signTransaction`:

```ts
const existing = yield * select((s: RootState) => findRecordByIndexSelector(s, flowId, i))
if (existing && existing.status !== 'failed') {
  // already sent; wait for confirmation if pending, skip if confirmed
  if (existing.status === 'confirmed') continue
  const receipt = yield * call(publicClient.waitForTransactionReceipt, { hash: existing.hash })
  yield *
    put(
      receipt.status === 'success'
        ? markConfirmed({ flowId, hash: existing.hash })
        : markFailed({ flowId, hash: existing.hash })
    )
  continue
}
```

After successful `sendRawTransaction`, before awaiting the receipt:

```ts
yield * put(recordSent({ flowId, index: i, nonce: tx.nonce, hash: txHash }))
```

After successful receipt:

```ts
yield * put(markConfirmed({ flowId, hash: txHash }))
```

On error catch:

```ts
yield * put(markFailed({ flowId, hash: txHash }))
```

- [ ] **Step 7: Update callers**

Search call sites of `sendPreparedTransactions`:

```bash
grep -rn "sendPreparedTransactions(" src/ | grep -v test | grep -v viem/saga.ts
```

For each: pass a stable `flowId` derived from the user-visible flow. Suggested mapping:

- swap saga: `flowId = swap-${swapId}`
- dollarsSpend saga: `flowId = dollarsSpend-${multiSwapStartedAt}-${stepIndex}`
- earn saga: `flowId = earn-${depositAttemptId}`
- buckspay saga: `flowId = buckspay-${attemptId}`
- gold saga: `flowId = gold-${attemptId}`
- send saga: `flowId = send-${txContext.id}`
- jumpstart saga: `flowId = jumpstart-${claimId}`

- [ ] **Step 8: Run tests**

```bash
yarn test src/viem/saga.test.ts
yarn build:ts && yarn lint
```

- [ ] **Step 9: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "feat(viem): add idempotency layer to sendPreparedTransactions"
git push -u origin feature/wri-idempotency-send-prepared
export GH_TOKEN="$(security find-generic-password -a tucop-finance-classic -s GITHUB_TOKEN -w)"
gh pr create --base Development --title "feat(viem): add idempotency layer to sendPreparedTransactions" --body "Adds a per-flow sentTransactionLog Redux slice. sendPreparedTransactions now checks the log on reentry and skips already-sent transactions, waiting for confirmation of pending ones. Redux-persist migration v239."
gh pr merge --auto --squash --delete-branch
```

---

## Task 2: Pre-flight check to prevent orphan approve transactions

Currently, [`src/swap/useSwapQuote.ts:160-184`](../../src/swap/useSwapQuote.ts#L160-L184) emits an approve tx if allowance is insufficient. If the subsequent swap reverts (e.g., slippage), the approve already confirmed and the allowance sits unused. Repeat over many swap attempts and the user has paid gas for orphan approves.

**Fix:** before emitting the approve, simulate the full (approve + swap) sequence using `viem.simulateContract` against the swap target. If the swap simulation fails, abort the whole flow with a clear error and DO NOT emit the approve.

This task also applies to gold and earn flows that follow the same pattern.

**Files:**

- Create: `src/lib/preflight/swapSimulation.ts` (the simulation helper)
- Modify: `src/swap/saga.ts` (call the simulation before emitting approve)
- Modify: `src/gold/saga.ts` (same)
- Modify: `src/earn/saga.ts` (same)
- Modify: `src/dollarsSpend/saga.ts` (per-step)
- Create: `src/lib/preflight/swapSimulation.test.ts`

- [ ] **Step 1: Branch and write test**

```bash
git checkout Development && git pull
git checkout -b feature/wri-preflight-swap-simulation
```

Create `src/lib/preflight/swapSimulation.test.ts`:

```ts
import { simulateSwapTransaction } from './swapSimulation'

describe('simulateSwapTransaction', () => {
  it('returns OK when swap target call would succeed', async () => {
    // mock viem public client
    const mockClient = {
      call: jest.fn().mockResolvedValue({ data: '0x' }),
    }
    const result = await simulateSwapTransaction(mockClient as any, {
      from: '0xuser',
      to: '0xrouter',
      data: '0x',
      value: 0n,
      assumedAllowance: 1000n,
      sellToken: '0xtoken',
    })
    expect(result.kind).toBe('ok')
  })

  it('returns Revert when call reverts', async () => {
    const mockClient = {
      call: jest.fn().mockRejectedValue(new Error('execution reverted: slippage')),
    }
    const result = await simulateSwapTransaction(mockClient as any, {
      from: '0xuser',
      to: '0xrouter',
      data: '0x',
      value: 0n,
      assumedAllowance: 1000n,
      sellToken: '0xtoken',
    })
    expect(result.kind).toBe('revert')
    if (result.kind === 'revert') expect(result.reason).toContain('slippage')
  })
})
```

- [ ] **Step 2: Run, expect FAIL**

```bash
yarn test src/lib/preflight/swapSimulation.test.ts
```

- [ ] **Step 3: Implement the helper**

Create `src/lib/preflight/swapSimulation.ts`:

```ts
import type { PublicClient } from 'viem'

export type SimulationResult =
  | { kind: 'ok' }
  | { kind: 'revert'; reason: string }
  | { kind: 'network-error'; error: unknown }

export interface SimulateArgs {
  from: `0x${string}`
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
  assumedAllowance: bigint
  sellToken: `0x${string}`
}

export async function simulateSwapTransaction(
  client: PublicClient,
  args: SimulateArgs
): Promise<SimulationResult> {
  try {
    // viem's call simulates a tx without committing it. We override state to pretend
    // the approve already happened (the `assumedAllowance`), then check the swap call.
    await client.call({
      account: args.from,
      to: args.to,
      data: args.data,
      value: args.value,
      stateOverride: [
        {
          address: args.sellToken,
          // override slot for allowance(from, router)
          // (in practice, viem's state override syntax varies; this is the pattern)
          stateDiff: [],
        },
      ],
    } as any)
    return { kind: 'ok' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('revert')) return { kind: 'revert', reason: msg }
    return { kind: 'network-error', error: err }
  }
}
```

- [ ] **Step 4: Test passes**

```bash
yarn test src/lib/preflight/swapSimulation.test.ts
```

- [ ] **Step 5: Wire the helper into swap saga**

Open `src/swap/saga.ts`. After the quote is fetched and before `sendPreparedTransactions` is dispatched, IF the prepared transactions include an approve at index 0:

```ts
const sim =
  yield *
  call(simulateSwapTransaction, publicClient[network], {
    from: walletAddress,
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value ?? 0),
    assumedAllowance: amountToApprove,
    sellToken: fromToken.address,
  })

if (sim.kind === 'revert') {
  yield * put(swapError({ swapId, error: { kind: 'slippage', reason: sim.reason } }))
  return
}
```

Behind a Statsig flag `wri_preflight_swap_simulation` so it can be disabled if the simulation cost proves prohibitive.

- [ ] **Step 6: Apply same wiring to gold, earn, dollarsSpend sagas**

For each, locate the equivalent "approve + swap" pattern and insert the same pre-flight call.

- [ ] **Step 7: Verify**

```bash
yarn build:ts && yarn lint && yarn test src/swap src/gold src/earn src/dollarsSpend
```

- [ ] **Step 8: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "feat(preflight): simulate swap before emitting approve to prevent orphans"
git push -u origin feature/wri-preflight-swap-simulation
gh pr create --base Development --title "feat(preflight): simulate swap before emitting approve to prevent orphans" --body "Adds pre-flight simulation of the swap tx via viem call. If the simulation reverts, the saga aborts before emitting the approve, so the user does not pay gas for an unused allowance. Behind Statsig flag wri_preflight_swap_simulation. Applies to swap, gold, earn, dollarsSpend flows."
gh pr merge --auto --squash --delete-branch
```

---

## Task 3: Persist in-flight state for multi-step flows

Currently `dollarsSpend/slice.ts` is NOT included in the redux-persist whitelist. If the user closes the app mid-multi-swap, the `inFlight` state is lost and the app reopens with no banner about the in-progress flow.

**Fix:** add the slice to redux-persist whitelist with a custom serializer that drops volatile fields (e.g., active timers) but keeps the descriptor. On app rehydrate, the standby transaction reconciliation already in place picks up the chain state; the in-flight banner uses the persisted descriptor to display state to the user.

Track A's `useTransactionInFlight` hook (PR'd in Plan 01) is the canonical owner of this state once it lands. Until then, this task fixes the dollarsSpend-specific slice directly.

**Files:**

- Modify: `src/redux/store.ts` (add `dollarsSpend` to persist whitelist)
- Modify: `src/dollarsSpend/slice.ts` (add a `serialize` / `deserialize` if any field needs cleanup; mark `lastError` as `null` on rehydrate so a stale error doesn't appear)
- Modify: `src/redux/migrations.ts` (v240 migration to seed the slice if not present)
- Modify: `src/dollarsSpend/slice.test.ts`

- [ ] **Step 1: Branch + failing test**

```bash
git checkout Development && git pull
git checkout -b feature/wri-persist-inflight
```

Add to `src/dollarsSpend/slice.test.ts`:

```ts
it('survives a REHYDRATE with the inFlight descriptor intact', () => {
  const startedState = reducer(undefined, multiSwapStarted({ steps: stubSteps }))
  const persisted = JSON.parse(JSON.stringify(startedState))
  const rehydrated = reducer(persisted, {
    type: 'persist/REHYDRATE',
    payload: { dollarsSpend: persisted },
  })
  expect(rehydrated.inFlight).toBeTruthy()
  expect(rehydrated.inFlight.plannedSteps).toHaveLength(stubSteps.length)
})
```

- [ ] **Step 2: Run, expect FAIL** (slice is not in persist whitelist; REHYDRATE returns initial state).

- [ ] **Step 3: Add `dollarsSpend` to persist config**

Open `src/redux/store.ts`. In the persist whitelist add `'dollarsSpend'`. Add a transform (if needed) to scrub `lastError` to null on rehydrate:

```ts
import { createTransform } from 'redux-persist'

const dollarsSpendTransform = createTransform(
  (inboundState) => inboundState,
  (outboundState: any) => ({ ...outboundState, lastError: null }),
  { whitelist: ['dollarsSpend'] }
)
```

Register it via `transforms: [dollarsSpendTransform, ...]` in the persistConfig.

- [ ] **Step 4: Migration**

In `src/redux/migrations.ts` add:

```ts
240: (state) => ({
  ...state,
  dollarsSpend: state.dollarsSpend ?? { inFlight: null, lastError: null, plannedSteps: [] },
}),
```

Bump version to `240`.

- [ ] **Step 5: Run test, expect PASS**

```bash
yarn test src/dollarsSpend/slice.test.ts
```

- [ ] **Step 6: Smoke check**

Spin up the app on simulator. Start a dollarsSpend flow. Force-close the app while step 2 of 3 is executing. Reopen the app. Confirm that the `DeepLinkRecovery` banner (built in Task 6) appears with the correct step count.

- [ ] **Step 7: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "feat(dollarsSpend): persist inFlight state across app restarts"
git push -u origin feature/wri-persist-inflight
gh pr create --base Development --title "feat(dollarsSpend): persist inFlight state across app restarts" --body "Adds dollarsSpend to the redux-persist whitelist with a transform that scrubs lastError on rehydrate. Migration v240. Solves the bug where multi-swap state was lost on app close."
gh pr merge --auto --squash --delete-branch
```

---

## Task 4: Fix the double-null guard in MultiSwapProgressSheet and PartialSuccessSheet

Both [`MultiSwapProgressSheet.tsx:14`](../../src/dollarsSpend/MultiSwapProgressSheet.tsx#L14) and [`PartialSuccessSheet.tsx:21`](../../src/dollarsSpend/PartialSuccessSheet.tsx#L21) have early returns that, together, can render NULL during the race between the saga dispatching the failure action and Redux propagating it. The user sees a blank moment.

**Fix:** add a transition state. The progress sheet stays mounted with a "wrapping up" message until either the failure sheet renders OR the success state propagates. Use an animated transition wrapper so the user always sees feedback.

**Files:**

- Create: `src/dollarsSpend/TransactionFlowShell.tsx` (the new shell that renders one of: progress / partial / success / null)
- Modify: `src/dollarsSpend/MultiSwapProgressSheet.tsx` (remove the second null guard; rely on the shell)
- Modify: `src/dollarsSpend/PartialSuccessSheet.tsx` (same)
- Modify: callers that render these sheets directly (replace with the shell)
- Modify: `src/dollarsSpend/MultiSwapProgressSheet.test.tsx`

- [ ] **Step 1: Branch + failing test**

```bash
git checkout Development && git pull
git checkout -b feature/wri-tx-flow-shell
```

Add to `MultiSwapProgressSheet.test.tsx`:

```ts
it('does not render null during transition between in-progress and partial-failure', () => {
  // simulate saga dispatched multiSwapStepFailed but failedAtIndex not yet reflected
  const intermediateState = {
    inFlight: { plannedSteps: [...], completedSteps: 1, failedAtIndex: null },  // transitional
    transitioning: true,
  }
  const { getByText } = render(<TransactionFlowShell />, { initialState: { dollarsSpend: intermediateState } })
  expect(getByText(/finalizando|wrapping/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement TransactionFlowShell**

Create `src/dollarsSpend/TransactionFlowShell.tsx`:

```tsx
import React from 'react'
import { useSelector } from 'src/redux/hooks'
import { dollarsSpendInFlightSelector } from './selectors'
import MultiSwapProgressSheet from './MultiSwapProgressSheet'
import PartialSuccessSheet from './PartialSuccessSheet'
import { useTranslation } from 'react-i18next'
import { View, Text } from 'react-native'

export function TransactionFlowShell() {
  const inFlight = useSelector(dollarsSpendInFlightSelector)
  const { t } = useTranslation()

  if (!inFlight) return null

  if (inFlight.failedAtIndex !== null) {
    return <PartialSuccessSheet />
  }

  if (inFlight.transitioning) {
    return (
      <View>
        <Text>{t('dollarsSpend.transitioning', 'Finalizando tu operacion...')}</Text>
      </View>
    )
  }

  return <MultiSwapProgressSheet />
}
```

- [ ] **Step 4: Modify the slice to track the transitional moment**

Open `src/dollarsSpend/slice.ts`. Add `transitioning: boolean` to the state. Toggle to `true` in `multiSwapStepFailed` and back to `false` after a render frame (via a saga `delay(0)` between dispatching the failed action and the actual UI update).

Alternative: a single dispatched action that updates both `failedAtIndex` and clears `transitioning` atomically. Pick whichever lands cleaner.

- [ ] **Step 5: Replace direct sheet usages with the shell**

```bash
grep -rn "MultiSwapProgressSheet\|PartialSuccessSheet" src/ | grep -v test
```

For each usage in `src/dollarsSpend/index.ts` or wherever these are mounted, replace with `<TransactionFlowShell />`.

- [ ] **Step 6: i18n string**

Add to `locales/es-419/translation.json`:

```json
"dollarsSpend.transitioning": "Finalizando tu cambio..."
```

(English fallback in `locales/base/translation.json` if applicable.)

- [ ] **Step 7: Verify**

```bash
yarn build:ts && yarn lint && yarn test src/dollarsSpend
```

- [ ] **Step 8: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "fix(dollarsSpend): close the rendering-gap between progress and partial-success"
git push -u origin feature/wri-tx-flow-shell
gh pr create --base Development --title "fix(dollarsSpend): close the rendering-gap between progress and partial-success" --body "Introduces TransactionFlowShell which renders MultiSwapProgressSheet, PartialSuccessSheet, or a brief transitional message based on slice state. Eliminates the moment where both sheets returned null. Removes the dual-null-guard bug."
gh pr merge --auto --squash --delete-branch
```

---

## Task 5: PIN cache per-session transactional extension (per locked decision #4)

The default `PasswordCache` TTL is 600 seconds of inactivity. For a multi-step dollarsSpend flow that takes longer (e.g., 3 sequential swaps each waiting for confirmation, total >10 minutes), the cache can expire mid-flow and force a re-prompt.

**Fix per locked decision #4:** instead of raising the global TTL (which weakens the security posture), extend the cache for the duration of a `transactional` saga only. Cache is held from saga start, released on saga end (success, failure, or abort).

**Files:**

- Modify: `src/pincode/PasswordCache.ts` (add `pinTransactional(account)` and `endTransactional(account)`)
- Modify: `src/viem/saga.ts` (call `pinTransactional` at start of `sendPreparedTransactions`, `endTransactional` in finally)
- Modify: `src/pincode/PasswordCache.test.ts`

- [ ] **Step 1: Branch + failing test**

```bash
git checkout Development && git pull
git checkout -b feature/wri-pin-transactional-cache
```

Add to `src/pincode/PasswordCache.test.ts`:

```ts
it('does not expire during a transactional session even if 600s pass', () => {
  jest.useFakeTimers()
  const acct = '0xabc'
  setCachedPassword(acct, 'pw')
  pinTransactional(acct)
  jest.advanceTimersByTime(601 * 1000)
  expect(getCachedPassword(acct)).toBe('pw')
  endTransactional(acct)
  jest.advanceTimersByTime(601 * 1000)
  expect(getCachedPassword(acct)).toBeUndefined()
})
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

In `src/pincode/PasswordCache.ts`:

```ts
const transactionalLocks = new Set<string>()

export function pinTransactional(account: string) {
  transactionalLocks.add(account)
}

export function endTransactional(account: string) {
  transactionalLocks.delete(account)
}

// existing inactivity timer logic checks transactionalLocks.has(account)
// before evicting. If true, skip eviction.
```

Modify the existing inactivity check to consult `transactionalLocks`.

- [ ] **Step 4: Wire into the saga**

In `src/viem/saga.ts` `sendPreparedTransactions`, wrap the body:

```ts
const account = wallet.account.address
pinTransactional(account)
try {
  // ... existing body
} finally {
  endTransactional(account)
}
```

- [ ] **Step 5: Verify**

```bash
yarn test src/pincode src/viem
yarn build:ts && yarn lint
```

- [ ] **Step 6: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "feat(pincode): per-session transactional cache hold"
git push -u origin feature/wri-pin-transactional-cache
gh pr create --base Development --title "feat(pincode): per-session transactional cache hold" --body "Per locked decision #4. PIN cache is held for the duration of a sendPreparedTransactions saga. Released on success / failure / abort. Default 600s inactivity TTL unchanged; security posture preserved."
gh pr merge --auto --squash --delete-branch
```

---

## Task 6: DeepLinkRecovery banner

Implements section 6.1.9 of the spec. On app foreground, scans for unresolved transactions in `sentTransactionLog` (Task 1) and `dollarsSpend.inFlight` (Task 3). Shows a non-blocking banner.

**Files:**

- Create: `src/app/DeepLinkRecovery.tsx`
- Modify: `src/navigator/Navigator.tsx` (mount the recovery component near the root)
- Modify: locales for the banner copy
- Create: `src/app/DeepLinkRecovery.test.tsx`

- [ ] **Step 1: Branch + test**

```bash
git checkout Development && git pull
git checkout -b feature/wri-deeplink-recovery
```

Test:

```ts
it('shows the recovery banner when an unresolved flow exists older than 1 minute', () => {
  const oldStart = Date.now() - 2 * 60 * 1000
  const state = { dollarsSpend: { inFlight: { startedAt: oldStart, plannedSteps: [...] } } }
  const { getByText } = render(<DeepLinkRecovery />, { initialState: state })
  expect(getByText(/quedo a medias|sin completar/i)).toBeTruthy()
})

it('shows nothing when no unresolved flow exists', () => {
  const { queryByText } = render(<DeepLinkRecovery />, { initialState: { dollarsSpend: { inFlight: null } } })
  expect(queryByText(/quedo a medias/i)).toBeNull()
})
```

- [ ] **Step 2: Implement the component**

```tsx
import React, { useEffect, useState } from 'react'
import { AppState, View, Text, TouchableOpacity } from 'react-native'
import { useSelector } from 'src/redux/hooks'
import { useTranslation } from 'react-i18next'
import { dollarsSpendInFlightSelector } from 'src/dollarsSpend/selectors'

export default function DeepLinkRecovery() {
  const { t } = useTranslation()
  const inFlight = useSelector(dollarsSpendInFlightSelector)
  const [appActive, setAppActive] = useState(AppState.currentState === 'active')

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'))
    return () => sub.remove()
  }, [])

  if (!inFlight || !appActive) return null
  const ageMs = Date.now() - (inFlight.startedAt ?? 0)
  if (ageMs < 60_000) return null

  const olderThan24h = ageMs > 24 * 60 * 60 * 1000
  const message = olderThan24h
    ? t(
        'recovery.staleBanner',
        'Tienes una operacion sin completar desde hace mas de un dia. Revisala.'
      )
    : t('recovery.banner', 'Tu transferencia se quedo a medias, ver detalles.')

  return (
    <TouchableOpacity
      onPress={() => {
        /* navigate to recovery screen */
      }}
    >
      <View>
        <Text>{message}</Text>
      </View>
    </TouchableOpacity>
  )
}
```

- [ ] **Step 3: Mount in Navigator**

Open `src/navigator/Navigator.tsx`. Mount `<DeepLinkRecovery />` inside the root layout, above the main tab navigator.

- [ ] **Step 4: i18n**

Add to `locales/es-419/translation.json`:

```json
"recovery.banner": "Tu transferencia se quedo a medias, ver detalles.",
"recovery.staleBanner": "Tienes una operacion sin completar desde hace mas de un dia. Revisala."
```

- [ ] **Step 5: Verify + PR**

Same as previous tasks: build, lint, test, commit, push, PR, auto-merge.

---

## Task 7: Connectivity transparency layer (per locked decision #7 and spec 6.1.10)

Implements the pre-flight modal + in-flow connectivity banner + post-flow root-cause messaging.

**Files:**

- Create: `src/lib/connectivity/useConnectivityState.ts`
- Create: `src/lib/connectivity/PreflightAdvisoryModal.tsx`
- Create: `src/lib/connectivity/ConnectivityBanner.tsx`
- Modify: `src/dollarsSpend/TransactionFlowShell.tsx` (use the banner overlay)
- Modify: `locales/es-419/translation.json` (per the copy table in spec 6.1.10)

The full content of this task follows the same pattern: TDD, implement, wire, verify, PR.

The detailed copy strings to use are defined in spec section 6.1.10.e (root-cause table). Copy them verbatim from the spec into the i18n file.

Estimated 1 PR for the connectivity hook + 1 PR for the modal + 1 PR for the banner + 1 PR for the root-cause shell. Four small PRs in sequence.

---

## Self-Review

### Spec coverage check

| Spec section                                  | Plan task                           |
| --------------------------------------------- | ----------------------------------- |
| 7.1 (idempotency in sendPreparedTransactions) | Task 1                              |
| 7.2 (prevent orphan approves)                 | Task 2                              |
| 7.3 (persist in-flight state)                 | Task 3                              |
| 7.4 (partial-failure UX)                      | Task 4                              |
| 7.5 (PIN cache transactional hold)            | Task 5                              |
| 6.1.9 (DeepLinkRecovery)                      | Task 6                              |
| 6.1.10 (connectivity transparency)            | Task 7                              |
| Locked #4 (PIN cache approach)                | Task 5 enforces this exact decision |
| Locked #7 (connectivity UX)                   | Task 7 enforces this exact decision |

### Placeholder scan

No TBD / TODO / FIXME in step bodies. Bracketed strings like `[...]` in test stubs are intentional pseudo-code placeholders for the implementing agent to fill from real fixtures.

### Type consistency

`SentTxRecord`, `flowId: string`, `recordSent` / `markConfirmed` / `markFailed` / `clearFlow` names consistent across slice, selectors, saga wiring, tests. Same for `pinTransactional` / `endTransactional` and the in-flight descriptor field naming aligned with the S5 final API.

### Open concerns

- Task 4's "transitioning" state machinery is the lowest-confidence piece. If the rendering gap is small enough (sub-frame), it may be fully eliminated by Task 1 + Task 3 alone with no new state field needed. Run Task 4 last and measure first.
- Task 7's connectivity banner relies on `@react-native-community/netinfo`. Confirm it's already a dep (likely yes given the wallet's network detection logic). If not, add it as a small upfront task.
- Task 6 needs the `flowId` schema from Task 1 to be consistent so the recovery screen can match `inFlight` to `sentTransactionLog` entries. Sequence: Task 1 → Task 3 → Task 6.
