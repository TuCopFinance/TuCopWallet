# Squid Discord outreach draft - IntegratorId attribution under EIP-7702

This is the message to send to the Squid team via Discord (`#dev-support`
or equivalent channel listed at https://discord.gg/squidrouter). It is a
direct question, written so a Squid engineer can answer with a single
sentence (PASS/FAIL/clarify).

> **Note on integratorId placeholder.** TuCopWallet does not call Squid's
> HTTP API directly. We route all swap quotes through Valora's
> `getSwapQuote` cloud function (`getSwapQuote.cloud-function.<...>`),
> which is the actual Squid integrator. Valora's `x-integrator-id` is
> the relevant ID here, NOT a TuCop-owned ID. Before sending this
> message, confirm with Valora's team what their integratorId value is
> and substitute it below (or ask Valora to send the outreach jointly).

---

## Message draft

> Hi Squid team! Quick technical question about integrator attribution
> under EIP-7702 batched calls.
>
> **Context:** We are TuCopWallet (mobile wallet on Celo mainnet). We
> consume Squid via Valora's `getSwapQuote` cloud function (Valora's
> integratorId: `<VALORA_INTEGRATOR_ID>`). We are about to ship EIP-7702
> batch execution so users can do `approve + swap` in a single tx.
>
> **Pattern today (baseline):** EOA -> SquidRouter
> (`0x4c363649D45d93A39Aa2E72cB1bEae5e25C63E88` on Celo). Sample txs:
>
> - `0xa69ac5caac68033acfbfa9abdcbcc6395119e88e687b790f14212154d3a202e5`
>   (CELO -> USDm)
> - `0xd232e2997cf38b709284adde7dbabc30a7b131a09a4f151845f6cbe7c4bbaccf`
>   (CELO -> COPm)
>
> **Pattern after 7702:** Outer tx is type `0x04`. `from` is the EOA,
> `to` is either the EOA itself (with delegated code) or a BatchExecutor
> contract we own. The actual call to the SquidRouter happens as a
> nested `CALL` from inside the BatchExecutor. The calldata that hits
> SquidRouter is byte-for-byte identical to the canonical pattern (same
> selector `0xf1a0939a`, same `swap(...)` args, same per-request hash
> in the inner bytes). `tx.origin` is still the EOA. `msg.sender` to
> SquidRouter is the EOA (delegated) or the BatchExecutor.
>
> **Question:** Does your analytics / integrator-revenue attribution
> survive this pattern?
>
> Specifically:
>
> 1. Is attribution keyed off the `x-integrator-id` header at API
>    request time (i.e. tied to Valora's `getSwapQuote` call), with
>    the on-chain tx merely correlated via the per-request hash
>    embedded in calldata? If yes, we expect PASS and only need
>    confirmation.
> 2. Or does it require the outer tx `to` field to be the SquidRouter?
>    If yes, we have a problem because the outer `to` will be the EOA
>    or BatchExecutor after 7702.
> 3. Or does it depend on `tx.origin == msg.sender`? (Under 7702, the
>    EOA still pays gas and is `tx.origin`, but `msg.sender` to
>    SquidRouter is the delegated code / executor.)
>
> If easier, I can run a real test on Celo mainnet with a low-value
> swap (< $5) through a 7702-wrapped path and have you confirm that
> the attribution appears correctly in your dashboard for Valora's
> integratorId.
>
> Thanks!

---

## Expected response shapes

- **PASS:** "We attribute by `x-integrator-id` at quote time, correlated
  on-chain via the request hash in calldata. 7702 wrapping does not
  affect us."
- **FAIL:** "Our indexer matches on outer-tx `to == SquidRouter`. Nested
  calls are not attributed."
- **NEEDS-TEST:** "We are not sure - please run a low-value 7702 swap on
  Celo and we will check the dashboard."

## Follow-up if NEEDS-TEST

If Squid asks for a live 7702 test, defer to the user. The spike wallet
`0x4D0d9e458e8a0D0C2c033B1fc2fE5a182837c3D2` already has CELO from
prior baselines, so a single 7702 swap of ~5 CELO should suffice. We do
NOT run that test as part of this Sprint 0 spike; it is gated on
Squid's response.

## Where to find Valora's integratorId

If TuCop has a Valora point of contact (Slack, Telegram), ask them
directly: "What is Valora's Squid x-integrator-id?". Otherwise the
value can be sniffed from Squid's API response headers when calling
`getSwapQuote` in a debug build (look for `x-request-id` in the
response, then trace it back through Squid's status endpoint).
