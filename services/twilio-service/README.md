# twilio-service — Keyless Backup Service

> **STATUS: PLACEHOLDER** — Source code not available locally. Service is running on Railway.

## Production URL

`https://twilio-service.up.railway.app`

## Purpose

Handles SMS verification via Twilio and manages encrypted mnemonic storage for keyless backup/restore. Uses Sign-In With Ethereum (SIWE) for authentication.

## Endpoints

### OTP / SMS

| Method | Endpoint      | Description                           |
| ------ | ------------- | ------------------------------------- |
| `POST` | `/otp/send`   | Send SMS verification code via Twilio |
| `POST` | `/otp/verify` | Verify OTP and return app keyshare    |

### Keyless Backup

| Method | Endpoint                 | Description                 |
| ------ | ------------------------ | --------------------------- |
| `POST` | `/keyless-backup`        | Store encrypted mnemonic    |
| `GET`  | `/keyless-backup`        | Retrieve encrypted mnemonic |
| `POST` | `/keyless-backup/delete` | Delete encrypted mnemonic   |

### SIWE (Sign-In With Ethereum)

| Method | Endpoint      | Description               |
| ------ | ------------- | ------------------------- |
| `POST` | `/siwe/login` | Authenticate via SIWE     |
| `GET`  | `/siwe/clock` | Clock sync for SIWE nonce |

## App Integration

Referenced in `src/web3/networkConfig.ts` (lines 255-273):

- `CAB_ISSUE_SMS_CODE_*` -> `POST /otp/send`
- `CAB_ISSUE_APP_KEYSHARE_*` -> `POST /otp/verify`
- `CAB_STORE_ENCRYPTED_MNEMONIC_*` -> `POST /keyless-backup`
- `CAB_GET_ENCRYPTED_MNEMONIC_*` -> `GET /keyless-backup`
- `CAB_DELETE_ENCRYPTED_MNEMONIC_*` -> `POST /keyless-backup/delete`
- `CAB_LOGIN_*` -> `POST /siwe/login`
- `CAB_CLOCK_*` -> `GET /siwe/clock`

## Authentication

Uses JWT API keys defined in `networkConfig.ts`:

- `CAB_API_KEY_MAINNET` / `CAB_API_KEY_STAGING`

## TODO

- [ ] Recover source code from Railway or original deployment
- [ ] Add source code to this directory
- [ ] Document environment variables (Twilio credentials, DB config, SIWE secrets)
- [ ] Add Dockerfile / railway.toml for deployment
