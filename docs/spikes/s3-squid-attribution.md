# Spike S3 - Squid IntegratorId attribution under EIP-7702 delegation

**Plan:** Sprint 0 Plan 00, Task 7.
**Spec:** [`docs/specs/2026-06-15-wallet-robustness-initiative-design.md`](../specs/2026-06-15-wallet-robustness-initiative-design.md)
section 5.S3.
**Gate effect:** Track C (EIP-7702 migration) is conditional on this
spike + S1.

## Verdict

**`UNKNOWN_PENDING_OUTREACH`** - leaning strongly toward PASS based on
documentation evidence and decoded calldata, but a Squid engineer must
confirm before we commit to Track C with attribution preserved.

The documentation indicates IntegratorId attribution is established at
HTTP-API-request time (via the `x-integrator-id` header) and correlated
on-chain via a per-request hash embedded in calldata, NOT via the outer
tx's `to`, `msg.sender`, or `tx.origin`. If that is correct, EIP-7702
batched execution preserves attribution unchanged. We have however no
authoritative public statement to that effect from Squid, so we cannot
declare PASS unilaterally.

## Why this question matters

TuCopWallet plans to introduce EIP-7702 BatchExecutor delegation so a
single user-signed tx can run, atomically, an approve + swap (and later,
self-audit). The wallet currently uses Squid as a swap routing
provider, via Valora's `getSwapQuote` proxy. If Squid's attribution
analytics break under 7702 wrapping, the financial impact is real:
Valora (and indirectly any revenue share with TuCop) would lose
integrator credit for swaps that look correct on-chain but are routed
through a BatchExecutor on the caller side.

## What we did

### Step 1 - Squid documentation review

Fetched <https://docs.squidrouter.com/llms-full.txt>
(see `s3-squid-docs.txt`, 9817 lines) and grepped for `integrator`,
`attribut`, `tx.origin`, `msg.sender`, `7702`, `delegation`, `batch`
(see `s3-squid-docs-greps.txt`, 235 matching lines).

**Findings:**

1. **Two distinct "integrator" concepts in Squid.**
   - **integratorId** = a string identifier the integrator passes as
     the `x-integrator-id` HTTP header (or as `integratorId` in the
     widget config) when calling `https://v2.api.squidrouter.com/v2/route`
     and `/v2/status`. This is purely **off-chain** - it identifies the
     calling app/wallet to Squid's API and is used for analytics,
     revenue share, and rate limits. (Docs lines 22, 47, 56, 281, 1142,
     1924, 2192, 2217.)
   - **integratorAddress** = an OPTIONAL EVM address inside the route
     request's `collectFees` object. If set, Squid embeds a fee transfer
     to that address in the route's `transactionRequest.data` calldata.
     Only used when the integrator opts into Squid's fee-collection
     mechanism. (Docs lines 6099, 6116, 6164, 6193.) TuCop does NOT use
     this.
2. **Squid explicitly supports smart-contract callers.**
   - "Funds are always transferred from the `msg.sender` on the source
     chain (this could be the user for direct calls to Squid Intents,
     or a smart contract like Multicall)" (docs line 3187, 4371).
   - Refunds are routed to `order.fromAddress`, which is the user
     address from the API request, NOT the on-chain `msg.sender`
     (docs lines 3188-3190).
   - This confirms Squid's backend already treats `msg.sender !=
