# Feature Modules

Central architecture overview of every feature module shipped in TuCop Wallet. Each module corresponds to a slice registered in `src/redux/reducersList.ts` and lives in its own directory under `src/`.

Use this document to find the right module by name and jump to its co-located README for the deep dive. Slice names below match the keys in `reducersList`.

## Conventions

- Feature module = a directory under `src/<name>/` with its own Redux slice, saga (where there are side effects), screens or components, and TypeScript types.
- "Saga / orchestration" identifies the file that owns the async behavior. Some modules use redux-saga, others use thin hooks (`useTransactionInFlight`, `useSwapQuote`) or pure helpers.
- "Status" is `Active` unless explicitly marked.
- Token UI display rule is universal: `COPm -> Pesos`, `USDT/USDC/USDm -> Dolares`, `XAUt0 -> Oro`, `CELO -> CELO`. See `.claude/rules/tokens.md`.

---

## Transactional features

User-initiated flows that result in on-chain transactions. These are the surfaces where the wallet actually moves money.

### send

- **What:** Peer-to-peer transfers by address, phone number, contact, or QR code. Handles fee-currency selection, encrypted comments, recent recipients, and Secure Send validation when a phone number resolves to multiple addresses.
- **Slice:** `send` (`src/send/reducers.ts`). Tracks `recentRecipients`, `lastUsedTokenId`, `encryptedComment`.
- **Orchestration:** `src/send/saga.ts`. Prepared transactions come from `usePrepareSendTransactions.ts`.
- **Screens:** `SendSelectRecipient.tsx`, `SendEnterAmount.tsx`, `SendConfirmation.tsx`, `ValidateRecipientAccount.tsx`.
- **Details:** [src/send/README.md](../../../src/send/README.md).

### swap

- **What:** Token exchange via Squid Router (Celo-only routes). Debounced quote fetching, slippage settings, price-impact warnings, allowance + execute pipeline. `quoteOnly=true` is used for planning fan-out to bypass the 10 RPS wallet rate limit.
- **Slice:** `swap` (`src/swap/slice.ts`). Tracks current quote, swap status, slippage tolerance.
- **Orchestration:** `src/swap/saga.ts` + `useSwapQuote.ts` hook.
- **Screens:** `SwapScreen.tsx`.
- **ADR:** [0017-squid-integrator-via-tucop-backend.md](../../adr/0017-squid-integrator-via-tucop-backend.md).
- **Details:** [src/swap/README.md](../../../src/swap/README.md).

### gold

- **What:** Buy and sell XAUt0 (Tether Gold, 1 token = 1 troy ounce) using USDT. Wraps Squid Router under a gold-specific UI with price feed, balance display, and local price alerts. Shown to users as "Oro Digital".
- **Slice:** `gold` (`src/gold/slice.ts`). Holds `priceUsd`, `priceCop`, `priceChange24h`, `alerts`.
- **Orchestration:** `src/gold/saga.ts` + `useGoldQuote.ts`. Price feed from CoinGecko.
- **Screens:** `GoldHome.tsx`, `GoldBuyEnterAmount.tsx`, `GoldBuyConfirmation.tsx`, `GoldSellEnterAmount.tsx`, `GoldSellConfirmation.tsx`, `GoldPriceAlerts.tsx`.
- **ADR:** [0007-digital-gold-xaut0.md](../../adr/0007-digital-gold-xaut0.md).
- **Details:** [src/gold/README.md](../../../src/gold/README.md).

### dollarsSpend

