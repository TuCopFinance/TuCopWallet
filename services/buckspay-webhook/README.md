# BucksPay Webhook Proxy

Server-side proxy for the BucksPay offramp API. Keeps API credentials off mobile devices.

## How it works

```
Mobile App  -->  This proxy  -->  BucksPay API (api.buckspay.xyz)
(no secrets)    (injects creds)   (bank transfers)
```

The proxy:

1. Receives API calls from the TuCOP mobile app (no credentials needed)
2. Injects `X-API-Key` and `X-API-Secret` headers
3. Forwards to BucksPay's real API at `https://api.buckspay.xyz/v1`
4. Receives webhook callbacks from BucksPay and verifies HMAC-SHA256 signatures

## Endpoints

| Method | Path                        | Purpose                          |
| ------ | --------------------------- | -------------------------------- |
| GET    | `/`                         | Health check                     |
| GET    | `/api/check/:address`       | Check if user exists in BucksPay |
| POST   | `/api/transaction`          | Submit transaction for offramp   |
| GET    | `/api/transaction/:trxHash` | Get transaction status           |
| POST   | `/webhook`                  | Receive BucksPay callbacks       |

## Environment Variables

| Variable                  | Description                             |
| ------------------------- | --------------------------------------- |
| `PORT`                    | Server port (default: 3000)             |
| `BUCKSPAY_API_KEY`        | BucksPay API key                        |
| `BUCKSPAY_API_SECRET`     | BucksPay API secret                     |
| `BUCKSPAY_WEBHOOK_SECRET` | Secret for verifying webhook signatures |

These are set as Railway environment variables, never committed to the repo.

## Deployment (Railway)

- **Service:** `buckspay-webhook`
- **URL:** `https://buckspay-webhook-production-ad81.up.railway.app`
- **Root directory:** Set to `services/buckspay-webhook` in Railway dashboard

To deploy updates, push to main. Railway auto-deploys from this directory.

## Local Development

```bash
cd services/buckspay-webhook
npm install
BUCKSPAY_API_KEY=xxx BUCKSPAY_API_SECRET=xxx node index.js
```

## Note

This directory is excluded from the React Native Metro bundler via `metro.config.js` blockList.
It is NOT part of the mobile app build.
