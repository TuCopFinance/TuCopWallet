# BucksPay Implementation Guide

Implementation details for the BucksPay offramp integration in TuCOP Wallet.

For the BucksPay API reference, see [buckspay-api.md](buckspay-api.md).

---

## Architecture

The mobile app does **NOT** call the BucksPay API directly. All API calls go through a **server-side proxy** hosted on Railway. This keeps API credentials secure and off the mobile client.

```
Mobile App  ──→  Railway Proxy  ──→  BucksPay API (api.buckspay.xyz)
                 (injects credentials)

BucksPay    ──→  Railway Proxy /webhook  ──→  (logs / future processing)
                 (transaction completion callbacks)
```

> **Note**: BucksPay API uses "CCOP"/"ccop" as the crypto identifier. In the TuCOP app, this token is called **COPm** (renamed from cCOP).

---

## Infrastructure

| Component           | URL                                                                              | Purpose                              |
| ------------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| **Proxy + Webhook** | `https://buckspay-webhook-production-ad81.up.railway.app`                        | Proxies API calls, receives webhooks |
| **Railway Project** | [TuCop Wallet](https://railway.com/project/a65b8682-cbf2-48cc-b62f-f6b5bc69a994) | Hosts the service                    |
| **Health Check**    | `GET https://buckspay-webhook-production-ad81.up.railway.app/`                   | Returns `{"status":"ok"}`            |

### Railway Environment Variables

Credentials are stored **server-side only** as Railway environment variables:

| Variable                  | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `BUCKSPAY_API_KEY`        | API key for BucksPay authentication                 |
| `BUCKSPAY_API_SECRET`     | API secret for BucksPay authentication              |
| `BUCKSPAY_WEBHOOK_SECRET` | HMAC-SHA256 secret for verifying webhook signatures |

### Proxy Source Code

Located at `/buckspay-webhook/` in the parent TuCOP directory (outside this repo).

Simple Express server that:

- Proxies API requests to BucksPay, injecting credentials server-side
- Receives webhook callbacks and verifies HMAC signatures

---

## Proxy Endpoint Mapping

The proxy mirrors the BucksPay API but strips the authentication layer from the client:

| Mobile App Calls                      | Proxy Forwards To                        |
| ------------------------------------- | ---------------------------------------- |
| `GET /api/check/{address}`            | `GET /v1/external/check/{address}`       |
| `POST /api/transaction`               | `POST /v1/external/transaction`          |
| `GET /api/transaction/{trxHash}`      | `GET /v1/external/transaction/{trxHash}` |
| `POST /webhook` (BucksPay calls this) | N/A (receives and logs)                  |

---

## Mobile App Files

| File                                          | Purpose                                   |
| --------------------------------------------- | ----------------------------------------- |
| `src/buckspay/api.ts`                         | API client (calls proxy, no auth headers) |
| `src/buckspay/saga.ts`                        | Redux saga orchestration                  |
| `src/buckspay/slice.ts`                       | Redux state management                    |
| `src/buckspay/types.ts`                       | TypeScript interfaces                     |
| `src/web3/networkConfig.ts`                   | `BUCKSPAY_API_BASE_URL` (points to proxy) |
| `src/fiatExchanges/SelectOfframpProvider.tsx` | Provider selection screen                 |
| `src/buckspay/BucksPayBankForm.tsx`           | Bank details form                         |
| `src/buckspay/BucksPayConfirm.tsx`            | Transaction confirmation screen           |
| `src/buckspay/BucksPayStatus.tsx`             | Transaction tracking screen               |

---

## Offramp Flow

### User Flow

1. User taps **"Gasta"** on the home screen
2. `SelectOfframpProvider` screen shows BucksPay as provider
3. User taps BucksPay → dispatches `checkUserStart()`

### Saga Flow (`src/buckspay/saga.ts`)

```
checkUserStart()
  │
  ├── GET /api/check/{walletAddress} (via proxy)
  │
  ├── User registered? ──→ YES ──→ Navigate to BucksPayBankForm
  │                                  │
  │                                  ├── User enters bank details
  │                                  ├── Navigate to BucksPayConfirm
  │                                  │     ├── Prepare COPm transfer tx
  │                                  │     └── User confirms
  │                                  │
  │                                  └── offrampStart() dispatched
  │                                        ├── Send COPm to BucksPay wallet
  │                                        ├── POST /api/transaction (via proxy)
  │                                        ├── Navigate to BucksPayStatus
  │                                        └── Poll GET /api/transaction/{trxHash}
  │
  └── User NOT registered? ──→ Open WebView (https://app.buckspay.xyz/)
      (or API error)             User registers on BucksPay webapp
```

### Transaction Status Lifecycle

```
PENDING → INPROGRESS → STARTED → PAYED → FINISHED
```

### Key Constants

| Constant                    | Value                                                     | Location           |
| --------------------------- | --------------------------------------------------------- | ------------------ |
| `BUCKSPAY_API_BASE_URL`     | `https://buckspay-webhook-production-ad81.up.railway.app` | `networkConfig.ts` |
| `BUCKSPAY_RECEIVER_ADDRESS` | `0xB731D9D3840F5C237CB7CD091f6e0ff5f6562Dd0`              | `networkConfig.ts` |
| `BUCKSPAY_CELO_NETWORK_ID`  | `6`                                                       | `networkConfig.ts` |

---

## Credential Management

API credentials are **never** stored in the mobile app or `secrets.json`. They exist only as Railway environment variables on the proxy server.

### Rotating Credentials

1. Register a new integration:
   ```bash
   curl -X POST https://api.buckspay.xyz/v1/external \
     -H "Content-Type: application/json" \
     -d '{"name": "TuCOP Wallet", "webhook": "https://buckspay-webhook-production-ad81.up.railway.app/webhook"}'
   ```
2. Save the returned `apiKey`, `apiSecret`, and `webhookSecret` (shown only once)
3. Update Railway env vars:
   ```bash
   cd /path/to/buckspay-webhook
   railway variables set \
     BUCKSPAY_API_KEY=<new-key> \
     BUCKSPAY_API_SECRET=<new-secret> \
     BUCKSPAY_WEBHOOK_SECRET=<new-webhook-secret> \
     --service buckspay-webhook
   ```
4. Redeploy or the service picks up changes on next restart

### Deploying Updates

```bash
cd /path/to/buckspay-webhook
railway up --detach --service buckspay-webhook
```

---

## Security Considerations

- API credentials exist only on Railway (server-side), never in the mobile app bundle
- Webhook signatures are verified with HMAC-SHA256
- The proxy does not expose any BucksPay admin endpoints
- Rate limiting is handled by BucksPay (100 req/min per API key)