- **What:** Multi-step spending flow against a virtual "Dolares" token that aggregates USDT, USDC, and USDm balances. Plans a sequence of swaps to source the requested dollar amount, then executes them either as N sequential swaps or as a single atomic EIP-7702 batch through the project's BatchExecutor.
- **Slice:** `dollarsSpend` (`src/dollarsSpend/slice.ts`). Tracks `inFlight.plannedSteps`, `completedSteps`, `failedAtIndex`, and an `isAtomic` flag that switches progress copy.
- **Orchestration:** `src/dollarsSpend/saga.ts` (sequential path) + `saga7702.ts` (atomic path). Plan built by `planSpend.ts`, quoted by `useMultiSwapQuote.ts`.
- **Screens / sheets:** `TransactionFlowShell.tsx`, `MultiSwapProgressSheet.tsx`, `PartialSuccessSheet.tsx`, `DolaresMultiStepSummary.tsx`.
- **Gate:** `wri_dollars_spend_7702_v1` selects the atomic path.
- **ADR:** [0015-eip-7702-batchexecutor-atomic-dollar-spends.md](../../adr/0015-eip-7702-batchexecutor-atomic-dollar-spends.md), [0019-spike-wallet-v2-hardened-delegation.md](../../adr/0019-spike-wallet-v2-hardened-delegation.md).

### buckspay (DEPRECATED)

- **Status:** Deprecated. Inactive since June 2026. Slice and folder remain in repo but are not maintained.
- **What it was:** COPm -> COP offramp to Colombian bank accounts via Mento + a Railway webhook proxy.
- **Slice:** `buckspay` (`src/buckspay/slice.ts`). Still registered for state-shape compatibility.
- **Archive:** [docs/archive/2026-06-buckspay/](../../archive/2026-06-buckspay/) preserves the original module README, API spec, implementation notes, and webhook service README.
- **ADR:** [0005-buckspay-offramp.md](../../adr/0005-buckspay-offramp.md) (historical).

### jumpstart

- **What:** Send pre-funded escrow links over WhatsApp, SMS, etc. Recipients install the app and claim. Used as a low-friction referral and onboarding hook.
- **Slice:** `jumpstart` (`src/jumpstart/slice.ts`). Tracks claim status per link, send status.
- **Orchestration:** `src/jumpstart/saga.ts` + `usePrepareJumpstartTransactions.ts`. Link parsing in `jumpstartLinkHandler.ts`.
- **Screens:** `JumpstartIntro.tsx`, `JumpstartEnterAmount.tsx`, `JumpstartSendConfirmation.tsx`, `JumpstartShareLink.tsx`, `JumpstartTransactionDetailsScreen.tsx`.

### earn

- **What:** Deposit tokens into yield protocols on Celo. Lists available pools with APY, TVL, and risk level, then runs approve + deposit (or withdraw) through the standard prepared-transaction pipeline.
- **Slice:** `earn` (`src/earn/slice.ts`). Holds `pools`, `positions`, deposit / withdraw status.
- **Orchestration:** `src/earn/saga.ts`.
- **Screens:** `EarnHome.tsx`, `EarnEnterAmount.tsx`, `EarnConfirmationScreen.tsx`, `EarnPoolInfoScreen.tsx`, plus the Marranitos staking subfolder.
- **Details:** [src/earn/README.md](../../../src/earn/README.md).

### earn / neeru (sub-feature)

- **What:** Integration with Neeru Vaults (yield vaults shipped 2026-06). Gated behind `show_neeru_vaults`. Has its own slice for fine-grained position tracking, optimistic deposit UI, and per-position close flow.
- **Slice:** `neeru` (`src/earn/neeru/slice.ts`). Holds `positions`, `optimisticPositions`, `lastSyncedBlock`, close-flow status.
- **Orchestration:** `src/earn/neeru/saga.ts`. ABI / events in `abi.ts`, `eventParsing.ts`. Reads through `api.ts`.
- **Screens / sheets:** `NeeruVaultDetailScreen.tsx`, `NeeruPositionRow.tsx`, `NeeruCloseSheet.tsx`, `NeeruEmergencyCloseSheet.tsx`.

### subsidies