fromAddress` as a normal case, which is exactly the EIP-7702
     situation when seen from SquidRouter's perspective.
3. **Per-request correlation hash.** The `/v2/status` endpoint expects
   `transactionId` (the on-chain tx hash) + `requestId` + `quoteId`
   (returned by `/v2/route`) (docs lines 2238, 2259-2266, 2316-2317).
   The on-chain calldata embeds a per-request hash (see calldata
   analysis below) which is the on-chain anchor that lets Squid's
   indexer correlate the executed tx with the API request that carried
   the `x-integrator-id`.

### Step 2 - Where TuCop's integratorId lives

Result captured in [`s3-integrator-id-references.txt`](s3-integrator-id-references.txt).

**Key finding: TuCopWallet does NOT call Squid's API directly.** All
swap quotes go through Valora's `getSwapQuote` cloud function. That
function is the actual Squid integrator and attaches Valora's own
`x-integrator-id` when proxying to Squid. The two README files that
mention `x-integrator-id` (`src/swap/README.md`, `src/gold/README.md`)
are illustrative, not active code paths.

This means:

- There is no TuCop-owned integratorId to "fill in" - the relevant ID
  is on Valora's side.
- 7702 attribution risk is shared between TuCop and Valora. If Valora
  loses integrator credit, that is a downstream impact for any
  TuCop / Valora revenue-share arrangement, but the on-chain trigger
  is the same wallet behaviour.

### Step 3 - Decoded calldata of baseline txs

Full analysis in [`s3-calldata-analysis.md`](s3-calldata-analysis.md).

Both baseline txs target SquidRouter on Celo
(`0x4c363649D45d93A39Aa2E72cB1bEae5e25C63E88`) with selector
`0xf1a0939a` =
`swap(string,address,uint256,string,address,address,bytes,uint256)`.

The decoded args show:

- Source/destination chain names ("celo-mainnet"), source/destination
  tokens, source amount, destination receiver address, an inner
  multicall bytes blob, and a tail uint256.
- The inner blob ends with a 16-byte hash (`06be632ddb...` for tx 1,
  `04789174f2...` for tx 2). Unique per swap. This is almost
  certainly Squid's per-request correlation hash, the on-chain anchor
  for off-chain attribution.
- **The integratorId is not embedded anywhere in the calldata.**

### Step 4 - Discord outreach draft

See [`s3-squid-discord-draft.md`](s3-squid-discord-draft.md).

The draft asks Squid 3 direct questions:

1. Is attribution keyed off `x-integrator-id` (API-layer) + per-request
   hash (on-chain correlation)? [If yes -> PASS for 7702.]
2. Does it require outer-tx `to == SquidRouter`? [If yes -> FAIL for
   7702.]
3. Does it depend on `tx.origin == msg.sender`? [Edge case -
   `tx.origin` is preserved under 7702 but `msg.sender` to SquidRouter
   changes.]

The user must:

1. Confirm Valora's integratorId or coordinate the outreach with
   Valora.
2. Send the draft via Squid's Discord
   (<https://discord.gg/squidrouter>).
3. Relay Squid's answer back to update this verdict.

## Why not PASS today

We have strong indirect evidence:

- IntegratorId is documented as an HTTP header, never as a calldata
  field.
- The on-chain calldata does not contain it.
- Squid explicitly supports `msg.sender != user` via smart-contract
  callers (Multicall, etc.).
- The per-request hash in calldata is the documented correlation
  mechanism.

But: we do not have an explicit statement from Squid that says "7702
batched calls preserve attribution". Without that confirmation we
cannot certify PASS as the gate criterion for Track C. The risk is
low, but the cost of being wrong (silently losing revenue attribution)
is high enough to require explicit sign-off.

## What changes the verdict

| Trigger                                                                           | New verdict                                                                             |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Squid confirms IntegratorId is calldata-independent and 7702 attribution survives | PASS                                                                                    |
| Squid says attribution requires outer-tx `to == SquidRouter`                      | FAIL                                                                                    |
| Squid asks for a low-stakes mainnet 7702 test before answering                    | NEEDS-TEST (the user gates that on their own ROI judgment)                              |
| No response after 14 days                                                         | Escalate: run the < USD 5 mainnet 7702 spike directly and check the dashboard ourselves |

## Path forward

1. **Owner action:** send `s3-squid-discord-draft.md` via Squid Discord.
2. **Wait for response** (target: 5 business days, escalate at 14).
3. **Update this file with verdict** (PASS / FAIL / NEEDS-TEST) and
   update `docs/spikes/README.md` accordingly.
4. **Gate Track C** in the WRI plan based on the final verdict.

## Artifacts

| File                              | Purpose                           |
| --------------------------------- | --------------------------------- |
| `s3-squid-docs.txt`               | Full Squid docs (9817 lines).     |
| `s3-squid-docs-greps.txt`         | Filtered hits for relevant terms. |
| `s3-integrator-id-references.txt` | TuCop repo search results.        |
| `s3-calldata-analysis.md`         | Decoded calldata of baseline txs. |
| `s3-squid-discord-draft.md`       | Outreach message to send.         |
| `s3-squid-attribution.md`         | This file - findings + verdict.   |
