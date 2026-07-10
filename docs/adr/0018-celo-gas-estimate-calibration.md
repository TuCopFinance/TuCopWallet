# ADR-0018: Calibrate Celo gas-estimate display to 60% of returned limit

## Status

Accepted

## Date

2026-06-26

## Context

Celo's `eth_estimateGas` RPC returns a gas **limit** with a substantial
safety buffer, not the expected gas **use**. Empirically the returned
limit is roughly 2x the gas actually consumed by the transaction.

The wallet's UI showed "Tarifa de red estimada" by computing
`gasLimit * gasPrice`, so users were told their fee would be ~2x what
they actually paid. To non-technical users this read as overcharging;
side-by-side comparisons with other Celo wallets that quoted
closer-to-actual fees made TuCop look untrustworthy.

Two empirical reference points from production txs:

- Legacy swap tx `0xd29dc1d8...`: `gasLimit = 704,900`, `gasUsed = 347,491`,
  ratio = 0.49.
- Atomic 7702 tx `0xb7aa617c...`: `gasLimit = 965,445`, `gasUsed = 793,860`,
  ratio = 0.82.

## Options considered

1. **Show the raw gas limit**: status quo, ~2x overstatement.
2. **Calibrate to a flat factor**: pick one ratio that balances both flow
   types. Display calibrated estimate; keep `tx.gas` unchanged at submission.
3. **Per-flow calibration**: track a different ratio per tx kind (swap, send,
   7702, etc.). Rejected: harder to maintain, marginal gain.

## Decision

Adopt option 2. After `estimateGas()`, set
`tx._estimatedGasUse = tx.gas * 60 / 100`. The UI displays the calibrated
value; `tx.gas` (the limit) is unchanged at submission. Balance checks
still use the full `tx.gas`, not the calibrated estimate.

Artifacts:

- Modified [src/viem/prepareTransactions.ts](../../src/viem/prepareTransactions.ts).
- `getEstimatedGasFee()` already preferred `_estimatedGasUse` over `gas`
  when present, so the UI pickup was a one-line change.
- Calibration factor 0.60 chosen as flat compromise between the observed
  0.49 (legacy swap) and 0.82 (atomic 7702) ratios.
- Tests updated: 9 expectations across
  [src/viem/prepareTransactions.test.ts](../../src/viem/prepareTransactions.test.ts)
  and [src/swap/SwapScreen.test.tsx](../../src/swap/SwapScreen.test.tsx).
  One `not-enough-balance-for-gas` test had its mocked gas bumped from
  1,000 to 1,500 to preserve the original test intent (it had been
  relying on the inflated estimate).

## Consequences

### Positive

- Displayed fee is within ~±20% of actual fee for typical flows. Users no
  longer perceive the wallet as overcharging.
- Single point of calibration: any future Celo gas-model change is a
  one-line factor update.

### Negative

- The displayed estimate is now an approximation, not a strict upper bound.
  A user who reads it and concludes "I have exactly enough balance for
  fees" could still be 1-2% short on heavy 7702 txs. Mitigation: balance
  checks use `tx.gas`, not the calibrated estimate; the calibration is
  display-only.
- Celo-specific quirk. If the wallet ever expands beyond Celo the factor
  would need re-tuning per chain.

## References

- Verified across the WRI Track C dogfood smoke runs (June 2026); fee
  display matched on-chain fee within tolerance on every observation.
- [src/viem/prepareTransactions.ts](../../src/viem/prepareTransactions.ts)