- **What:** ReFi Colombia UBI claim flow. Phone-verified users see eligibility and can claim subsidy payments paid in COPm. No dedicated slice; reads on-chain through `ReFiColombiaSubsidiesContract.ts` and uses the shared in-flight primitive to sequence the claim transaction.
- **Slice:** none (intentionally stateless beyond what `transactionInFlight` provides).
- **Orchestration:** `ReFiColombiaSubsidiesContract.ts`, `subsidyEventHistory.ts`.
- **Screens:** `ReFiColombiaSubsidiesScreen.tsx`.

---

## Identity and account

Slices that describe who the user is and which address resolves what.

### identity

- **What:** Phone number to address mapping, contact import, Secure Send validation, address verification status, Android SMS auto-fill. The lookup hub for any feature that needs to translate a phone number into a Celo address.
- **Slice:** `identity` (`src/identity/reducer.ts`). Holds bidirectional maps, validation state, contact import progress.
- **Orchestration:** `src/identity/saga.ts`. Backend calls in `contactMapping.ts`, validation rules in `secureSend.ts`.
- **Details:** [src/identity/README.md](../../../src/identity/README.md).

### account

- **What:** User profile, terms acceptance, support contact, settings submenus, account-setup error and recovery screens. Also where post-store-wipe recovery flows attach.
- **Slice:** `account` (`src/account/reducer.ts`). Holds `acceptedTerms`, `pincodeType`, `onboardingCompleted`, `lastOnboardingStepScreen`.
- **Orchestration:** `src/account/saga.ts`. Zendesk wiring in `zendesk.ts`.
- **Screens:** `Profile.tsx`, `Support.tsx`, `LegalSubmenu.tsx`, `PreferencesSubmenu.tsx`, `SecuritySubmenu.tsx`, `StoreWipeRecoveryScreen.tsx`.

### recipients

- **What:** Normalized recipient cache used by send, jumpstart, and any picker. Resolves phone numbers, contacts, addresses, and Nomspace handles into a single Recipient shape.
- **Slice:** `recipients` (`src/recipients/reducer.ts`). Holds the recipient cache keyed by normalized id.
- **Orchestration:** `src/recipients/saga.ts`. Resolution in `recipient.ts`, `resolve-id.ts`.
- **Components:** `RecipientItemV2.tsx`, `RecipientPickerV2.tsx`.

### walletConnect

- **What:** WalletConnect v2 sessions and request handling via Reown WalletKit. Manages pending proposals, active sessions, and incoming `session_request` events that get routed to PIN-gated approval UIs.
- **Slice:** `walletConnect` (`src/walletConnect/reducer.ts`). Holds `sessions`, `pendingSessions`, `pendingActions`.
- **Orchestration:** `src/walletConnect/saga.ts`. Request shape in `request.ts`, dispatcher in `walletConnect.ts`.
- **Screens:** under `src/walletConnect/screens/`.

---

## Onboarding and lifecycle

Slices that drive the app from cold start through first paint and recovery.

### app

- **What:** Top-level lifecycle: logged-in flag, lock state, app-state transitions, deep-link recovery, multichain beta opt-in, sanctioned-country blocks. Mostly read by other modules.
- **Slice:** `app` (`src/app/reducers.ts`).
- **Orchestration:** `src/app/saga.ts`. Deep links in `useDeepLinks.ts`. Init gating in `AppInitGate.tsx`.
- **Screens:** `App.tsx`, `AppLoading.tsx`, `ErrorBoundary.tsx`, `ErrorScreen.tsx`, `UpgradeScreen.tsx`, `SanctionedCountryErrorScreen.tsx`.

### home

- **What:** Home tab state: notifications, CleverTap inbox, NFT celebration status, "has visited home" flag, get-started carousel. Drives `TabHome.tsx` and `TabActivity.tsx`.
- **Slice:** `home` (`src/home/reducers.ts`).
- **Orchestration:** `src/home/cleverTapInbox.ts`.
- **Screens:** `TabHome.tsx`, `TabActivity.tsx`, `NotificationCenter.tsx`, `ActionsCarousel.tsx`, `GetStarted.tsx`, `SendBar.tsx`.

