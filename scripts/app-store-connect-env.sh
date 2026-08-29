#!/usr/bin/env bash
# scripts/app-store-connect-env.sh
#
# Loads App Store Connect API credentials from macOS Keychain and exports
# them as env vars, writing the .p8 to a self-cleaning temp file. Consumed
# by scripts/upload-testflight.sh AND the Fastlane iOS upload lane
# (fastlane/Fastfile expects APPLE_CONNECT_{KEY_ID,ISSUER_ID,CERTIFICATE_PATH}).
#
# Usage (as loader, not standalone):
#   source scripts/app-store-connect-env.sh
#   # env vars now set: APPLE_CONNECT_KEY_ID, APPLE_CONNECT_ISSUER_ID,
#   # APPLE_CONNECT_CERTIFICATE_PATH; temp .p8 auto-deleted on shell exit.
#
# Keychain layout (acct=tucop-finance):
#   svce=APP_STORE_CONNECT_KEY_ID       10-char Key ID
#   svce=APP_STORE_CONNECT_ISSUER_ID    36-char UUID
#   svce=APP_STORE_CONNECT_PRIVATE_KEY  .p8 PEM (stored hex-encoded, 514 chars)
#
# The private key is hex-encoded because macOS `security -w` outputs hex
# when the value has embedded newlines (PEM has them). Decode with xxd -r -p.

set -euo pipefail

RED='\033[0;31m'
NC='\033[0m'

fail() { printf "${RED}[app-store-connect-env]${NC} %s\n" "$*" >&2; return 1; }

_ASC_KEY_ID=$(security find-generic-password -a tucop-finance -s APP_STORE_CONNECT_KEY_ID -w 2>/dev/null) \
  || { fail "APP_STORE_CONNECT_KEY_ID not in Keychain (acct=tucop-finance)"; exit 1; }
_ASC_ISSUER_ID=$(security find-generic-password -a tucop-finance -s APP_STORE_CONNECT_ISSUER_ID -w 2>/dev/null) \
  || { fail "APP_STORE_CONNECT_ISSUER_ID not in Keychain (acct=tucop-finance)"; exit 1; }

# .p8 to a self-cleaning temp file. Use mktemp with .p8 suffix so tools
# that inspect extension are happy. Trap on EXIT of the sourcing shell.
_ASC_P8_TMP=$(mktemp -t app_store_connect_key.XXXXXX).p8
security find-generic-password -a tucop-finance -s APP_STORE_CONNECT_PRIVATE_KEY -w 2>/dev/null | xxd -r -p > "$_ASC_P8_TMP" \
  || { rm -f "$_ASC_P8_TMP"; fail "APP_STORE_CONNECT_PRIVATE_KEY not in Keychain (acct=tucop-finance)"; exit 1; }

# Sanity check the PEM envelope was reconstructed correctly
if ! head -1 "$_ASC_P8_TMP" | grep -q 'BEGIN PRIVATE KEY'; then
  rm -f "$_ASC_P8_TMP"
  fail "Reconstructed .p8 missing BEGIN PRIVATE KEY header. Keychain value likely corrupt."
  exit 1
fi

# Standard Fastlane names (Fastfile reads these)
export APPLE_CONNECT_KEY_ID="$_ASC_KEY_ID"
export APPLE_CONNECT_ISSUER_ID="$_ASC_ISSUER_ID"
export APPLE_CONNECT_CERTIFICATE_PATH="$_ASC_P8_TMP"

# Also expose Apple's altool-preferred names (some tools want them in this form)
export ASC_KEY_ID="$_ASC_KEY_ID"
export ASC_ISSUER_ID="$_ASC_ISSUER_ID"
export ASC_KEY_PATH="$_ASC_P8_TMP"

# Ensure cleanup if the sourcing shell exits without an explicit trap
trap 'rm -f "$_ASC_P8_TMP"' EXIT
