#!/usr/bin/env bash
set -euo pipefail

# ========================================
# Generate the root state schema from the RootState TS type
# ========================================

root_state_schema="test/RootStateSchema.json"

typescript-json-schema ./tsconfig.json RootStateForSchemaGeneration --include src/redux/reducersForSchemaGeneration.ts --ignoreErrors --required --noExtraProps > "$root_state_schema"

# Post-process: typescript-json-schema emits `"enum": ""` (empty string) when a
# TS literal type resolves to a single value that also has `"const"` set. AJV
# rejects the schema at compile time because enum must be an array. Strip the
# malformed entries — the accompanying `"const"` already enforces the invariant.
# This keeps `update-root-state-schema` idempotent + matches what the AJV
# validation test in src/redux/store.test.ts expects.
python3 - "$root_state_schema" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    schema = json.load(f)
def walk(node):
    if isinstance(node, dict):
        if 'enum' in node and node['enum'] == '':
            del node['enum']
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for item in node:
            walk(item)
walk(schema)
with open(path, 'w') as f:
    json.dump(schema, f, indent=4, ensure_ascii=False)
    f.write('\n')
PY

if git diff --exit-code "$root_state_schema"; then
  echo "$root_state_schema is up to date"
  exit 0
fi

echo -e "$root_state_schema has been updated. Please review the changes, add the necessary redux migration and commit the changes.\nSee https://github.com/valora-inc/wallet/tree/main/WALLET.md#redux-state-migration"
