# Identity Module

## Overview

The Identity module handles phone number verification, contact mapping, address
lookup, and secure send validation. It enables users to send money to phone
numbers and validates recipients for security.

## Directory Structure

```
src/identity/
├── README.md                  # This file
├── reducer.ts                 # Redux state
├── actions.ts                 # Redux actions
├── saga.ts                    # Async operations
├── selectors.ts               # Redux selectors
├── types.ts                   # TypeScript types
├── contactMapping.ts          # Contact import & lookup
├── contactMapping.test.ts     # Contact mapping tests
├── secureSend.ts              # Address validation logic
├── secureSend.test.ts         # Secure send tests
└── smsRetrieval.ts            # Android SMS auto-fill
```

## State Shape

```typescript
interface IdentityState {
  // Bidirectional phone ↔ address mappings
  addressToE164Number: Record<string, string>
  e164NumberToAddress: Record<string, AddressMapping>

  // Display names for addresses
  addressToDisplayName: Record<string, string>

  // Secure send validation state per phone number
  secureSendPhoneNumberMapping: Record<string, SecureSendState>

  // Address verification status cache
  addressToVerificationStatus: Record<string, RecipientVerificationStatus>

  // Contact import progress
  importContactsProgress: ImportContactsStatus
  lastSavedContactsHash: string | null
}

enum RecipientVerificationStatus {
  UNVERIFIED = 0,
  VERIFIED = 1,
  UNKNOWN = 2,
}
```

## Key Features

### 1. Phone Number Lookup

Resolve wallet addresses from phone numbers:

```typescript
// contactMapping.ts
async function fetchWalletAddresses(phoneNumber: string) {
  const signedMessage = await signMessage(address, 'lookup')

  const response = await fetch(networkConfig.lookupPhoneNumberUrl, {
    method: 'POST',
    headers: { 'x-wallet-address': address },
    body: JSON.stringify({
      phoneNumber,
      signedMessage,
      clientPlatform,
      clientVersion,
    }),
  })

  return response.json() // Returns array of addresses
}
```

### 2. Contact Import

Import device contacts and sync with backend:

```typescript
function* doImportContacts() {
  // 1. Request contacts permission
  const granted = yield call(requestContactsPermission)

  // 2. Get all contacts from device
  const contacts = yield call(getAllContacts)

  // 3. Extract E164 phone numbers
  const recipients = contactsToRecipients(contacts)

  // 4. Cache in Redux
  yield put(setPhoneRecipientCache(recipients))

  // 5. Sync to backend (background)
  yield spawn(saveContacts, recipients)
}
```

### 3. Secure Send (Address Validation)

When a phone number has multiple addresses, validate before sending:

```
Phone has multiple addresses?
├── No  → Send directly
└── Yes → Validation required
    │
    ├── Last 4 digits unique?
    │   └── Yes → Partial validation (user enters 4 chars)
    │
    └── Not unique?
        └── Full validation (user enters 42 chars)
```

```typescript
// secureSend.ts
function checkIfValidationRequired(
  addresses: string[],
  userAddress: string
): AddressValidationType {
  if (addresses.length <= 1) {
    return AddressValidationType.NONE
  }

  // Exclude user's own address
  const otherAddresses = addresses.filter((a) => a !== userAddress)

  if (last4DigitsAreUnique(otherAddresses)) {
    return AddressValidationType.PARTIAL
  }

  return AddressValidationType.FULL
}
```

### 4. Address Verification

Check if an address is verified (trusted):

```typescript
async function fetchAddressVerification(address: string) {
  const response = await fetch(networkConfig.checkAddressVerifiedUrl, {
    method: 'POST',
    body: JSON.stringify({ address }),
  })

  return response.json().verified // boolean
}
```

## Saga Flows

### Fetch Addresses for Phone Number

```typescript
function* fetchAddressesAndValidateSaga(action) {
  const { e164Number } = action.payload

  // Fetch addresses from backend
  const addresses = yield call(fetchWalletAddresses, e164Number)

  // Update phone → address mapping
  yield put(
    updateE164PhoneNumberAddresses({
      [e164Number]: { addresses },
    })
  )

  // Check if secure send validation is needed
  const validationType = checkIfValidationRequired(addresses, userAddress)

  if (validationType !== AddressValidationType.NONE) {
    yield put(requireSecureSend({ e164Number, validationType }))
  }
}
```

### Validate Recipient Address

```typescript
function* validateRecipientAddressSaga(action) {
  const { e164Number, inputAddress } = action.payload

  const state = yield select(secureSendPhoneNumberMappingSelector)
  const { addresses, validationType } = state[e164Number]

  // Validate input against possible addresses
  const match = validateAndReturnMatch(inputAddress, addresses, userAddress, validationType)

  if (match) {
    yield put(
      validateRecipientAddressSuccess({
        e164Number,
        validatedAddress: match,
      })
    )
  } else {
    // Show error - no match found
  }
}
```

## Authentication

All lookups require wallet signature:

```typescript
const signedMessage = await signMessage(walletAddress, 'lookup')

headers: {
  'x-wallet-address': walletAddress,
  'x-signed-message': signedMessage,
}
```

## Analytics Events

| Event                       | When                   |
| --------------------------- | ---------------------- |
| `contacts_import_requested` | User starts import     |
| `contacts_import_complete`  | Import finished        |
| `phone_lookup_started`      | Address lookup begins  |
| `phone_lookup_success`      | Addresses found        |
| `secure_send_validation`    | User validates address |

## Error Handling

| Error              | Handling                   |
| ------------------ | -------------------------- |
| Permission denied  | Show permission request UI |
| Lookup timeout     | Retry with backoff         |
| No addresses found | Show "No wallet found"     |
| Validation failed  | Show error, allow retry    |

## SMS Retrieval (Android)

Auto-fill SMS verification codes:

```typescript
// smsRetrieval.ts
function startSmsRetriever() {
  // Uses Android SMS Retriever API
  // Automatically extracts OTP from incoming SMS
}
```

## Related Documentation

- [Verify Module](../verify/README.md)
- [Send Module](../send/README.md)
- [Phone Verification Service](../../docs/architecture/modules/integrations.md)
