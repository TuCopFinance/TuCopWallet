# ADR-0017: Route Squid swap quotes through TuCop backend as integrator

## Status

Accepted

## Date

2026-06-27

## Context

Swap flow called the Squid Router API directly from the client. Three
problems:

1. **API key in client.** The Squid integrator-id sat in the React Native
   bundle, readable by anyone who pulled the IPA/APK apart. Rotation
   forced an app store release.
2. **No attribution.** Direct calls could not be reliably credited to
   TuCop's integrator program, leaving fee-share revenue on the table.
3. **Per-wallet rate limit.** Squid's public endpoint rate-limits to
   ~10 RPS per wallet address. Planning UIs that fan out previews tripped
   the limit and degraded UX.

Sprint 0 spike S3 ([../research/s3-squid-attribution.md](../research/s3-squid-attribution.md))
confirmed via on-chain calldata analysis that IntegratorId travels as a
16-byte correlation hash in the swap calldata; attribution is preserved
when the user EOA -> Squid Router call is unchanged but the _quote_
request is proxied.

## Options considered

1. **Status quo (direct client -> Squid)**: keep API key in bundle, lose
   integrator attribution, fight rate limits client-side.
2. **Proxy quotes through TuCop backend**: backend holds the integrator-id,
   client never sees it; execution path on-chain is unchanged.
3. **Move execution server-side**: have the backend sign and submit swaps.
   Rejected: custodial pattern, user no longer holds the signing path.

## Decision

Adopt option 2. All swap quote requests go through TuCop's backend, which
holds the Squid integrator-id and proxies to Squid.

Artifacts:

- Backend endpoint: `tucop-backend-production.up.railway.app`.
- Repo: `TuCOPWallet-Backend`.
- Integrator-id: held server-side, never exposed to the client.
- Quote-only path: `quoteOnly=true` requests are routed through the
  backend with relaxed rate-limit handling because they don't consume
  Squid execution slots; safe for client-side planning fan-out.
- Execution path: a defensive assertion in `src/swap/saga.ts` ensures
  `quoteOnly` is never true when committing to a real swap.

## Consequences

### Positive

- Squid API key removed from the React Native bundle. No more app-store
  release dependency for key rotation.
- TuCop captures the integrator fee-share on user swaps.
- Backend can layer rate-limit hygiene (debounce + dedupe + AbortController
  - status-aware backoff for 429/502/400) without changing every client
    callsite.

### Negative

- One more service in the critical path; backend outage now blocks swaps.
  Mitigation: backend health surfaces in the wallet's connectivity status.
- Backend has to keep up with Squid API changes (thin adapter, not a
  policy layer).

## References

- [../research/s3-squid-attribution.md](../research/s3-squid-attribution.md)
- [../research/s3-calldata-analysis.md](../research/s3-calldata-analysis.md)
- Implementing commit: `6c09a4c73 feat(swap): route swap quotes through TuCop backend (Squid integrator)`
