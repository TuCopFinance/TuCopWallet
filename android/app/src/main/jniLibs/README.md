# Bundled `libc++_shared.so` (NDK r28)

These files are the `libc++_shared.so` shipped with **Android NDK r28**
(`28.0.13004108`) for `arm64-v8a` and `armeabi-v7a`. They are checked in here on
purpose.

## Why

`react-native-quick-crypto >= 1.1.x` is compiled with NDK r28 and uses
`__cxa_init_primary_exception`, a symbol that only exists in libc++ shipped
with NDK r28+.

Several upstream AARs (`fbjni-0.7.0`, `react-android-0.77.3`) ship their own
older `libc++_shared.so` (~1.29 MB, missing the symbol). The `pickFirst
'**/libc++_shared.so'` directive in `android/app/build.gradle` is non-
deterministic about which copy wins, and when it picks one of the older AAR
copies, the app crashes at start-up:

```
dlopen failed: cannot locate symbol "__cxa_init_primary_exception"
referenced by "lib/arm64/libQuickCrypto.so"
```

Dropping the NDK r28 copy into the app's own `jniLibs/` makes the app source
the highest-priority candidate in `pickFirst`, so this version wins
deterministically. AGP strips it before packaging, so the on-device footprint
is ~1.25 MB (smaller than the broken AAR copy).

## When to refresh

Whenever `ndkVersion` in `android/build.gradle` is upgraded, replace these
files with the new NDK's `libc++_shared.so`:

```bash
NDK=$ANDROID_HOME/ndk/<version>/toolchains/llvm/prebuilt/<host>/sysroot/usr/lib
cp "$NDK/aarch64-linux-android/libc++_shared.so" arm64-v8a/libc++_shared.so
cp "$NDK/arm-linux-androideabi/libc++_shared.so" armeabi-v7a/libc++_shared.so
```

After refresh, do a `clean bundleMainnetRelease` and verify with `llvm-nm`
that the bundled `libc++_shared.so` still exports
`__cxa_init_primary_exception`.
