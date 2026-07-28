#!/usr/bin/env bash
# Pre-release smoke against the TuCop backend. Runs the six checks from the
# wallet-consumer-spec verification playbook and halts on any regression.
#
# Usage: ./scripts/pre-release-backend-smoke.sh
#        ADDR=<any-neeru-holder> ./scripts/pre-release-backend-smoke.sh
#
# The default address is a public spike wallet that always has Neeru history
# on mainnet. Override ADDR if that changes.
set -euo pipefail

BASE=${BASE:-https://tucop-backend-production.up.railway.app}
ADDR=${ADDR:-0x81dcf9160237d0ef0d4db27cfb2ea9743547f882}

STEP=0
fail() {
  echo
  echo "SMOKE FAILED: $1" >&2
  exit 1
}

next() {
  STEP=$((STEP + 1))
  echo
  echo "[$STEP/6] $1"
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "missing dependency: $1"
}

require curl
require jq

next "health probes"
curl -sf "$BASE/health" | jq -e '.ok == true' >/dev/null || fail "/health did not return ok"
curl -sf "$BASE/ready" | jq -e '.ok == true' >/dev/null || fail "/ready did not return ok"
curl -sf "$BASE/health/relay" | jq -e '.ok == true' >/dev/null || fail "/health/relay is failing (relay may need refunding)"

next "neeru catalogue (4 categories, no partialFailure)"
CATALOG=$(curl -sf "$BASE/hooks-api/getEarnPositions?networkIds=celo-mainnet&supportedAppIds=neeru-vaults&address=$ADDR")
COUNT=$(echo "$CATALOG" | jq '.data | length')
PF=$(echo "$CATALOG" | jq '.meta.partialFailure // null')
[[ "$COUNT" == "4" ]] || fail "expected 4 neeru categories, got $COUNT"
[[ "$PF" == "null" ]] || fail "unexpected partialFailure: $PF"

next "shortcut list (withdraw-amount-only present, withdraw-principal-only absent)"
SHORTCUTS=$(curl -sf "$BASE/hooks-api/v2/getShortcuts")
echo "$SHORTCUTS" | jq -e '.data | any(.appId == "neeru-vaults" and .id == "withdraw-amount-only")' >/dev/null \
  || fail "withdraw-amount-only shortcut missing"
echo "$SHORTCUTS" | jq -e '.data | any(.id == "withdraw-principal-only") | not' >/dev/null \
  || fail "legacy withdraw-principal-only shortcut is still emitted"

next "asset URLs (new path 200, old path 404)"
NEW_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/assets/neeru/category-0.png")
OLD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/assets/neeru/tranche-0.png")
[[ "$NEW_STATUS" == "200" ]] || fail "new asset URL returned $NEW_STATUS"
[[ "$OLD_STATUS" == "404" ]] || fail "old asset URL returned $OLD_STATUS (expected 404 post-cutover)"

next "neeru positions detail (shape check)"
DETAIL=$(curl -sf "$BASE/api/earn/neeru/positions?address=$ADDR")
echo "$DETAIL" | jq -e '.data.positions | type == "array"' >/dev/null \
  || fail "detail endpoint did not return a positions array"

next "feed indexer health (lag under 500 blocks, or catching up)"
LAG_1=$(curl -sf "$BASE/api/transactions/indexer/health" | jq '.lagBlocks')
[[ "$LAG_1" =~ ^-?[0-9]+$ ]] || fail "lagBlocks not numeric: $LAG_1"
if [[ "$LAG_1" -le 500 ]]; then
  :
else
  sleep 10
  LAG_2=$(curl -sf "$BASE/api/transactions/indexer/health" | jq '.lagBlocks')
  [[ "$LAG_2" =~ ^-?[0-9]+$ ]] || fail "lagBlocks not numeric on retry: $LAG_2"
  DELTA=$((LAG_1 - LAG_2))
  if [[ "$LAG_2" -le 500 ]]; then
    :
  elif [[ "$DELTA" -ge 50 ]]; then
    echo "  indexer catching up: $LAG_1 -> $LAG_2 blocks ($DELTA delta in 10s)"
  else
    fail "indexer lag $LAG_2 blocks exceeds 500-block threshold and not catching up (delta=$DELTA in 10s)"
  fi
fi

echo
echo "OK  all 6 smoke checks passed against $BASE"
