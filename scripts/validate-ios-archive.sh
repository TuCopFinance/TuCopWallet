#!/usr/bin/env bash
# scripts/validate-ios-archive.sh
#
# MANDATORY post-Archive check before clicking "Distribute App" in Xcode.
# Inspects the actual .xcarchive on disk (not Xcode's UI) and refuses to
# proceed if the archive was built from the wrong scheme.
#
# Usage:
#   scripts/validate-ios-archive.sh                  # auto-picks newest archive
#   scripts/validate-ios-archive.sh <path.xcarchive>
#
# Root cause this guards: Xcode's scheme dropdown was left on
# TuCop-mainnetdev after debug work, user hit Archive without noticing,
# and the resulting binary (icon "TuCop (dev)", dev backend URLs, dev
# Statsig keys) was uploaded to App Store and made it live. This check
# would have caught it in 2 seconds.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail() { printf "${RED}[FAIL]${NC} %s\n" "$*" >&2; exit 1; }
ok() { printf "${GREEN}[ OK ]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ARCHIVE_PATH="${1:-}"
if [[ -z "$ARCHIVE_PATH" ]]; then
  ARCHIVE_PATH=$(ls -td ~/Library/Developer/Xcode/Archives/*/*.xcarchive 2>/dev/null | head -1)
  [[ -n "$ARCHIVE_PATH" ]] || fail "No archive path passed and no archives found in ~/Library/Developer/Xcode/Archives/"
  echo "Auto-selected newest archive: $ARCHIVE_PATH"
fi

[[ -d "$ARCHIVE_PATH" ]] || fail "Archive not found: $ARCHIVE_PATH"

APP_PATH="$ARCHIVE_PATH/Products/Applications/TuCop.app"
[[ -d "$APP_PATH" ]] || fail "TuCop.app not found inside archive: $APP_PATH"

INFO_PLIST="$APP_PATH/Info.plist"
[[ -f "$INFO_PLIST" ]] || fail "Info.plist missing inside archive"

echo "== iOS archive validation =="
echo "Archive:  $ARCHIVE_PATH"
echo ""

# Read metadata (Info.plist inside .app is binary, need PlistBuddy)
DISPLAY_NAME=$(/usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" "$INFO_PLIST" 2>/dev/null || echo "")
BUNDLE_ID=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$INFO_PLIST" 2>/dev/null || echo "")
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INFO_PLIST" 2>/dev/null || echo "")
BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$INFO_PLIST" 2>/dev/null || echo "")

echo "  CFBundleDisplayName:         $DISPLAY_NAME"
echo "  CFBundleIdentifier:          $BUNDLE_ID"
echo "  CFBundleShortVersionString:  $VERSION"
echo "  CFBundleVersion:             $BUILD"
echo ""

# 1. CFBundleDisplayName check (the smoking gun)
if [[ "$DISPLAY_NAME" == *"(dev)"* ]]; then
  fail "CFBundleDisplayName contains '(dev)'. This archive was built with mainnetdev scheme. DO NOT UPLOAD."
fi
if [[ "$DISPLAY_NAME" == *"(nightly)"* ]]; then
  fail "CFBundleDisplayName contains '(nightly)'. This archive is a nightly build. DO NOT UPLOAD."
fi
if [[ "$DISPLAY_NAME" != "TuCop" ]]; then
  fail "CFBundleDisplayName is '$DISPLAY_NAME', expected 'TuCop'."
fi
ok "CFBundleDisplayName = TuCop (production)"

# 2. Bundle ID check
if [[ "$BUNDLE_ID" != "org.tucop" ]]; then
  fail "CFBundleIdentifier is '$BUNDLE_ID', expected 'org.tucop'."
fi
ok "CFBundleIdentifier = org.tucop"

# 3. Version alignment with package.json
if [[ -f "$REPO_ROOT/package.json" ]]; then
  PKG_VERSION=$(python3 -c "import json; print(json.load(open('$REPO_ROOT/package.json'))['version'])")
  if [[ "$VERSION" != "$PKG_VERSION" ]]; then
    fail "Archive version '$VERSION' does not match package.json '$PKG_VERSION'. Stale archive?"
  fi
  ok "Archive version matches package.json ($VERSION)"
fi

# 4. Firebase plist flavor check (defensive)
DEV_PLISTS=$(find "$APP_PATH" -name "GoogleService-Info.*dev*.plist" -o -name "GoogleService-Info.*nightly*.plist" 2>/dev/null)
if [[ -n "$DEV_PLISTS" ]]; then
  fail "Archive contains dev/nightly Firebase plists: $DEV_PLISTS"
fi
ok "No dev/nightly Firebase plists embedded"

# 5. Architectures check (should be arm64 only for App Store)
BINARY="$APP_PATH/TuCop"
if [[ -f "$BINARY" ]]; then
  ARCHS=$(lipo -archs "$BINARY" 2>/dev/null || echo "unknown")
  if [[ "$ARCHS" == *"x86_64"* ]]; then
    warn "Binary contains x86_64 (simulator arch). Should be arm64 only for App Store."
  fi
  ok "Binary architectures: $ARCHS"
fi

echo ""
ok "All archive validation checks passed. Safe to Distribute App -> App Store Connect -> Upload."
