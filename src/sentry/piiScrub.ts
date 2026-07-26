// PII scrubbing for Sentry payloads. The wallet handles wallet addresses,
// transaction hashes and monetary amounts that must never leave the device
// in identifiable form. This module walks every event / breadcrumb Sentry is
// about to send, replaces those strings with opaque placeholders in-place,
// and returns the sanitised structure to the Sentry SDK.

// EVM address: 0x + 40 hex chars, word-bounded so we do not match longer
// hex blobs (e.g. tx hashes contain a 40-char substring but are 64 chars).
const ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g
// Transaction hash / storage slot / block hash: 0x + 64 hex chars.
const HASH_RE = /\b0x[a-fA-F0-9]{64}\b/g

// Wei-scale amounts (10^18 or larger) surfaced as digit runs. Anything with
// 15 or more consecutive digits is very likely a monetary amount or a rate
// value we do not want to correlate to a specific user. Coarser signals
// (e.g. "large deposit") can still be attached explicitly via context tags.
const LARGE_NUMBER_RE = /\b\d{15,}\b/g

export function scrubString(input: string): string {
  return input
    .replace(ADDRESS_RE, '<addr>')
    .replace(HASH_RE, '<hash>')
    .replace(LARGE_NUMBER_RE, '<amount>')
}

// Recursive in-place walk. Keeps arrays as arrays and preserves keys so
// Sentry's schema validation still passes.
export function scrubDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return scrubString(value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = scrubDeep((value as Record<string, unknown>)[key])
    }
    return out as unknown as T
  }
  return value
}

// Public entry: what Sentry's beforeSend / beforeBreadcrumb receive. Never
// throws; if scrubbing somehow explodes we drop the payload rather than
// letting a partially-sanitised body leave the device.
export function scrubSensitiveStrings<T>(payload: T | null): T | null {
  if (payload === null || payload === undefined) return payload
  try {
    return scrubDeep(payload)
  } catch {
    return null
  }
}

// FNV-1a 64-bit adapted to JS bigints. Deterministic, non-cryptographic,
// dependency-free. Sentry only needs a stable id to group sessions of the
// same account; we do not need collision resistance against a determined
// adversary because the id never leaves this device paired with the address.
export function opaqueAccountId(address: string): string {
  const normalized = address.trim().toLowerCase()
  let hash = BigInt('0xcbf29ce484222325')
  const prime = BigInt('0x100000001b3')
  const mask = (BigInt(1) << BigInt(64)) - BigInt(1)
  for (let i = 0; i < normalized.length; i++) {
    hash ^= BigInt(normalized.charCodeAt(i))
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}