### imports

- **What:** Wallet import from a 24-word recovery phrase. Validates the phrase, derives the account, and routes into the regular onboarding tail.
- **Slice:** `imports` (`src/import/reducer.ts`).
- **Orchestration:** `src/import/saga.ts`.
- **Screens:** `ImportWallet.tsx`. The "choose import method" screen lives in `src/onboarding/registration/ImportSelect.tsx`.

### keylessBackup

- **What:** Cloud Account Backup. Auth0 sign-in + Web3Auth keyshare gives an `appKeyshare` + `torusKeyshare` pair that together reconstruct the user's mnemonic. Phone code input is the second factor on restore.
- **Slice:** `keylessBackup` (`src/keylessBackup/slice.ts`). Holds the in-flight keyshares and backup / delete status.
- **Orchestration:** `src/keylessBackup/saga.ts`. Web3Auth in `web3auth.ts`, encryption in `encryption.ts`, keychain bridge in `keychain.ts`.
- **Screens:** `KeylessBackupIntro.tsx`, `SignInWithEmail.tsx`, `LinkPhoneNumber.tsx`, `KeylessBackupPhoneInput.tsx`, `KeylessBackupPhoneCodeInput.tsx`, `KeylessBackupProgress.tsx`, `WalletSecurityPrimer.tsx`.

Onboarding screens (welcome, PIN setup, biometry, recovery phrase, country and terms) live in `src/onboarding/` but do not have a dedicated slice. Step navigation is centralized in `src/onboarding/steps.ts` and state is split across `account`, `app`, and `imports`. See [src/onboarding/README.md](../../../src/onboarding/README.md). Phone verification UI is in `src/verify/` (see [src/verify/README.md](../../../src/verify/README.md)) and writes through to `identity` + `app`.

---

## UX and supporting modules

Modules that back UI surfaces or supply cross-cutting data. They rarely originate transactions themselves.

### tokens

- **What:** Central source of truth for balances, prices, metadata, fee-currency selection, sortable lists, and the wallet tab. 600+ lines of selectors plus the import-token flow. Allowed token IDs are restricted to COPm and USDT.
- **Slice:** `tokens` (`src/tokens/slice.ts`).
- **Orchestration:** `src/tokens/saga.ts`. Hooks in `hooks.ts`.
- **Screens:** `TabWallet.tsx`, `TokenDetails.tsx`, `TokenImport.tsx`, `AssetList.tsx`.
- **Details:** [src/tokens/README.md](../../../src/tokens/README.md).

### dapps

- **What:** Curated DApp list, recent / favorite tracking, optional in-app WebView. Coordinates with `walletConnect` for sessions launched from the DApp list.
- **Slice:** `dapps` (`src/dapps/slice.ts`).
- **Orchestration:** `src/dapps/saga.ts`.
- **Screens:** `DappsScreen.tsx`, `DappShortcutTransactionRequest.tsx`, `DappShortcutsRewards.tsx`.

### nfts

- **What:** NFT gallery, detail view, and load-error UI. Read-only display; transfers happen through the standard send pipeline.
- **Slice:** `nfts` (`src/nfts/slice.ts`).
- **Orchestration:** `src/nfts/saga.ts`.
- **Screens:** `NftsInfoCarousel.tsx`, `NftMedia.tsx`, `NftsLoadError.tsx`.

### positions

- **What:** DeFi position tracking via the Hooks API. Surfaces user positions across registered protocols and exposes shortcuts (one-tap actions) per app.
- **Slice:** `positions` (`src/positions/slice.ts`). Holds `positions`, `earnPositionIds`, `shortcuts`, and triggered-shortcut status.
- **Orchestration:** `src/positions/saga.ts`. USD math in `getPositionBalanceUsd.ts`. Tx wiring in `transactions.ts`.
- **Components:** `HooksPreviewModeBanner.tsx`. Positions render inside `TabWallet.tsx`.

### priceHistory

