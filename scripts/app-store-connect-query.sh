#!/usr/bin/env bash
# scripts/app-store-connect-query.sh
#
# Read-only queries against the App Store Connect API for TuCop. Useful
# after `yarn upload:testflight` to check if the build finished processing,
# or to grab TestFlight state without opening the portal.
#
# Auth: creds loaded from Keychain via app-store-connect-env.sh, JWT signed
# with the .p8 using openssl.
#
# Commands:
#   apps                  List apps (proves auth works)
#   builds [--limit N]    List recent builds for TuCop (sorted newest first)
#   versions              List App Store versions for TuCop
#   testflight            List active TestFlight builds
#   whoami                Print who this API key belongs to (from JWT)
#
# Usage:
#   scripts/app-store-connect-query.sh apps
#   scripts/app-store-connect-query.sh builds --limit 10
#   scripts/app-store-connect-query.sh testflight

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=./app-store-connect-env.sh
source "$REPO_ROOT/scripts/app-store-connect-env.sh"

TUCOP_BUNDLE_ID="org.tucop"

_asc_jwt() {
  local header_json='{"alg":"ES256","kid":"'"$APPLE_CONNECT_KEY_ID"'","typ":"JWT"}'
  local header_b64
  header_b64=$(printf '%s' "$header_json" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

  local now exp payload_json payload_b64
  now=$(date +%s)
  exp=$((now + 300))
  payload_json='{"iss":"'"$APPLE_CONNECT_ISSUER_ID"'","iat":'"$now"',"exp":'"$exp"',"aud":"appstoreconnect-v1"}'
  payload_b64=$(printf '%s' "$payload_json" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

  local signing_input="$header_b64.$payload_b64"
  local signature
  signature=$(printf '%s' "$signing_input" | openssl dgst -sha256 -sign "$APPLE_CONNECT_CERTIFICATE_PATH" \
    | openssl asn1parse -inform DER \
    | awk '/INTEGER/ {print $NF}' \
    | while read -r hex; do
        printf '%064s' "${hex#0x}" | tr ' ' '0'
      done \
    | xxd -r -p \
    | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

  printf '%s.%s' "$signing_input" "$signature"
}

_asc_get() {
  local path="$1"
  local jwt
  jwt=$(_asc_jwt)
  curl -sS --globoff -H "Authorization: Bearer $jwt" "https://api.appstoreconnect.apple.com$path"
}

_get_tucop_app_id() {
  local resp
  resp=$(_asc_get "/v1/apps?filter[bundleId]=$TUCOP_BUNDLE_ID&limit=1")
  python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
if 'errors' in d:
    print('ERROR:', d['errors'], file=sys.stderr)
    sys.exit(1)
apps = d.get('data', [])
if not apps:
    print('No app found for bundleId $TUCOP_BUNDLE_ID', file=sys.stderr)
    sys.exit(1)
print(apps[0]['id'])
" <<<"$resp"
}

cmd_apps() {
  _asc_get "/v1/apps?limit=10" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
if 'errors' in d:
    print('ERROR:', json.dumps(d['errors'], indent=2), file=sys.stderr); sys.exit(1)
for a in d.get('data', []):
    at = a.get('attributes', {})
    print(f\"{a['id']:>12}  {at.get('name','?')}  bundleId={at.get('bundleId','?')}\")
"
}

cmd_whoami() {
  echo "Key ID:    $APPLE_CONNECT_KEY_ID"
  echo "Issuer ID: $APPLE_CONNECT_ISSUER_ID"
  echo "P8 path:   $APPLE_CONNECT_CERTIFICATE_PATH (temp)"
  echo ""
  echo "Testing auth against /v1/apps..."
  cmd_apps
}

cmd_builds() {
  local limit=10
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit) limit="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  local app_id
  app_id=$(_get_tucop_app_id)
  _asc_get "/v1/builds?filter[app]=$app_id&sort=-uploadedDate&limit=$limit&include=preReleaseVersion" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
if 'errors' in d:
    print('ERROR:', json.dumps(d['errors'], indent=2), file=sys.stderr); sys.exit(1)

# Build a lookup for preReleaseVersion (holds the marketing version)
prv_by_id = {}
for inc in d.get('included', []):
    if inc.get('type') == 'preReleaseVersions':
        prv_by_id[inc['id']] = inc.get('attributes', {}).get('version', '?')

print(f\"{'BUILD_ID':>14}  {'VERSION':<10}  {'BUILD':<6}  {'STATE':<20}  {'UPLOADED':<20}  {'EXPIRES'}\")
print('-' * 110)
for b in d.get('data', []):
    at = b.get('attributes', {})
    rel = b.get('relationships', {})
    prv_data = rel.get('preReleaseVersion', {}).get('data') or {}
    prv_id = prv_data.get('id')
    version = prv_by_id.get(prv_id, '?')
    print(f\"{b['id']:>14}  {version:<10}  {at.get('version','?'):<6}  {at.get('processingState','?'):<20}  {at.get('uploadedDate','?'):<20}  {at.get('expirationDate','?')}\")
"
}

cmd_versions() {
  local app_id
  app_id=$(_get_tucop_app_id)
  _asc_get "/v1/apps/$app_id/appStoreVersions?limit=10" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
if 'errors' in d:
    print('ERROR:', json.dumps(d['errors'], indent=2), file=sys.stderr); sys.exit(1)
print(f\"{'VERSION_ID':>14}  {'VERSION':<10}  {'STATE':<32}  {'PLATFORM':<10}  {'CREATED'}\")
print('-' * 100)
for v in d.get('data', []):
    at = v.get('attributes', {})
    print(f\"{v['id']:>14}  {at.get('versionString','?'):<10}  {at.get('appStoreState','?'):<32}  {at.get('platform','?'):<10}  {at.get('createdDate','?')}\")
"
}

cmd_testflight() {
  local app_id
  app_id=$(_get_tucop_app_id)
  _asc_get "/v1/builds?filter[app]=$app_id&filter[processingState]=VALID&sort=-uploadedDate&limit=10" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
if 'errors' in d:
    print('ERROR:', json.dumps(d['errors'], indent=2), file=sys.stderr); sys.exit(1)
data = d.get('data', [])
if not data:
    print('No VALID builds visible (all may be processing or expired).')
    sys.exit(0)
print(f\"{'BUILD_ID':>14}  {'BUILD':<6}  {'STATE':<10}  {'USES_NON_EXEMPT_ENCRYPTION':<28}  {'UPLOADED'}\")
print('-' * 110)
for b in data:
    at = b.get('attributes', {})
    print(f\"{b['id']:>14}  {at.get('version','?'):<6}  {at.get('processingState','?'):<10}  {str(at.get('usesNonExemptEncryption','?')):<28}  {at.get('uploadedDate','?')}\")
"
}

case "${1:-whoami}" in
  apps)       cmd_apps ;;
  builds)     shift; cmd_builds "$@" ;;
  versions)   cmd_versions ;;
  testflight) cmd_testflight ;;
  whoami)     cmd_whoami ;;
  -h|--help)
    grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    echo "Unknown command: $1" >&2
    echo "Use one of: apps | builds | versions | testflight | whoami" >&2
    exit 1
    ;;
esac
