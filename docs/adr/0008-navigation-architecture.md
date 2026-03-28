# ADR-0008: Navigation Architecture

## Status

Accepted

## Date

2024-12-01

## Context

TuCOP Wallet is a complex mobile application with multiple user flows:
onboarding, main app navigation, modal screens, and deep linking support.
We needed a navigation architecture that could handle:

1. Multiple navigation stacks (auth, main app, modals)
2. Tab-based navigation for primary features
3. Deep linking for external app integrations
4. Conditional screens based on feature flags
5. Resume capability for interrupted flows

React Native offers several navigation solutions:

- **React Navigation** - Most popular, flexible, well-maintained
- **React Native Navigation (Wix)** - Native navigation, better performance
- **Expo Router** - File-based routing (requires Expo)

## Decision

We use **React Navigation 7.x** with a hybrid stack/tab architecture:

```
RootNavigator (Native Stack)
├── OnboardingStack
│   ├── Welcome
│   ├── PincodeSet
│   ├── EnableBiometry
│   └── ...
├── MainStack (Native Stack)
│   ├── TabNavigator (Bottom Tabs)
│   │   ├── TabHome
│   │   ├── TabWallet
│   │   └── TabDiscover
│   ├── SendSelectRecipient
│   ├── SendEnterAmount
│   ├── SendConfirmation
│   ├── SwapScreen
│   ├── EarnHome
│   ├── GoldHome
│   └── ...
└── ModalStack
    ├── QRCodeScanner
    ├── ActionSheetModal
    └── ...
```

### Key Architectural Decisions

#### 1. Native Stack for Performance

```typescript
import { createNativeStackNavigator } from '@react-navigation/native-stack'

const Stack = createNativeStackNavigator()
```

Native stack provides better performance than JS-based stack for:

- Screen transitions (native animations)
- Memory management
- Gesture handling

#### 2. Bottom Tabs for Primary Navigation

Three main tabs:

- **Home** - Dashboard, balance, recent activity
- **Wallet** - Token list, details
- **Discover** - DApps, services, features

```typescript
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

const Tab = createBottomTabNavigator()

function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="TabHome" component={TabHome} />
      <Tab.Screen name="TabWallet" component={TabWallet} />
      <Tab.Screen name="TabDiscover" component={TabDiscover} />
    </Tab.Navigator>
  )
}
```

#### 3. Centralized Screen Registry

All screens defined in `src/navigator/Screens.tsx`:

```typescript
export enum Screens {
  // Onboarding
  Welcome = 'Welcome',
  PincodeSet = 'PincodeSet',
  EnableBiometry = 'EnableBiometry',

  // Main
  TabHome = 'TabHome',
  SendSelectRecipient = 'SendSelectRecipient',
  // ...
}
```

#### 4. Type-Safe Navigation

Route params defined in `src/navigator/types.tsx`:

```typescript
export type StackParamList = {
  [Screens.SendEnterAmount]: {
    recipient: Recipient
    defaultTokenIdOverride?: string
  }
  [Screens.SendConfirmation]: {
    transactionData: TransactionDataInput
  }
  // ...
}
```

#### 5. Deep Linking Configuration

```typescript
const linking = {
  prefixes: ['celo://', 'https://tucop.co'],
  config: {
    screens: {
      SendEnterAmount: 'wallet/pay',
      SwapScreen: 'wallet/swap',
      // ...
    },
  },
}
```

## Consequences

### Positive

- **Type Safety**: Full TypeScript support for navigation params
- **Performance**: Native stack provides smooth 60fps transitions
- **Flexibility**: Mix of stacks, tabs, and modals as needed
- **Deep Linking**: Built-in support for external app integration
- **Resume**: Can restore navigation state on app restart

### Negative

- **Complexity**: Multiple navigator types to manage
- **Bundle Size**: React Navigation adds ~100KB to bundle
- **Learning Curve**: Navigation patterns require documentation

### Patterns Established

1. **Screen Organization**: Group screens by feature in `Screens` enum
2. **Modal vs Push**: Modals for quick actions, push for full flows
3. **Tab Persistence**: Tab state preserved when navigating away
4. **Conditional Navigation**: Use feature flags in `steps.ts` for onboarding

## Alternatives Considered

### React Native Navigation (Wix)

**Pros**: True native navigation, better performance
**Cons**: More complex setup, less community support, harder to customize

### Expo Router

**Pros**: File-based routing, simpler mental model
**Cons**: Requires Expo, less flexibility for complex flows

## References

- [React Navigation Documentation](https://reactnavigation.org/)
- [Navigation Module Documentation](../architecture/modules/navigation.md)
- [Onboarding Flow](../architecture/diagrams/flow-onboarding.md)
