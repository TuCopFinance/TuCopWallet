# TuCop Wallet - Documentation Index

Documentation is organized following the [Diataxis framework](https://diataxis.fr/): four reader-intent categories (tutorials, how-to, reference, explanation) plus dedicated folders for decisions, plans, runbooks, and frozen historical material.

Start here when looking for something specific. Module-level READMEs live next to the code in [src/](../src/) and are linked from the relevant sections below.

---

## Folder map

| Folder                         | Purpose                                                             |
| ------------------------------ | ------------------------------------------------------------------- |
| [architecture/](architecture/) | System architecture, module breakdowns, flow diagrams (explanation) |
| [adr/](adr/)                   | Architecture Decision Records (why)                                 |
| [reference/](reference/)       | Reference material (what)                                           |
| [guides/](guides/)             | How-to guides (how)                                                 |
| [specs/](specs/)               | Active forward-looking design specs                                 |
| [plans/](plans/)               | Implementation plans for active or in-flight specs                  |
| [runbooks/](runbooks/)         | Operational procedures for incidents and manual ops                 |
| [research/](research/)         | Time-boxed research outputs (spike writeups + raw evidence)         |
| [archive/](archive/)           | Frozen historical material, never deleted                           |

---

## Architecture

| Document                                                                                       | Description                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [architecture/OVERVIEW.md](architecture/OVERVIEW.md)                                           | High-level architecture diagram and overview                        |
| [architecture/modules/redux.md](architecture/modules/redux.md)                                 | Redux state management: 32-slice inventory + cross-module contracts |
| [architecture/modules/navigation.md](architecture/modules/navigation.md)                       | React Navigation 7.x architecture                                   |
| [architecture/modules/blockchain.md](architecture/modules/blockchain.md)                       | Viem + Celo blockchain integration                                  |
| [architecture/modules/features.md](architecture/modules/features.md)                           | Every feature module summarized in one page                         |
| [architecture/modules/dependencies.md](architecture/modules/dependencies.md)                   | Module dependency graph and refactoring safety                      |
| [architecture/modules/health.md](architecture/modules/health.md)                               | Per-module health snapshot (tests, docs, maintenance)               |
| [architecture/diagrams/architecture-mermaid.md](architecture/diagrams/architecture-mermaid.md) | High-level Mermaid diagrams                                         |
| [architecture/diagrams/flow-onboarding.md](architecture/diagrams/flow-onboarding.md)           | User onboarding flow                                                |
| [architecture/diagrams/flow-send.md](architecture/diagrams/flow-send.md)                       | Send / transfer flow                                                |
| [architecture/diagrams/flow-swap.md](architecture/diagrams/flow-swap.md)                       | Token swap flow                                                     |
| [architecture/diagrams/flow-buckspay.md](architecture/diagrams/flow-buckspay.md)               | BucksPay offramp flow (feature deprecated; diagram kept)            |

## Architecture Decision Records

Numbered ADRs in MADR format. Add a new one with the next number; reference superseded ADRs explicitly.

| ADR                                                             | Decision                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| [template.md](adr/template.md)                                  | ADR template                                                    |
| [0001](adr/0001-use-viem-over-ethers.md)                        | Use Viem over Ethers.js                                         |
| [0002](adr/0002-redux-saga-over-thunk.md)                       | Redux Saga for side effects                                     |
| [0003](adr/0003-celo-sepolia-testnet.md)                        | Celo Sepolia migration (superseded by WRI Track D mainnet-only) |
| [0004](adr/0004-react-native-077.md)                            | React Native 0.77.3 upgrade                                     |
| [0005](adr/0005-buckspay-offramp.md)                            | BucksPay Colombia offramp (feature later deprecated)            |
| [0006](adr/0006-mento-token-rebranding.md)                      | Mento cXXX -> XXXm migration                                    |
| [0007](adr/0007-digital-gold-xaut0.md)                          | Digital Gold (XAUt0) feature                                    |
| [0008](adr/0008-navigation-architecture.md)                     | React Navigation architecture                                   |
| [0009](adr/0009-testing-strategy.md)                            | Testing strategy (Jest + Detox)                                 |
| [0010](adr/0010-feature-flags-statsig.md)                       | Statsig feature flags                                           |
| [0011](adr/0011-error-handling-logging.md)                      | Error handling + logging                                        |
| [0012](adr/0012-shared-state-screen-primitives.md)              | StateCard + StickyCtaBottom primitives                          |
| [0013](adr/0013-toast-subscription-host.md)                     | Toast subscription host                                         |
| [0014](adr/0014-home-balance-cards-layout.md)                   | 4-card home balance layout                                      |
| [0015](adr/0015-eip-7702-batchexecutor-atomic-dollar-spends.md) | EIP-7702 BatchExecutor for atomic dollar spends                 |
| [0016](adr/0016-complete-ethers-v5-removal.md)                  | Complete ethers v5 removal (refines 0001)                       |
| [0017](adr/0017-squid-integrator-via-tucop-backend.md)          | Squid integrator proxied via TuCop backend                      |
| [0018](adr/0018-celo-gas-estimate-calibration.md)               | Celo gas estimate calibration (60% factor)                      |
| [0019](adr/0019-spike-wallet-v2-hardened-delegation.md)         | Spike wallet v2 with hardened BatchExecutor delegation          |

## Reference

Information-oriented material: what something is, how it is shaped, what the contract looks like.

| Document                                                                 | Description                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [reference/DESIGN_SYSTEM.md](reference/DESIGN_SYSTEM.md)                 | StateCard + StickyCtaBottom usage guide                                             |
| [reference/integrations.md](reference/integrations.md)                   | Every external service the wallet integrates with (20 services across 5 categories) |
| [reference/celo-gas-optimization.md](reference/celo-gas-optimization.md) | Celo L2 gas estimation and EIP-1559 calibration                                     |
| [reference/deeplinks.md](reference/deeplinks.md)                         | Deeplink schemes                                                                    |

## Guides

Task-oriented walkthroughs: how to accomplish a specific job.

| Document                                                     | Description                                     |
| ------------------------------------------------------------ | ----------------------------------------------- |
| [guides/wallet-setup.md](guides/wallet-setup.md)             | Development setup                               |
| [guides/phone-verification.md](guides/phone-verification.md) | Phone verification how-to                       |
| [guides/connecting-dapps.md](guides/connecting-dapps.md)     | WalletConnect v2 integration                    |
| [guides/navigation-flows.md](guides/navigation-flows.md)     | User-facing navigation flows                    |
| [guides/ci-cd.md](guides/ci-cd.md)                           | CI/CD pipeline architecture                     |
| [guides/releases.md](guides/releases.md)                     | End-to-end release process (quick + detailed)   |
| [guides/manual-upload.md](guides/manual-upload.md)           | Manual App Store / Play Store upload (fallback) |
| [../e2e/README.md](../e2e/README.md)                         | E2E testing setup with Detox                    |

## Specs

Active, forward-looking design specs for unshipped or in-progress features.

| Document                                                                                                           | Status                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [specs/2026-05-26-carbon-defi-initiative.md](specs/2026-05-26-carbon-defi-initiative.md)                           | Carbon DeFi initiative (decision open). Workspace: [specs/carbon-defi/](specs/carbon-defi/)                        |
| [specs/2026-06-15-wallet-robustness-initiative-design.md](specs/2026-06-15-wallet-robustness-initiative-design.md) | Wallet Robustness Initiative. Tracks A, B (mostly), C (mostly), D (mostly) shipped. Track C in production rollout. |

## Plans

Implementation plans tied to specs above. Shipped plans graduate to [archive/](archive/).

| Document                                                                                                         | Status                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [plans/2026-06-16-wri-plan-02-track-b-critical-fixes.md](plans/2026-06-16-wri-plan-02-track-b-critical-fixes.md) | WRI Track B critical fixes. Shipped except PreflightAdvisoryModal.       |
| [plans/2026-06-16-wri-plan-03-track-c-eip7702.md](plans/2026-06-16-wri-plan-03-track-c-eip7702.md)               | WRI Track C EIP-7702. Shipped through Task 4; rollout flag flips remain. |
| [plans/2026-06-16-wri-plan-04-track-d-hygiene.md](plans/2026-06-16-wri-plan-04-track-d-hygiene.md)               | WRI Track D hygiene. Shipped except Sentry breadcrumbs on retry.         |

## Runbooks

Operational procedures. See [runbooks/README.md](runbooks/README.md) for what goes here and the naming convention.

(empty for now; populate as incidents accumulate)

## Research

Outcomes of time-boxed spikes (research questions answered before implementation). Sprint 0 of the Wallet Robustness Initiative ran 5 spikes that informed all per-track plans.

See [research/README.md](research/README.md) for the spike inventory + verdicts.

## Backend services

| Document                                                                     | Description                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------ |
| [../railway-backend/README.md](../railway-backend/README.md)                 | Version API source (Express + Prisma + Postgres) |
| [../services/README.md](../services/README.md)                               | Backend services overview and index              |
| [../services/api-wallet-tlf/README.md](../services/api-wallet-tlf/README.md) | Phone verification OTP service                   |
| [../services/twilio-service/README.md](../services/twilio-service/README.md) | Keyless backup SMS service                       |

(BucksPay webhook docs moved to [archive/2026-06-buckspay/](archive/2026-06-buckspay/) since the feature is deprecated.)

## Module documentation

Per-module READMEs co-located with code under `src/<module>/README.md`.

| Module     | Path                                                       |
| ---------- | ---------------------------------------------------------- |
| analytics  | [../src/analytics/README.md](../src/analytics/README.md)   |
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

| Document                                                       | Description                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| [../README.md](../README.md)                                   | Project overview, setup, architecture                            |
| [../ROADMAP.md](../ROADMAP.md)                                 | Project roadmap (local-only / gitignored; not visible on GitHub) |
| [../CONTRIBUTING.md](../CONTRIBUTING.md)                       | Contribution guidelines                                          |
| [../SECURITY.md](../SECURITY.md)                               | Vulnerability reporting policy                                   |
| [../.github/SETUP_CHECKLIST.md](../.github/SETUP_CHECKLIST.md) | CI/CD secrets and certificates checklist                         |

## GitHub templates

| Document                                                          | Description                         |
| ----------------------------------------------------------------- | ----------------------------------- |
| [Bug report](../.github/ISSUE_TEMPLATE/1-bug-report.md)           | Issue template for bug reports      |
| [Feature request](../.github/ISSUE_TEMPLATE/2-feature-request.md) | Issue template for feature requests |
| [Task](../.github/ISSUE_TEMPLATE/3-task.md)                       | Issue template for tasks / epics    |
| [PR template](../.github/pull_request_template.md)                | Pull request template               |

## Archive

Frozen historical material, never deleted. Organized by era / topic.

| Folder                                                               | Era                 | Contents                                                                  |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| [archive/2026-01-mobile-stack/](archive/2026-01-mobile-stack/)       | Pre-fork (Jan 2026) | Original Mobile Stack / Valora docs, fork sync workflow                   |
| [archive/2026-05-release-1.118.3/](archive/2026-05-release-1.118.3/) | May 2026            | PR plans and design spec for the 1.118.3 release (local-only)             |
| [archive/2026-06-buckspay/](archive/2026-06-buckspay/)               | June 2026           | BucksPay deprecation: code archived, docs preserved for potential revival |
| [archive/wri/](archive/wri/)                                         | June 2026           | Wallet Robustness Initiative shipped plans (Sprint 0 + Track A)           |
| [archive/research/](archive/research/)                               | Various             | Deep-research notes for shipped features (local-only)                     |

---

## Naming conventions

Used across [plans/](plans/), [specs/](specs/), [adr/](adr/), [research/](research/), [archive/](archive/), [runbooks/](runbooks/).

| Doc kind          | Filename pattern                                                 | Status markers                                                                |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| ADR               | `NNNN-<kebab-slug>.md` (sequential, never reused)                | `Proposed` / `Accepted` / `Superseded by NNNN` / `Deprecated` in the first H2 |
| Spec              | `YYYY-MM-DD-<kebab-slug>.md`                                     | `Status:` line in frontmatter: `Draft` / `Active` / `Shipped` / `Archived`    |
| Plan              | `YYYY-MM-DD-<kebab-slug>.md` (date the plan was written)         | Same as spec                                                                  |
| Research          | `<spike-id>-<kebab-slug>.md` plus raw outputs `<spike-id>-*.txt` | Verdict in the spike summary, not the filename                                |
| Runbook           | `<system-or-feature>-<action>.md`                                | None (a runbook is either current or deleted)                                 |
| Archive subfolder | `YYYY-MM-<topic>/`                                               | Each subfolder has its own `README.md` explaining what is frozen and why      |

### Other rules

- Plain ASCII only. No em dashes, no curly quotes, no fancy arrows. Use `->`, `-`, `"`, `'`.
- No emojis.
- English in all tracked docs (locales/ excepted).
- Tables use the spaced separator style: `| --- | --- |` not `|---|---|`.
- Cross-references use relative paths from the file location.
- Link to code with line anchors where useful: `src/web3/saga.ts#L42`.

### Where to put a new doc

```text
Is it a question of "why was this decided" ?         -> docs/adr/
Is it a complete user-facing how-to guide ?          -> docs/guides/
Is it a stable reference (API, schema, config) ?     -> docs/reference/
Is it system architecture or module behavior ?       -> docs/architecture/
Is it a forward-looking design for unshipped work ?  -> docs/specs/
Is it an implementation plan for an active spec ?    -> docs/plans/
Is it an operational procedure for production ?      -> docs/runbooks/
Is it research / spike output ?                      -> docs/research/
Is it a private working draft you don't want public? -> tasks/ (gitignored)
Is it frozen historical material ?                   -> docs/archive/YYYY-MM-<topic>/
Is it module-specific co-located ?                   -> src/<module>/README.md
```

---

## Private working area

[../tasks/](../tasks/) is gitignored. It holds the local-only roadmap, timeline, and working plans the maintainer is iterating on. Files graduate to `docs/plans/` or `docs/specs/` when they are ready to be public. Shipped local plans move to `tasks/done/`.

This split is intentional: tracked docs are the public, vetted artifacts; `tasks/` is the maintainer's scratchpad.
