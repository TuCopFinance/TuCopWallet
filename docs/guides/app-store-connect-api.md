# App Store Connect API - Automated TestFlight Upload

How to upload an iOS build to TestFlight and query App Store Connect state from the command line, without opening the Xcode Organizer or the App Store Connect web portal.

The manual Xcode wizard flow still works and is documented in [manual-upload.md](manual-upload.md). This guide covers the automated alternative, which is faster and gives you scriptable read-only queries against the App Store Connect REST API.

Added 2026-08-28. Wired for local machines only. CI does not use these scripts yet (the .p8 lives in macOS Keychain, not in GitHub Secrets).

---

## What it replaces

`.claude/rules/release-procedure.md` Stage 5.4 used to be:

1. Wait for Xcode Archive to finish
2. In Organizer, click `Distribute App`
3. Choose `App Store Connect` -> `Upload`
4. Wait 10 to 30 minutes for the upload wizard
5. Watch email for the "processing complete" notification

The automated flow collapses steps 2 to 4 into a single command:

```bash
yarn upload:testflight
```

Step 1 (Xcode Archive) still runs manually in Xcode. Step 5 (Apple processing) still happens on Apple's side but you can poll it from the terminal with `yarn asc:builds` instead of watching your inbox.

---

## Prerequisites

### One-time setup (already done)

Three credentials stored in macOS Keychain under `acct=tucop-finance`:

| Service (svce)                  | Value                 | Where it came from                                                                          |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `APP_STORE_CONNECT_KEY_ID`      | 10-char Key ID        | Generated in App Store Connect -> Users and Access -> Integrations -> App Store Connect API |
| `APP_STORE_CONNECT_ISSUER_ID`   | 36-char UUID          | Same screen, at the top of the keys list                                                    |
| `APP_STORE_CONNECT_PRIVATE_KEY` | .p8 PEM (hex-encoded) | Downloaded once at key creation                                                             |

Key metadata:

- Name: `0xj4an-M5Pro` (device canonical name convention)
- Access: Admin
- Team: `TuCop Finance LLC (QZUQHFSF4H)`

Verify at any time with:

```bash
yarn asc:whoami
```

Expected output:

```text
Key ID:    DJR2P492ZS
Issuer ID: d5b02f28-3d57-4b9e-a7df-1b9b4e470ae0
P8 path:   /var/folders/.../app_store_connect_key.XXXXXX.p8 (temp)

Testing auth against /v1/apps...
  6742667119  Billetera TuCop  bundleId=org.tucop
```

