# Research

Outcomes of time-boxed investigations (a.k.a. spikes, in agile/XP terminology)
that informed design decisions before implementation. Each spike answered a
specific technical question with a written verdict; raw outputs (greps, traces,
on-chain experiments) live alongside the writeup for traceability.

Sprint 0 of the Wallet Robustness Initiative ran 5 spikes in parallel; their
outcomes drove the per-track plans under [`../plans/`](../plans/) and the
locked decisions under [`../adr/`](../adr/).

## Sprint 0 — WRI

Spec: [`../specs/2026-06-15-wallet-robustness-initiative-design.md`](../specs/2026-06-15-wallet-robustness-initiative-design.md)
Plan: [`../plans/2026-06-15-wri-plan-00-sprint-0-spikes.md`](../plans/2026-06-15-wri-plan-00-sprint-0-spikes.md)
Summary: [`sprint-0-summary.md`](sprint-0-summary.md)

| Spike | Question                                  | File                                                     | Verdict                                     |
| ----- | ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| S1    | CIP-64 + EIP-7702 viability on Celo       | [`s1-cip64-7702.md`](s1-cip64-7702.md)                   | **PASS** (single-tx pattern confirmed)      |
| S2    | ethers v5 transitive dep audit            | [`s2-ethers-v5-deps.md`](s2-ethers-v5-deps.md)           | **PASS** (removable, 1 file + 1 dep bump)   |
| S3    | Squid IntegratorId attribution under 7702 | [`s3-squid-attribution.md`](s3-squid-attribution.md)     | **UNKNOWN_PENDING_OUTREACH** (leaning PASS) |
| S4    | Self-audit protocol for BatchExecutor     | [`s4-self-audit-protocol.md`](s4-self-audit-protocol.md) | **APPROVED**                                |
| S5    | `useTransactionInFlight` final API        | [`s5-tx-in-flight-api.md`](s5-tx-in-flight-api.md)       | **APPROVED**                                |

## Supporting material

- [`wallets/`](wallets/) — dedicated low-stakes EOAs used to run on-chain spike
  experiments. `.wallets.txt` inside is gitignored (private keys live there).
- `contracts-research/` (sibling of `src/` in repo root) — Foundry workspace for
  S1 and S4 contract experiments. Not shipped to users.

## Raw outputs

The `s<N>-*.txt` and `s<N>-*-output.txt` files alongside each spike writeup are
raw command outputs (greps, knip dumps, on-chain traces) that back the verdicts.
Kept for audit trail, not curated reading.
