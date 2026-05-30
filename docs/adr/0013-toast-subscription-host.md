# ADR-0013: Subscription-based ToastHost for cross-platform success feedback

## Status

Accepted

## Date

2026-05-29

## Context

TuCOP had two parallel mechanisms for user-facing feedback:

- `Alert.alert(...)` from React Native — blocking modal dialog, used for both confirmations and bare success messages.
- `Logger.showMessage(...)` and `Logger.showError(...)` from the project Logger — wrappers around `react-native-simple-toast`, which is an **Android-only** native Toast. iOS users got nothing.

The result was visibly broken UX on iOS for ~10 callers: copy-to-clipboard handlers, PIN change confirmations, account unlock failures, debug mode toggle, marranito pool success messages, etc. The native Toast warning was even documented in code as `// TODO: see what to do with this on iOS since there's not native toast`.

A complementary error-handling pipeline already exists: `showErrorMessage(...)` dispatches to a global `<ErrorSheetHost />` that renders a bottom-sheet. That pattern works on both platforms via `@gorhom/bottom-sheet`. It is the right shape for _errors_ (classified, with technical details). It is the wrong shape for success / info notifications, which should be ambient and auto-dismissing.

## Options considered

1. **Use the `Toast` primitive per screen with local state**: Each screen owns a `showToast` boolean.
   Problem: scattered state management, easy to forget cleanup, no consistency across screens.

2. **Extend `showErrorMessage` to handle a `success` variant**: Push everything through the existing pipeline.
   Problem: conflates error classification (with redaction and technical context) and success copy (already user-facing translated strings). Two intents, one channel.

3. **Subscription-based `ToastHost` mirroring `ErrorSheetHost`**: A global host mounted once at the App root, plus a `showToast(...)` dispatcher that publishes to subscribers.
   Same architecture as `ErrorSheetHost` (which already worked well). Composes with the existing `Toast` primitive instead of reinventing the visual surface.

4. **Use a third-party toast library (e.g. `react-native-toast-message`)**: Pull in a dependency.
   Problem: adds a new visual surface that does not match the existing `Toast` + `InLineNotification` styling, plus the maintenance burden of a new dep for a 50-line problem.

## Decision

Build a subscription-based `ToastHost` that mirrors `ErrorSheetHost`:

- **`showToast({ title?, message, variant?, duration? })`** in `src/components/showToast.tsx` is a pure dispatcher that publishes to listeners. Variant defaults to `NotificationVariant.Success`, duration defaults to 3000 ms.
- **`<ToastHost />`** in `src/components/ToastHost.tsx` is the global subscriber: it renders the existing `<Toast>` primitive (which wraps `<InLineNotification>`) with auto-dismiss and swipe-to-dismiss.
- Mounted once in `App.tsx` next to `<ErrorSheetHost />`.

The pipeline is intentionally separate from `showErrorMessage` because the two have different responsibilities: error classification (with redaction, technical context) vs user-facing success / info copy that is already translated.

All `Logger.showMessage` and `Logger.showError` callers were migrated; the methods themselves and the `react-native-simple-toast` import in `Logger.ts` were removed.

## Consequences

### Positive

- iOS users get the same feedback Android users always had
- Same architectural shape as `ErrorSheetHost` (one host, one dispatcher, screens call the function and forget)
- Reuses the existing `Toast` + `InLineNotification` styling; no new visual surface introduced
- `Alert.alert` now only carries its correct semantic (confirm / cancel dialogs), not "success message that blocks the screen"
- 15 dead LOC and one third-party import dropped from `Logger.ts`

### Negative

- One more global host mounted in `App.tsx` (small overhead)
- `src/account/reducer.ts` dispatches the toast from inside a reducer (anti-pattern); migration preserved the existing smell instead of fixing it - moving the side effect to a saga or middleware is a separate cleanup

## Migration history

| PR   | Scope                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| #135 | Introduce `showToast` + `<ToastHost />`; migrate 5 success `Alert.alert` callers + 4 clipboard `Logger.showMessage` callers        |
| #136 | Migrate 4 auth-sensitive `Logger.show*` callers (PincodeSet, authentication, RevokePhoneNumber, account/reducer)                   |
| #137 | Remove the now-dead `Logger.showMessage` and `Logger.showError` methods plus the `react-native-simple-toast` import in `Logger.ts` |

## References

- `src/components/showToast.tsx` - dispatcher
- `src/components/ToastHost.tsx` - host
- `src/components/Toast.tsx` - underlying primitive (unchanged)
- ADR-0011 error handling and logging - companion decision for the error pipeline
