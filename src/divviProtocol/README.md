# Divvi Protocol Integration v2

This folder contains the integration with the Divvi protocol for referral tracking in blockchain transactions.

## Migration to v2 Completed ✅

The integration has been successfully updated from v1 to v2 of the Divvi SDK. The main changes include:

### Changes Made

1. **Main Function**: `getDataSuffix` → `getReferralTag`
2. **Required Parameter**: Added the `user` parameter (user address)
3. **Simplification**: The `providers` parameter is no longer required in v2

### Updated Files

- ✅ `divviService.ts` - Main service updated to v2
- ✅ `register.ts` - Registration logic updated
- ✅ `registerReferral.ts` - Utility functions updated
- ✅ `selectors.ts` - Selectors updated
- ✅ `slice.ts` - Redux slice updated with `user` field
- ✅ `saga.ts` - Saga updated to handle v2

### New v2 Features

#### 1. Required `user` Parameter

```typescript
// v1 (PREVIOUS)
getDataSuffix({
  consumer: consumerAddress,
  providers: providerAddresses,
})

// v2 (CURRENT)
getReferralTag({
  user: userAddress, // ✅ New required parameter
  consumer: consumerAddress, // ✅ Kept
  // providers is no longer needed
})
```

#### 2. Cryptographic Verification

- Divvi now cryptographically verifies that the specified `user` is the one who actually consented to the transaction
- Prevents false referrals and ensures accurate attribution
- Supports both EOA and smart contract wallets (EIP-1271)

#### 3. Signed Message Support

- Enables off-chain referrals without on-chain transactions
- Perfect for cash-in flows, airdrops, etc.
- Supports multiple message formats

## File Structure

```
src/divviProtocol/
├── README.md              # This documentation
├── api.ts                 # Re-exports for compatibility
├── divviService.ts        # Main service (v2)
├── register.ts            # Registration logic (v2)
├── registerReferral.ts    # Referral utilities (v2)
├── saga.ts                # Redux saga (v2)
├── selectors.ts           # State selectors (v2)
└── slice.ts               # Redux slice (v2)
```

## Usage

### Get Data Suffix for Transactions

```typescript
import { fetchDivviCalldata } from 'src/divviProtocol/divviService'

// In a component or saga
const state = store.getState()
const dataSuffix = await fetchDivviCalldata(state)

if (dataSuffix) {
  // Use the suffix in the transaction
  const txData = originalCalldata + dataSuffix
}
```

### Check Referral Status

```typescript
import { hasReferralSucceeded } from 'src/divviProtocol/selectors'

const state = store.getState()
const hasSucceeded = hasReferralSucceeded(state, consumerAddress, providersArray)
```

## Configuration

The configuration is automatically obtained from `app.config.ts`:

```typescript
divviProtocol: {
  divviId: "consumer-address",
  consumer: "consumer-address",
  providers: ["provider1", "provider2"], // Optional in v2
  campaignIds: ["campaign1", "campaign2"]
}
```

## Workflow

1. **Initialization**: Automatically initialized when the app mounts
2. **Transaction**: The data suffix is appended to transactions
3. **Confirmation**: Confirmed transactions are detected
4. **Reporting**: Automatically reported to the Divvi API
5. **Tracking**: State is updated in Redux

## Logs and Debugging

Logs are available with the `divviProtocol/*` tag:

```
divviProtocol/divviService - Main service
divviProtocol/register - Registration logic
divviProtocol/saga - Redux saga
```

## Privacy Considerations

⚠️ **IMPORTANT**: For off-chain signed messages, the text is recorded on the Optimism blockchain and is publicly visible. Never include private or sensitive information.

## Compatibility

- ✅ EOA (Externally Owned Accounts)
- ✅ Smart Contract Wallets
- ✅ Account Abstraction
- ✅ Safe Multisig
- ✅ EIP-1271 Signatures
