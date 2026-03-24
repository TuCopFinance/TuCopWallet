# api-wallet-tlf — Phone Verification Service

> **STATUS: PLACEHOLDER** — Source code not available locally. Service is running on Railway.

## Production URL

`https://api-wallet-tlf-production.up.railway.app`

## Purpose

Links phone numbers to wallet addresses. Used for identity verification and contact resolution in TuCOP Wallet.

## Endpoints

| Method | Endpoint                   | Description                             |
| ------ | -------------------------- | --------------------------------------- |
| `POST` | `/api/wallets/request-otp` | Send OTP code via SMS to a phone number |
| `POST` | `/api/wallets/verify-otp`  | Verify the OTP code sent to the user    |
| `GET`  | `/api/wallets/by-phone`    | Resolve wallet address by phone number  |
| `POST` | `/api/wallets/unlink`      | Unlink phone number from wallet         |

## App Integration

Referenced in `src/web3/networkConfig.ts` (lines 210-226):

- `VERIFY_PHONE_NUMBER_*` -> `POST /api/wallets/request-otp`
- `VERIFY_SMS_CODE_*` -> `POST /api/wallets/verify-otp`
- `RESOLVE_PHONE_NUMBER_*` -> `GET /api/wallets/by-phone`
- `REVOKE_PHONE_NUMBER_*` -> `POST /api/wallets/unlink`

## Integration with Keyless Backup

This service is bidirectionally integrated with `twilio-service`:

- When a user verifies via keyless backup, the number is auto-registered here
- When a user verifies here, the system checks if they already exist in keyless backup

See `docs/phone-verification.md` for full integration details.

## TODO

- [ ] Recover source code from Railway or original deployment
- [ ] Add source code to this directory
- [ ] Document environment variables
- [ ] Add Dockerfile / railway.toml for deployment
