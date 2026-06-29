# TuCOP Wallet - Documentation Index

Documentation is organized following the [Diátaxis framework](https://diataxis.fr/) — four categories matching reader intent: how to learn (tutorials), how to do (guides), what something is (reference), and why a decision was made (explanation). System architecture and decision records get dedicated top-level folders.

## Structure at a glance

| Folder                           | Purpose                                               |
| -------------------------------- | ----------------------------------------------------- |
| [`architecture/`](architecture/) | System architecture, module breakdowns, flow diagrams |
| [`adr/`](adr/)                   | Architecture Decision Records (why)                   |
| [`reference/`](reference/)       | Reference material (what)                             |
| [`guides/`](guides/)             | How-to guides (how)                                   |
| [`specs/`](specs/)               | Active forward-looking design specs                   |
| [`archive/`](archive/)           | Frozen historical material, never deleted             |

---

## Architecture

| Document                                                                             | Description                                  |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| [architecture/OVERVIEW.md](architecture/OVERVIEW.md)                                 | High-level architecture diagram and overview |
| [architecture/modules/redux.md](architecture/modules/redux.md)                       | Redux state management (26 slices)           |
| [architecture/modules/navigation.md](architecture/modules/navigation.md)             | React Navigation 7.x architecture            |
| [architecture/modules/blockchain.md](architecture/modules/blockchain.md)             | Viem + Celo blockchain integration           |
| [architecture/modules/features.md](architecture/modules/features.md)                 | Feature modules (send, swap, earn, gold)     |
| [architecture/modules/integrations.md](architecture/modules/integrations.md)         | External integrations (BucksPay, APIs)       |
| [architecture/diagrams/flow-send.md](architecture/diagrams/flow-send.md)             | Send/transfer flow                           |
| [architecture/diagrams/flow-swap.md](architecture/diagrams/flow-swap.md)             | Token swap flow                              |
| [architecture/diagrams/flow-onboarding.md](architecture/diagrams/flow-onboarding.md) | User onboarding flow                         |

## Architecture Decision Records (ADRs)

| Document                                                                                 | Description                             |
| ---------------------------------------------------------------------------------------- | --------------------------------------- |
| [adr/template.md](adr/template.md)                                                       | ADR template (MADR format)              |
| [adr/0001-use-viem-over-ethers.md](adr/0001-use-viem-over-ethers.md)                     | Viem vs Ethers.js decision              |
| [adr/0002-redux-saga-over-thunk.md](adr/0002-redux-saga-over-thunk.md)                   | Redux Saga for side effects             |
| [adr/0003-celo-sepolia-testnet.md](adr/0003-celo-sepolia-testnet.md)                     | Celo Sepolia migration (from Alfajores) |
| [adr/0004-react-native-077.md](adr/0004-react-native-077.md)                             | React Native 0.77.3 upgrade             |
| [adr/0005-buckspay-offramp.md](adr/0005-buckspay-offramp.md)                             | BucksPay Colombia offramp               |
| [adr/0006-mento-token-rebranding.md](adr/0006-mento-token-rebranding.md)                 | Mento cXXX -> XXXm migration            |
| [adr/0007-digital-gold-xaut0.md](adr/0007-digital-gold-xaut0.md)                         | Digital Gold (XAUt0) feature            |
| [adr/0008-navigation-architecture.md](adr/0008-navigation-architecture.md)               | React Navigation architecture           |
| [adr/0009-testing-strategy.md](adr/0009-testing-strategy.md)                             | Testing strategy (Jest + Detox)         |
| [adr/0010-feature-flags-statsig.md](adr/0010-feature-flags-statsig.md)                   | Statsig feature flags                   |
| [adr/0011-error-handling-logging.md](adr/0011-error-handling-logging.md)                 | Error handling + logging                |
| [adr/0012-shared-state-screen-primitives.md](adr/0012-shared-state-screen-primitives.md) | StateCard + StickyCtaBottom             |
| [adr/0013-toast-subscription-host.md](adr/0013-toast-subscription-host.md)               | Toast subscription host                 |

## Reference

Information-oriented material: what something is, how it is shaped, what the contract looks like.

| Document                                                                     | Description                                |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| [reference/DESIGN_SYSTEM.md](reference/DESIGN_SYSTEM.md)                     | StateCard + StickyCtaBottom usage guide    |
| [reference/NAVIGATION_FLOWS.md](reference/NAVIGATION_FLOWS.md)               | Comprehensive navigation flows reference   |
| [reference/buckspay-api.md](reference/buckspay-api.md)                       | BucksPay external API spec (OpenAPI 3.0)   |
| [reference/buckspay-implementation.md](reference/buckspay-implementation.md) | BucksPay offramp architecture and flow     |
| [reference/celo-gas-optimization.md](reference/celo-gas-optimization.md)     | Celo L2 gas fee optimization and EIP-1559  |
| [reference/deeplinks.md](reference/deeplinks.md)                             | Deep linking specification and URL schemes |

## Guides

Task-oriented walkthroughs: how to accomplish a specific job.

| Document                                                     | Description                                      |
| ------------------------------------------------------------ | ------------------------------------------------ |
| [guides/wallet-setup.md](guides/wallet-setup.md)             | Quick-start development setup guide              |
| [guides/phone-verification.md](guides/phone-verification.md) | Phone verification system how-to                 |
| [guides/connecting-dapps.md](guides/connecting-dapps.md)     | WalletConnect v2 integration guide               |
| [guides/ci-cd.md](guides/ci-cd.md)                           | CI/CD pipeline architecture and operations       |
| [guides/release-process.md](guides/release-process.md)       | Step-by-step release process                     |
| [guides/releases.md](guides/releases.md)                     | Quick release reference (Android/iOS)            |
| [guides/syncing-forks.md](guides/syncing-forks.md)           | How to sync with upstream (Valora / MobileStack) |
| [guides/manual-upload.md](guides/manual-upload.md)           | Manual App Store / Play Store upload             |
| [../e2e/README.md](../e2e/README.md)                         | E2E testing setup with Detox                     |
| [../fastlane/README.md](../fastlane/README.md)               | Fastlane build lanes (auto-generated)            |

## Specs

Active, forward-looking design specs for unshipped features.

| Document                                                                                 | Description                                                                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [specs/2026-05-26-carbon-defi-initiative.md](specs/2026-05-26-carbon-defi-initiative.md) | Carbon DeFi initiative (unified): FX Strategy "Invierte en Dolares" + Swap Executor Refactor |

## Backend services

| Document                                                                         | Description                                |
| -------------------------------------------------------------------------------- | ------------------------------------------ |
| [../railway-backend/README.md](../railway-backend/README.md)                     | Version API source (Express + Prisma + PG) |
| [../services/README.md](../services/README.md)                                   | Backend services overview and index        |
| [../services/buckspay-webhook/README.md](../services/buckspay-webhook/README.md) | BucksPay proxy service                     |
| [../services/api-wallet-tlf/README.md](../services/api-wallet-tlf/README.md)     | Phone verification OTP service             |
| [../services/twilio-service/README.md](../services/twilio-service/README.md)     | Keyless backup SMS service                 |

## Module documentation

Per-module READMEs are co-located with code under `src/<module>/README.md`.

| Module     | Path                                                       |
| ---------- | ---------------------------------------------------------- |
| analytics  | [../src/analytics/README.md](../src/analytics/README.md)   |
| buckspay   | [../src/buckspay/README.md](../src/buckspay/README.md)     |
| earn       | [../src/earn/README.md](../src/earn/README.md)             |
| gold       | [../src/gold/README.md](../src/gold/README.md)             |
| icons      | [../src/icons/README.md](../src/icons/README.md)           |
| identity   | [../src/identity/README.md](../src/identity/README.md)     |
| onboarding | [../src/onboarding/README.md](../src/onboarding/README.md) |
| send       | [../src/send/README.md](../src/send/README.md)             |
| swap       | [../src/swap/README.md](../src/swap/README.md)             |
| tokens     | [../src/tokens/README.md](../src/tokens/README.md)         |
| verify     | [../src/verify/README.md](../src/verify/README.md)         |

## Repo-level files

| Document                                                       | Description                              |
| -------------------------------------------------------------- | ---------------------------------------- |
| [../README.md](../README.md)                                   | Project overview, setup, architecture    |
| [../CONTRIBUTING.md](../CONTRIBUTING.md)                       | Contribution guidelines                  |
| [../SECURITY.md](../SECURITY.md)                               | Vulnerability reporting policy           |
| [../CLAUDE.md](../CLAUDE.md)                                   | Project rules for AI assistants          |
| [../.github/SETUP_CHECKLIST.md](../.github/SETUP_CHECKLIST.md) | CI/CD secrets and certificates checklist |

## GitHub templates

| Document                                                          | Description                         |
| ----------------------------------------------------------------- | ----------------------------------- |
| [Bug report](../.github/ISSUE_TEMPLATE/1-bug-report.md)           | Issue template for bug reports      |
| [Feature request](../.github/ISSUE_TEMPLATE/2-feature-request.md) | Issue template for feature requests |
| [Task](../.github/ISSUE_TEMPLATE/3-task.md)                       | Issue template for tasks / epics    |
| [PR template](../.github/pull_request_template.md)                | Pull request template               |

## Archive

Frozen historical material, never deleted. Useful for understanding past decisions or recovering context.

| Document                                                         | Description                                                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [archive/runbook.md](archive/runbook.md)                         | Generic Mobile Stack setup runbook (Jan 2026)                                             |
| [archive/wallet.md](archive/wallet.md)                           | Original Valora wallet documentation (Jan 2026)                                           |
| [archive/watching-assets.mdx](archive/watching-assets.mdx)       | Legacy token registration via deeplink (Jan 2026)                                         |
| [archive/FLOW_DIAGRAM_ASCII.txt](archive/FLOW_DIAGRAM_ASCII.txt) | ASCII flow diagrams (superseded by `reference/NAVIGATION_FLOWS.md`)                       |
| `archive/2026-05-release-1.118.3/` (local-only)                  | PR plans and design spec for the 1.118.3 release                                          |
| `archive/research/` (local-only)                                 | Deep-research notes for shipped features (e.g. XAUt0)                                     |
| `archive/DESIGN_SYSTEM_PLAN.md` (local-only)                     | Pre-implementation plan for the design system; superseded by `reference/DESIGN_SYSTEM.md` |