- **What:** Historical price series used by the token-detail chart. Lightweight: just a fetch + a slice + a chart component.
- **Slice:** `priceHistory` (`src/priceHistory/slice.ts`).
- **Orchestration:** `src/priceHistory/saga.ts`.
- **Components:** `PriceHistoryChart.tsx`.

### points

- **What:** Rewards program. Maintains points history, activity card definitions, pending point events, and the intro / home screens. Backend writes through the saga.
- **Slice:** `points` (`src/points/slice.ts`).
- **Orchestration:** `src/points/saga.ts`. Card list in `cardDefinitions.tsx`.
- **Screens:** `PointsHome.tsx`, `PointsIntro.tsx`, `PointsHistoryBottomSheet.tsx`, `ActivityCard.tsx`, `PointsDiscoverCard.tsx`.

### fiatExchanges

- **What:** Cash-in / cash-out provider selection (Coinbase Pay, MoonPay, Simplex, Transak, Bidali, external exchanges). Routes the user to the right provider screen and tracks pending fiat transactions.
- **Slice:** `fiatExchanges` (`src/fiatExchanges/reducer.ts`).
- **Orchestration:** `src/fiatExchanges/saga.ts`. Quote layer under `quotes/`.
- **Screens:** `SelectProvider.tsx`, `SelectOfframpProvider.tsx`, `FiatExchangeAmount.tsx`, `CoinbasePayScreen.tsx`, `SimplexScreen.tsx`, `BidaliScreen.tsx`, `ExternalExchanges.tsx`, `WithdrawSpend.tsx`.

### fiatConnect

- **What:** FiatConnect protocol client for KYC, link-account, refetch-quote, review, and transfer-status flows. Used by FiatConnect-compatible offramps surfaced through `fiatExchanges`.
- **Slice:** `fiatConnect` (`src/fiatconnect/slice.ts`).
- **Orchestration:** `src/fiatconnect/saga.ts`. Client in `clients.ts`. KYC under `kyc/`.
- **Screens:** `KycLanding.tsx`, `LinkAccountScreen.tsx`, `FiatDetailsScreen.tsx`, `ReviewScreen.tsx`, `RefetchQuoteScreen.tsx`, `TransferStatusScreen.tsx`.

### localCurrency

- **What:** User-selected local currency, exchange rates, and conversion helpers used everywhere amounts are displayed.
- **Slice:** `localCurrency` (`src/localCurrency/reducer.ts`).
- **Orchestration:** `src/localCurrency/saga.ts`. Conversion in `convert.ts`. Hooks in `hooks.ts`.
- **Screens:** `SelectLocalCurrency.tsx`.

### networkInfo

- **What:** Online / offline tracking, network reachability flag. Read by sagas to decide whether to attempt RPC calls. Powers the connectivity-transparency UX rule.
- **Slice:** `networkInfo` (`src/networkInfo/reducer.ts`).
- **Orchestration:** `src/networkInfo/saga.ts`.

### web3

- **What:** Wallet address, account creation status, and low-level wallet bootstrapping. Plus selectors that other modules use to read the active address.
- **Slice:** `web3` (`src/web3/reducer.ts`).

### transactions

- **What:** The transaction feed: standby transactions for optimistic UI, confirmed history pulled from Blockscout, per-tx detail screens. Specializes feed items by transaction kind (swap, earn deposit, claim, transfer, NFT, approval).
- **Slice:** `transactions` (`src/transactions/slice.ts`).
- **Orchestration:** `src/transactions/saga.ts`. Blockscout client in `blockscoutApi.ts`. Send-saga adapters in `send.ts`. Standby helpers in `transferFeedUtils.ts`.
- **Screens / components:** under `src/transactions/feed/`: `TransactionFeed.tsx`, `TransactionDetails.tsx`, plus per-kind feed items. `TransactionSuccessScreen.tsx` is the post-flow success surface.

### alert

