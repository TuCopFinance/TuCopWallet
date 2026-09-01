import crypto from 'crypto'
import { Address } from 'viem'
import { FetchImpl, signTucopRampRequest, tucopRampFetch } from 'src/tucopramp/client'
import { TucopRampError } from 'src/tucopramp/types'
import { KeychainAccounts } from 'src/web3/KeychainAccounts'

const TEST_BASE_URL = 'https://proxy.example/api/tucopramp'
const TEST_WALLET = '0xabc0000000000000000000000000000000000000' as Address

type FetchMock = jest.MockedFunction<FetchImpl>

// Test-double keychainAccounts: signMessage is exercised, all the other surface
// area (unlock, getPassword, etc) is short-circuited so the test stays focused
// on the canonical string + header wiring.
function makeFakeKeychainAccounts(signature: string): KeychainAccounts {
  return {
    getAccounts: () => [TEST_WALLET],
    isUnlocked: () => true,
    unlock: async () => true,
    getViemAccount: () => ({
      address: TEST_WALLET,
      signMessage: async (_args: { message: string }) => signature,
    }),
  } as unknown as KeychainAccounts
}

describe('signTucopRampRequest', () => {
  it('produces canonical GET with empty body hash', async () => {
    const kc = makeFakeKeychainAccounts('0xdead')
    const res = await signTucopRampRequest({
      method: 'GET',
      upstreamPath: '/v1/p2p/banks',
      walletAddress: TEST_WALLET,
      keychainAccounts: kc,
      now: () => 1_755_566_400_000,
    })
    expect(res.canonical).toBe(
      'TuCOPRamp:GET:/v1/p2p/banks:0xabc0000000000000000000000000000000000000:1755566400:'
    )
    // 5 separators, 6 parts (prefix, method, path, address, timestamp, body hash);
    // last part is empty for GET, so string ends with a single trailing colon.
    expect(res.canonical.split(':')).toHaveLength(6)
    expect(res.canonical.split(':')[5]).toBe('')
    expect(res.timestamp).toBe('1755566400')
    expect(res.signature).toBe('0xdead')
  })

  it('produces canonical POST with sha256(body) as lowercase hex', async () => {
    const kc = makeFakeKeychainAccounts('0xsig')
    const body = JSON.stringify({ gross_amount_cop: 250_000, cedula: '1234567890' })
    const expectedHash = crypto.createHash('sha256').update(body).digest('hex')
    const res = await signTucopRampRequest({
      method: 'POST',
      upstreamPath: '/v1/p2p/offramp/quote',
      body,
      walletAddress: TEST_WALLET,
      keychainAccounts: kc,
      now: () => 1_755_566_400_000,
    })
    expect(res.canonical).toBe(
      `TuCOPRamp:POST:/v1/p2p/offramp/quote:${TEST_WALLET}:1755566400:${expectedHash}`
    )
    expect(res.canonical.endsWith(`:${expectedHash}`)).toBe(true)
  })

  it('throws when upstreamPath is the proxy-prefixed one (Pattern B invariant guard)', async () => {
    const kc = makeFakeKeychainAccounts('0xsig')
    await expect(
      signTucopRampRequest({
        method: 'GET',
        upstreamPath: '/api/tucopramp/v1/p2p/banks',
        walletAddress: TEST_WALLET,
        keychainAccounts: kc,
      })
    ).rejects.toThrow(/must start with "\/v1\/p2p\/"/)
  })

  it('lowercases the wallet address in the canonical string', async () => {
    const kc = makeFakeKeychainAccounts('0xsig')
    const upper = '0xABC0000000000000000000000000000000000000' as Address
    const res = await signTucopRampRequest({
      method: 'GET',
      upstreamPath: '/v1/p2p/users/me',
      walletAddress: upper,
      keychainAccounts: kc,
      now: () => 1_755_566_400_000,
    })
    expect(res.canonical).toContain(':0xabc0000000000000000000000000000000000000:')
    expect(res.canonical).not.toContain('0xABC')
  })
})

