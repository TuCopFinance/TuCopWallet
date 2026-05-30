# Design System

Conventions for shared UI components in TuCop Wallet. Authoritative source for "how should this screen look?" decisions on standard patterns.

## State screens: `<StateCard>` + `<StickyCtaBottom>`

Any screen whose primary purpose is to communicate a single state - success, error, warning, loading, empty - and (optionally) offer one or two follow-up actions, must be built with `<StateCard>` and `<StickyCtaBottom>` instead of inline JSX.

### When to use

- Transaction success / failure screens (send, swap, earn deposit/withdraw, gold buy/sell, subsidy claim)
- Onboarding completion or failure (backup complete, account setup failed)
- Fiat flow outcomes (cash-in success, KYC denied/expired)
- Error states inside data-dependent screens (NFTs failed to load, etc.)
- Eligibility / status reveals (subsidy eligible, already claimed)

### When NOT to use

- Mid-flow inline alerts -> use `<InLineNotification>`
- Bottom-anchored transient warnings -> use `<SmartTopAlert>` or `<Toast>` if it exists
- Bottom sheet content -> compose with the existing BottomSheet primitives, not StateCard

### API

```tsx
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'

<SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
  <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
    <StateCard
      variant="success"  // 'success' | 'error' | 'warning' | 'info' | 'loading'
      title="You're all set"
      subtitle="Your backup was saved securely."
      testID="MyScreen/StateCard"
      // icon={<Custom />}  // escape hatch, see below
    >
      {/* optional children rendered below subtitle, inside the card */}
    </StateCard>
  </ScrollView>
  <StickyCtaBottom>
    <Button text="Continue" onPress={...} size={BtnSizes.FULL} />
    {/* optional secondary button below primary, separated by 8px margin */}
  </StickyCtaBottom>
</SafeAreaView>
```

### Variants

| variant   | default icon          | use for                                                 |
| --------- | --------------------- | ------------------------------------------------------- |
| `success` | `<Celebration>`       | Action succeeded, eligibility confirmed, claim received |
| `error`   | `<ErrorIcon>`         | Action failed, data unavailable, terminal denial        |
| `warning` | `<Warning>`           | Recoverable failure, expired session, soft block        |
| `info`    | `<InfoIcon>`          | Informational state with no urgency                     |
| `loading` | `<ActivityIndicator>` | Async wait state                                        |

The default icon ships with a colored circular background (120x120) sized to the variant's semantic color (`successLight`, `errorLight`, `warningLight`, `infoLight`, `gray1`).

### Icon escape hatch

Pass `icon` only when the screen needs brand or feature-specific imagery that the default does not cover:

- A `<Checkmark>` on backup-complete (more recognizable than generic Celebration for that specific success).
- A brand image like `fiatExchange` on cash-in success.
- A custom spinner like `<RedLoadingSpinnerToInfo>` on NFT load failure.

The icon you pass replaces the default but keeps the circular background and sizing. Match the variant's color palette so the icon does not look out of place against its bg color.

### Layout rules

- Always wrap the screen in `<SafeAreaView edges={['top', 'bottom']}>` so the bottom sticky CTA respects the gesture bar.
- The `<StateCard>` lives inside a `<ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>` so it stays centered on tall devices and scrolls on short ones.
- CTAs live in `<StickyCtaBottom>` (single component handles top divider + padding + bg).
- Multiple buttons stack vertically inside `<StickyCtaBottom>`: primary first (`type={BtnTypes.PRIMARY}`), secondary below with `style={{ marginTop: Spacing.Smallest8 }}` and `type={BtnTypes.SECONDARY}`.
- Both buttons use `size={BtnSizes.FULL}` so they span the full width.

### Tests

Migrating an existing screen to StateCard usually means snapshot regeneration. Steps:

1. Delete the old snapshot file from `__snapshots__/`.
2. Run `yarn test --testPathPattern=<MyScreen>` to regenerate.
3. Visually diff the new snapshot (the structure should be saner, not weirder).
4. Preserve all `testID` values used by behavioral tests (button presses, conditional render checks). The `testID` prop on `<StateCard>` exposes a single testID on the card root; per-element testIDs (subtitle, icon) are not exposed and tests should not rely on them.

## Enforcement

This convention is enforced by **self-review** and the safeguards built into the component itself:

- `variant` is a TypeScript union literal (`'success' | 'error' | 'warning' | 'info' | 'loading'`). Passing an unknown value is a compile error.
- Snapshot tests on screens that already adopt StateCard will fail loudly if the migrated layout drifts.
- The component lives in `src/components/StateCard.tsx` next to the other shared primitives, so it's discoverable.

There is intentionally no custom ESLint rule for this. The icon components (`Celebration`, `ErrorIcon`, `Warning`, `InfoIcon`) are dual-use across the app (tooltips, badges, inline notifications, etc.), so banning their imports outside StateCard would create many false positives. A custom AST rule is overkill for a solo-dev project.

Self-review checklist before merging a new state-card-ish screen:

- [ ] Uses `<StateCard variant>` and `<StickyCtaBottom>` instead of inline title + body + button JSX
- [ ] Variant matches semantic intent (success / error / warning / info / loading)
- [ ] Uses default icon unless a brand-specific one is clearly required (then `icon` prop)
- [ ] `<SafeAreaView edges={['top', 'bottom']}>` + scrollable content
- [ ] `testID` preserved on interactive elements

## Migration history

| PR   | Screens migrated                                                                               |
| ---- | ---------------------------------------------------------------------------------------------- |
| #126 | TransactionSuccessScreen, ReFiColombiaSubsidiesScreen (introduced StateCard + StickyCtaBottom) |
| #132 | KycDenied, KycExpired, BackupComplete, CashInSuccess, NftsLoadError, AccountErrorScreen        |

Add a row when you migrate more screens.
