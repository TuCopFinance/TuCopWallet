# ADR-0010: Feature Flags with Statsig

## Status

Accepted

## Date

2024-12-01

## Context

TuCOP Wallet needs feature flag management for:

1. **Gradual Rollouts**: Release features to percentage of users
2. **A/B Testing**: Test UI variations for conversion
3. **Kill Switches**: Disable broken features instantly
4. **Environment Separation**: Different flags for dev/staging/prod
5. **User Targeting**: Enable features for specific users/regions

### Options Considered

| Solution                   | Pros                                | Cons                    |
| -------------------------- | ----------------------------------- | ----------------------- |
| **Statsig**                | Free tier, SDK support, experiments | Vendor lock-in          |
| **LaunchDarkly**           | Enterprise features, reliability    | Expensive               |
| **Flagsmith**              | Open source option                  | Self-hosting complexity |
| **Firebase Remote Config** | Free, good mobile support           | Limited experiments     |
| **Custom Solution**        | Full control                        | Development overhead    |

## Decision

We use **Statsig** for feature flag management.

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STATSIG INTEGRATION                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────┐        ┌───────────────────┐        ┌───────────────────┐
│                   │        │                   │        │                   │
│   TuCOP App       │───────▶│   Statsig SDK     │───────▶│  Statsig Console  │
│                   │        │                   │        │                   │
└───────────────────┘        └───────────────────┘        └───────────────────┘
         │                            │
         │                            │
         ▼                            ▼
┌───────────────────┐        ┌───────────────────┐
│  Local Cache      │        │  Analytics Events │
│  (offline)        │        │  (exposure logs)  │
└───────────────────┘        └───────────────────┘
```

### Implementation

#### Initialization

```typescript
// src/statsig/index.ts
import { Statsig } from 'statsig-react-native'

export async function initializeStatsig(walletAddress?: string) {
  await Statsig.initialize(STATSIG_CLIENT_KEY, {
    userID: walletAddress,
    custom: {
      networkId: networkConfig.networkId,
      appVersion: APP_VERSION,
      platform: Platform.OS,
    },
  })
}
```

#### Feature Gates

```typescript
// src/statsig/index.ts
export function getFeatureGate(gate: StatsigFeatureGates): boolean {
  return Statsig.checkGate(gate)
}

// Usage
import { getFeatureGate } from 'src/statsig'

if (getFeatureGate('show_gold_feature')) {
  // Show gold tab
}
```

#### Dynamic Configs

```typescript
// src/statsig/index.ts
export function getDynamicConfig(config: string): DynamicConfig {
  return Statsig.getConfig(config)
}

// Usage
const config = getDynamicConfig('onboarding_config')
const steps = config.get('steps', defaultSteps)
```

#### Experiments

```typescript
// src/statsig/index.ts
export function getExperiment(experiment: string): Layer {
  return Statsig.getExperiment(experiment)
}

// Usage
const experiment = getExperiment('send_button_color')
const buttonColor = experiment.get('color', '#007AFF')
```

### Current Feature Gates

| Gate                | Description                 | Default |
| ------------------- | --------------------------- | ------- |
| `show_gold_feature` | Enable Digital Gold (XAUt0) | false   |
| `show_buckspay`     | Enable BucksPay offramp     | false   |
| `show_points`       | Enable points/rewards       | false   |
| `show_earn`         | Enable yield farming        | false   |
| `show_jumpstart`    | Enable Jumpstart referrals  | false   |
| `show_nfts`         | Enable NFT display          | false   |
| `show_dapps`        | Enable DApp catalog         | true    |

### Onboarding Feature Toggles

```typescript
// src/statsig/types.ts
export enum ToggleableOnboardingFeatures {
  CloudBackup = 'CloudBackup',
  CloudBackupSetupInOnboarding = 'CloudBackupSetupInOnboarding',
  PhoneVerification = 'PhoneVerification',
  EnableBiometry = 'EnableBiometry',
  ProtectWallet = 'ProtectWallet',
}

// Usage in onboarding
const features = getOnboardingFeatures()
if (features[ToggleableOnboardingFeatures.EnableBiometry]) {
  // Show biometry setup screen
}
```

### Offline Behavior

Statsig caches feature values locally:

```typescript
// First launch: uses server values
// Offline: uses cached values
// Cache TTL: 24 hours (configurable)
```

### Analytics Integration

Statsig logs exposure events automatically:

```typescript
// When checkGate is called:
// - Logs exposure event with gate name
// - Records user properties
// - Enables experiment analysis
```

## Consequences

### Positive

- **Zero Code Deploys**: Toggle features without app update
- **Safe Rollouts**: Gradual percentage rollouts
- **A/B Testing**: Built-in experiment framework
- **Analytics**: Automatic exposure logging
- **Free Tier**: Generous limits for startups

### Negative

- **Network Dependency**: First launch needs network
- **Vendor Lock-in**: Migration requires code changes
- **Latency**: SDK initialization adds ~100ms
- **Complexity**: Another service to manage

### Best Practices

1. **Default to Off**: New features default to disabled
2. **Clean Up**: Remove gates after full rollout
3. **Type Safety**: Use TypeScript enum for gate names
4. **Testing**: Mock gates in tests
5. **Fallbacks**: Always provide sensible defaults

```typescript
// Good: typed gate name, default value
const showGold = getFeatureGate(StatsigFeatureGates.ShowGoldFeature)

// Bad: string literal, no default
const showGold = Statsig.checkGate('show_gold')
```

## Testing

```typescript
// Mock in tests
jest.mock('src/statsig', () => ({
  getFeatureGate: jest.fn((gate) => {
    const enabled = {
      show_gold_feature: true,
      show_buckspay: false,
    }
    return enabled[gate] ?? false
  }),
  getDynamicConfig: jest.fn(() => ({
    get: jest.fn((key, defaultValue) => defaultValue),
  })),
}))
```

## Statsig Console

Access at: https://console.statsig.com/

Key sections:

- **Feature Gates**: Boolean toggles
- **Dynamic Configs**: JSON configuration
- **Experiments**: A/B tests
- **Metrics**: Usage analytics
- **Users**: User properties and segments

## References

- [Statsig React Native SDK](https://docs.statsig.com/client/reactNativeSDK)
- [Feature Gates Documentation](https://docs.statsig.com/feature-gates/working-with)
- [Experiments Guide](https://docs.statsig.com/experiments-plus)
