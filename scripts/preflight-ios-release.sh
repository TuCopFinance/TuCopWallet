#!/usr/bin/env bash
# scripts/preflight-ios-release.sh
#
# MANDATORY pre-Archive check for iOS App Store releases. Exits 1 with a
# loud message if any invariant fails. Wire it into any release wrapper
# (yarn release:ios) BEFORE opening Xcode. Motivated by the 1.118.9 (259)
# incident where the mainnetdev scheme was accidentally archived and
# uploaded to the App Store (icon read "(dev)"); the recovery ate a full
# rebuild + a 1.118.10 patch. This script would have caught it.
#
# Checks:
#   1. .env exists AND matches .env.mainnet byte-for-byte
#   2. .env does NOT contain APP_DISPLAY_NAME=TuCop (dev)  (mainnetdev tell)
#   3. Info.plist template vars intact ($(MARKETING_VERSION), $(CURRENT_PROJECT_VERSION))
#   4. Version numbers aligned across package.json / pbxproj / gradle.properties
#   5. Warns if dead schemes exist (nightly, test) so we don't leave rot
#
# Exit codes:
#   0  green light, safe to open Xcode and Archive
#   1  something wrong, refuse to proceed

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  printf "${RED}[FAIL]${NC} %s\n" "$*" >&2
  exit 1
}
ok() { printf "${GREEN}[ OK ]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }

echo "== iOS release preflight ($(date '+%Y-%m-%d %H:%M:%S')) =="

# 1. .env == .env.mainnet
[[ -f .env ]] || fail ".env not found. Run: cp .env.mainnet .env"
[[ -f .env.mainnet ]] || fail ".env.mainnet missing from repo"
if ! diff -q .env .env.mainnet >/dev/null 2>&1; then
  fail ".env differs from .env.mainnet. Fix: cp .env.mainnet .env"
fi
ok ".env matches .env.mainnet"

# 2. no dev-flavor display name
if grep -qE '^APP_DISPLAY_NAME=.*\(dev\)' .env; then
  fail ".env has APP_DISPLAY_NAME with '(dev)' suffix. This is the mainnetdev env. STOP."
fi
if ! grep -qE '^APP_DISPLAY_NAME=TuCop$' .env; then
  fail ".env APP_DISPLAY_NAME is not exactly 'TuCop'. Actual: $(grep '^APP_DISPLAY_NAME=' .env)"
fi
ok "APP_DISPLAY_NAME=TuCop (no dev suffix)"

# 3. Info.plist template vars intact (agvtool sometimes hardcodes them)
INFO_PLIST="ios/TuCop/Info.plist"
[[ -f "$INFO_PLIST" ]] || fail "$INFO_PLIST not found"
if ! grep -qE '<string>\$\(MARKETING_VERSION\)</string>' "$INFO_PLIST"; then
  fail "Info.plist CFBundleShortVersionString is not \$(MARKETING_VERSION). Restore template var."
fi
if ! grep -qE '<string>\$\(CURRENT_PROJECT_VERSION\)</string>' "$INFO_PLIST"; then
  fail "Info.plist CFBundleVersion is not \$(CURRENT_PROJECT_VERSION). Restore template var."
fi
ok "Info.plist template vars intact"

# 4. version alignment
PKG_VERSION=$(python3 -c "import json; print(json.load(open('package.json'))['version'])")
IOS_MARKETING=$(grep -m1 "MARKETING_VERSION = 1\." ios/TuCop.xcodeproj/project.pbxproj | grep -oE '1\.[0-9]+\.[0-9]+')
IOS_BUILD=$(grep -m1 "CURRENT_PROJECT_VERSION = [0-9]" ios/TuCop.xcodeproj/project.pbxproj | grep -oE '[0-9]+' | head -1)
ANDROID_VERSION=$(grep -oE 'versionName "1\.[0-9]+\.[0-9]+"' android/app/build.gradle | grep -oE '1\.[0-9]+\.[0-9]+')
ANDROID_CODE=$(grep -oE 'VERSION_CODE=[0-9]+' android/gradle.properties | cut -d= -f2)

[[ "$PKG_VERSION" == "$IOS_MARKETING" ]] || fail "package.json ($PKG_VERSION) != iOS MARKETING_VERSION ($IOS_MARKETING)"
[[ "$PKG_VERSION" == "$ANDROID_VERSION" ]] || fail "package.json ($PKG_VERSION) != Android versionName ($ANDROID_VERSION)"
ok "Versions aligned: package.json=$PKG_VERSION iOS=$IOS_MARKETING($IOS_BUILD) Android=$ANDROID_VERSION($ANDROID_CODE)"

# 5. warn about dead schemes (nightly is fully removed; TuCop-test is kept for Detox E2E)
DEAD_SCHEMES=(
  "ios/TuCop.xcodeproj/xcshareddata/xcschemes/TuCop-mainnetnightly.xcscheme"
  "ios/TuCop.xcodeproj/xcshareddata/xcschemes/TuCop-mainnetnightly (unused).xcscheme"
  "ios/TuCop.xcodeproj/xcshareddata/xcschemes/TuCop-test (unused).xcscheme"
)
for f in "${DEAD_SCHEMES[@]}"; do
  [[ -f "$f" ]] && warn "Dead scheme still present: $f (safe to delete)"
done

echo ""
ok "All preflight checks passed. Safe to Archive."
echo ""
echo "Next steps in Xcode:"
echo "  1. Verify scheme dropdown says 'TuCop-mainnet' (NOT mainnetdev)"
echo "  2. Destination: Any iOS Device (arm64)"
echo "  3. Clean Build Folder (Shift+Cmd+K)"
echo "  4. Product -> Archive"
echo "  5. After Archive completes, run: yarn validate:ios-archive"
