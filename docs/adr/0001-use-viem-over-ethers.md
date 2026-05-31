# ADR-0001: Use Viem instead of Ethers.js

## Status

Accepted

## Date

2024-01-15

## Context

TuCOP Wallet needs to interact with the Celo blockchain for transactions, balance queries, and message signing. The two leading options in the ecosystem are Ethers.js (v5/v6) and Viem.

The wallet was inherited from Valora/MobileStack which used a mix of `contractkit` (deprecated) and `ethers`. We needed to modernize and unify.

## Options considered

1. **Ethers.js v6**: Established library, extensive documentation, but large bundle size and breaking changes between v5 and v6.

2. **Viem**: Modern library, tree-shakeable, TypeScript-first, better performance, native Celo support.

3. **Wagmi + Viem**: Full React stack, but web-oriented, overhead for mobile.

## Decision

Use **Viem** as the primary library for blockchain interactions.

Rationale:

- 35% smaller bundle size than ethers.js
- Native TypeScript with full inference
- Celo-L2 specific support (fee currency, gas estimation)
- Effective tree-shaking (only what we import)
- Active maintenance by the Wagmi / Paradigm team

## Consequences

### Positive

- Better performance on mobile devices
- Stricter types reduce runtime bugs
- Cleaner and more modular code
- Better support for Celo-specific features (fee currencies)

### Negative

- Learning curve for devs familiar with ethers
- Fewer examples / tutorials available (smaller community)
- Some ethers patterns have no direct equivalent

## References

- [Viem Documentation](https://viem.sh/)
- [Viem vs Ethers comparison](https://viem.sh/docs/introduction.html#comparison-to-ethers)
- `src/viem/` - Current implementation
