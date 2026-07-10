# External Integrations

Reference of every external service the TuCop Wallet talks to. Each entry
lists the production endpoint or SDK, who consumes it, how it is
authenticated, and what happens if it goes down.

The TuCop backend (`tucop-backend-production.up.railway.app`, the
"TuCOPWallet-Backend" repo) is the umbrella proxy: it fronts Squid,
Blockscout, CoinMarketCap, and the WRI delegate-relay so the app
ships zero third-party API keys for those services.

All HTTP traffic flows through `src/utils/fetchWithTimeout.ts`, which
adds a 15s timeout (`FETCH_TIMEOUT_DURATION`), up to 3 attempts with
exponential backoff (250ms x 2^attempt + jitter) on 5xx and network
errors, and a per-host circuit breaker (5 failures in 60s opens for
30s, then auto-closes). 4xx responses are NOT retried.

---

## 1. Blockchain / on-chain

### 1.1 Celo Forno RPC

| Field         | Value                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose       | Primary read RPC for Celo mainnet (chainId 42220).                                                                                                         |
| Endpoint      | `https://forno.celo.org/` (`DEFAULT_FORNO_URL` in `src/config.ts`)                                                                                         |
| WS / fallback | None. Single RPC.                                                                                                                                          |
| Used by       | viem `publicClient` (`src/viem/`), every read path (balances, gas estimate, tx receipts, contract calls).                                                  |
| Auth          | None. Public Celo Foundation gateway.                                                                                                                      |
| Failure mode  | Circuit breaker opens after sustained 5xx. Reads fail through to the UI as "no connection" toasts. No on-chain writes are attempted while breaker is open. |
| Related       | `src/web3/networkConfig.ts`, ADR-0018 (gas estimate calibration).                                                                                          |

### 1.2 Alchemy multi-chain RPC

| Field        | Value                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | Public RPC for the non-Celo viem chains the app understands (Ethereum, Arbitrum, Optimism, Polygon PoS, Base) - used by the cross-chain swap preview path.                      |
| Endpoints    | `https://eth-mainnet.g.alchemy.com/v2/<KEY>`, `arb-mainnet`, `opt-mainnet`, `polygon-mainnet`, `base-mainnet` (see `ALCHEMY_*_RPC_URL_MAINNET` in `src/web3/networkConfig.ts`). |
| Used by      | Cross-chain balance reads, Squid route validation. Celo itself never uses Alchemy.                                                                                              |
| Auth         | API keys per chain in `secrets.json` (`ALCHEMY_ETHEREUM_API_KEY`, `ALCHEMY_ARBITRUM_API_KEY`, etc.). Loaded by `src/config.ts`.                                                 |
| Failure mode | `fetchWithTimeout` retry + circuit breaker per host. Arbitrum has a backend-proxied fallback at `${CLOUD_FUNCTIONS}/rpc/arbitrum-one`.                                          |

### 1.3 Squid Router (via TuCop backend proxy)

| Field        | Value                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | DEX aggregator + cross-chain bridge. Powers swap, `dollarsSpend`, and the gold buy flow.                                                                                                                                                            |
| Endpoint     | `POST https://tucop-backend-production.up.railway.app/api/swap/quote` (drop-in shape of the upstream Squid `/v2/route` response).                                                                                                                   |
| Used by      | `src/swap/useSwapQuote.ts`, `src/dollarsSpend/useMultiSwapQuote.ts`, `src/gold/` quote flows.                                                                                                                                                       |
| Auth         | Backend holds the Squid `x-integrator-id`. Mobile bundle ships zero Squid credentials.                                                                                                                                                              |
| Failure mode | Standard retry + breaker. Swap UI surfaces "no se pudo cotizar" and disables the action button. Planning-time fan-out uses `quoteOnly=true` to bypass the upstream 10 RPS wallet-level rate limit (see `feedback_squid_quoteonly_for_planning.md`). |
| Related      | ADR-0017 (Squid integrator via backend), `docs/research/s3-squid-attribution.md`.                                                                                                                                                                   |

### 1.4 Mento Protocol oracles

