# ADR-0015: Atomic dollar spends via EIP-7702 + hardened BatchExecutor

## Status

Accepted

## Date

2026-06-28

## Context

TuCop's dollar-spend flow (Dolares -> Pesos and the broader USDm/USDC/USDT
spending paths) historically chained multiple transactions: approve, swap,
transfer. Three structural problems:

1. Not atomic: partial failure left users in inconsistent states.
2. Required CELO bootstrap: stablecoin-only users couldn't spend until they
   sourced CELO from somewhere else.
3. Multiple confirmations / receipts: high UX friction, multiple opportunities
   for the UI to lose state.

Sprint 0 spike S1 ([../research/s1-cip64-7702.md](../research/s1-cip64-7702.md))
confirmed Celo's CIP-64 envelope (tx type `0x7b`) composes with EIP-7702
authorizations (tx type `0x04`) on Celo mainnet. Spike S4
([../research/s4-self-audit-protocol.md](../research/s4-self-audit-protocol.md))
defined the self-audit checklist for the delegated contract.

## Options considered

1. **Status quo (chained txs)**: keep the multi-tx flow, accept the CELO
   bootstrap and atomicity gaps.
2. **EIP-7702 single-tx with hardened BatchExecutor**: delegate the user's
   EOA via 7702, call `execute()` on the delegated address from a single
   CIP-64 transaction paying gas in a stablecoin.
3. **Account abstraction (ERC-4337)**: deploy smart accounts for every user.
   Rejected: heavier custody model, bundler dependency, and Celo's CIP-64
   already gives stablecoin-fee semantics on EOAs.

## Decision

Adopt option 2. Dollar-spend operations execute as a single CIP-64
transaction calling `execute()` on the user's EOA, which is delegated (via
prior EIP-7702 authorization) to a hardened BatchExecutor.

Artifacts:

- Hardened BatchExecutor at `0xaE6a87E88b55644Eda54C3AA55B11944eE5E1DFe`
  (Celo mainnet), deployed under the S4 audit checklist with an `onlySelf`
  guard.
- Wired in [src/web3/networkConfig.ts](../../src/web3/networkConfig.ts)
  under `batchExecutorAddress`.
- Feature gate: `wri_dollars_spend_7702_v1` (Statsig — see
  [ADR-0010](0010-feature-flags-statsig.md)).
- First-time delegation sponsored via TuCop backend relay
  (`POST /api/wri/delegate-relay`) so users never need CELO for setup.
- CIP-64 fee currency: USDm or COPm depending on the spend, with a
  CELO-native fallback retained for users who prefer it.

## Consequences

### Positive

- One atomic transaction per dollar spend.
- Zero CELO requirement for end users at any phase.
- Feed renders the spend instantly via a USD-pinned standby transaction
  before any indexer catches the on-chain tx.

### Negative

- Delegated EOA semantics are unfamiliar to most reviewers; the S4 protocol
  must be re-run for any future BatchExecutor change.
- Legacy CELO-fee path for dollar spends (Bug E) was intentionally deferred:
  when a user explicitly picks CELO as fee currency on the 7702 path, fallback
  goes through the legacy chained code.
- Backend feed indexer for atomic-7702 tx is deferred; the client-side standby
  tx is the source of truth in the feed until the indexer catches up.
- `authorizationList` and `feeCurrency` are mutually exclusive at Celo node
  (types 0x04 and 0x7b cannot combine in a single tx). The relay-then-spend
  split resolves this.

## References

- [../research/s1-cip64-7702.md](../research/s1-cip64-7702.md) (PASS verdict)
- [../research/s4-self-audit-protocol.md](../research/s4-self-audit-protocol.md)
- [../plans/2026-06-16-wri-plan-03-track-c-eip7702.md](../plans/2026-06-16-wri-plan-03-track-c-eip7702.md)
- [../research/wallets/.wallets.txt](../research/wallets/.wallets.txt) (gitignored) — spike wallet v2 (the dogfood EOA)
- Reference smoke txs (Celo mainnet, spike wallet v2):
  - `0xda5201baf205b149dd9c9755d8e7c33d59e1a460ea76911e978a5d6a14bb1723` — USDm gas, CELO debited 0
  - `0x88c390fcc21c562200cd1758ea7ae8ce5721c1532a1dd02c62ab74deb92c34e9` — COPm gas, CELO debited 0
