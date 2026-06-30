<!-- markdownlint-disable MD032 MD040 MD060 -->

# Sprint 0 Summary — Gate Decisions for the Wallet Robustness Initiative

**Date:** 2026-06-16
**Spec:** [`docs/specs/2026-06-15-wallet-robustness-initiative-design.md`](../specs/2026-06-15-wallet-robustness-initiative-design.md)
**Plan:** [`docs/archive/wri/plan-00-sprint-0-spikes.md`](../archive/wri/plan-00-sprint-0-spikes.md)

## Verdict matrix

| Spike | Question                                   | Verdict                                     | Source                                                 |
| ----- | ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------ |
| S1    | CIP-64 + tx 0x04 viability on Celo mainnet | **PASS** (better than expected)             | [s1-cip64-7702.md](s1-cip64-7702.md)                   |
| S2    | ethers v5 transitive dep audit             | **PASS**                                    | [s2-ethers-v5-deps.md](s2-ethers-v5-deps.md)           |
| S3    | Squid IntegratorId behavior under EIP-7702 | **UNKNOWN_PENDING_OUTREACH** (leaning PASS) | [s3-squid-attribution.md](s3-squid-attribution.md)     |
| S4    | Self-audit protocol for BatchExecutor      | **APPROVED**                                | [s4-self-audit-protocol.md](s4-self-audit-protocol.md) |
| S5    | useTransactionInFlight final API           | **APPROVED**                                | [s5-tx-in-flight-api.md](s5-tx-in-flight-api.md)       |

## Gate decisions

### Track A (Foundations) — PROCEED with S5-validated API

S5 confirmed the v4 hook API satisfies Swap + DollarsSpend + BucksPay simultaneously with only the two pre-agreed extension points (`customPoll`, `retryClassifier`). Track A's plan must use the v4 signatures from `docs/research/s5-tx-in-flight-api.md` verbatim.

### Track B (Critical Fixes) — PROCEED

No Sprint 0 dependency. Plan 02 can be written immediately and execution can start in parallel with Track A's first foundation PRs.

### Track C (EIP-7702 Migration) — PROCEED (simplified)

S1 returned PASS better than spec assumed. The spec previously had a risk register entry (R3) covering "user needs CELO bootstrap"; that risk is eliminated. Track C ships with:

- One transaction (CIP-64 envelope, type `0x7b`) that combines `authorizationList` + `feeCurrency = USDm | COPm` + the inner batched calls. No two-step pattern needed.
- BatchExecutor production-candidate contract is the `BatchExecutorV2.sol` source validated in S4, deployed to Celo mainnet under the audit checklist from S4.
- No CELO requirement for users at any phase. The Sprint 0 spike wallet on-chain proof:
  - tx `0xda5201baf205b149dd9c9755d8e7c33d59e1a460ea76911e978a5d6a14bb1723` (USDm gas), CELO debited 0, USDm debited 940,001,565,600,000 wei.
  - tx `0x88c390fcc21c562200cd1758ea7ae8ce5721c1532a1dd02c62ab74deb92c34e9` (COPm gas), CELO debited 0, COPm debited 3,340,194,750,125,582,052 wei.

S3 is gated UNKNOWN. The strong-evidence reading of Squid docs + on-chain calldata analysis (the IntegratorId travels via the API request header, anchored on-chain by a 16-byte correlation hash) suggests attribution survives. Plan 03 should be written with the assumption of PASS, with a contingent rollback if S3 outreach confirms FAIL.

### Track D (Stack Hygiene + Sepolia Removal + Valora Migration) — PROCEED

S2 returned PASS clean. ethers v5 removal is one file rewrite (`e2e/scripts/fund-e2e-accounts.ts`) + one dep bump (`@mento-protocol/mento-sdk` 0.2.3 → 3.2.8). Track D also handles:

- Sepolia / testnet codebase removal (locked decision #12)
- API key relocation to backend (locked decision #8)
- Valora migration acceleration (locked decision #3)

## Spec updates needed (apply in a separate PR)

Edits to [`docs/specs/2026-06-15-wallet-robustness-initiative-design.md`](../specs/2026-06-15-wallet-robustness-initiative-design.md):

1. **Section 8 Track C overview**: simplify per S1 PASS. Remove any text assuming a two-step delegation pattern. Document the single-tx pattern (CIP-64 envelope with authList + feeCurrency).
2. **Section 13 Risk Register**: remove R3 ("user needs CELO bootstrap"). Add R6 "Squid IntegratorId attribution under 7702 still pending outreach" (low impact given strong evidence, mitigation in place).
3. **Section 6.1.4 useTransactionInFlight API**: replace placeholder API with final v4 signatures from S5.
4. **Section 5 Spike status table**: mark all 5 verdicts as resolved.

(The spec file is in `.git/info/exclude` per the user's personal workflow, so this edit is local-only and does not merge to any branch. Track owners reference this summary for the canonical post-spike design.)

## Next deliverables

- Plan 01: Track A Foundations (incorporates the final S5 API)
- Plan 02: Track B Critical Fixes
- Plan 03: Track C EIP-7702 Migration (simplified per S1 PASS, with S3 outreach as a parallel non-blocking task)
- Plan 04: Track D Stack Hygiene + Sepolia Removal + Valora Migration

All four plans can be written immediately. Execution parallelism per Approach 1 (Tracks A merges first to integration; B, C, D rebase and parallelize).

## Pending non-blocking items

- **S3 Squid outreach** — Discord message ready at `docs/research/s3-squid-discord-draft.md`. Awaiting user action to send to Squid Discord. If Squid confirms calldata-only IntegratorId attribution: Track C proceeds with confidence. If Squid confirms attribution requires direct EOA→Router pattern: Track C re-scoped to non-Squid flows only.
- **Spike wallet remaining funds** — Spike wallet `0x4D0d9e458e8a0D0C2c033B1fc2fE5a182837c3D2` retains approximately 59 CELO, 0.63 USDm, 2202 COPm. Available for additional spike runs in Track C development. At project end, residual funds returned to user-designated address.