| Field        | Value                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | On-chain oracle source for Mento stablecoin USD pegs (USDm, COPm, EURm, BRLm).                                                |
| Surface      | Read-only contract calls, executed via viem against Celo Forno. No HTTP endpoint of its own.                                  |
| Used by      | Indirectly: USDT/USDC/USDm balance valuation, COPm "Pesos" UI display, Mento swap previews when applicable.                   |
| Auth         | n/a (on-chain).                                                                                                               |
| Failure mode | Falls back to last-known price cached in Redux. Stale-price banner appears after `TIME_UNTIL_TOKEN_INFO_BECOMES_STALE` (12h). |

### 1.5 Blockscout Pro (via TuCop backend proxy)

| Field        | Value                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose      | Celo on-chain transaction history (ERC-20 transfers, internal txs, decoded logs).                                                                                                    |
| Endpoint     | `GET https://tucop-backend-production.up.railway.app/api/v2/...` (`BLOCKSCOUT_PROXY_BASE` in `src/web3/networkConfig.ts`). Example: `/addresses/{addr}/token-transfers?type=ERC-20`. |
| Used by      | `src/transactions/blockscoutApi.ts`, the home feed, and Activity tab.                                                                                                                |
| Auth         | Backend holds the Blockscout Pro API key. Mobile bundle ships none.                                                                                                                  |
| Failure mode | Retry + breaker. On open breaker, the feed shows cached transactions only and emits a "feed unavailable" hint.                                                                       |
| Related      | `docs/architecture/modules/blockchain.md`.                                                                                                                                           |

### 1.6 Block explorers (link-out only)

Used to build deep links the user can tap to open a tx, address, token, or
NFT in an explorer. No API consumption.

| Network              | Explorer                                              |
| -------------------- | ----------------------------------------------------- |
| Celo                 | `https://celoscan.io/{tx,address,token}/`             |
| Ethereum             | `https://etherscan.io/{tx,address,token,nft}/`        |
| Arbitrum One         | `https://arbiscan.io/{tx,address,token}/`             |
| Optimism             | `https://optimistic.etherscan.io/{tx,address,token}/` |
| Polygon PoS          | `https://polygonscan.com/{tx,address,token}/`         |
| Base                 | `https://basescan.org/{tx,address,token}/`            |
| NFTs (Celo)          | `https://explorer.celo.org/mainnet/token/`            |
| Cross-chain (Axelar) | `https://axelarscan.io/gmp/`                          |

See `blockExplorerUrls` in `src/web3/networkConfig.ts`.

---

## 2. Backend services

### 2.1 TuCop Backend (umbrella)

| Field            | Value                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose          | Single backend that proxies third-party APIs (Squid, Blockscout, CoinMarketCap), hosts the WRI delegate-relay, the Neeru positions resolver, the subsidy event indexer, and the hooks API. |
| Production URL   | `https://tucop-backend-production.up.railway.app`                                                                                                                                          |
| Repo             | `TuCOPWallet-Backend` (Railway-deployed).                                                                                                                                                  |
| Endpoints in app | `/api/swap/quote`, `/api/v2/...` (Blockscout), `/api/prices/xaut?vs=usd`, `/api/wri/delegate-relay`, `/hooks-api`, `/events` (subsidies), `/api/neeru/...` (Neeru).                        |
| Auth             | Mobile -> backend is unauthenticated for read endpoints. Write endpoints (delegate-relay) carry the wallet's signed EIP-7702 authorization in the body.                                    |
| Failure mode     | Same `fetchWithTimeout` policy as everything else. Per-host breaker on `tucop-backend-production.up.railway.app`.                                                                          |
| Related          | `docs/architecture/modules/redux.md` (slice contracts), ADR-0017, `.claude/rules/railway.md`.                                                                                              |

### 2.2 Phone verification API (`api-wallet-tucop`)

