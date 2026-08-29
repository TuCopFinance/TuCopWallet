#!/usr/bin/env bash
# scripts/upload-testflight.sh
#
# Uploads an .xcarchive to TestFlight via the App Store Connect API.
# Replaces the manual "Distribute App" wizard in Xcode Organizer
# (release-procedure.md Stage 5.4). Credentials loaded from Keychain via
# scripts/app-store-connect-env.sh.
#
# Usage:
#   scripts/upload-testflight.sh                       # auto-picks newest archive
#   scripts/upload-testflight.sh <path.xcarchive>      # specific archive
#   scripts/upload-testflight.sh --validate-only       # dry-run (no upload)
#   scripts/upload-testflight.sh --validate-only <p>   # dry-run on specific archive
#
# Prerequisites:
#   1. Archive must have passed `yarn validate:ios-archive` first
#   2. Xcode command line tools installed (xcrun altool present)
#   3. Keychain has APP_STORE_CONNECT_{KEY_ID,ISSUER_ID,PRIVATE_KEY}
#
# What it does:
#   1. Loads creds from Keychain
#   2. Exports .xcarchive to .ipa (xcodebuild -exportArchive with App Store method)
#   3. Uploads .ipa to App Store Connect (xcrun altool --upload-app)
#   4. Prints Apple's response (build ID, upload timestamp)
#
# TestFlight processing runs asynchronously on Apple's side (~10-30 min).
# Use scripts/testflight-status.sh (if wired) or the email notification
# to know when the build is ready to invite testers.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

fail() { printf "${RED}[FAIL]${NC} %s\n" "$*" >&2; exit 1; }
ok() { printf "${GREEN}[ OK ]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
info() { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Parse args
VALIDATE_ONLY=false
ARCHIVE_PATH=""
for arg in "$@"; do
  case "$arg" in
    --validate-only) VALIDATE_ONLY=true ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) ARCHIVE_PATH="$arg" ;;
  esac
done

