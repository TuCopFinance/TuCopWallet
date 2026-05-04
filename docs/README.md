# TuCOP Wallet - Documentation Index

## Architecture

| Document                                                                     | Description                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| [architecture/OVERVIEW.md](architecture/OVERVIEW.md)                         | High-level architecture diagram and overview |
| [architecture/modules/redux.md](architecture/modules/redux.md)               | Redux state management (26 slices)           |
| [architecture/modules/navigation.md](architecture/modules/navigation.md)     | React Navigation 7.x architecture            |
| [architecture/modules/blockchain.md](architecture/modules/blockchain.md)     | Viem + Celo blockchain integration           |
| [architecture/modules/features.md](architecture/modules/features.md)         | Feature modules (send, swap, earn, gold)     |
| [architecture/modules/integrations.md](architecture/modules/integrations.md) | External integrations (BucksPay, APIs)       |

## Architecture Decision Records (ADRs)

| Document                                                                 | Description                             |
| ------------------------------------------------------------------------ | --------------------------------------- |
| [adr/template.md](adr/template.md)                                       | ADR template (MADR format)              |
| [adr/0001-use-viem-over-ethers.md](adr/0001-use-viem-over-ethers.md)     | Viem vs Ethers.js decision              |
| [adr/0002-redux-saga-over-thunk.md](adr/0002-redux-saga-over-thunk.md)   | Redux Saga for side effects             |
| [adr/0003-celo-sepolia-testnet.md](adr/0003-celo-sepolia-testnet.md)     | Celo Sepolia migration (from Alfajores) |
| [adr/0004-react-native-077.md](adr/0004-react-native-077.md)             | React Native 0.77.3 upgrade             |
| [adr/0005-buckspay-offramp.md](adr/0005-buckspay-offramp.md)             | BucksPay Colombia offramp               |
| [adr/0006-mento-token-rebranding.md](adr/0006-mento-token-rebranding.md) | Mento cXXX → XXXm migration             |
| [adr/0007-digital-gold-xaut0.md](adr/0007-digital-gold-xaut0.md)         | Digital Gold (XAUt0) feature            |

## Flow Diagrams

| Document                                                                             | Description          |
| ------------------------------------------------------------------------------------ | -------------------- |
| [architecture/diagrams/flow-send.md](architecture/diagrams/flow-send.md)             | Send/transfer flow   |
| [architecture/diagrams/flow-swap.md](architecture/diagrams/flow-swap.md)             | Token swap flow      |
| [architecture/diagrams/flow-onboarding.md](architecture/diagrams/flow-onboarding.md) | User onboarding flow |

## Getting Started

| Document                                            | Description                                    |
| --------------------------------------------------- | ---------------------------------------------- |
| [README.md](../README.md)                           | Main project overview, setup, and architecture |
| [wallet-setup.md](wallet-setup.md)                  | Quick-start development setup guide            |
| [CONTRIBUTING.md](../CONTRIBUTING.md)               | Contribution guidelines, PR requirements       |
| [SECURITY.md](../SECURITY.md)                       | Vulnerability reporting policy                 |
| [MANUAL_UPLOAD_GUIDE.md](../MANUAL_UPLOAD_GUIDE.md) | Manual App Store / Play Store upload guide     |

## Release & CI/CD

| Document                                            | Description                                   |
| --------------------------------------------------- | --------------------------------------------- |
| [releases.md](releases.md)                          | Quick release reference (Android/iOS)         |
| [release-process.md](release-process.md)            | Step-by-step version release process          |
| [ci-cd.md](ci-cd.md)                                | CI/CD pipeline architecture and configuration |
| [SETUP_CHECKLIST.md](../.github/SETUP_CHECKLIST.md) | CI/CD secrets and certificates checklist      |

## Technical

| Document                                             | Description                                 |
| ---------------------------------------------------- | ------------------------------------------- |
| [celo-gas-optimization.md](celo-gas-optimization.md) | Celo L2 gas fee optimization and EIP-1559   |
| [phone-verification.md](phone-verification.md)       | Integrated phone verification system design |

## Integrations

| Document                                                 | Description                                  |
| -------------------------------------------------------- | -------------------------------------------- |
| [buckspay-api.md](buckspay-api.md)                       | BucksPay offramp API reference (OpenAPI 3.0) |
| [buckspay-implementation.md](buckspay-implementation.md) | BucksPay offramp architecture and flow       |
| [connecting-dapps.md](connecting-dapps.md)               | WalletConnect v2 integration guide for DApps |
| [deeplinks.md](deeplinks.md)                             | Deep linking specification and URL schemes   |

## Backend Services

| Document                                                                         | Description                                |
| -------------------------------------------------------------------------------- | ------------------------------------------ |
| [../railway-backend/README.md](../railway-backend/README.md)                     | Version API source (Express + Prisma + PG) |
| [../services/README.md](../services/README.md)                                   | Backend services overview and index        |
| [../services/buckspay-webhook/README.md](../services/buckspay-webhook/README.md) | BucksPay proxy service                     |
| [../services/api-wallet-tlf/README.md](../services/api-wallet-tlf/README.md)     | Phone verification OTP service             |
| [../services/twilio-service/README.md](../services/twilio-service/README.md)     | Keyless backup SMS service                 |

## Development

| Document                                       | Description                                    |
| ---------------------------------------------- | ---------------------------------------------- |
| [syncing-forks.md](syncing-forks.md)           | How to sync with upstream (Valora/MobileStack) |
| [../e2e/README.md](../e2e/README.md)           | E2E testing setup with Detox                   |
| [../fastlane/README.md](../fastlane/README.md) | Fastlane build lanes (auto-generated)          |

## Module Documentation

| Document                                                 | Description                                |
| -------------------------------------------------------- | ------------------------------------------ |
| [../src/analytics/README.md](../src/analytics/README.md) | Analytics module design and event tracking |

## GitHub Templates

| Document                                                          | Description                         |
| ----------------------------------------------------------------- | ----------------------------------- |
| [Bug report](../.github/ISSUE_TEMPLATE/1-bug-report.md)           | Issue template for bug reports      |
| [Feature request](../.github/ISSUE_TEMPLATE/2-feature-request.md) | Issue template for feature requests |
| [Task](../.github/ISSUE_TEMPLATE/3-task.md)                       | Issue template for tasks/epics      |
| [PR template](../.github/pull_request_template.md)                | Pull request template               |

## Archive

Legacy documentation from the [Mobile Stack](https://github.com/mobilestack-xyz/mobilestack-mento) fork (archived Jan 2026), kept for reference:

| Document                                                   | Description                            |
| ---------------------------------------------------------- | -------------------------------------- |
| [archive/runbook.md](archive/runbook.md)                   | Generic Mobile Stack setup runbook     |
| [archive/wallet.md](archive/wallet.md)                     | Original Valora wallet documentation   |
| [archive/watching-assets.mdx](archive/watching-assets.mdx) | Legacy token registration via deeplink |