| Field          | Value                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Purpose        | OTP-based phone-number-to-wallet linking. Distinct service from `tucop-backend`.                                          |
| Production URL | `https://api-wallet-tucop-production.up.railway.app`                                                                      |
| Endpoints      | `POST /api/wallets/request-otp`, `POST /api/wallets/verify-otp`, `GET /api/wallets/by-phone`, `POST /api/wallets/unlink`. |
| Used by        | `src/verify/` flow, contact resolution, RevokePhoneNumber.                                                                |
| Auth           | Wallet-signed message (SIWE-style) on protected endpoints.                                                                |
| Failure mode   | Retry + breaker. OTP flow surfaces "no se pudo enviar el codigo" on failure and offers retry.                             |

### 2.3 Twilio-backed keyless backup service

| Field          | Value                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose        | SMS OTP for keyless backup, SIWE login session, encrypted mnemonic storage.                                                                                |
| Production URL | `https://twilio-service.up.railway.app`                                                                                                                    |
| Endpoints      | `POST /otp/send`, `POST /otp/verify`, `POST /keyless-backup`, `GET /keyless-backup`, `POST /keyless-backup/delete`, `POST /siwe/login`, `GET /siwe/clock`. |
| Used by        | `src/keylessBackup/saga.ts`, `src/keylessBackup/index.ts`.                                                                                                 |
| Auth           | CAB API key (`CAB_API_KEY_MAINNET` JWT in `src/web3/networkConfig.ts`) + SIWE session on backup endpoints.                                                 |
| Failure mode   | Retry + breaker. Keyless restore surfaces an explicit error and never partial-restores.                                                                    |
| Related        | `services/twilio-service/README.md`.                                                                                                                       |

### 2.4 BucksPay webhook proxy (DEPRECATED)

| Field        | Value                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Status       | DEPRECATED. Feature was sunset; UI is feature-gated off. Documentation kept for archival.                                    |
| Purpose      | Convert COPm to COP, push to a Colombian bank account.                                                                       |
| Endpoint     | `https://buckspay-webhook-production-ad81.up.railway.app` (`BUCKSPAY_API_BASE_URL`). Web app at `https://app.buckspay.xyz/`. |
| Used by      | `src/buckspay/api.ts` (`checkUserExists`, `submitTransaction`, `getTransactionStatus`). Gated behind `show_buckspay`.        |
| Auth         | Bearer token in backend; mobile only sends wallet address + tx hash.                                                         |
| Spec         | See `docs/archive/2026-06-buckspay/api.md` for the full OpenAPI 3.0 spec preserved at archival.                              |
| Failure mode | Standard retry + breaker.                                                                                                    |

### 2.5 Auth0 (OAuth provider for keyless backup)

| Field        | Value                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Purpose      | OAuth login (Google, Apple) for the keyless backup flow. Tenant is shared with legacy Valora infra.              |
| Domain       | `auth.valora.xyz`                                                                                                |
| Client ID    | `FS2sPfMvDBKy0udOoCbc4ao8HakvAR6b`                                                                               |
| Used by      | `src/keylessBackup/SignInWithEmail.tsx` via `react-native-auth0` (`Auth0Provider` mounted in `src/app/App.tsx`). |
| Failure mode | Auth0 errors abort the keyless backup setup; the user can retry. No fallback provider.                           |
| Related      | `src/keylessBackup/saga.ts`, Section 2.6 (Web3Auth) consumes the resulting JWT.                                  |

### 2.6 Web3Auth / Torus (mnemonic key-share)

| Field        | Value                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Purpose      | Distributed key generation: derive a deterministic share from the Auth0 JWT to seal/unseal the mnemonic.     |
| SDK          | `@toruslabs/torus.js`, `@toruslabs/fetch-node-details`, `@toruslabs/constants`. Network: `SAPPHIRE_MAINNET`. |
| Verifier     | `valora-cab-auth0` (`WEB3_AUTH_VERIFIER` in `networkConfig.ts`).                                             |
| Client ID    | `WEB3AUTH_CLIENT_ID` hardcoded in `src/config.ts`.                                                           |
| Used by      | `src/keylessBackup/web3auth.ts` (`getTorusPrivateKey`).                                                      |
| Failure mode | Network error -> user sees "no pudimos verificar tu cuenta", can retry.                                      |

### 2.7 Persona (KYC / identity verification)

