# TuCOP Wallet — Backend Services

All backend services deployed on Railway for the TuCOP Wallet app.

## Services

| Service                | Directory           | Railway URL                                       | Status           |
| ---------------------- | ------------------- | ------------------------------------------------- | ---------------- |
| **Version API**        | `version-api/`      | `tucopwallet-production.up.railway.app`           | Source available |
| **BucksPay Proxy**     | `buckspay-webhook/` | `buckspay-webhook-production-ad81.up.railway.app` | Source available |
| **Phone Verification** | `api-wallet-tlf/`   | `api-wallet-tlf-production.up.railway.app`        | Placeholder      |
| **Keyless Backup**     | `twilio-service/`   | `twilio-service.up.railway.app`                   | Placeholder      |

## Service Descriptions

### version-api

App version management. The mobile app checks this on startup to determine if a forced update is required. Also receives GitHub webhooks to auto-update versions on new releases.

### buckspay-webhook

Proxy between the mobile app and BucksPay API. Keeps API credentials server-side. Also receives transaction completion webhooks from BucksPay.

### api-wallet-tlf (placeholder)

Phone number verification via OTP. Links phone numbers to wallet addresses for contact resolution and identity.

### twilio-service (placeholder)

SMS via Twilio for keyless backup. Stores/retrieves encrypted mnemonics. SIWE authentication for secure access.

## Railway Project

- **Project ID:** `a65b8682-cbf2-48cc-b62f-f6b5bc69a994`
- **Account:** admin@tucop.org

## Development

Each service is an independent Node.js app with its own `package.json`. To run locally:

```bash
cd services/<service-name>
npm install
npm run dev   # or npm start
```

## TODO

- [ ] Recover source code for `api-wallet-tlf` and `twilio-service`
- [ ] Add Dockerfiles for consistent deployments
- [ ] Add railway.toml configs per service
