# ADR-0014: Home balance cards layout (4-card stack with Pesos / Dólares / Oro / Inversiones)

## Status

Accepted

## Date

2026-06-03

## Context

TuCop Wallet's home (and the Wallet tab) display balances through an Apple Wallet-style stacked card component, `BalanceCard.tsx`, introduced in PR #142 (May 2026). Until now the stack contained three cards:

- "Saldo disponible" (white, default front) - sum of all allowed tokens.
- "Oro" (gold gradient) - XAUt0.
- "Inversiones" (deep navy gradient) - supported earn positions (Aave + Allbridge).

The "Saldo disponible" card was expandable into two breakdown rows: Pesos (COPm) and Dólares, where Dólares was computed as a residual: `total − pesos`.

Three forces prompted a re-think:

1. Multiple dollar stablecoins are being added to the wallet (USDC, USDm, USAT). The residual "Dólares" formula is fragile - it only works as long as no non-dollar token enters the whitelist, and it hides per-token detail.
2. USAT (Tether America USD, issued by Anchorage Digital, GENIUS Act compliant) launched on Celo in April 2026 and joins the wallet's dollar-stable family.
3. The current "Saldo disponible" front card mixes two semantically different buckets (Pesos + Dólares) under one number. Colombian users think of COP and USD as separate balances, not as a single sum.

## Options considered

1. **Keep 3-card stack, expand breakdown to N dollar tokens.** Residual formula stays; breakdown grows to one row per stablecoin. Becomes crowded once 4+ stables are added, and still mixes COP + USD math under one headline number.

2. **Split into 4 cards (Pesos / Dólares / Oro / Inversiones).** Each card owns one concept. "Pesos disponibles" front-of-stack, white, non-expandable. "Dólares" new card, green gradient, expandable with per-token breakdown (USDT / USDC / USDm / USAT). Stack metaphor preserved.

3. **5+ cards (one per dollar stablecoin).** Loses the "Dólares" mental aggregation; visually overwhelming for users who only care about total USD exposure.

4. **Replace the stack with a flat list.** Higher visual change cost; throws away the differentiator from PR #142.

## Decision

**Option 2** - 4-card stack:

- `Pesos disponibles` (front, white, non-expandable, COPm only).
- `Dólares` (new, green gradient `['#22C55E', '#137211', '#0A4A0B']`, expandable, sum of USDT + USDC + USDm + USAT).
- `Oro` (unchanged).
- `Inversiones` (unchanged).

Reasons:

- Matches the Colombian user's mental model: Pesos and Dólares are separate buckets, not a sum.
- Per-token breakdown only on Dólares (the only card with multiple constituents) keeps complexity contained.
- Reuses the existing card-stack infrastructure (overlap geometry, gradient/solid backgrounds, hide-balances behavior).
- The chosen green gradient aligns with `Colors.successDark` (the only green in the design system) and reads immediately as "dollar".
- Future dollar tokens (e.g. BRLm if ever added) can extend the Dólares card without UI churn.
- The Dólares total becomes an explicit sum instead of a residual, removing a class of bugs if a non-dollar token (e.g. CELO) is ever re-enabled in `ALLOWED_TOKEN_IDS`.

## Consequences

### Positive

- Pesos and Dólares become first-class cards, each with a clear semantic.
- Per-token visibility for dollar holdings without polluting the Pesos card.
- "Dólares" is an explicit aggregation - safe to extend.
- Aligns the home with how the user reasons about money.

### Negative

- Slightly taller peek strip (4 cards vs. 3).
- "Pesos disponibles" loses its expand toggle (only one token), which is a small UX inconsistency relative to the other three cards.
- One-time refactor cost: snapshots in `BalanceCard.test.tsx`, `TabHome.test.tsx`, and `TabWallet.test.tsx` need regeneration.

### Neutral

- Aggregated "Dólares" behavior is otherwise identical to what users already see (one total + drill-down); the drill-down becomes per-token instead of "all-not-pesos".

## References

- Prior art: PR #142 - Apple Wallet-style stacked BalanceCard.
- Implementation plan (local, not git-tracked): `tasks/plans/dollar-tokens-and-balance-cards.md`.
- Mento token branding: [ADR-0006](0006-mento-token-rebranding.md).
- Digital Gold integration pattern: [ADR-0007](0007-digital-gold-xaut0.md).
