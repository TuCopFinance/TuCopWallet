# S2: ethers v5 transitive dependency audit

**Status:** PASS
**Date:** 2026-06-16
**Branch:** spike/wri-s2-ethers-v5-deps

## TL;DR

ethers v5 is NOT a transitive dependency forced on us by any production library. It is a direct `devDependencies` entry in our own `package.json`, used by a single e2e helper script that already has a viable migration path to viem. No other top-level package in the dependency graph requires ethers v5. Track D can fully remove ethers v5 from `package.json` after migrating one e2e script and bumping `@mento-protocol/mento-sdk` to v3.x.

## Direct usage in `src/`

```text
0 matches in src/
```

`src/` has zero direct imports of `ethers` and zero direct imports of `@ethersproject/*`. See `s2-ethers-direct-uses.txt` (empty).

## Repo-wide usage (outside `src/`)

```text
1 match
e2e/scripts/fund-e2e-accounts.ts:4: import { Contract, providers, utils, Wallet } from 'ethers'
```

Single consumer is the e2e test faucet refill / wallet funding helper. The file comment states "Would be nice to use viem, but mento is using ethers" - that was true when the helper was written against `@mento-protocol/mento-sdk@^0.2.3`, the version currently locked. Latest `@mento-protocol/mento-sdk@3.2.8` declares `viem` (not `ethers`) as a dependency. See "Upgrade paths" below.

## Top-level dependents that pull `ethers` (any major)

Method: parsed `yarn.lock` for every block whose dependency list references `ethers` or any `@ethersproject/*` package, then traced reverse-consumers.

| Top-level dep (in `package.json`)    | Locked version | ethers requirement (locked)                                                        | Latest npm version | ethers requirement (latest)          | Upgrade verdict                                                                             |
| ------------------------------------ | -------------- | ---------------------------------------------------------------------------------- | ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `ethers` (our own `devDependencies`) | `5.7.2`        | n/a (it IS ethers)                                                                 | `6.16.x`           | n/a                                  | Remove entirely after migrating `e2e/scripts/fund-e2e-accounts.ts` to viem (Track D step)   |
| `@fiatconnect/fiatconnect-sdk`       | `0.5.62`       | `ethers@^6.13.4` (v6, NOT v5)                                                      | `0.5.164`          | `ethers@^6.16.0` (v6)                | Not blocking S2. Already on v6 in both locked and latest. v5 is not pulled by this package. |
| `@mento-protocol/mento-sdk`          | `0.2.3`        | peerDep `ethers@^5.7` (not installed at top-level except via our own devDep above) | `3.2.8`            | dropped ethers, uses `viem@^2.21.44` | Bump to v3.x as part of Track D. Unlocks removing the e2e helper's ethers usage.            |
| `@walletconnect/sign-client`         | `^2.19.0`      | none                                                                               | `2.23.9`           | none                                 | Not a blocker. Does not pull ethers.                                                        |
| `@walletconnect/core`                | `^2.21.4`      | none                                                                               | `2.23.9`           | none                                 | Not a blocker. Does not pull ethers.                                                        |
| `@walletconnect/utils`               | `^2.18.1`      | none                                                                               | `2.23.9`           | none                                 | Not a blocker. Does not pull ethers.                                                        |
| `@reown/walletkit`                   | `^1.2.1`       | none                                                                               | `1.5.5`            | none                                 | Not a blocker. Does not pull ethers.                                                        |
| `react-native-persona`               | `2.2.23`       | none                                                                               | `2.44.0`           | none                                 | Not a blocker. Does not pull ethers.                                                        |

Reverse-consumer scan in `yarn.lock` confirms: every `@ethersproject/*` sub-package in the lockfile is consumed exclusively by either another `@ethersproject/*` sub-package or by the `ethers@5.7.2` umbrella package itself. No production library outside our own `package.json` reaches into the ethers v5 graph.

## Why ethers v5 is in the tree at all

Two parallel chains, only one of which is v5:

1. **v5 chain** (the focus of this spike):

   - `package.json` declares `"ethers": "^5.7.2"` in `devDependencies`
   - That resolves to `ethers@5.7.2`, which pulls 30 `@ethersproject/*@5.7.x` sub-packages
   - The single consumer of the v5 API is `e2e/scripts/fund-e2e-accounts.ts`
   - The helper uses ethers because of historical coupling with `@mento-protocol/mento-sdk@0.2.x`, which declared `ethers@^5.7` as a peerDependency

2. **v6 chain** (informational, not in S2 scope):
   - `@fiatconnect/fiatconnect-sdk@0.5.62` declares `ethers@^6.13.4` as a runtime dependency
   - That resolves to `ethers@6.13.4`, a separate nested install
   - This is NOT shared with the v5 graph and does not block ethers v5 removal

## Verdict

**PASS.** Every dependent of ethers v5 has an upgrade path that does not require ethers v5:

- `e2e/scripts/fund-e2e-accounts.ts` can be rewritten to viem (the rest of the codebase already standardizes on viem, including the rest of the e2e helpers).
- `@mento-protocol/mento-sdk` v3.x drops ethers entirely in favor of viem. Bumping unlocks the rewrite.
- No third-party production library is blocking removal.

After Track D lands, the `ethers` line can be deleted from `devDependencies` and all 30 `@ethersproject/*@5.7.0` lockfile entries plus `ethers@5.7.2` itself will leave the tree, removing ~22.32 MB of transitive disk weight (per `yarn why ethers` "Disk size with transitive dependencies").

## Implications for Track D

Concrete adjustments to spec section 9.2 ethers v5 removal scope:

1. **Scope confirmed: full removal, not just "stop importing".** The package.json line can go.
2. **Migration unit: 1 file.** Only `e2e/scripts/fund-e2e-accounts.ts` needs a rewrite. `src/` has zero direct uses already.
3. **Prerequisite bump.** Add `@mento-protocol/mento-sdk@^3.2.8` (or current latest) to the Track D migration plan. Mento SDK majors 0.x -> 3.x change the public API; verify the swap-helper functions (`getAmountIn`, `getAmountOut`, `increaseTradingAllowance`, `swapIn`, `swapOut`) still have equivalents in v3.x before committing to the bump.
4. **No production code path changes.** Since `src/` is already free of ethers, the user-facing wallet runtime is unaffected. The Track D change is build-time / test-time only.
5. **CI risk: low.** E2E will require validation that the rewritten faucet script still funds wallets correctly on Celo mainnet. Add to Track D acceptance criteria: `yarn e2e:fund-accounts` (or equivalent task) succeeds end-to-end before removing `ethers` from `package.json`.
6. **Lockfile churn estimate:** ~30 `@ethersproject/*@5.7.x` entries + `ethers@5.7.2` removed; one entry for `@mento-protocol/mento-sdk@3.x` updated. Net package count down significantly.

## Raw output

- [s2-ethers-tree.txt](s2-ethers-tree.txt)
- [s2-ethers-direct-uses.txt](s2-ethers-direct-uses.txt) (empty, expected)
- [s2-ethers-repo-wide-uses.txt](s2-ethers-repo-wide-uses.txt)
- [s2-knip-deps.txt](s2-knip-deps.txt) (empty output - knip reports no unused dependencies, since `ethers` IS used by `e2e/scripts/fund-e2e-accounts.ts` which is in knip's `entry` scope)
- [s2-knip-full.txt](s2-knip-full.txt) (full knip dead-code report; no ethers-related findings)
