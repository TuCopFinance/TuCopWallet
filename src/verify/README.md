# Verify Module

## Overview

The Verify module provides the UI and hooks for phone number verification. It
handles SMS code requests, verification, and phone number revocation.

## Directory Structure

```
src/verify/
├── README.md                         # This file
├── hooks.ts                          # Core verification hooks
├── hooks.test.tsx                    # Hook tests
├── VerificationStartScreen.tsx       # Phone input screen
├── VerificationStartScreen.test.tsx  # Start screen tests
├── VerificationCodeInput.tsx         # Code input component
├── VerificationCodeInput.test.tsx    # Code input tests
├── VerificationCodeInputScreen.tsx   # Code screen wrapper
├── VerificationCodeInputScreen.test.tsx
└── ResendButtonWithDelay.tsx         # Resend with cooldown
```

## User Flow

```
VerificationStartScreen
        │
        │ User enters phone number
        ▼
┌───────────────────┐
│ Check if phone    │
│ exists in Cloud   │
│ Account Backup    │
└────────┬──────────┘
         │
    ┌────┴────┐
    │         │
 Exists    Not Found
    │         │
    ▼         ▼
Auto-verify   Request SMS
    │         │
    │         ▼
    │  VerificationCodeInputScreen
    │         │
    │         │ User enters 6-digit code
    │         ▼
    │  ┌───────────────────┐
    │  │ Verify SMS code   │
    │  │ with backend      │
    │  └────────┬──────────┘
    │           │
    └─────┬─────┘
          │
          ▼
   Verification Complete
   (phoneNumberVerificationCompleted)
```

## Key Hooks

### useVerifyPhoneNumber

Main hook for the verification flow:

```typescript
function useVerifyPhoneNumber(phoneNumber: string, countryCode: string) {
  const [smsCode, setSmsCode] = useState('')
  const [verificationStatus, setVerificationStatus] = useState('NONE')

  // Request SMS code
  useEffect(() => {
    async function requestCode() {
      // 1. Check Cloud Account Backup first
      const exists = await checkPhoneInCAB(phoneNumber)
      if (exists) {
        dispatch(phoneNumberVerificationCompleted())
        setVerificationStatus('SUCCESSFUL')
        return
      }

      // 2. Request SMS verification
      await fetch(networkConfig.verifyPhoneNumberUrl, {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
      })
    }

    requestCode()
  }, [phoneNumber])

  // Submit code when entered
  useEffect(() => {
    if (smsCode.length === 6) {
      verifyCode(smsCode)
    }
  }, [smsCode])

  return { resendSms, setSmsCode, verificationStatus }
}
```

### useRevokeCurrentPhoneNumber

Revoke phone verification:

```typescript
function useRevokeCurrentPhoneNumber() {
  return useCallback(async () => {
    await fetch(networkConfig.revokePhoneNumberUrl, {
      method: 'DELETE',
      headers: { 'x-api-key': API_KEY },
      body: JSON.stringify({ address: walletAddress }),
    })

    dispatch(phoneNumberRevoked())
  }, [])
}
```

## Components

### VerificationStartScreen

Phone number input screen:

```typescript
<VerificationStartScreen
  route={{ params: { selectedCountryCodeAlpha2 } }}
/>

// Features:
// - Phone number input with country code
// - Country selection via bottom sheet
// - Progress indicator (if in onboarding)
// - "Learn More" help dialog
```

### VerificationCodeInput

Reusable code input component:

```typescript
<VerificationCodeInput
  phoneNumber="+573001234567"
  verificationStatus={status}
  setSmsCode={setSmsCode}
  onResendSms={resendSms}
  onSuccess={() => navigate('Home')}
/>

// Features:
// - 6-digit code input
// - Auto-submit on complete
// - Shows phone number being verified
// - Resend button with delay
// - Error state handling
```

### ResendButtonWithDelay

Resend button with 30-second cooldown:

```typescript
<ResendButtonWithDelay
  onResend={resendSms}
/>

// Features:
// - 30-second delay (Twilio recommended)
// - Real-time countdown display
// - Disabled state during cooldown
// - Tabular numerals for consistent width
```

## API Integration

### Request Verification Code

```typescript
POST /api/verify/start
{
  "phoneNumber": "+573001234567"
}

Response:
{
  "verificationId": "verify_abc123"
}
```

### Verify Code

```typescript
POST /api/verify/confirm
{
  "phoneNumber": "+573001234567",
  "code": "123456",
  "address": "0x..."
}

Response:
{
  "success": true
}
```

### Revoke Verification

```typescript
DELETE /api/verify/revoke
{
  "address": "0x..."
}
```

## Verification Status

```typescript
enum PhoneNumberVerificationStatus {
  NONE = 'NONE', // Not started
  SUCCESSFUL = 'SUCCESSFUL', // Verified
  FAILED = 'FAILED', // Verification failed
}
```

## Analytics Events

| Event                         | When                    |
| ----------------------------- | ----------------------- |
| `verification_start`          | User opens verification |
| `verification_code_requested` | SMS requested           |
| `verification_code_entered`   | User enters code        |
| `verification_success`        | Code verified           |
| `verification_failed`         | Code invalid            |
| `verification_resend`         | User resends SMS        |

## Error Handling

| Error             | Handling                |
| ----------------- | ----------------------- |
| Invalid phone     | Show format error       |
| SMS send failed   | Show retry option       |
| Wrong code        | Show error, clear input |
| Too many attempts | Show cooldown message   |
| Network error     | Show retry button       |

## Cloud Account Backup Integration

If phone exists in Cloud Account Backup:

```typescript
// Check if phone has encrypted mnemonic
const response = await fetch(`${networkConfig.cabGetEncryptedMnemonicUrl}/check-phone`, {
  method: 'POST',
  body: JSON.stringify({ phoneNumber }),
})

if (response.exists) {
  // Auto-verify without SMS
  dispatch(phoneNumberVerificationCompleted())
}
```

## Related Documentation

- [Identity Module](../identity/README.md)
- [Onboarding Flow](../../docs/architecture/diagrams/flow-onboarding.md)
- [Phone Verification Service](../../docs/architecture/modules/integrations.md)
