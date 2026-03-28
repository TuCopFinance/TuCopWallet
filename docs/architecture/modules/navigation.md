# Navigation Architecture

## Overview

TuCOP Wallet uses **React Navigation 7.x** with a nested navigator structure:

- Native Stack Navigator (main navigation)
- Bottom Tab Navigator (main tabs)
- Bottom Sheet Navigator (modal sheets)

## Navigator Hierarchy

```
RootStack (BottomSheetNavigator)
│
├── MainModal (NativeStackNavigator - modal presentation)
│   │
│   ├── Main (NativeStackNavigator)
│   │   │
│   │   ├── TabNavigator (BottomTabNavigator)
│   │   │   ├── Home
│   │   │   ├── Send
│   │   │   ├── Earn
│   │   │   ├── Swap
│   │   │   └── Account
│   │   │
│   │   └── 80+ Screen stacks
│   │
│   └── Modal screens (PincodeEnter, RegulatoryTerms, etc.)
│
└── Bottom Sheets (WalletConnectRequest, etc.)
```

## Key Files

| File                             | Purpose                   |
| -------------------------------- | ------------------------- |
| `src/navigator/Navigator.tsx`    | Main navigator definition |
| `src/navigator/TabNavigator.tsx` | Bottom tabs               |
| `src/navigator/Screens.ts`       | Screen name constants     |
| `src/navigator/types.tsx`        | Navigation types          |
| `src/navigator/Headers.tsx`      | Header configurations     |
| `src/navigator/initialRoute.ts`  | Initial route logic       |

---

## Screen Groups

### Tab Screens (5)

```typescript
// TabNavigator.tsx
<Tab.Navigator>
  <Tab.Screen name={Screens.TabHome} component={TabHome} />
  <Tab.Screen name={Screens.TabSend} component={SendSelectRecipient} />
  <Tab.Screen name={Screens.TabEarn} component={EarnHome} />
  <Tab.Screen name={Screens.TabSwap} component={SwapScreen} />
  <Tab.Screen name={Screens.TabAccount} component={SettingsMenu} />
</Tab.Navigator>
```

### Onboarding Screens (nuxScreens)

- `Welcome` - Initial welcome screen
- `ProtectWallet` - Backup prompt
- `OnboardingRecoveryPhrase` - Show seed phrase
- `PincodeSet` - Create PIN
- `ImportSelect` - Import or create
- `ImportWallet` - Import from seed
- `EnableBiometry` - FaceID/TouchID
- `OnboardingSuccessScreen` - Complete

### Send Flow (sendScreens)

- `SendSelectRecipient` - Choose recipient
- `SendEnterAmount` - Enter amount
- `SendConfirmation` - Confirm transaction
- `ValidateRecipientIntro` - Address validation
- `ValidateRecipientAccount` - Account check

### Swap Flow (swapScreens)

- `SwapScreenWithBack` - Token swap interface

### Earn Flow (earnScreens)

- `EarnHome` - Yield opportunities
- `EarnEnterAmount` - Stake amount
- `EarnConfirmationScreen` - Confirm stake
- `EarnInfoScreen` - Pool information
- `EarnPoolInfoScreen` - Detailed pool info

### Gold Flow (goldScreens)

- `GoldInfoScreen` - Gold education
- `GoldHome` - Gold dashboard
- `GoldBuyEnterAmount` - Buy amount
- `GoldBuyConfirmation` - Confirm buy
- `GoldSellEnterAmount` - Sell amount
- `GoldSellConfirmation` - Confirm sell
- `GoldPriceAlerts` - Price alerts

### BucksPay Flow (bucksPayScreens)

- `SelectOfframpProvider` - Choose provider
- `BucksPayBankForm` - Enter bank details
- `BucksPayConfirm` - Confirm withdrawal
- `BucksPayStatus` - Transaction status

### Settings Screens (settingsScreens)

25+ screens including:

- `Profile`, `ProfileSubmenu`
- `SecuritySubmenu`, `PreferencesSubmenu`
- `Language`, `SelectLocalCurrency`
- `WalletConnectSessions`
- `BackupPhrase`, `BackupQuiz`
- FiatConnect screens (KYC, transfers)

### Verification Screens (verificationScreens)

- `VerificationStartScreen` - Start phone verification
- `VerificationCodeInputScreen` - Enter code

---

## Navigation Patterns

### Navigate to Screen

