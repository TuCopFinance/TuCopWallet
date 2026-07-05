#!/usr/bin/env node
/* eslint-env node */
// WRI feed shape diff: compare /getWalletTransactions (Valora legacy) against
// /api/transactions/feed (TuCop backend) for a given wallet, so we know what
// the flip of WRI_TX_FEED_TUCOP_V1 will change in the user's view before it
// hits prod.
//
// Usage:
//   node scripts/wri-feed-shape-diff.mjs <address> [--currency=USD|COP] [--include-deferred]
//
// The script:
//   1. Hits both endpoints with the same query params.
//   2. Normalizes both responses (lowercase all hex, sort tx by hash, fill
//      missing localAmount as null on the TuCop side).
//   3. Filters out backend-deferred types (NFT_*, CROSS_CHAIN_SWAP_TRANSACTION,
//      DEPOSIT / WITHDRAW / CLAIM_REWARD) from BOTH sides by default so the
//      comparison is apples-to-apples. Pass --include-deferred to keep them.
//   4. Prints: address counts, missing txs per side, and up to 10 concrete
//      field-level deltas for txs present on both sides.

import { argv, exit, stdout } from 'node:process'

const VALORA_URL = 'https://api.mainnet.valora.xyz/getWalletTransactions'
const TUCOP_URL = 'https://tucop-backend-production.up.railway.app/api/transactions/feed'

const INCLUDE_TYPES = [
  'RECEIVED',
  'SENT',
  'NFT_RECEIVED',
  'NFT_SENT',
  'SWAP_TRANSACTION',
  'CROSS_CHAIN_SWAP_TRANSACTION',
  'APPROVAL',
  'DEPOSIT',
  'WITHDRAW',
  'CLAIM_REWARD',
].join(',')

const DEFERRED_TYPES = new Set([
  'NFT_RECEIVED',
  'NFT_SENT',
  'CROSS_CHAIN_SWAP_TRANSACTION',
  'DEPOSIT',
  'WITHDRAW',
  'CLAIM_REWARD',
])

const NETWORK_IDS = 'celo-mainnet'

