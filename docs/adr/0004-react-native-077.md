# ADR-0004: Upgrade to React Native 0.77.3 with the Old Architecture

## Status

Accepted

## Date

2025-03-20

## Context

TuCOP Wallet was on React Native 0.72.15. Google Play requires support for devices with 16 KB page size starting November 2025. That requires AGP 8.3+ which is not compatible with RN 0.72.

In addition, RN 0.77 brings performance and DevX improvements.

## Options considered

1. **Stay on RN 0.72**: Patch AGP manually.
   Problem: unsupported, risk of incompatibilities.

2. **Upgrade to RN 0.74-0.76**: Intermediate versions.
   Problem: many accumulated breaking changes.

3. **Direct upgrade to RN 0.77.3**: Latest stable version.
   Bundled with AGP 8.5.1, Gradle 8.10.2, Kotlin 2.0.21.

4. **RN 0.77 + New Architecture**: Fabric + TurboModules.
   Problem: many dependencies do not support the New Architecture yet.

## Decision

Upgrade to **React Native 0.77.3** keeping the **Old Architecture** (`newArchEnabled=false`).

Key changes:

- MainActivity / MainApplication migrated to Kotlin (required by RN 0.77 Old Arch)
- SoLoader uses `OpenSourceMergedSoMapping` (fixes the `libreact_featureflagsjni.so` crash)
- AGP 8.5.1 + `useLegacyPackaging = true` (16 KB page size compliance)
- Hermes enabled by default

## Consequences

### Positive

- Compliance with Google Play requirements
- Better performance (Hermes optimized)
- Access to new React Native APIs
- Ready for a future migration to the New Architecture

### Negative

- Old Architecture has no indefinite support
- Some new libraries only support the New Arch
- Migration to Kotlin required rewriting MainActivity / MainApplication

## References

- [React Native 0.77 Changelog](https://reactnative.dev/blog/2025/01/21/release-0.77)
- [16KB Page Size Requirement](https://developer.android.com/guide/practices/page-sizes)
- `android/app/src/main/java/xyz/mobilestack/MainActivity.kt`