# Auto-pick newest archive if none passed
if [[ -z "$ARCHIVE_PATH" ]]; then
  ARCHIVE_PATH=$(ls -td ~/Library/Developer/Xcode/Archives/*/*.xcarchive 2>/dev/null | head -1 || true)
  [[ -n "$ARCHIVE_PATH" ]] || fail "No archive found. Pass explicit path or archive one via Xcode first."
  info "Auto-selected newest archive: $ARCHIVE_PATH"
fi

[[ -d "$ARCHIVE_PATH" ]] || fail "Archive not found: $ARCHIVE_PATH"

# Sanity check: TuCop.app inside
APP_PATH="$ARCHIVE_PATH/Products/Applications/TuCop.app"
[[ -d "$APP_PATH" ]] || fail "TuCop.app not found inside archive: $APP_PATH"

# Enforce: prior validation must have passed. We can't check the past run,
# but we CAN re-run the validator to be safe (~2 sec).
info "Re-running yarn validate:ios-archive on this archive..."
if ! "$REPO_ROOT/scripts/validate-ios-archive.sh" "$ARCHIVE_PATH" >/dev/null 2>&1; then
  fail "Archive failed validation. Run 'yarn validate:ios-archive $ARCHIVE_PATH' to see the specific failure."
fi
ok "Archive validation passed"

# Load App Store Connect creds
info "Loading App Store Connect credentials from Keychain..."
# shellcheck source=./app-store-connect-env.sh
source "$REPO_ROOT/scripts/app-store-connect-env.sh"
ok "Credentials loaded (key_id=$APPLE_CONNECT_KEY_ID)"

# Export archive to .ipa
info "Exporting archive to .ipa..."
EXPORT_DIR=$(mktemp -d -t tucop_export.XXXXXX)
trap 'rm -rf "$EXPORT_DIR"' EXIT

# Read the App Store Connect team ID from pbxproj (DEVELOPMENT_TEAM = QZUQHFSF4H;).
# Grab the value AFTER "DEVELOPMENT_TEAM = " directly. Naive [A-Z0-9]{10} on
# the whole line matches "DEVELOPMEN" (first 10 chars of DEVELOPMENT) before
# reaching the real team ID.
TEAM_ID=$(grep -m1 "DEVELOPMENT_TEAM = " ios/TuCop.xcodeproj/project.pbxproj \
  | sed -E 's/.*DEVELOPMENT_TEAM = ([A-Z0-9]+);.*/\1/')
[[ -n "$TEAM_ID" && "$TEAM_ID" != "DEVELOPMEN" ]] || fail "Could not extract DEVELOPMENT_TEAM from pbxproj (got: $TEAM_ID)"

EXPORT_OPTIONS_PLIST=$(mktemp -t export_options.XXXXXX).plist
cat > "$EXPORT_OPTIONS_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
PLIST

if ! xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
    -allowProvisioningUpdates \
    -authenticationKeyID "$APPLE_CONNECT_KEY_ID" \
    -authenticationKeyIssuerID "$APPLE_CONNECT_ISSUER_ID" \
    -authenticationKeyPath "$APPLE_CONNECT_CERTIFICATE_PATH" \
    2>&1 | tail -20; then
  fail "xcodebuild -exportArchive failed. Full log above."
fi

IPA_PATH=$(ls "$EXPORT_DIR"/*.ipa 2>/dev/null | head -1)
[[ -f "$IPA_PATH" ]] || fail "Export succeeded but no .ipa found in $EXPORT_DIR"
IPA_SIZE=$(du -h "$IPA_PATH" | awk '{print $1}')
ok "Exported: $IPA_PATH ($IPA_SIZE)"

if [[ "$VALIDATE_ONLY" == true ]]; then
  info "Validating .ipa with App Store (no upload)..."
  xcrun altool --validate-app \
    -f "$IPA_PATH" \
    -t ios \
    --apiKey "$APPLE_CONNECT_KEY_ID" \
    --apiIssuer "$APPLE_CONNECT_ISSUER_ID"
  ok "Validation complete (no upload performed)"
  exit 0
fi

# Upload to App Store Connect (goes to TestFlight, processed async).
# altool with --apiKey does NOT accept a key-path argument. It looks for the
# .p8 file at ./private_keys, ~/private_keys, ~/.private_keys, or
# ~/.appstoreconnect/private_keys, with the fixed name AuthKey_<KEY_ID>.p8.
# Stage the .p8 at ~/.appstoreconnect/private_keys/ with the required name
# for the duration of the upload, then clean up.
info "Uploading to App Store Connect..."
ALTOOL_KEYS_DIR="$HOME/.appstoreconnect/private_keys"
mkdir -p "$ALTOOL_KEYS_DIR"
ALTOOL_KEY_PATH="$ALTOOL_KEYS_DIR/AuthKey_${APPLE_CONNECT_KEY_ID}.p8"
cp "$APPLE_CONNECT_CERTIFICATE_PATH" "$ALTOOL_KEY_PATH"
chmod 600 "$ALTOOL_KEY_PATH"
# Extend the export-dir trap to also remove the staged .p8 when the script exits.
trap 'rm -rf "$EXPORT_DIR"; rm -f "$ALTOOL_KEY_PATH"' EXIT

xcrun altool --upload-app \
  -f "$IPA_PATH" \
  -t ios \
  --apiKey "$APPLE_CONNECT_KEY_ID" \
  --apiIssuer "$APPLE_CONNECT_ISSUER_ID"

ok "Upload complete."
echo ""
info "Next steps:"
echo "   1. Wait 10-30 min for App Store Connect to process the build"
echo "   2. Check email 'Your app has completed processing' (from noreply@email.apple.com)"
echo "   3. Or visit https://appstoreconnect.apple.com/apps -> TuCop -> TestFlight"
echo "   4. Once processed, invite testers or promote to a version for App Store review"