describe('tucopRampFetch', () => {
  it('GET with skipWalletAuth omits wallet headers and parses JSON', async () => {
    const fetchMock: FetchMock = jest.fn(
      async (_url, _init) =>
        new Response(JSON.stringify({ banks: [{ code: 'BAN' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    const res = await tucopRampFetch<{ banks: unknown[] }>({
      method: 'GET',
      upstreamPath: '/v1/p2p/banks',
      skipWalletAuth: true,
      baseUrl: TEST_BASE_URL,
      fetchImpl: fetchMock,
    })
    expect(res.banks).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${TEST_BASE_URL}/v1/p2p/banks`)
    const headers = new Headers(init?.headers)
    expect(headers.get('X-Wallet-Address')).toBeNull()
    expect(headers.get('X-Wallet-Signature')).toBeNull()
    expect(headers.get('X-Wallet-Timestamp')).toBeNull()
  })

  it('POST with body signs and attaches all 3 wallet headers', async () => {
    const kc = makeFakeKeychainAccounts('0xdeadbeef')
    let receivedBody: string | undefined
    const fetchMock: FetchMock = jest.fn(async (_url, init) => {
      receivedBody = init?.body as string
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const body = { gross_amount_cop: 250_000, cedula: '1234567890' }
    await tucopRampFetch({
      method: 'POST',
      upstreamPath: '/v1/p2p/offramp/quote',
      body,
      walletAddress: TEST_WALLET,
      keychainAccounts: kc,
      baseUrl: TEST_BASE_URL,
      fetchImpl: fetchMock,
      now: () => 1_755_566_400_000,
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${TEST_BASE_URL}/v1/p2p/offramp/quote`)
    expect(receivedBody).toBe(JSON.stringify(body))
    const headers = new Headers(init?.headers)
    expect(headers.get('X-Wallet-Address')).toBe(TEST_WALLET)
    expect(headers.get('X-Wallet-Timestamp')).toBe('1755566400')
    expect(headers.get('X-Wallet-Signature')).toBe('0xdeadbeef')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('adds Idempotency-Key when provided', async () => {
    const kc = makeFakeKeychainAccounts('0xsig')
    const fetchMock: FetchMock = jest.fn(
      async (_url, _init) =>
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    )
    await tucopRampFetch({
      method: 'POST',
      upstreamPath: '/v1/p2p/offramp/orders',
      body: { ok: true },
      walletAddress: TEST_WALLET,
      keychainAccounts: kc,
      idempotencyKey: 'idem-abc',
      baseUrl: TEST_BASE_URL,
      fetchImpl: fetchMock,
    })
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('Idempotency-Key')).toBe('idem-abc')
  })

  it('throws TucopRampError with httpStatus + code + request_id on 4xx', async () => {
    const fetchMock: FetchMock = jest.fn(
      async (_url, _init) =>
        new Response(
          JSON.stringify({
            type: 'https://tucopramp.xyz/errors/invalid_api_key',
            title: 'Invalid API key',
            status: 401,
            code: 'invalid_api_key',
            detail: 'The provided key is invalid.',
            request_id: 'req_abc',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
    )
    let caught: TucopRampError | undefined
    try {
      await tucopRampFetch({
        method: 'GET',
        upstreamPath: '/v1/p2p/banks',
        skipWalletAuth: true,
        baseUrl: TEST_BASE_URL,
        fetchImpl: fetchMock,
      })
    } catch (e) {
      caught = e as TucopRampError
    }
    expect(caught).toBeInstanceOf(TucopRampError)
    expect(caught?.httpStatus).toBe(401)
    expect(caught?.code).toBe('invalid_api_key')
    expect(caught?.request_id).toBe('req_abc')
    expect(caught?.message).toBe('The provided key is invalid.')
    expect(caught?.envelope.type).toBe('https://tucopramp.xyz/errors/invalid_api_key')
  })

  it('parses Retry-After on 429', async () => {
    const fetchMock: FetchMock = jest.fn(
      async (_url, _init) =>
        new Response(JSON.stringify({ code: 'rate_limited_wallet' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
        })
    )
    let caught: TucopRampError | undefined
    try {
      await tucopRampFetch({
        method: 'GET',
        upstreamPath: '/v1/p2p/banks',
        skipWalletAuth: true,
        baseUrl: TEST_BASE_URL,
        fetchImpl: fetchMock,
      })
    } catch (e) {
      caught = e as TucopRampError
    }
    expect(caught?.httpStatus).toBe(429)
    expect(caught?.retryAfterSeconds).toBe(30)
  })

  it('wraps non-JSON error bodies in a synthetic envelope', async () => {
    const fetchMock: FetchMock = jest.fn(
      async (_url, _init) =>
        new Response('gateway boom', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        })
    )
    let caught: TucopRampError | undefined
    try {
      await tucopRampFetch({
        method: 'GET',
        upstreamPath: '/v1/p2p/banks',
        skipWalletAuth: true,
        baseUrl: TEST_BASE_URL,
        fetchImpl: fetchMock,
      })
    } catch (e) {
      caught = e as TucopRampError
    }
    expect(caught?.httpStatus).toBe(502)
    expect(caught?.code).toBe('http_502')
  })

  it('throws when a wallet-scoped call omits walletAddress or keychainAccounts', async () => {
    const fetchMock: FetchMock = jest.fn()
    await expect(
      tucopRampFetch({
        method: 'GET',
        upstreamPath: '/v1/p2p/users/me',
        baseUrl: TEST_BASE_URL,
        fetchImpl: fetchMock,
      })
    ).rejects.toThrow(/walletAddress and keychainAccounts required/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when upstreamPath does not start with /v1/p2p/', async () => {
    await expect(
      tucopRampFetch({
        method: 'GET',
        upstreamPath: '/api/tucopramp/v1/p2p/banks',
        skipWalletAuth: true,
        baseUrl: TEST_BASE_URL,
        fetchImpl: jest.fn(),
      })
    ).rejects.toThrow(/must start with "\/v1\/p2p\/"/)
  })
})
