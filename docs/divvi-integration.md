# Divvi Protocol Integration

This document describes the integration of the Divvi protocol in TuCop Wallet.

## What is Divvi?

Divvi is an on-chain referral and attribution protocol that allows applications to track referred user activity and receive rewards for it.

## Integration

### Dependencies

- `@divvi/referral-sdk`: Official Divvi SDK for integration

### Configuration

The Divvi configuration has been implemented as part of the application state in `publicConfig`. The values are defined in `src/app/publicConfig.ts`:

```javascript
// src/app/publicConfig.ts
export const publicAppConfig: PublicAppConfig = {
  divviProtocol: {
    divviId: 'tucop-wallet',
    campaignIds: [],
    consumer: '0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5',
    providers: [
      '0x5f0a55FaD9424ac99429f635dfb9bF20c3360Ab8',
      '0xB06a1b291863f923E7417E9F302e2a84018c33C5',
      '0x6226ddE08402642964f9A6de844ea3116F0dFc7e'
    ]
  }
}
```

This configuration is initialized in `src/app/saga.ts` when the application starts and is available through the `getDivviConfig` selector in `src/divviProtocol/selectors.ts`.

### Main Components

1. **divviService.ts**: Retrieves the Divvi data suffix using the user configuration and the official SDK.

2. **registerReferral.ts**: Re-exports functions from the official SDK and provides a helper function to append the suffix to existing transactions.

3. **saga.ts**: Manages the integration lifecycle:

   - Initializes Divvi on application startup
   - Listens for confirmed transactions to report them to Divvi

4. **prepareTransactions.ts**: Modifies outgoing transactions to include the Divvi data suffix.

### Integration Flow

1. **Append data suffix**: When a transaction is prepared, the Divvi data suffix is appended to the transaction's `data` (calldata) field.

2. **Report transaction**: When a transaction is confirmed, it is reported to Divvi using the official SDK to correctly attribute the activity.

## Code Examples

### Retrieve Data Suffix

```typescript
import { getDataSuffix } from '@divvi/referral-sdk'

const dataSuffix = getDataSuffix({
  consumer: '0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5',
  providers: [
    '0x5f0a55FaD9424ac99429f635dfb9bF20c3360Ab8',
    '0xB06a1b291863f923E7417E9F302e2a84018c33C5',
    '0x6226ddE08402642964f9A6de844ea3116F0dFc7e',
  ],
})
```

### Report Transaction

```typescript
import { submitReferral } from '@divvi/referral-sdk'

await submitReferral({
  txHash: '0x123...',
  chainId: 42220, // Celo Mainnet chainId
})
```

## References

- [Official Divvi Documentation](https://divvi.xyz/docs)
- [Divvi SDK on NPM](https://www.npmjs.com/package/@divvi/referral-sdk)

## Testing the Integration

To verify that the Divvi integration is working correctly, follow these steps:

### 1. Configuration Verification

You can verify that the Divvi configuration is correctly loaded using the Redux developer tools:

```javascript
// In the Redux DevTools console
state.app.publicConfig.divviProtocol

// Should display something like:
{
  divviId: 'tucop-wallet',
  campaignIds: [],
  consumer: '0x22886C71a4C1Fa2824BD86210ead1C310B3d7cf5',
  providers: ['0x5f0a55FaD9424ac99429f635dfb9bF20c3360Ab8', '0xB06a1b291863f923E7417E9F302e2a84018c33C5', '0x6226ddE08402642964f9A6de844ea3116F0dFc7e']
}
```

### 2. Data Suffix Verification

Perform a transaction (token send, swap, etc.) and check the logs to confirm the Divvi data suffix is being appended to the transaction:

```
[DEBUG] divviProtocol/divviService - Generating Divvi data suffix
[DEBUG] viem/prepareTransactions - Divvi data suffix appended to transaction
```

### 3. Transaction Report Verification

Once the transaction is confirmed, check the logs to confirm it is being correctly reported to Divvi:

```
[INFO] divviProtocol/saga - Transaction 0x123... successfully reported to Divvi
```

### 4. Verification on the Divvi Portal

To confirm the integration works end-to-end, check the [Divvi portal](https://app.divvi.xyz/) to verify that your users' transactions are being registered and attributed correctly.