function parseArgs(rawArgs) {
  const positional = []
  const flags = { currency: 'USD', includeDeferred: false, maxDeltas: 10 }
  for (const arg of rawArgs) {
    if (arg.startsWith('--currency=')) {
      flags.currency = arg.slice('--currency='.length).toUpperCase()
    } else if (arg === '--include-deferred') {
      flags.includeDeferred = true
    } else if (arg.startsWith('--max-deltas=')) {
      flags.maxDeltas = Number(arg.slice('--max-deltas='.length))
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag ${arg}`)
    } else {
      positional.push(arg)
    }
  }
  if (positional.length !== 1) {
    throw new Error('exactly one positional argument required: <wallet address>')
  }
  const [address] = positional
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`address does not look like an EVM address: ${address}`)
  }
  return { address, ...flags }
}

async function fetchFeed(url, { address, currency }) {
  const params = new URLSearchParams({
    address,
    networkIds: NETWORK_IDS,
    includeTypes: INCLUDE_TYPES,
    localCurrencyCode: currency,
  })
  const full = `${url}?${params.toString()}`
  const res = await fetch(full, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`${url} returned ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

// Recursively lowercase every string that looks like a hex identifier.
// Regex is intentionally broad: anything starting with 0x followed by hex.
// This normalizes address casing (Valora emits EIP-55 checksummed, TuCop
// emits lowercase) so a byte-exact diff does not fill with false positives.
function normalizeHexCase(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return /^0x[a-fA-F0-9]+$/.test(value) ? value.toLowerCase() : value
  }
  if (Array.isArray(value)) return value.map(normalizeHexCase)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = normalizeHexCase(v)
    return out
  }
  return value
}

// TuCop omits localAmount when the token has no peg match; Valora emits it as
// null. To keep the diff focused on real deltas, fill missing localAmount with
// explicit null on any TokenAmount-shaped object we can identify.
function alignLocalAmountPresence(value) {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(alignLocalAmountPresence)
  if (typeof value === 'object') {
    const looksLikeTokenAmount =
      Object.prototype.hasOwnProperty.call(value, 'value') &&
      Object.prototype.hasOwnProperty.call(value, 'tokenId')
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = alignLocalAmountPresence(v)
    if (looksLikeTokenAmount && !Object.prototype.hasOwnProperty.call(out, 'localAmount')) {
      out.localAmount = null
    }
    return out
  }
  return value
}

function filterDeferredTypes(transactions) {
  return transactions.filter((tx) => !DEFERRED_TYPES.has(tx.type))
}

// Naive recursive diff. Returns array of { path, valora, tucop } tuples.
// Not smart about ordering inside arrays: we assume both sides sort tx by hash
// before diffing, so element-wise comparison is meaningful.
function deepDiff(a, b, path = '') {
  const diffs = []
  if (a === b) return diffs
  if (a === null || b === null || typeof a !== typeof b) {
    diffs.push({ path: path || '<root>', valora: a, tucop: b })
    return diffs
  }
  if (typeof a !== 'object') {
    diffs.push({ path: path || '<root>', valora: a, tucop: b })
    return diffs
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    diffs.push({ path: path || '<root>', valora: a, tucop: b })
    return diffs
  }
  if (Array.isArray(a)) {
    const maxLen = Math.max(a.length, b.length)
    for (let i = 0; i < maxLen; i += 1) {
      diffs.push(...deepDiff(a[i], b[i], `${path}[${i}]`))
    }
    return diffs
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    diffs.push(...deepDiff(a[k], b[k], path ? `${path}.${k}` : k))
  }
  return diffs
}

function preview(value) {
  if (value === undefined) return '<absent>'
  if (value === null) return 'null'
  const s = typeof value === 'string' ? value : JSON.stringify(value)
  return s.length > 80 ? `${s.slice(0, 77)}...` : s
}

async function main() {
  const args = parseArgs(argv.slice(2))
  stdout.write(`WRI feed shape-diff for ${args.address} (currency=${args.currency})\n`)
  stdout.write(`  Valora: ${VALORA_URL}\n`)
  stdout.write(`  TuCop:  ${TUCOP_URL}\n\n`)

  const [valoraRaw, tucopRaw] = await Promise.all([
    fetchFeed(VALORA_URL, args),
    fetchFeed(TUCOP_URL, args),
  ])

  const normalize = (raw) => {
    const withHex = normalizeHexCase(raw)
    const withLocalAmount = alignLocalAmountPresence(withHex)
    const txs = withLocalAmount.transactions ?? []
    return args.includeDeferred ? txs : filterDeferredTypes(txs)
  }

  const valoraTxs = normalize(valoraRaw)
  const tucopTxs = normalize(tucopRaw)

  const valoraByHash = new Map(valoraTxs.map((tx) => [tx.transactionHash, tx]))
  const tucopByHash = new Map(tucopTxs.map((tx) => [tx.transactionHash, tx]))

  const onlyValora = [...valoraByHash.keys()].filter((h) => !tucopByHash.has(h))
  const onlyTucop = [...tucopByHash.keys()].filter((h) => !valoraByHash.has(h))
  const common = [...valoraByHash.keys()].filter((h) => tucopByHash.has(h))

  stdout.write('== Counts ==\n')
  stdout.write(`  Valora transactions: ${valoraTxs.length}\n`)
  stdout.write(`  TuCop  transactions: ${tucopTxs.length}\n`)
  stdout.write(`  Common (by hash):    ${common.length}\n`)
  stdout.write(`  Only in Valora:      ${onlyValora.length}\n`)
  stdout.write(`  Only in TuCop:       ${onlyTucop.length}\n\n`)

  if (onlyValora.length > 0) {
    stdout.write(`== Missing in TuCop (first 5) ==\n`)
    for (const h of onlyValora.slice(0, 5)) {
      const tx = valoraByHash.get(h)
      stdout.write(`  ${h}  type=${tx.type}  block=${tx.block}\n`)
    }
    stdout.write('\n')
  }

  if (onlyTucop.length > 0) {
    stdout.write(`== Extra in TuCop (first 5) ==\n`)
    for (const h of onlyTucop.slice(0, 5)) {
      const tx = tucopByHash.get(h)
      stdout.write(`  ${h}  type=${tx.type}  block=${tx.block}\n`)
    }
    stdout.write('\n')
  }

  let allDiffs = []
  for (const h of common) {
    const diffs = deepDiff(valoraByHash.get(h), tucopByHash.get(h), h)
    allDiffs = allDiffs.concat(diffs)
  }

  if (allDiffs.length === 0) {
    stdout.write('== Field-level diff ==\n  No deltas on common transactions after normalization.\n')
    return
  }

  stdout.write(`== Field-level diff (${allDiffs.length} total, showing first ${args.maxDeltas}) ==\n`)
  for (const d of allDiffs.slice(0, args.maxDeltas)) {
    stdout.write(`  ${d.path}\n`)
    stdout.write(`    valora: ${preview(d.valora)}\n`)
    stdout.write(`    tucop:  ${preview(d.tucop)}\n`)
  }
}

main().catch((err) => {
  stdout.write(`error: ${err.message}\n`)
  exit(1)
})
