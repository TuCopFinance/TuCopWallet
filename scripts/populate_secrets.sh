#!/usr/bin/env bash
# Populate TuCOP secrets from Keychain (dev) or env vars (CI) into gitignored
# plaintext files that the build reads. Replaces the previous KMS-based
# scripts/key_placer.sh which depended on Valora's GCP project celo-mobile-testnet.
#
# Reads (in this priority order):
#   1. Env vars (CI):   SENTRY_AUTH_TOKEN, SENTRY_CLIENT_URL
#   2. macOS Keychain:  acct=tucop-finance svce=SENTRY_ORG_TOKEN, svce=SENTRY_CLIENT_URL
#
# Writes (all gitignored):
#   - ios/sentry.properties
#   - android/sentry.properties
#   - secrets.json
#
# Missing values are written as empty. Runtime error reporting needs the DSN.
# Build sourcemap upload needs the auth token. Both degrade gracefully so
# postinstall never fails the developer's yarn install.

set -eu

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."

SENTRY_ORG_SLUG="tucop-finance"
SENTRY_PROJECT_SLUG="tucopwallet"

kc() {
  local svce="$1"
  security find-generic-password -a tucop-finance -s "$svce" -w 2>/dev/null || true
}

sentry_token="${SENTRY_AUTH_TOKEN:-}"
sentry_dsn="${SENTRY_CLIENT_URL:-}"

if [ -z "$sentry_token" ] && command -v security >/dev/null 2>&1; then
  sentry_token="$(kc SENTRY_ORG_TOKEN)"
fi
if [ -z "$sentry_dsn" ] && command -v security >/dev/null 2>&1; then
  sentry_dsn="$(kc SENTRY_CLIENT_URL)"
fi

write_sentry_properties() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
  cat > "$target" <<EOF
defaults.url=https://sentry.io
defaults.org=${SENTRY_ORG_SLUG}
defaults.project=${SENTRY_PROJECT_SLUG}
auth.token=${sentry_token}
cli.executable=node_modules/@sentry/cli/bin/sentry-cli
EOF
}

write_sentry_properties ios/sentry.properties
write_sentry_properties android/sentry.properties

cat > secrets.json <<EOF
{
  "mainnet": {
    "SENTRY_CLIENT_URL": "${sentry_dsn}"
  }
}
EOF

if [ -z "$sentry_token" ]; then
  echo "populate_secrets: WARN sentry auth token not found (env SENTRY_AUTH_TOKEN or Keychain acct=tucop-finance svce=SENTRY_ORG_TOKEN). Sourcemap upload will fail; runtime is unaffected." >&2
fi
if [ -z "$sentry_dsn" ]; then
  echo "populate_secrets: WARN sentry DSN not found (env SENTRY_CLIENT_URL or Keychain acct=tucop-finance svce=SENTRY_CLIENT_URL). Runtime error reporting will be disabled." >&2
fi

exit 0
