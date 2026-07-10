# S3 Calldata Analysis - Squid Baseline Transactions

Decoded from the two pre-existing Celo mainnet baseline swaps executed from
spike wallet `0x4D0d9e458e8a0D0C2c033B1fc2fE5a182837c3D2`, sent directly
EOA -> SquidRouter (no 7702 wrapping). These set the reference "attribution
intact" pattern against which the future 7702 wrapping is compared.

## Transactions

| #   | Pair         | Tx hash                                                              |
| --- | ------------ | -------------------------------------------------------------------- |
| 1   | CELO -> USDm | `0xa69ac5caac68033acfbfa9abdcbcc6395119e88e687b790f14212154d3a202e5` |
| 2   | CELO -> COPm | `0xd232e2997cf38b709284adde7dbabc30a7b131a09a4f151845f6cbe7c4bbaccf` |

Both target the same Squid Router on Celo:
`0x4c363649D45d93A39Aa2E72cB1bEae5e25C63E88`

## Function selector

`0xf1a0939a` resolves to:

```text
swap(string,address,uint256,string,address,address,bytes,uint256)
```

## Decoded params (tx 1, CELO -> USDm)

| #   | Type    | Value                                                                                  | Meaning                                          |
| --- | ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | string  | `"celo-mainnet"`                                                                       | srcChain                                         |
| 2   | address | `0x471EcE3750Da237f93B8E339c536989b8978a438`                                           | srcToken (CELO)                                  |
| 3   | uint256 | `10000000000000000000` (10 CELO)                                                       | amount                                           |
| 4   | string  | `"celo-mainnet"`                                                                       | dstChain                                         |
| 5   | address | `0x765DE816845861e75A25fCA122bb6898B8B1282a`                                           | dstToken (USDm)                                  |
| 6   | address | `0xce16F69375520ab01377ce7B88f5BA8C48F8D666`                                           | dstAddress (Squid hop wallet for refunds)        |
| 7   | bytes   | nested SquidMulticall payload (approves + Mento broker swap + ERC-20 transfer to user) | swapCallsBytes                                   |
| 8   | uint256 | `0`                                                                                    | tail param (likely forecallEnabled or hash type) |

## Notable feature in the inner `swapCallsBytes`

The very last 16 bytes of the inner payload are a per-request hash:

| Tx  | Per-request hash (16 bytes)          |
| --- | ------------------------------------ |
| 1   | `0x06be632ddb518388371bb3d5cb18544e` |
| 2   | `0x04789174f21a65eda44b5ea44ca97035` |

These hashes are unique per swap and do NOT match TuCop's integratorId.
They are almost certainly Squid's per-route correlation identifier
(linking the on-chain tx to the API quote returned by `/v2/route`).

## What is NOT in the calldata

- **No `integratorId` (TuCop's or Valora's) embedded in calldata.**
  No 16-byte / 20-byte / 32-byte slot in the decoded payload matches the
  shape of an integratorId string.
- No reference to `tx.origin` or `msg.sender` is required by the
  arguments - the `dstAddress` is provided explicitly as an arg
  (param 6), so refunds and routing do not depend on the caller's
  address.

## What this implies for EIP-7702 wrapping

Under a 7702 BatchExecutor flow, the outer tx becomes:

```text
type=0x04
from = EOA (e.g. user)
to   = EOA (delegated to BatchExecutor) OR BatchExecutor address
data = BatchExecutor.execute([
         { to: SquidRouter, value: 10 CELO, data: <unchanged Squid calldata> }
       ])
```

The inner Squid calldata is byte-for-byte identical to the baseline. The
nested `to`, `value`, and `data` are exactly what the EOA would have sent
directly. The only delta vs the baseline is:

1. Outer tx-type changes from `0x02` (EIP-1559) to `0x04` (EIP-7702).
2. `msg.sender` to SquidRouter changes from the EOA to either the EOA
   itself (delegated code) or BatchExecutor's address (depending on
   the design).
3. `tx.origin` remains the EOA in either case.

Because the calldata that hits SquidRouter is unchanged, and because
Squid documents explicit handling for smart-contract callers (refunds
keyed off `order.fromAddress` not `msg.sender`, per Squid Intents docs),
the calldata-level evidence supports the hypothesis that 7702 wrapping
does NOT break attribution.

## What the calldata cannot prove

The calldata alone cannot tell us how Squid's **off-chain analytics
dashboard** attributes a tx. Their indexer could:

(a) Decode the `swap()` calldata wherever in the call tree it appears
(would PASS under 7702).
(b) Use the on-chain `to` field of the outer tx, comparing to known
router addresses (would FAIL when `to == BatchExecutor`).
(c) Use the per-request hash inside the calldata to correlate with the
`/v2/route` request (which carried the `x-integrator-id` header)
(would PASS under 7702).
(d) Use tx.origin (would PASS under 7702).

Hypotheses (a), (c), (d) all yield PASS. Hypothesis (b) yields FAIL.

This ambiguity is what makes the Discord outreach (Step 2 in Plan 00
Task 7) the path forward.
