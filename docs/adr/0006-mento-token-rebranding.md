# ADR-0006: Branding migration cXXX -> XXXm (Mento stablecoins)

## Status

Proposed

## Date

2025-03-27

## Context

Mento Protocol announced the rebranding of all its stablecoins from `cXXX` to `XXXm` to reflect its multichain strategy. Examples:

- cCOP -> COPm
- cUSD -> USDm
- cEUR -> EURm

This change is branding only (the contracts and addresses do not change), but it affects how we display tokens to users.

## Options considered

1. **Keep cXXX**: Ignore the rebranding.
   Problem: inconsistent with the rest of the Celo ecosystem.

2. **Gradual migration**: Show both names during the transition.
   Problem: user confusion.

3. **Immediate migration**: Change everything at once.
   Requires: updating UI, analytics, translations.

4. **Friendly names**: Show "Pesos" and "Dollars" to the user.
   Already partially implemented, but needs completion.

## Decision

**Full migration** to `XXXm` names internally, but keep **friendly names** in the UI:

| Token | Internal code | UI (Spanish) | UI (English)    |
| ----- | ------------- | ------------ | --------------- |
| COPm  | COPm          | Pesos        | Colombian Pesos |
| USDm  | USDm          | Dolares      | Dollars         |
| USDT  | USDT          | Dolares      | Dollars         |

Rule: the user never sees "COPm" or "cCOP", only "Pesos".

## Consequences

### Positive

- Aligned with the official Mento branding
- Friendlier UI for non-crypto users
- Consistency across the ecosystem

### Negative

- Analytics changes (events with old names)
- Update documentation and tests
- Possible temporary confusion for existing users

## References

- [Mento Rebranding Proposal](https://forum.celo.org/t/mento-stablecoin-rebranding-and-strategic-evolution/12639)
- [Mento Stablecoins](https://www.mento.org/stablecoins)
- `tasks/plans/mento-rebranding-migration.md` - Implementation plan
