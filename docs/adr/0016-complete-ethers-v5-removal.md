# ADR-0016: Complete ethers v5 removal (refinement of ADR-0001)

## Status

Accepted

## Date

2026-06-16

## Context

[ADR-0001](0001-use-viem-over-ethers.md) chose Viem as the primary
crypto library, but ethers v5 stayed in the dependency tree via two
surfaces:

1. `@mento-protocol/mento-sdk` 0.2.3 imported ethers v5 internally.
2. `e2e/scripts/fund-e2e-accounts.ts` still called ethers v5 directly.

Result: production bundle carried ~150 KB of duplicate crypto code; future
contributors had to know both APIs; Mento SDK upgrades were blocked by the
implicit ethers-v5 dependency.

Sprint 0 spike S2 ([../research/s2-ethers-v5-deps.md](../research/s2-ethers-v5-deps.md))
audited the footprint with `yarn why`, `knip`, and per-file greps. Verdict:
removable with one file rewrite plus one dep bump.

## Options considered

1. **Defer (status quo)**: keep dual stack, accept the bundle/maintenance cost.
2. **Bump Mento SDK + rewrite e2e**: cleanly drops ethers v5 from the tree.
3. **Migrate to ethers v6**: rejected — the team's investment in viem
   (typesafe ABI codegen, modern provider model) makes ethers v6 a
   sideways move.

## Decision

Adopt option 2. Bump `@mento-protocol/mento-sdk` from 0.2.3 to 3.2.8
(viem-native) and rewrite `e2e/scripts/fund-e2e-accounts.ts` in viem.
Remove `ethers` from `package.json` direct dependencies. CI guard fails
the build if `ethers` reappears in `yarn why ethers` output.

## Consequences

### Positive

- Production bundle smaller by ~150 KB (uncompressed).
- One mental model for transaction signing across the codebase.
- Future Mento SDK upgrades no longer drag a parallel crypto stack back in.

### Negative

- e2e funding scripts are slightly more verbose in viem (no
  `Wallet.fromMnemonic` one-liner); offset by being consistent with
  production code.
- Any third-party contribution that ships ethers code must be rewritten
  before merge.

## References

- [ADR-0001: Use Viem instead of Ethers.js](0001-use-viem-over-ethers.md)
- [../research/s2-ethers-v5-deps.md](../research/s2-ethers-v5-deps.md)
- [../plans/2026-06-16-wri-plan-04-track-d-hygiene.md](../plans/2026-06-16-wri-plan-04-track-d-hygiene.md)