| Field        | Value                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| Purpose      | KYC for in-app fiat ramps where required.                                    |
| SDK          | `react-native-persona` v2.2.23, environment `PersonaEnvironment.PRODUCTION`. |
| Template     | `DEFAULT_PERSONA_TEMPLATE_ID = 'itmpl_5FYHGGFhdAYvfd7FvSpNADcC'`.            |
| Used by      | `src/account/Persona.tsx`.                                                   |
| Auth         | SDK-managed session token.                                                   |
| Failure mode | KYC failure blocks the fiat path; user can retry.                            |

### 2.8 Cloud Functions (legacy Valora)

| Field            | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose          | Hosts the remaining endpoints the app has not yet migrated off (FiatConnect provider discovery, Simplex proxy, points system, NFT lookup, Jumpstart claims, tokensInfo with prices, exchange-rate, wallet-balances).                                                                                                                                                                                                                                                                                                                                         |
| Base URL         | `https://api.mainnet.valora.xyz` (`CLOUD_FUNCTIONS_MAINNET`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Endpoints in app | `/getTokensInfoWithPrices`, `/getExchanges`, `/fetchProviders`, `/getFiatConnectProviders`, `/getQuotes`, `/processSimplexRequest`, `/walletJumpstart`, `/getNfts`, `/getWalletTransactions`, `/getWalletBalances`, `/getExchangeRate`, `/getPointsHistory`, `/getPointsConfig`, `/getPointsBalance`, `/trackPointsEvent`, `/simulateTransactions`, `/lookupPhoneNumber`, `/lookupAddress`, `/saveContacts`, `/checkAddressVerified`, `/resolveId`, `/setRegistrationProperties`, `/migrateASv1Verification`, `/fetchUserLocationData`, `/rpc/arbitrum-one`. |
| Auth             | EIP-712 signed `setRegistrationProperties` message; most read endpoints are unauthenticated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Migration status | Being decommissioned per WRI Track D. Migration target: TuCop backend or direct on-chain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Failure mode     | Per-host breaker. Many endpoints are best-effort (tokensInfo cache survives a brief outage).                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### 2.9 In-house liquidity (FiatConnect KYC + transfers)

| Field    | Value                                                             |
| -------- | ----------------------------------------------------------------- |
| Purpose  | KYC submission + crypto-fiat transfers via the FiatConnect API.   |
| Endpoint | `https://liquidity-dot-celo-mobile-mainnet.appspot.com`           |
| SDK      | `@fiatconnect/fiatconnect-sdk`, `@fiatconnect/fiatconnect-types`. |
| Used by  | `src/in-house-liquidity/`, `src/fiatconnect/`.                    |
| Auth     | SIWE session per provider.                                        |

### 2.10 Zendesk (in-app support)

| Field        | Value                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Purpose      | Submit user-initiated support requests with attached logs.                                                 |
| Endpoint     | `https://tucopwallet.zendesk.com/api/v2/requests.json` (subdomain `ZENDESK_PROJECT_NAME = 'tucopwallet'`). |
| Auth         | API key in `secrets.json` (`ZENDESK_API_KEY`).                                                             |
| Used by      | `src/account/zendesk.ts`, `src/account/SupportContact.tsx`.                                                |
| Failure mode | Failed submission shows an error toast; the user can retry.                                                |

### 2.11 Crowdin (over-the-air translations)

| Field             | Value                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| Purpose           | Pull updated translation strings without shipping a new app version.            |
| Distribution hash | `CROWDIN_DISTRIBUTION_HASH = 'e-f9f6869461793b9d1a353b2v7c'` (`src/config.ts`). |
| Used by           | `src/i18n/saga.ts`. Cached locally at `${CachesDirectoryPath}/translations`.    |
| Failure mode      | App falls back to bundled strings. Silent.                                      |

### 2.12 App store update checker

| Field        | Value                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Purpose      | Detect a newer build and surface an upgrade prompt. Queries the stores directly, not the backend. |
| iOS          | `GET https://itunes.apple.com/lookup?id=${APP_STORE_ID}`                                          |
| Android      | Play Store version page.                                                                          |
| Used by      | `src/utils/appUpdateChecker.ts`.                                                                  |
| Failure mode | Silent. The prompt simply does not appear.                                                        |

---

## 3. Price feeds

### 3.1 CoinMarketCap (via TuCop backend proxy)

| Field             | Value                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Purpose           | USD price of XAUt0 (digital gold) for the gold buy UI.                                                                         |
| Endpoint          | `GET https://tucop-backend-production.up.railway.app/api/prices/xaut?vs=usd` (`getXautPriceUrl`).                              |
| Used by           | `src/gold/` price selectors.                                                                                                   |
| Auth              | Backend holds the CoinMarketCap key. Mobile bundle ships none.                                                                 |
| Failure mode      | Retry + breaker. Last-known price is reused; if absent, gold buy is disabled with a "no podemos cotizar el oro ahora" message. |
| Migration history | Replaces direct CoinMarketCap calls and the CMC key from the bundle (WRI Track D Task 4-6).                                    |

### 3.2 Cloud Functions token prices (legacy)

| Field     | Value                                                        |
| --------- | ------------------------------------------------------------ |
| Purpose   | USD + COP prices for tokens shown in balances.               |
| Endpoint  | `GET https://api.mainnet.valora.xyz/getTokensInfoWithPrices` |
| Used by   | `src/tokens/saga.ts`.                                        |
| Migration | Target for migration to TuCop backend (post-Track D).        |

---

## 4. Observability and config

### 4.1 Sentry (error tracking + tracing)

| Field         | Value                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose       | Crash reports, breadcrumbs (including `fetchWithTimeout` retry events), perf traces.                                                               |
| SDK           | `@sentry/react-native` 6.22.x.                                                                                                                     |
| DSN           | `SENTRY_CLIENT_URL` in `secrets.json` (loaded by `src/config.ts`).                                                                                 |
| Enabled flag  | `SENTRY_ENABLED` env var. Sample rate `DEFAULT_SENTRY_TRACES_SAMPLE_RATE = 0.2`.                                                                   |
| Tracing hosts | `forno.celo.org`, `blockchain-api-dot-celo-mobile-mainnet.appspot.com`, `api.mainnet.valora.xyz`, `liquidity-dot-celo-mobile-mainnet.appspot.com`. |
| Used by       | `src/sentry/Sentry.ts`, `src/utils/Logger.ts`, `src/utils/fetchWithTimeout.ts` (breadcrumbs).                                                      |
| Failure mode  | Silent. Sentry buffers offline and flushes when available.                                                                                         |
| Related       | ADR-0011 (error handling + logging).                                                                                                               |

### 4.2 Statsig (feature flags + experiments)

| Field        | Value                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Purpose      | Feature gates, dynamic configs, experiments, A/B testing. Single source of truth for `show_*` toggles. |
| SDK          | `statsig-react-native` ^4.15.0.                                                                        |
| API key      | `STATSIG_API_KEY` in `secrets.json` (client key). Falls back to a dummy key in E2E.                    |
| Env          | `STATSIG_ENV = { tier: 'production' }`.                                                                |
| Used by      | `src/statsig/index.ts`. Read via `getFeatureGate`, `getExperimentParams`, `getDynamicConfigParams`.    |
| Failure mode | Uninitialized SDK returns each gate's default value (typically `false`).                               |
| Related      | ADR-0010.                                                                                              |

### 4.3 Firebase

| Field        | Value                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Purpose      | Push notifications (FCM), Remote Config (Statsig is primary), Realtime Database (legacy bits), Auth (legacy bits). |
| SDKs         | `@react-native-firebase/app`, `/messaging`, `/remote-config`, `/database`, `/auth`.                                |
| Enabled flag | `FIREBASE_ENABLED = false` in `src/config.ts`. Currently OFF.                                                      |
| Used by      | `src/firebase/firebase.ts`, `src/firebase/notifications.ts`.                                                       |
| Config       | `google-services.json` (Android) / `GoogleService-Info.plist` (iOS) in `secrets.json`.                             |
| Failure mode | When disabled, push permission flow is short-circuited; nothing else degrades.                                     |

### 4.4 CleverTap (push + inbox)

| Field        | Value                                                                       |
| ------------ | --------------------------------------------------------------------------- |
| Purpose      | Notification inbox, marketing push.                                         |
| SDK          | `clevertap-react-native` ^2.2.1, wired in via the Segment CleverTap plugin. |
| Used by      | `src/home/cleverTapInbox.ts`, `src/home/NotificationCenter.tsx`.            |
| Auth         | SDK-managed account token in `secrets.json`.                                |
| Failure mode | Inbox stays empty until next successful sync.                               |

### 4.5 Segment (analytics pipeline)

| Field   | Value                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose | Event tracking. Currently dormant: `init()` is commented out in `src/analytics/AppAnalytics.ts`, so events are queued but not flushed. |
| SDK     | `@segment/analytics-react-native` ^2.21.2, with plugins for Adjust, CleverTap, Firebase, destination filters.                          |
| Used by | `src/analytics/AppAnalytics.ts` (`track`, `identify`, `page`, `startSession`).                                                         |
| API key | `SEGMENT_API_KEY` in `secrets.json` (currently unused since init is disabled).                                                         |

---

## 5. Wallet protocol

### 5.1 WalletConnect v2

| Field             | Value                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Pair the wallet with external dApps (web, mobile, desktop) over the WalletConnect Relay protocol.                                                                 |
| Project ID        | `WALLET_CONNECT_PROJECT_ID = 'dcc6ce1fc698ea19c114e7afe1bc469f'` (`src/config.ts`).                                                                               |
| Relay             | `wss://relay.walletconnect.org` (`walletConnectEndpoint`).                                                                                                        |
| Verify            | `https://verify.walletconnect.com` (dApp origin verification).                                                                                                    |
| Universal link    | `https://tucop.xyz/wc` (`WALLETCONNECT_UNIVERSAL_LINK`).                                                                                                          |
| SDKs              | `@walletconnect/core` ^2.21.4, `@walletconnect/sign-client` ^2.19.0, `@walletconnect/utils`, `@walletconnect/react-native-compat`, `@walletconnect/legacy-types`. |
| Supported methods | `personal_sign`, `eth_signTypedData[_v4]`, `eth_sendTransaction`.                                                                                                 |
| Used by           | `src/walletConnect/walletConnect.ts`, `src/walletConnect/request.ts`, the `walletConnect` Redux slice, dApp shortcuts.                                            |
| Failure mode      | Relay drops are auto-reconnected by the SDK. Pairing failures surface as a toast and the session is rolled back.                                                  |
| Related           | ADR-0008 (navigation), `src/walletConnect/` slice.                                                                                                                |

---

## 6. Conventions

- All HTTP through `src/utils/fetchWithTimeout.ts`. Direct `fetch` in feature code is a lint smell.
- Secrets live in `secrets.json` (gitignored) and are loaded by `src/config.ts`. Hardcoded keys in source are forbidden.
- Backend-proxied APIs (Squid, Blockscout, CoinMarketCap, WRI relay) never expose their upstream key to the mobile bundle.
- New external dependencies require an ADR if the integration is non-trivial. See `docs/adr/template.md`.
- When deprecating an integration, move its spec under `docs/archive/<date>-<name>/` and update this file to mark it DEPRECATED, do not delete it.

## Related documents

- ADR-0008 navigation architecture (WalletConnect)
- ADR-0010 feature flags Statsig
- ADR-0011 error handling and logging (Sentry, Logger)
- ADR-0015 EIP-7702 BatchExecutor (WRI delegate-relay caller)
- ADR-0017 Squid integrator via TuCop backend
- ADR-0018 Celo gas-estimate calibration
- `docs/archive/2026-06-buckspay/api.md` BucksPay OpenAPI spec (archived)
- `docs/architecture/modules/redux.md` slice contracts and state shapes
- `docs/architecture/modules/blockchain.md` on-chain layer
- `docs/reference/celo-gas-optimization.md`
- `services/twilio-service/README.md`
