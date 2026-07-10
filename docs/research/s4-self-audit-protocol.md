<!-- markdownlint-disable MD032 MD040 MD060 -->

# S4: Self-audit protocol for `BatchExecutorV2.sol`

**Status:** APPROVED
**Date:** 2026-06-16
**Spike branch:** spike/wri-s4-self-audit-protocol
**Spec context:** Spec section 5.S4, locked decision #1 (no external audit, self-audit only).

## Contract under audit

[`contracts-research/src/BatchExecutorV2.sol`](../../contracts-research/src/BatchExecutorV2.sol) — production-candidate. ~30 lines of business logic, uses OpenZeppelin's `ReentrancyGuard`.

## Invariants (the five properties we hold true at all times)

1. **Self-call only**: `execute()` reverts unless `msg.sender == address(this)`. Enforced by `onlySelf` modifier. Under EIP-7702 delegation, `msg.sender` inside `execute` IS the delegated EOA (whose code equals this contract's bytecode), so `address(this) == EOA == msg.sender`. No external caller can invoke `execute`.
2. **No held balance**: contract holds no balance between external entry points. By construction (no `receive()` / `fallback()` function), the only way to send value to the contract is via `execute`, which reverts for external callers (invariant 1). The fuzzer cannot increase the balance.
3. **Reentrancy safe**: `nonReentrant` on `execute`. Inner calls cannot re-enter `execute`. Even if an inner call attempted to call back into `execute`, the reentrancy guard would revert.
4. **Atomic batch**: any inner call failure reverts the entire batch via `CallFailed(i, ret)`. No partial state across calls.
5. **No delegatecall surface**: all inner calls use `call`, not `delegatecall`. No way for an inner call to overwrite this contract's storage.

## Audit checklist (run before mainnet flag flip in Track C)

Each item must be checked off (and its evidence file produced) before the production contract is deployed and the Statsig flag is flipped to 100%.

- [ ] **Foundry invariant tests**: minimum 50,000 runs, depth 100. Evidence: `contracts-research/test/BatchExecutorV2.invariant.t.sol` + `forge test --match-contract BatchExecutorV2InvariantTest -vvv` output. Two invariants tested: `invariant_contractHoldsNoBalance`, `invariant_executeRevertsForExternalCallers`.
- [x] **Slither static analysis**: zero high/medium severity. Evidence: [`contracts-research/.slither/s4-slither-output.txt`](../../contracts-research/.slither/s4-slither-output.txt). Result: 2 informational findings (`calls-loop`, `low-level-calls`) — both intentional design choices for a batch executor, both informational severity, both noted in this protocol as expected behavior.
- [ ] **Mythril symbolic execution** on `execute()`: run `myth analyze src/BatchExecutorV2.sol --solv 0.8.26`. Acceptance: no high-severity SWC findings.
- [ ] **Fork test against Celo mainnet state, 100 randomized batches**: test file `contracts-research/test/BatchExecutorV2.fork.t.sol` to be added in Track C. Acceptance: 100% pass rate, no unexpected reverts.
- [ ] **Differential test**: batched (via BatchExecutorV2) vs sequential (vanilla approve+swap+approve+swap+approve+swap from the dollarsSpend flow) equivalence. Test file `contracts-research/test/BatchExecutorV2.differential.t.sol` to be added in Track C. Acceptance: identical final state (token balances, allowances at zero after execution).
- [ ] **Manual review by two reviewers** using SWC registry checklist. SWC IDs to explicitly verify:
  - SWC-107 (reentrancy): covered by `nonReentrant` modifier + invariant 3.
  - SWC-101 (integer overflow): Solidity 0.8.26 has checked arithmetic by default. The only counter is `i` in the loop, bounded by `calls.length` which is calldata-bounded. No overflow path.
  - SWC-105 (unprotected ether withdrawal): no withdraw function exists. Inner calls can move value out, but only the delegated EOA's own funds (since msg.sender is enforced). The user authorizes via signing the delegation.
  - SWC-114 (transaction order dependence): no state read between calls; each `target.call(data)` is independent in storage terms.
  - SWC-116 (timestamp dependence): no `block.timestamp` usage.
  - SWC-104 (unchecked call return): `if (!ok) revert CallFailed(i, ret)` checks every return.
  - SWC-129 (typographical errors / shadowing): none, single-file, no inheritance besides ReentrancyGuard.
    Sign-off file: `docs/research/s4-manual-review-signoff.md` to be created in Track C with both reviewers' names + date.
- [ ] **Internal team dogfood on Celo mainnet**: 30 days, small personal funds, behind Statsig flag `wri_dollars_spend_7702_v1` for internal team only. Evidence: at least 30 successful real swaps via the batched path with zero stuck delegations and zero unexpected reverts.

## Rollback / recovery plan

If a bug is discovered post-deployment with users delegated to `BatchExecutorV2`:

1. **Detect**: Sentry anomaly in dollarsSpend metrics (success rate drop, stuck-delegation reports), OR Squid IntegratorId attribution drop, OR any user-reported stuck delegation.
2. **Kill switch (immediate)**: flip Statsig flag `wri_dollars_spend_7702_v1` to false. The dollarsSpend saga falls back to the sequential code path on the next user action. Latency: less than 5 minutes from incident detection to flag flip.
3. **Revoke (per-user as needed)**: in the next user action of any flow, the app signs an EIP-7702 authorization with `contractAddress = 0x0000000000000000000000000000000000000000` to clear the delegation atomically. This is implemented as a small helper `scripts/revoke-7702-delegation.ts` (to be delivered with Track C). The user's EOA returns to plain-EOA state in one tx.
4. **Communicate**: in-app banner explaining the issue, link to support (`docs.tucop.xyz/support` or equivalent), and the offer to revoke their delegation immediately via a one-tap action.
5. **Post-mortem**: incident report committed to `docs/incidents/YYYY-MM-DD-7702-rollback.md` with cause, blast radius (number of users affected, value at risk), and fix.

## Verdict

**APPROVED.** Protocol is comprehensive given the locked-decision constraint of no external audit. The contract surface is minimal (one external function, one modifier, one error per failure mode). All five invariants are either machine-checkable (1, 2, 3, 4) or trivially observable (5). The two Slither informational findings are expected and documented.

## Implications for Track C

- The production `BatchExecutor.sol` lands at `contracts/src/BatchExecutor.sol` (or wherever Track C's PR organizes it) using exactly the `BatchExecutorV2.sol` source from the spike workspace, possibly graduated to a numbered file (`BatchExecutorV1.sol` in production parlance).
- Track C's plan MUST include each unchecked checklist item from above as an explicit task.
- The kill-switch flag is part of the Statsig wiring delivered in Track C, with name `wri_dollars_spend_7702_v1`.
- The revoke helper is delivered with Track C.
- The 30-day mainnet dogfood is the gate between phase 1 (internal validation) and phase 2 (ship to all users) per spec section 8.3.
