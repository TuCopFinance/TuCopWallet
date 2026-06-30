# ADR-0005: BucksPay as the native offramp for Colombia

## Status

Accepted

## Date

2025-02-01

## Context

Colombian users need to convert COPm (Mento stablecoin) to COP in Colombian bank accounts. Existing options (Ramp, Simplex) do not support Colombia or charge very high fees.

BucksPay is a Colombian service that offers COPm -> COP conversion with direct bank transfer.

## Options considered

1. **External exchanges only**: Direct users to Binance P2P, etc.
   Problem: fragmented UX, many steps, users drop off.

2. **Generic FiatConnect**: Use the standard protocol.
   Problem: no FiatConnect provider supports Colombia.

3. **Native BucksPay integration**: Direct API in the app.
   Requires: custom screens, state handling, webhooks.

4. **WebView to BucksPay**: Load their web app in our app.
   Problem: poor UX, we can't track state.

## Decision

Implement a **native integration with the BucksPay API** as the primary offramp for Colombian users.

Flow:

1. User enters an amount in COPm
2. Selects destination bank and account
3. Confirms the transaction (signs with wallet)
4. App sends COPm to the BucksPay hot wallet
5. BucksPay processes and sends COP to the bank
6. Webhooks update state in real time

## Consequences

### Positive

- Native, fluid UX for Colombian users
- Competitive fees (~1.5%)
- Same-day transfer (Colombia ACH)
- Full control over flow and UX

### Negative

- Dependency on a single provider
- Requires maintaining a custom integration
- Backend proxy needed for webhooks

## References

- [BucksPay API Docs (archived)](../archive/2026-06-buckspay/api.md)
- `src/buckspay/` - Implementation (deprecated)
- [`docs/archive/2026-06-buckspay/implementation.md`](../archive/2026-06-buckspay/implementation.md) - Detailed architecture (archived)