- **What:** Minimal in-app alert banner (toast-like). Decoupled from React Navigation so any saga can dispatch a banner without screen knowledge.
- **Slice:** `alert` (`src/alert/reducer.ts`).
- **Component:** `AlertBanner.tsx`.

### i18n

- **What:** Locale state plus over-the-air translation downloads. `useChangeLanguage` is the public hook.
- **Slice:** `i18n` (`src/i18n/slice.ts`).
- **Orchestration:** `src/i18n/saga.ts`. OTA pull in `otaTranslations.ts`.

---

## WRI primitives

Shared transaction-lifecycle infrastructure introduced as part of the Wallet Reliability Initiative in 2026-06. These are not user-facing features but every transactional feature now composes with them.

### transactionInFlight

- **What:** Generic per-flow state machine for any active transaction: `preparing -> awaiting-pin -> submitting -> pending-confirmation -> progress -> succeeded | partial-failure | failed`. Indexed by `flowId`, scoped by `flowKind` (`swap`, `dollarsSpend`, `send`, `buckspay`, `earn`, `gold`, `jumpstart`, `subsidy`). Powers retry, abort, multi-step progress, and the active-wait UI.
- **Slice:** `transactionInFlight` (`src/lib/useTransactionInFlight/slice.ts`).
- **Hook:** `useTransactionInFlight` in `src/lib/useTransactionInFlight/`. Features call `start`, `advance`, `fail`, `retry`, `abort` on the returned object.
- **Related:** `ConfirmationSheet`, `TransactionResultSheet`, `TransactionFlowShell` (in dollarsSpend) consume this slice to render a uniform UI across features.

### sentTransactionLog

- **What:** Append-only log of every hash dispatched through `sendPreparedTransactions`, keyed by `flowId` with `{ index, nonce, hash, status }`. Survives across foreground / background transitions so a flow that submitted but did not yet see a receipt can be reconciled on next app open.
- **Slice:** `sentTransactionLog` (`src/viem/sentTransactionLog/slice.ts`).
- **Use sites:** every saga that calls `sendPreparedTransactions` records sent hashes; the confirmation poller marks them confirmed or failed.

---

## How features compose

A typical transactional flow weaves the slices above together. Taking a swap as the canonical example:

1. User opens `SwapScreen` (`swap`). The screen reads balances from `tokens`, the active address from `web3`, the user locale from `localCurrency`, and network reachability from `networkInfo`.
2. Input is debounced (300-500 ms). `useSwapQuote` fans out to Squid with `quoteOnly=true` to stay under the wallet rate limit, then displays the best route.
3. User taps "Swap". `useTransactionInFlight` is called with `flowKind: 'swap'` and the prepared transactions; the descriptor lands in `transactionInFlight.byFlow[flowId]`.
4. The shared `ConfirmationSheet` mounts on the descriptor. It prompts PIN through the standard pincode authentication path. The descriptor advances to `awaiting-pin -> submitting`.
5. The swap saga calls `sendPreparedTransactions` (in `src/viem/saga.ts`). For each hash dispatched, `sentTransactionLog.recordSent` is fired. The descriptor advances to `pending-confirmation`.
6. The receipt poller marks each hash `confirmed` or `failed` in `sentTransactionLog`. The descriptor reaches `succeeded` (or `partial-failure` / `failed`).
7. `TransactionResultSheet` reads the final descriptor and renders the appropriate copy. On success the saga dispatches `tokens.refreshTokenBalances` and the new tx appears in the `transactions` feed via the standby + confirmed merge.
8. The feed entry on `TabActivity` is rendered by `SwapFeedItem`, which reads token metadata from `tokens` and locale formatting from `localCurrency`.

The same pattern applies to `send`, `gold`, `earn`, `jumpstart`, `subsidies`, and the multi-step `dollarsSpend` flow (which additionally uses its own slice for per-step progress and an atomic EIP-7702 path when the feature gate is on). The two WRI primitives are what make the UI consistent across all of them.
