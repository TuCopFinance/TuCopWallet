import Logger from 'src/utils/Logger'

const TAG = 'web3/backendHosts'

// The wallet's backend origin, remote-configurable (2026-11 architecture:
// the VPS at backend.tucop.xyz is the primary for the next store release,
// Railway stays alive as the fallback and keeps serving the release that is
// already in stores). The hosts live in the `backend_hosts` Statsig dynamic
// config so the NEXT infrastructure move is a flag flip instead of an app
// release plus a store-adoption wait.
export const DEFAULT_BACKEND_PRIMARY = 'https://backend.tucop.xyz'
export const DEFAULT_BACKEND_FALLBACK = 'https://tucop-backend-production.up.railway.app'

// Compiled-in host allowlist. This is the security boundary of the whole
// scheme and must NOT be relaxed for convenience: without it, whoever
// controls the Statsig console can redirect every byte of wallet backend
// traffic to an arbitrary origin. A remote value outside this list is
// ignored and the compiled default stays. (Backend team seconded keeping
// this strict, 2026-11-10.)
function isAllowlistedHost(host: string): boolean {
  return host === 'tucop.xyz' || host.endsWith('.tucop.xyz') || host.endsWith('.up.railway.app')
}

// A base URL from remote config is usable only when it is plain https on an
// allowlisted host with nothing else: no path, no query, no hash, no port,
// no credentials. Trailing slash is tolerated and stripped.
export function sanitizeBackendBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password || parsed.port) return null
  if ((parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
    return null
  }
  if (!isAllowlistedHost(parsed.hostname)) return null
  return `https://${parsed.hostname}`
}

interface BackendHosts {
  primary: string
  fallback: string
}

// Lazy require: fetchWithTimeout sits below almost every module in the app,
// so a top-level import of src/statsig from here risks a require cycle
// through whatever statsig pulls in. Resolved at call time instead; any
// failure (cycle mid-boot, tests without the module) falls back to the
// compiled defaults.
function readRemoteHosts(): { primary?: unknown; fallback?: unknown } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const statsig = require('src/statsig')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { StatsigDynamicConfigs } = require('src/statsig/types')
    return statsig.getDynamicConfigParams({
      configName: StatsigDynamicConfigs.BACKEND_HOSTS,
      defaultValues: {
        primary: DEFAULT_BACKEND_PRIMARY,
        fallback: DEFAULT_BACKEND_FALLBACK,
      },
    })
  } catch {
    return {}
  }
}

let warnedInvalid = false

// The effective (primary, fallback) pair: remote values when valid, compiled
// defaults otherwise. Read per call on purpose; the Statsig client caches
// locally so this is cheap, and it means a config flip needs no app restart
// beyond the SDK's own refresh cadence.
export function getBackendHosts(): BackendHosts {
  const remote = readRemoteHosts()
  const primary = sanitizeBackendBaseUrl(remote.primary)
  const fallback = sanitizeBackendBaseUrl(remote.fallback)
  if (!warnedInvalid && ((remote.primary && !primary) || (remote.fallback && !fallback))) {
    warnedInvalid = true
    Logger.warn(
      TAG,
      'backend_hosts remote value rejected by the compiled allowlist; using defaults'
    )
  }
  return {
    primary: primary ?? DEFAULT_BACKEND_PRIMARY,
    fallback: fallback ?? DEFAULT_BACKEND_FALLBACK,
  }
}

// If `url` points at the effective primary backend, return the same URL
// re-rooted at the fallback host. Null for every other origin (third-party
// APIs, RPC nodes, localhost dev overrides) so the failover logic in
// fetchWithTimeout can never touch traffic that is not ours.
export function toBackendFallbackUrl(url: string): string | null {
  const { primary, fallback } = getBackendHosts()
  if (!url.startsWith(`${primary}/`) && url !== primary) return null
  if (primary === fallback) return null
  return `${fallback}${url.slice(primary.length)}`
}

// For tests.
export function _resetBackendHostsForTests(): void {
  warnedInvalid = false
}
