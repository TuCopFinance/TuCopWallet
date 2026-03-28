# Onboarding Module

## Overview

The Onboarding module manages the complete user onboarding flow, including welcome
screens, wallet creation, wallet import, PIN setup, biometry, and recovery phrase
backup. It uses a feature-flag-driven step system for flexible flow control.

## Directory Structure

```
src/onboarding/
├── README.md                          # This file
├── steps.ts                           # Core navigation logic
├── actions.ts                         # Redux actions
├── types.ts                           # TypeScript types
├── welcome/
│   ├── Welcome.tsx                    # Entry point screen
│   └── BackgroundWelcome.tsx          # Animated SVG background
├── registration/
│   ├── ImportSelect.tsx               # Choose import method
│   ├── OnboardingRecoveryPhrase.tsx   # Show recovery phrase
│   ├── EnableBiometry.tsx             # Biometry setup
│   ├── ProtectWallet.tsx              # Security education
│   ├── SelectCountry.tsx              # Country selection
│   ├── SelectCountryItem.tsx          # Country list item
│   └── RegulatoryTerms.tsx            # Terms acceptance
├── success/
│   └── OnboardingSuccessScreen.tsx    # Completion screen
├── ChooseYourAdventure.tsx            # Post-onboarding menu
├── LanguageButton.tsx                 # Language selector
└── TopBarTextButtonOnboarding.tsx     # Styled header button
```

## User Flows

### New Wallet Creation

```
Welcome
    │
    ▼
PincodeSet (create PIN)
    │
    ▼
EnableBiometry (optional)
    │
    ▼
ProtectWallet (optional)
    │
    ▼
OnboardingRecoveryPhrase
    │
    ▼
VerificationStartScreen (optional)
    │
    ▼
ChooseYourAdventure
    │
    ▼
Home
```

### Wallet Import (Recovery Phrase)

```
Welcome
    │
    ▼
ImportSelect
    │
    ▼
ImportWallet (enter phrase)
    │
    ▼
VerificationStartScreen (optional)
    │
    ▼
ChooseYourAdventure
    │
    ▼
Home
```

### Wallet Import (Cloud Backup)

```
Welcome
    │
    ▼
ImportSelect
    │
    ▼
SignInWithEmail
    │
    ▼
Verification
    │
    ▼
ChooseYourAdventure
    │
    ▼
Home
```

## State Shape

```typescript
interface AccountState {
  acceptedTerms: boolean
  pincodeType: PincodeType // Unset | CustomPin
  onboardingCompleted: boolean
  lastOnboardingStepScreen: string | null // Resume point
  recoveryPhraseInOnboardingStatus: RecoveryPhraseStatus
}

enum RecoveryPhraseStatus {
  NotStarted = 'NotStarted',
  InProgress = 'InProgress',
  Completed = 'Completed',
}
```

## Step Navigation (steps.ts)

The core logic for determining onboarding flow:

```typescript
// Determine first screen based on context
function firstOnboardingScreen(): Screens {
  if (recoveringFromStoreWipe) {
    if (showCloudAccountBackupRestore) {
      return Screens.ImportSelect
    }
    return Screens.ImportWallet
  }
  return Screens.PincodeSet
}

// Navigate to next screen
function goToNextOnboardingScreen(currentScreen: Screens) {
  const nextScreen = _getStepInfo(currentScreen, props)
  navigate(nextScreen)
}

// Calculate progress for UI
function getOnboardingStepValues(currentScreen: Screens) {
  return { step: 1, totalSteps: 1 }
}
```

## Feature Flags

The flow is highly configurable via Statsig:

| Flag                           | Controls                         |
| ------------------------------ | -------------------------------- |
| `CloudBackup`                  | Show cloud backup restore option |
| `CloudBackupSetupInOnboarding` | Show cloud backup setup          |
| `PhoneVerification`            | Show phone verification          |
| `EnableBiometry`               | Show biometry setup              |
| `ProtectWallet`                | Show wallet protection screen    |

```typescript
enum ToggleableOnboardingFeatures {
  CloudBackup,
  CloudBackupSetupInOnboarding,
  PhoneVerification,
  EnableBiometry,
  ProtectWallet,
}
```

## Key Screens

### Welcome.tsx

- Entry point for all users
- Two CTAs: "Create New Wallet" / "Restore Wallet"
- Language selector in header
- Terms checkbox (A/B tested)

### ImportSelect.tsx

- Choose restoration method:
  - Cloud Backup + Email/Phone
  - Recovery Phrase

### EnableBiometry.tsx

- Supports: Face ID, Touch ID, Fingerprint, Face, Iris, Optic ID
- Skip option available
- Feature-gated visibility

### ProtectWallet.tsx

- Security education before showing recovery phrase
- Requires PIN verification to proceed

### OnboardingRecoveryPhrase.tsx

- Displays 24-word recovery phrase
- Copy to clipboard functionality
- Help bottom sheet with guidance

### ChooseYourAdventure.tsx

- Post-onboarding card menu
- Cards: Add funds, Earn, Profile
- Shuffled order (seeded by address)
- "Later" option to skip

### OnboardingSuccessScreen.tsx

- Celebration screen
- Auto-advances after 3 seconds

## Resume Logic

If user exits mid-onboarding:

```
App opens
    │
    ▼
Check onboardingCompleted?
├── Yes → TabNavigator (home)
└── No → Check lastOnboardingStepScreen
    ├── Has value → Resume at that screen
    └── No value → Start from beginning
```

## Analytics Events

| Event                           | When                          |
| ------------------------------- | ----------------------------- |
| `create_account_start`          | User taps "Create New Wallet" |
| `restore_account_start`         | User taps "Restore Wallet"    |
| `terms_and_conditions_accepted` | Terms accepted                |
| `biometry_opt_in_start`         | Biometry flow starts          |
| `biometry_opt_in_complete`      | Biometry enabled              |
| `protect_wallet_copy_phrase`    | User copies recovery phrase   |
| `cya_button_press`              | User taps adventure card      |
| `cya_later`                     | User skips adventure cards    |

## Biometry Types

```typescript
type BiometryType =
  | 'FaceID' // iOS
  | 'TouchID' // iOS
  | 'Fingerprint' // Android
  | 'Face' // Android
  | 'Iris' // Samsung
  | 'OpticID' // Vision Pro
```

## Country Selection

```typescript
// SelectCountry.tsx
// Searchable list with:
// - Localized country names (i18n)
// - Sanctioned countries filtered out
// - FlatList optimization
```

## Related Documentation

- [Onboarding Flow Diagram](../../docs/architecture/diagrams/flow-onboarding.md)
- [Identity Module](../identity/README.md)
- [Pincode Module](../pincode/README.md)
