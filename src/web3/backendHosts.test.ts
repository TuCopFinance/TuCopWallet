import {
  DEFAULT_BACKEND_FALLBACK,
  DEFAULT_BACKEND_PRIMARY,
  _resetBackendHostsForTests,
  getBackendHosts,
  sanitizeBackendBaseUrl,
  toBackendFallbackUrl,
} from 'src/web3/backendHosts'

jest.mock('src/statsig', () => ({
  getDynamicConfigParams: jest.fn(() => ({})),
}))

const { getDynamicConfigParams } = jest.requireMock('src/statsig')

describe('sanitizeBackendBaseUrl', () => {
  it('accepts allowlisted https origins and strips the trailing slash', () => {
    expect(sanitizeBackendBaseUrl('https://backend.tucop.xyz')).toBe('https://backend.tucop.xyz')
    expect(sanitizeBackendBaseUrl('https://backend.tucop.xyz/')).toBe('https://backend.tucop.xyz')
    expect(sanitizeBackendBaseUrl('https://tucop.xyz')).toBe('https://tucop.xyz')
    expect(sanitizeBackendBaseUrl('https://foo.up.railway.app')).toBe('https://foo.up.railway.app')
  })

  it('rejects everything outside the compiled allowlist', () => {
    // The allowlist is the security boundary: a Statsig compromise must not
    // be able to point the app anywhere else.
    expect(sanitizeBackendBaseUrl('https://evil.example.com')).toBeNull()
    expect(sanitizeBackendBaseUrl('https://tucop.xyz.evil.com')).toBeNull()
    expect(sanitizeBackendBaseUrl('https://eviltucop.xyz')).toBeNull()
    expect(sanitizeBackendBaseUrl('https://railway.app')).toBeNull()
  })

  it('rejects non-https, ports, credentials, paths and garbage', () => {
    expect(sanitizeBackendBaseUrl('http://backend.tucop.xyz')).toBeNull()
    expect(sanitizeBackendBaseUrl('https://backend.tucop.xyz:8443')).toBeNull()
    expect(sanitizeBackendBaseUrl('https://user:pw@backend.tucop.xyz')).toBeNull()
    expect(sanitizeBackendBaseUrl('https://backend.tucop.xyz/api')).toBeNull()
    expect(sanitizeBackendBaseUrl('https://backend.tucop.xyz?x=1')).toBeNull()
    expect(sanitizeBackendBaseUrl('not a url')).toBeNull()
    expect(sanitizeBackendBaseUrl(42)).toBeNull()
    expect(sanitizeBackendBaseUrl(undefined)).toBeNull()
  })
})

describe('getBackendHosts', () => {
  beforeEach(() => {
    _resetBackendHostsForTests()
    getDynamicConfigParams.mockReset()
  })

  it('returns the compiled defaults when remote config is empty', () => {
    getDynamicConfigParams.mockReturnValue({})
    expect(getBackendHosts()).toEqual({
      primary: DEFAULT_BACKEND_PRIMARY,
      fallback: DEFAULT_BACKEND_FALLBACK,
    })
  })

  it('uses valid remote values', () => {
    getDynamicConfigParams.mockReturnValue({
      primary: 'https://backend2.tucop.xyz',
      fallback: 'https://other.up.railway.app/',
    })
    expect(getBackendHosts()).toEqual({
      primary: 'https://backend2.tucop.xyz',
      fallback: 'https://other.up.railway.app',
    })
  })

  it('ignores remote values outside the allowlist and keeps defaults', () => {
    getDynamicConfigParams.mockReturnValue({
      primary: 'https://attacker.example.com',
      fallback: 'http://backend.tucop.xyz',
    })
    expect(getBackendHosts()).toEqual({
      primary: DEFAULT_BACKEND_PRIMARY,
      fallback: DEFAULT_BACKEND_FALLBACK,
    })
  })

  it('returns defaults when statsig throws', () => {
    getDynamicConfigParams.mockImplementation(() => {
      throw new Error('not initialized')
    })
    expect(getBackendHosts()).toEqual({
      primary: DEFAULT_BACKEND_PRIMARY,
      fallback: DEFAULT_BACKEND_FALLBACK,
    })
  })
})

describe('toBackendFallbackUrl', () => {
  beforeEach(() => {
    _resetBackendHostsForTests()
    getDynamicConfigParams.mockReturnValue({})
  })

  it('re-roots a primary URL at the fallback host, keeping path and query', () => {
    expect(toBackendFallbackUrl(`${DEFAULT_BACKEND_PRIMARY}/api/tucopramp/p2p/banks?x=1`)).toBe(
      `${DEFAULT_BACKEND_FALLBACK}/api/tucopramp/p2p/banks?x=1`
    )
  })

  it('returns null for any other origin', () => {
    expect(toBackendFallbackUrl('https://forno.celo.org/')).toBeNull()
    expect(toBackendFallbackUrl('http://localhost:8080/api/swap/quote')).toBeNull()
    expect(toBackendFallbackUrl(`${DEFAULT_BACKEND_FALLBACK}/api/swap/quote`)).toBeNull()
    // Prefix trickery: primary host as a prefix of a longer hostname.
    expect(toBackendFallbackUrl('https://backend.tucop.xyz.evil.com/api')).toBeNull()
  })
})