```typescript
import { useNavigation } from '@react-navigation/native'
import { Screens } from 'src/navigator/Screens'

function MyComponent() {
  const navigation = useNavigation()

  const goToSend = () => {
    navigation.navigate(Screens.SendSelectRecipient)
  }

  const goToSendWithParams = () => {
    navigation.navigate(Screens.SendEnterAmount, {
      recipient: { address: '0x...' },
      tokenId: 'celo-mainnet:0x...',
    })
  }
}
```

### Go Back

```typescript
navigation.goBack()

// Or go to specific screen
navigation.navigate(Screens.TabHome)
```

### Reset Navigation Stack

```typescript
import { CommonActions } from '@react-navigation/native'

navigation.dispatch(
  CommonActions.reset({
    index: 0,
    routes: [{ name: Screens.TabNavigator }],
  })
)
```

### Navigation Options

```typescript
// Static navigation options
MyScreen.navigationOptions = {
  headerShown: true,
  headerTitle: 'My Screen',
  headerBackTitle: '',
}

// Dynamic options
MyScreen.navigationOptions = ({ route }) => ({
  headerTitle: route.params?.title ?? 'Default',
})
```

---

## Header Configurations

Location: `src/navigator/Headers.tsx`

```typescript
// No header
export const noHeader: NativeStackNavigationOptions = {
  headerShown: false,
}

// Empty header (just back button)
export const emptyHeader: NativeStackNavigationOptions = {
  headerTitle: '',
  headerBackTitle: '',
  headerStyle: { backgroundColor: colors.background },
}

// Header with back button
export const headerWithBackButton: NativeStackNavigationOptions = {
  headerBackTitle: '',
  headerShadowVisible: false,
}

// Onboarding header style
export const nuxNavigationOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerBackTitle: '',
  headerTitle: '',
}
```

---

## Type Definitions

Location: `src/navigator/types.tsx`

```typescript
export type StackParamList = {
  [Screens.TabNavigator]: undefined
  [Screens.SendEnterAmount]: {
    recipient: Recipient
    tokenId?: string
    amount?: string
  }
  [Screens.GoldBuyConfirmation]: {
    tokenAmount: string
    usdtAmount: string
    quoteData: GoldQuoteResponse
  }
  // ... all screen params
}

// Usage with typed navigation
import { NativeStackScreenProps } from '@react-navigation/native-stack'

type Props = NativeStackScreenProps<StackParamList, Screens.SendEnterAmount>

function SendEnterAmount({ route, navigation }: Props) {
  const { recipient, tokenId } = route.params
  // ...
}
```

---

## Initial Route Logic

Location: `src/navigator/initialRoute.ts`

```typescript
export function getInitialRoute({
  language,
  acceptedTerms,
  pincodeType,
  onboardingCompleted,
  lastOnboardingStepScreen,
}: InitialRouteParams): keyof StackParamList {
  // New user
  if (!language) return Screens.Language

  // Terms not accepted
  if (!acceptedTerms) return Screens.RegulatoryTerms

  // PIN not set
  if (pincodeType === PincodeType.Unset) return Screens.PincodeSet

  // Onboarding incomplete
  if (!onboardingCompleted && lastOnboardingStepScreen) {
    return lastOnboardingStepScreen
  }

  // Regular app entry
  return Screens.TabNavigator
}
```

---

## Bottom Sheets

Using `@th3rdwave/react-navigation-bottom-sheet`:

```typescript
// In Navigator.tsx
const RootStack = createBottomSheetNavigator<StackParamList>()

function nativeBottomSheets(BottomSheet: typeof RootStack) {
  return (
    <>
      <BottomSheet.Screen
        name={Screens.WalletConnectRequest}
        component={WalletConnectRequest}
      />
      <BottomSheet.Screen
        name={Screens.FiatExchangeCurrencyBottomSheet}
        component={FiatExchangeCurrencyBottomSheet}
      />
    </>
  )
}
```

**Note:** Scrolling views inside bottom sheets must use components from
`@gorhom/bottom-sheet` instead of react-native.

---

## Deep Linking

Location: `src/app/` (deep link handlers)

Supported schemes:

- `tucop://` - Custom scheme
- `https://app.tucop.co/` - Universal links

See `docs/deeplinks.md` for full specification.

---

## Best Practices

1. **Use Screens constants** - Never hardcode screen names
2. **Type your params** - Define params in `StackParamList`
3. **Use appropriate header** - Choose from `Headers.tsx`
4. **Reset stack for flows** - Reset after onboarding/auth
5. **Handle deep links** - Register handlers in App.tsx
6. **Use bottom sheets** - For confirmations and selections
