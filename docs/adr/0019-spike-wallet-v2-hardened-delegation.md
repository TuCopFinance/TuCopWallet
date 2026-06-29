# ADR-0019: Supersede v1 spike wallet with v2 + hardened delegation

## Status

Accepted

## Date

2026-06-27

## Context

The Sprint 0 spike wallet v1 (`0x4D0d9e458e8a0D0C2c033B1fc2fE5a182837c3D2`)
was delegated via EIP-7702 to an early, unrestricted BatchExecutor
deployed for the S1 experiments. That early contract did not enforce
`msg.sender == address(this)` on `execute()`, so any third party could
call `execute()` on the delegated EOA and sweep funds. The risk was
recognized during the S4 self-audit and confirmed when v1's balance was
subsequently drained (USDm ~0.94 -> 0 and COPm ~2,195 -> 0).

A separate hardened BatchExecutor at
`0xaE6a87E88b55644Eda54C3AA55B11944eE5E1DFe` was deployed under the S4
protocol with the `onlySelf` guard
(`require(msg.sender == address(this))`). v1 could not be re-delegated
without re-exposing its keys, since the old delegation designator could
still be active in cached state.

## Options considered

1. **Re-delegate v1 to the hardened contract**: rejected — keys touched the
   compromised path; an attacker watching the chain could still front-run.
2. **Generate v2 fresh + delegate to hardened contract**: clean slate, keys
   never touched the compromised path.
3. **Use the personal hot wallet for further spikes**: rejected — much
   higher blast radius if any spike script has a bug; defeats the purpose
   of low-stakes R&D wallets.

## Decision

Adopt option 2. Retire v1. Generate v2 fresh and delegate it once to the
hardened BatchExecutor under the S4 audit checklist. All future spike
experiments use v2.

Artifacts:

- v2 EOA: `0x81dCf9160237D0EF0d4db27CFb2EA9743547f882`
- Delegated to (code at EOA):
  `0xef0100ae6a87e88b55644eda54c3aa55b11944ee5e1dfe` (designator pointing
  at the hardened BatchExecutor `0xaE6a87E88b55644Eda54C3AA55B11944eE5E1DFe`)
- Custody: single gitignored file
  [../research/wallets/.wallets.txt](../research/wallets/.wallets.txt),
  chmod 0600. v1 keys kept in the same file as a _cautionary record_,
  not for active use. v1 is treated as "anyone refunding it gets swept".
- Funding policy: v2 balance stays under single-digit USD; refilled from
  the personal hot wallet on demand.
- Rotation policy: if v2 is ever suspected of compromise, generate v3
  with the same hardened delegation and append to `.wallets.txt`. Never
  reuse a retired wallet.

## Consequences

### Positive

- All Sprint 0 follow-up experiments (Track C dogfood, smoke runs) ran
  safely on v2: 8 successful smoke txs verified before Track C merge.
- Single source of truth for R&D wallet state, replacing the four
  fragmented files from the early spike days.
- Pattern documented (file-based custody for low-value R&D wallets;
  3-copy custody for production wallets) is reusable for future spikes.

### Negative

- v1's residual ~0.029 CELO is unrecoverable in practice; anyone who
  re-funds the address gets swept. Acceptable cost for the audit trail.

## References

- [ADR-0015: EIP-7702 + BatchExecutor for atomic dollar spends](0015-eip-7702-batchexecutor-atomic-dollar-spends.md)
- [../research/s4-self-audit-protocol.md](../research/s4-self-audit-protocol.md)
- [../research/wallets/README.md](../research/wallets/README.md)
- [../research/wallets/.wallets.txt](../research/wallets/.wallets.txt) (gitignored)
- Backend sibling wallet (NOT in this repo): WRI delegate-relay
  `0x82C03355D6B44E643e1943b813065D09F207d626`, documented separately
  in TuCOPWallet-Backend.