If the last line does not print `Billetera TuCop`, the credentials are wrong or the .p8 is corrupted. Regenerate the key in App Store Connect and re-add it to Keychain (see [Regenerating credentials](#regenerating-credentials) below).

### Per-release prerequisites

1. Xcode Archive completed for the target version (`.xcarchive` present at `~/Library/Developer/Xcode/Archives/YYYY-MM-DD/TuCop-mainnet *.xcarchive`).
2. `yarn preflight:ios-release` was green before the archive.
3. `yarn validate:ios-archive` passes on the archive (the upload script re-runs this as a safety net).

---

## The 6 yarn commands

| Command                           | What it does                                                                    | Side effects          |
| --------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| `yarn upload:testflight`          | Exports the newest .xcarchive to .ipa and uploads to TestFlight                 | Yes, uploads to Apple |
| `yarn upload:testflight:validate` | Same export but runs `altool --validate-app` instead of upload                  | No, dry-run           |
| `yarn asc:whoami`                 | Prints Key ID + Issuer ID and confirms auth against `/v1/apps`                  | No, read-only         |
| `yarn asc:builds`                 | Lists the last 10 builds with version, build number, processing state           | No, read-only         |
| `yarn asc:versions`               | Lists App Store versions with `appStoreState` (READY_FOR_SALE, IN_REVIEW, etc.) | No, read-only         |
| `yarn asc:testflight`             | Lists active TestFlight builds (`processingState=VALID`) with expiration date   | No, read-only         |

All commands run from the repo root. All commands load credentials from Keychain via `scripts/app-store-connect-env.sh` (self-cleaning: the temp .p8 file is deleted on process exit).

---

## End-to-end release flow

Simplified version of the iOS release. For the full canonical procedure, see `.claude/rules/release-procedure.md`.

```bash
# 1. Version bump + preflight (unchanged)
yarn pre-deploy
yarn preflight:ios-release

# 2. Xcode Archive (still manual in Xcode UI)
open ios/TuCop.xcworkspace
# In Xcode: scheme = TuCop-mainnet, destination = Any iOS Device (arm64),
# Shift+Cmd+K to clean, then Product -> Archive.

# 3. Validate the archive on disk
yarn validate:ios-archive

# 4. Upload to TestFlight (was: click Distribute in Organizer)
yarn upload:testflight

# 5. Poll for processing completion
yarn asc:builds
# When the newest build shows processingState=VALID, it is ready for
# TestFlight testers and can be submitted for App Store review.
```

---

## Common tasks

### "Is the upload done yet?"

```bash
yarn asc:builds
```

Look at the newest row. If `STATE=PROCESSING`, Apple is still processing. If `STATE=VALID`, it is ready. Processing usually takes 10 to 30 minutes.

### "What is live in the App Store right now?"

```bash
yarn asc:versions
```

Filter by `STATE=READY_FOR_SALE` for versions that are live. `PENDING_DEVELOPER_RELEASE` means Apple approved but you have not clicked "Release this version" yet. `IN_REVIEW` means Apple is still reviewing.

### "What builds do TestFlight testers see?"

```bash
yarn asc:testflight
```

Only prints builds with `processingState=VALID`. If your latest build is not listed, it may still be processing (`yarn asc:builds` shows all states) or may have failed processing (check the "Activity" tab in the App Store Connect portal for the specific error).

### "Something went wrong, try again without uploading"

```bash
yarn upload:testflight:validate
```

Runs the export + `altool --validate-app` cycle without pushing the .ipa to Apple. Useful for catching entitlement / signing errors before spending 20 minutes on a real upload.

### "I need to upload a specific archive, not the newest"

```bash
./scripts/upload-testflight.sh /path/to/TuCop-mainnet\ 1.118.13.xcarchive
```

Or for validation only:

```bash
./scripts/upload-testflight.sh --validate-only /path/to/TuCop-mainnet\ 1.118.13.xcarchive
```

---

## Troubleshooting

### "Credentials not in Keychain"

The upload or query script exits with:

```text
[app-store-connect-env] APP_STORE_CONNECT_KEY_ID not in Keychain (acct=tucop-finance)
```

Check that all 3 items are present:

```bash
security find-generic-password -a tucop-finance -s APP_STORE_CONNECT_KEY_ID -w >/dev/null && echo "KEY_ID OK" || echo "KEY_ID MISSING"
security find-generic-password -a tucop-finance -s APP_STORE_CONNECT_ISSUER_ID -w >/dev/null && echo "ISSUER_ID OK" || echo "ISSUER_ID MISSING"
security find-generic-password -a tucop-finance -s APP_STORE_CONNECT_PRIVATE_KEY -w >/dev/null && echo "PRIVATE_KEY OK" || echo "PRIVATE_KEY MISSING"
```

If any print MISSING, add them (see [Regenerating credentials](#regenerating-credentials) below).

### "Archive failed validation"

The script re-runs `yarn validate:ios-archive` before uploading. If validation fails, run it standalone to see the specific error:

```bash
yarn validate:ios-archive
```

Common failures caught here: dev binary in disguise (`CFBundleDisplayName=TuCop (dev)`), missing arm64 slice, wrong bundle ID, wrong team. See `.claude/rules/ios-build.md` for the full validation ruleset.

### "xcodebuild -exportArchive failed"

Usually a signing issue. The script uses `-allowProvisioningUpdates` so Xcode should refresh certificates automatically, but this needs network access and Apple Developer session state. Common causes:

1. Xcode not signed into a developer account (Xcode -> Settings -> Accounts).
2. Certificate expired or revoked (check developer.apple.com/account -> Certificates).
3. Provisioning profile mismatch (delete profiles in `~/Library/MobileDevice/Provisioning Profiles/` and let Xcode regenerate).

Fall back to the manual Xcode flow ([manual-upload.md](manual-upload.md)) to see the same errors in a GUI.

### "altool upload succeeded but build never appears in TestFlight"

Apple sometimes rejects builds silently after upload if they fail deeper validation. Check:

```bash
yarn asc:builds
```

If the build is missing entirely (not even `PROCESSING`), it was rejected. Log into the App Store Connect portal, go to your app -> Activity -> "All Builds" -> filter by upload date, and look for the row with an "Invalid Binary" or similar error. The email from `noreply@email.apple.com` also lists the reason.

### "curl: (3) bad range in URL position"

This should not happen with the current scripts (they pass `--globoff`), but if you write your own curl call against the App Store Connect API, remember that filter parameters use square brackets (`filter[bundleId]=org.tucop`) which curl interprets as glob ranges without `--globoff`.

---

## How it works under the hood

Three shell scripts in `scripts/`:

### `scripts/app-store-connect-env.sh`

Called via `source`. Loads all 3 Keychain items into env vars:

- `APPLE_CONNECT_KEY_ID`
- `APPLE_CONNECT_ISSUER_ID`
- `APPLE_CONNECT_CERTIFICATE_PATH` (points to a `mktemp` .p8 file)

Also sets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH` for tools that prefer those names.

The .p8 is stored hex-encoded in Keychain because macOS `security -w` outputs hex when the value contains non-printable bytes (PEM has embedded newlines). The loader decodes with `xxd -r -p` and validates the reconstructed file starts with `-----BEGIN PRIVATE KEY-----` before proceeding.

The temp .p8 is deleted on shell exit via a `trap` on `EXIT`.

### `scripts/upload-testflight.sh`

The workhorse. Steps:

1. Auto-picks newest `.xcarchive` from `~/Library/Developer/Xcode/Archives/*/*.xcarchive` if none passed.
2. Re-runs `yarn validate:ios-archive` on it.
3. Sources `app-store-connect-env.sh` to load credentials.
4. Extracts `DEVELOPMENT_TEAM` from `ios/TuCop.xcodeproj/project.pbxproj` (currently `QZUQHFSF4H`).
5. Generates a temp `exportOptions.plist` with `method=app-store`, `signingStyle=automatic`.
6. Runs `xcodebuild -exportArchive` with API key auth flags.
7. Runs `xcrun altool --upload-app` on the resulting .ipa.
8. Cleans up the temp .ipa, plist, and .p8 on exit.

### `scripts/app-store-connect-query.sh`

Read-only queries via the App Store Connect REST API at `https://api.appstoreconnect.apple.com/v1`.

Auth uses ES256 JWTs signed by the .p8. The JWT signer is bash-only, no Python or Node dependency: `openssl dgst -sha256 -sign` for the raw signature, `openssl asn1parse` to unpack the ASN.1 DER envelope, `xxd -r -p` and `base64` for the standard base64url encoding.

Subcommands:

- `apps` - GET `/v1/apps?limit=10`
- `builds [--limit N]` - GET `/v1/builds?filter[app]=<id>&sort=-uploadedDate&limit=N&include=preReleaseVersion`
- `versions` - GET `/v1/apps/<id>/appStoreVersions?limit=10`
- `testflight` - GET `/v1/builds?filter[app]=<id>&filter[processingState]=VALID&sort=-uploadedDate&limit=10`
- `whoami` - prints Keychain values + runs `apps`

The `curl` call uses `--globoff` because filter parameters use square brackets, which curl treats as glob patterns by default.

---

## Regenerating credentials

If the .p8 is lost, corrupted, or you need to rotate the key:

1. Go to App Store Connect -> Users and Access -> Integrations -> App Store Connect API.
2. Revoke the old key (row named `0xj4an-M5Pro`).
3. Click `+` to generate a new key. Name: `0xj4an-M5Pro` (or the current device name). Access: `Admin`.
4. Download the `.p8` file (only offered once).
5. Copy the new Key ID from the row.
6. The Issuer ID at the top of the page does not change unless the whole account is recreated.
7. Update Keychain:

```bash
# Replace with the values from step 3 to 6
security add-generic-password -A -U -a tucop-finance -s APP_STORE_CONNECT_KEY_ID -w '<new-key-id>'
security add-generic-password -A -U -a tucop-finance -s APP_STORE_CONNECT_ISSUER_ID -w '<issuer-id>'
security add-generic-password -A -U -a tucop-finance -s APP_STORE_CONNECT_PRIVATE_KEY \
  -w "$(cat '/path/to/new-key.p8')"
```

8. Verify:

```bash
yarn asc:whoami
```

Should return the TuCop app row.

9. Delete the downloaded `.p8` (Apple does not let you re-download; the Keychain copy is the only backup):

```bash
rm '/path/to/new-key.p8'
```

The rotation is transparent to the upload flow: existing uploaded builds remain valid, only the credential used to upload NEW builds changes.

---

## What this does NOT do

- Does not build or sign the app. Xcode Archive still runs manually.
- Does not approve the binary for App Store release. Apple review is always human (24 to 48h).
- Does not automatically create a new App Store version, fill in "What's New", or submit for review. Those steps are still done in the App Store Connect web portal.
- Does not run from CI. The .p8 lives only in macOS Keychain. Full CI automation would require storing it as a GitHub Actions secret, which is a separate policy decision.
- Does not upload to Play Store. Android uses a different API (Google Play Developer API) and a different credential type (service account JSON). Not yet wired.

---

## References

- [manual-upload.md](manual-upload.md) - Xcode UI walk-through, always works as a fallback
- [releases.md](releases.md) - end-to-end release process
- [ci-cd.md](ci-cd.md) - CI pipeline architecture
- `.claude/rules/release-procedure.md` - canonical release checklist (Stage 5.4 now uses these commands)
- [Apple docs: Creating API Keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)
- [Apple docs: Generating Tokens for API Requests](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests)
