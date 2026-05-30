# ADR-0007: XAUt0 (Tether Gold) as the digital gold feature

## Status

Accepted

## Date

2025-03-25

## Context

Colombian users have strong demand for gold as a store of value, particularly in high-inflation contexts. XAUt0 is Tether Gold bridged to Celo, backed 1:1 by physical gold held in Swiss vaults.

TuCOP wants to offer gold buy/sell directly inside the app.

## Options considered

1. **Information only**: Show gold price without trading.
   Problem: adds no real value.

2. **External DEX**: Send users to Uniswap / etc for swap.
   Problem: fragmented UX, users drop off.

3. **Native integration**: USDT <-> XAUt0 swap in the app.
   Requires: quote provider, custom UI, price alerts.

4. **Gold staking**: Yield farming with XAUt0.
   Problem: not enough liquidity pools.

## Decision

Implement a **native XAUt0 buy/sell** flow using USDT as the primary pair.

Architecture:

- Quote provider: Squid Router (cross-chain aggregator)
- Price: CoinGecko API for display
- Alerts: local price-alert system
- Redux slice: `gold` for state

## Consequences

### Positive

- New differentiator product for TuCOP
- Native UX without leaving the app
- Attractive to users seeking store of value
- Foundation for future DeFi-with-gold products

### Negative

- XAUt0 liquidity on Celo is limited
- Spreads can be high on large volumes
- Requires educating users about tokenized gold

## References

- [Tether Gold](https://gold.tether.to/)
- [XAUt0 on Celo](https://celoscan.io/token/0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff)
- `tasks/plans/xaut0-digital-gold.md` - Full plan
- `src/gold/` - Implementation
