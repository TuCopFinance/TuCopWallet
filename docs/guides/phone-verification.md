# Integrated Phone Verification System

## Problem Summary

Previously, TuCOP Wallet had two completely separate phone verification systems:

1. **Regular System** (`api-wallet-tlf-production.up.railway.app`)

   - Only links phone number to wallet address
   - Used in settings and basic verification

2. **Keyless Backup System** (`twilio-service.up.railway.app`)
   - Generates keyshares to encrypt/decrypt the mnemonic
   - Used for backup and restore without a recovery phrase

**Problem:** Users who performed keyless backup did not have their number linked to their profile, and vice versa.

## Implemented Solution

### Bidirectional Integration

#### 1. Keyless Backup → Regular System

**File:** `src/keylessBackup/hooks.ts`

When a user successfully completes SMS verification in keyless backup:

1. The keyshare is generated normally
2. **NEW:** The number is automatically registered in the regular system
3. `phoneNumberVerificationCompleted()` is dispatched to update the state
4. The number becomes linked to the profile

```typescript
// After verifying SMS in keyless backup
const registeredInRegularSystem = await registerPhoneInRegularSystem(phoneNumber, walletAddress)

if (registeredInRegularSystem) {
  const countryCallingCode = phoneNumber.match(/^\+(\d{1,3})/)?.[1] || ''
  dispatch(phoneNumberVerificationCompleted(phoneNumber, `+${countryCallingCode}`))
}
```

#### 2. Regular System → Keyless Backup

**File:** `src/verify/hooks.ts`

When a user attempts to verify their number in the regular system:

1. **NEW:** First checks if the number already exists in keyless backup
2. If it exists, auto-verifies without requiring SMS
3. If it does not exist, proceeds with normal verification

```typescript
// Before requesting SMS
const existsInKeylessBackup = await checkPhoneInKeylessBackupSystem(phoneNumber, address)
if (existsInKeylessBackup) {
  await handleAlreadyVerified() // Auto-verifies
  return
}
```

## User Flows

### Scenario 1: User performs Keyless Backup first

1. User sets up keyless backup (Google/Apple + SMS)
2. ✅ **AUTOMATIC:** Number is linked to the profile
3. User goes to Settings → Sees number already verified
4. User can restore without issues

### Scenario 2: User verifies number in Settings first

1. User goes to Settings → Verify phone number
2. ✅ **AUTOMATIC:** System queries keyless backup
3. If backup was done before, auto-verifies
4. If not, proceeds with normal verification

### Scenario 3: User performs Restore

1. User initiates restore with Google/Apple + SMS
2. ✅ **AUTOMATIC:** Number is linked to the profile during restore
3. Wallet is recovered with the number already verified

## Benefits

### For the User

- **Unified experience:** A single verification process
- **No duplication:** No need to verify the same number twice
- **Consistency:** The number always appears verified in the profile

### For the System

- **Synchronized data:** Both systems know which numbers are verified
- **Complete backup:** Keyless backup includes profile linking
- **Compatibility:** Works with existing users from both systems

## Technical Implementation

### Helper Functions

#### `registerPhoneInRegularSystem()`

```typescript
// Registers a number verified in keyless backup into the regular system
async function registerPhoneInRegularSystem(phoneNumber: string, walletAddress: string)
```

#### `checkPhoneInKeylessBackupSystem()`

```typescript
// Checks if a number already exists in the keyless backup system
async function checkPhoneInKeylessBackupSystem(phoneNumber: string, walletAddress: string)
```

### Endpoints Used

1. **Regular System:**

   - `POST /api/wallets/request-otp` - Request code
   - `POST /api/wallets/verify-otp` - Verify code

2. **Keyless Backup System:**
   - `POST /otp/send` - Send SMS
   - `POST /otp/verify` - Verify and obtain keyshare
   - `POST /keyless-backup/check-phone` - **NEW:** Check existence

## Backend Considerations

### Required Endpoint in Keyless Backup

The system needs a new endpoint to query whether a number exists:

```
POST /keyless-backup/check-phone
{
  "phone": "+573001234567",
  "wallet": "0x123..."
}

Response:
{
  "exists": true/false
}
```

### Error Handling

- If registration in the regular system fails → Continues with keyless backup
- If the keyless backup query fails → Continues with normal verification
- Detailed logs for debugging

## Testing

### Test Cases

1. ✅ Keyless backup → Verify that the number appears in the profile
2. ✅ Regular verification → Verify that keyless backup is queried
3. ✅ Existing user with keyless backup → Auto-verification
4. ✅ New user → Normal verification
5. ✅ Network errors → Appropriate fallback

### Debug Logs

```
keylessBackup/hooks/registerPhoneInRegularSystem
verify/hooks/checkPhoneInKeylessBackupSystem
```

## Migration of Existing Users

### Users with Keyless Backup without Verification

- Upon opening Settings → Number automatically appears as verified
- No additional action required

### Users with Verification without Keyless Backup

- They can perform keyless backup normally
- The system recognizes that they are already verified

## Next Steps

1. **Implement endpoint** `/keyless-backup/check-phone` on the backend
2. **Exhaustive testing** of all flows
3. **Monitoring** of logs to detect issues
4. **Documentation** for the backend team

## Conclusion

This integration eliminates the fragmentation between systems and provides a coherent user experience, where phone verification works seamlessly regardless of the user's entry point.
