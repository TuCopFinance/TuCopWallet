# WRI Sprint 0 Spike Outputs

This directory holds research outcomes from the 5 Sprint 0 spikes defined in
[../specs/2026-06-15-wallet-robustness-initiative-design.md](../specs/2026-06-15-wallet-robustness-initiative-design.md).

| Spike | File                                                     | Outcome                                 |
| ----- | -------------------------------------------------------- | --------------------------------------- |
| S1    | [`s1-cip64-7702.md`](s1-cip64-7702.md)                   | pending                                 |
| S2    | [`s2-ethers-v5-deps.md`](s2-ethers-v5-deps.md)           | PASS                                    |
| S3    | [`s3-squid-attribution.md`](s3-squid-attribution.md)     | UNKNOWN_PENDING_OUTREACH (leaning PASS) |
| S4    | [`s4-self-audit-protocol.md`](s4-self-audit-protocol.md) | pending                                 |
| S5    | [`s5-tx-in-flight-api.md`](s5-tx-in-flight-api.md)       | pending                                 |

`wallet.txt` (gitignored) holds the dedicated spike-wallet address used by S1, S3, S4.

`contracts-spike/` (sibling of `src/` in repo root) holds the Foundry workspace
for S1 and S4 contract experiments. Not shipped to users.
