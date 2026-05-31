# ADR-0012: Shared state-screen primitives (StateCard + StickyCtaBottom)

## Status

Accepted

## Date

2026-05-28

## Context

A recurring UI pattern across TuCOP Wallet is the "state screen": a centered icon, a title, a description, and one or two follow-up actions. It shows up in success and failure screens (transactions, subsidies, fiat cash-in), terminal flows (KYC denied / expired), error states (NFTs failed to load, sanctioned country, app crash), and prompts (force update).

Before this decision, each of those screens used a slightly different inline implementation: custom icon container shapes and colors, inconsistent SafeAreaView edges, ad-hoc button placement, and a parallel duplicate component named `FullscreenCTA` doing roughly the same job in a different style. The cumulative effect was visual drift between screens that, semantically, should look identical.

## Options considered

1. **Document a pattern, no shared component**: Write a doc and rely on PR review.
   Problem: drift continues because each screen reimplements the layout.

2. **Single monolithic `StateScreen` component**: One component that owns everything (chrome + content + CTAs).
   Problem: too rigid for screens that need custom content slots (e.g. release notes block on UpgradeScreen).

3. **Two composable primitives**: `<StateCard>` (icon + title + subtitle + children slot) and `<StickyCtaBottom>` (sticky-bottom CTA wrapper).
   Allows composition with `<SafeAreaView>` + `<ScrollView>` while keeping the shared chrome consistent.

4. **Adopt an external design-system package**: NativeBase, Tamagui, etc.
   Problem: large dependency for a narrow need; existing screens use bespoke primitives that would need full migration.

## Decision

Build two small composable primitives in `src/components/`:

- **`<StateCard>`** with a `variant` union literal (`success | error | warning | info | loading`). Each variant ships a default icon (`Celebration`, `ErrorIcon`, `Warning`, `InfoIcon`, `ActivityIndicator`) inside a 120x120 colored circle (`successLight`, `errorLight`, `warningLight`, `infoLight`, `gray1`). A `icon` prop offers an escape hatch for brand-specific imagery (`Checkmark` on backup, brand image on cash-in success, `RedLoadingSpinnerToInfo` on NFT load failure). Title and subtitle are typed strings; arbitrary content goes in `children`.
- **`<StickyCtaBottom>`** is a wrapper that anchors the CTA(s) to the bottom with a thin top divider and white background, sitting inside the `SafeAreaView`'s `bottom` edge.

The canonical layout is documented in [`docs/reference/DESIGN_SYSTEM.md`](../reference/DESIGN_SYSTEM.md):

```tsx
<SafeAreaView edges={['top', 'bottom']}>
  <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
    <StateCard variant="..." title="..." subtitle="..." />
  </ScrollView>
  <StickyCtaBottom>
    <Button text="..." size={BtnSizes.FULL} />
  </StickyCtaBottom>
</SafeAreaView>
```

The parallel duplicate primitive `FullscreenCTA` was deleted after both its callers (`ErrorScreen`, `UpgradeScreen`) migrated.

## Consequences

### Positive

- Visual consistency across all state screens
- Type-safe variants reject typos at compile time
- Snapshot tests fail loudly if the migrated layout drifts
- One canonical source of truth for the pattern (`DESIGN_SYSTEM.md`)
- Removed code: `FullscreenCTA.tsx` (15 fewer LOC, one fewer primitive)

### Negative

- Refactor cost spread across many screens (PR #126, #132, #134 to date)
- Some legacy screens (e.g. onboarding splash with full-screen background image) do not fit the pattern and were intentionally skipped, creating two visual styles for "success" depending on context
- No mechanical lint enforcement of the convention; self-review checklist documented instead (banning state-icon imports outside StateCard would create too many false positives because the icons are dual-use)

## Migration history

| PR   | Screens migrated                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------- |
| #126 | `TransactionSuccessScreen`, `ReFiColombiaSubsidiesScreen` (introduced the primitives)                |
| #132 | `KycDenied`, `KycExpired`, `BackupComplete`, `CashInSuccess`, `NftsLoadError`, `AccountErrorScreen`  |
| #133 | Documentation in `docs/reference/DESIGN_SYSTEM.md`                                                   |
| #134 | `KycPending`, `SanctionedCountryErrorScreen`, `ErrorScreen`, `UpgradeScreen`; delete `FullscreenCTA` |

## References

- [`docs/reference/DESIGN_SYSTEM.md`](../reference/DESIGN_SYSTEM.md) - usage guide
- `src/components/StateCard.tsx`
- `src/components/StickyCtaBottom.tsx`
