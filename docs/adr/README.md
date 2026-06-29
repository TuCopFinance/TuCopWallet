# Architecture Decision Records

This folder is the immutable log of significant architectural decisions in
TuCopWallet. Each ADR captures **one** decision with the context that shaped
it. Once accepted, an ADR is not rewritten — if a decision is revisited,
write a new ADR that _supersedes_ the old one and flip the old one's
status header.

Format: [Michael Nygard ADR template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
Canonical starting point: [`template.md`](template.md).

## When to write one

- A cross-cutting choice that future code will depend on (stack pieces,
  on-chain protocols, security boundaries).
- A decision with multiple defensible alternatives where the reasoning
  would be lost if not written down.
- A divergence from how the rest of the wallet works that would surprise
  a future reader.

Do NOT write an ADR for small implementation details, bugfixes, or
refactors that don't change architecture.

## Numbering

Zero-padded to 4 digits, assigned sequentially at write time. Numbers are
never reused. Deprecated ADRs stay in place with an updated status header.

## Index

| #    | Title                                                                                                             | Status   |
| ---- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| 0001 | [Use Viem instead of Ethers.js](0001-use-viem-over-ethers.md)                                                     | Accepted |
| 0002 | [Redux Saga over Redux Thunk](0002-redux-saga-over-thunk.md)                                                      | Accepted |
| 0003 | [Celo Sepolia as the testnet (deprecate Alfajores)](0003-celo-sepolia-testnet.md)                                 | Accepted |
| 0004 | [Upgrade to React Native 0.77.3 with the Old Architecture](0004-react-native-077.md)                              | Accepted |
| 0005 | [BucksPay as the native offramp for Colombia](0005-buckspay-offramp.md)                                           | Accepted |
| 0006 | [Branding migration cXXX -> XXXm (Mento stablecoins)](0006-mento-token-rebranding.md)                             | Accepted |
| 0007 | [XAUt0 (Tether Gold) as the digital gold feature](0007-digital-gold-xaut0.md)                                     | Accepted |
| 0008 | [Navigation Architecture](0008-navigation-architecture.md)                                                        | Accepted |
| 0009 | [Testing Strategy](0009-testing-strategy.md)                                                                      | Accepted |
| 0010 | [Feature Flags with Statsig](0010-feature-flags-statsig.md)                                                       | Accepted |
| 0011 | [Error Handling and Logging Strategy](0011-error-handling-logging.md)                                             | Accepted |
| 0012 | [Shared state-screen primitives (StateCard + StickyCtaBottom)](0012-shared-state-screen-primitives.md)            | Accepted |
| 0013 | [Subscription-based ToastHost for cross-platform success feedback](0013-toast-subscription-host.md)               | Accepted |
| 0014 | [Home balance cards layout (Pesos / Dolares / Oro / Inversiones)](0014-home-balance-cards-layout.md)              | Accepted |
| 0015 | [Atomic dollar spends via EIP-7702 + hardened BatchExecutor](0015-eip-7702-batchexecutor-atomic-dollar-spends.md) | Accepted |
| 0016 | [Complete ethers v5 removal (refinement of ADR-0001)](0016-complete-ethers-v5-removal.md)                         | Accepted |
| 0017 | [Route Squid swap quotes through TuCop backend as integrator](0017-squid-integrator-via-tucop-backend.md)         | Accepted |
| 0018 | [Calibrate Celo gas-estimate display to 60% of returned limit](0018-celo-gas-estimate-calibration.md)             | Accepted |
| 0019 | [Supersede v1 spike wallet with v2 + hardened delegation](0019-spike-wallet-v2-hardened-delegation.md)            | Accepted |
