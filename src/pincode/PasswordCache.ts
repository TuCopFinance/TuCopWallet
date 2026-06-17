const CACHE_TIMEOUT = 300000 // 5 minutes

interface SecretCache {
  [account: string]: {
    timestamp: number | null
    secret: string | null
  }
}
let pinCache: SecretCache = {}
let pepperCache: SecretCache = {}
let passwordHashCache: SecretCache = {}
let passwordCache: SecretCache = {}

// Refcounted per-account lock that prevents inactivity-based eviction while a
// long-running transactional flow (e.g. sendPreparedTransactions) is in flight.
// Each pinTransactional must be paired with an endTransactional in a finally block.
const transactionalLocks = new Map<string, number>()

export function pinTransactional(account: string): void {
  transactionalLocks.set(account, (transactionalLocks.get(account) ?? 0) + 1)
}

export function endTransactional(account: string): void {
  const current = transactionalLocks.get(account) ?? 0
  if (current <= 1) {
    transactionalLocks.delete(account)
  } else {
    transactionalLocks.set(account, current - 1)
  }
}

function getCachedValue(cache: SecretCache, account: string) {
  // TODO(Rossy) use a monotonic clock here?
  const value = cache[account]
  if (value && value.secret && value.timestamp && Date.now() - value.timestamp < CACHE_TIMEOUT) {
    return value.secret
  } else if (value && value.secret && transactionalLocks.has(account)) {
    // Pinned by an in-flight transactional saga: hold the value past the
    // inactivity TTL so multi-step flows don't re-prompt for PIN mid-flow.
    return value.secret
  } else {
    // Clear values in cache when they're expired
    cache[account] = { timestamp: null, secret: null }
    return null
  }
}

function setCachedValue(cache: SecretCache, account: string, secret: string | null) {
  if (!cache[account]) {
    cache[account] = { timestamp: null, secret: null }
  }
  cache[account].timestamp = Date.now()
  cache[account].secret = secret
}

export function getCachedPin(account: string) {
  return getCachedValue(pinCache, account)
}

export function setCachedPin(account: string, pin: string | null) {
  setCachedValue(pinCache, account, pin)
}

export function getCachedPepper(account: string) {
  return getCachedValue(pepperCache, account)
}

export function setCachedPepper(account: string, pepper: string | null) {
  setCachedValue(pepperCache, account, pepper)
}

export function getCachedPasswordHash(account: string) {
  return getCachedValue(passwordHashCache, account)
}

export function setCachedPasswordHash(account: string, passwordHash: string) {
  setCachedValue(passwordHashCache, account, passwordHash)
}

export function getCachedPassword(account: string) {
  return getCachedValue(passwordCache, account)
}

export function setCachedPassword(account: string, password: string | null) {
  setCachedValue(passwordCache, account, password)
}

export function clearPasswordCaches() {
  pinCache = {}
  pepperCache = {}
  passwordHashCache = {}
  passwordCache = {}
  transactionalLocks.clear()
}
