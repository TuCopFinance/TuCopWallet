// Filter TuCOPRamp's full server/openapi.yaml down to the wallet surface
// before running openapi-typescript (see `yarn tucopramp:regen-types`).
//
// Why filter: the full spec carries ~125 routes, most of them Ramp's admin
// panel, integrator console and prereg surfaces the wallet never calls.
// Generating types for all of it ships 2,000+ dead lines and makes every
// Ramp-side admin refactor churn our generated file. We keep exactly the
// paths the wallet calls, plus every component reachable from them by $ref
// walk (the Error schema carries the full error-code catalog as an enum and
// is always reachable through the error responses).
//
// Usage:
//   node scripts/filter-tucopramp-openapi.js <in: openapi.yaml> <out: filtered.json>
//
// The input must be TuCOPRamp's server/openapi.yaml (the one the server
// generates from its route schemas). The published copies under
// developer-docs/ and admin/content/docs/ do NOT carry the /p2p routes
// (P2P left the public docs on 2026-10-25) and cannot be used here.
const fs = require('fs')
const yaml = require('js-yaml')

const [, , inFile, outFile] = process.argv
if (!inFile || !outFile) {
  console.error('usage: node scripts/filter-tucopramp-openapi.js <openapi.yaml> <out.json>')
  process.exit(1)
}
const spec = yaml.load(fs.readFileSync(inFile, 'utf8'))

// The 25 paths the wallet calls. This list is load-bearing: the client signs
// these exact strings (src/tucopramp/client.ts), so a path that changes
// upstream must change here AND at its call site in the same PR.
const KEEP_PATHS = [
  // P2P (TuCOP Ramp)
  '/p2p/banks',
  '/p2p/limits',
  '/p2p/onramp/receiving-account',
  '/p2p/users/me',
  '/p2p/users/cedula',
  '/p2p/offramp/quote',
  '/p2p/offramp/orders',
  '/p2p/onramp/quote',
  '/p2p/onramp/orders',
  '/p2p/orders',
  '/p2p/orders/{id}',
  '/p2p/orders/{id}/cancel',
  '/p2p/orders/{id}/proof-url',
  '/p2p/orders/{id}/proof',
  // Platform (Bridge ramp)
  '/sessions/wallet/nonce',
  '/sessions/wallet',
  '/sessions/current',
  '/parties',
  '/parties/me',
  '/destinations',
  '/destinations/{id}',
  '/quotes',
  '/withdrawals',
  '/withdrawals/{id}',
  '/deposits',
]

const missing = KEEP_PATHS.filter((p) => !spec.paths[p])
if (missing.length) {
  console.error('paths not found in the spec (did Ramp rename a route?):', missing)
  process.exit(1)
}

const keptPaths = {}
for (const p of KEEP_PATHS) keptPaths[p] = spec.paths[p]

// Walk $refs transitively from the kept paths.
const reachable = new Set()
function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk)
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string' && v.startsWith('#/components/')) {
        const [, , section, name] = v.split('/')
        const key = `${section}/${name}`
        if (!reachable.has(key)) {
          reachable.add(key)
          const target = spec.components?.[section]?.[name]
          if (!target) {
            console.error('dangling ref', v)
            process.exit(1)
          }
          walk(target)
        }
      } else {
        walk(v)
      }
    }
  }
}
walk(keptPaths)
if (!reachable.has('schemas/Error')) {
  console.error('Error schema not reachable; the error-code enum would be lost')
  process.exit(1)
}

const components = {}
for (const key of reachable) {
  const [section, name] = key.split('/')
  components[section] ??= {}
  components[section][name] = spec.components[section][name]
}
if (spec.components?.securitySchemes) components.securitySchemes = spec.components.securitySchemes

const out = {
  openapi: spec.openapi,
  info: spec.info,
  servers: spec.servers,
  paths: keptPaths,
  components,
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 2))
const schemaCount = Object.keys(components.schemas ?? {}).length
console.log(`kept ${KEEP_PATHS.length} paths, ${schemaCount} schemas`)
