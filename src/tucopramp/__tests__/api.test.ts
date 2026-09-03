import { FetchMock } from 'jest-fetch-mock'
import { Address } from 'viem'
import {
  cancelOrder,
  createOfframpOrder,
  createOnrampOrder,
  getBanks,
  getLimits,
  getMe,
  getOfframpQuote,
  getOnrampQuote,
  getOrder,
  getProofUrl,
  getReceivingAccount,
  listOrders,
  TucopRampAuth,
  updateCedula,
  uploadProof,
} from 'src/tucopramp/api'
import { TucopRampError } from 'src/tucopramp/types'
import { KeychainAccounts } from 'src/web3/KeychainAccounts'
import { TUCOPRAMP_API_BASE_URL } from 'src/web3/networkConfig'

const mockFetch = fetch as FetchMock

jest.mock('src/utils/Logger')

const TEST_WALLET = '0xabc0000000000000000000000000000000000000' as Address

function makeAuth(signature = '0xsig'): TucopRampAuth {
  const kc = {
    getAccounts: () => [TEST_WALLET],
    isUnlocked: () => true,
    unlock: async () => true,
    getViemAccount: () => ({
      address: TEST_WALLET,
      signMessage: async (_args: { message: string }) => signature,
    }),
  } as unknown as KeychainAccounts
  return { walletAddress: TEST_WALLET, keychainAccounts: kc }
}

const SIX_BANK_RESPONSE = {
  banks: [
    {
      code: 'bancolombia',
      display_name: 'Bancolombia',
      supported_account_types: ['savings', 'checking'],
    },
    {
      code: 'bogota',
      display_name: 'Banco Bogota',
      supported_account_types: ['savings', 'checking'],
    },
    { code: 'bbva', display_name: 'BBVA', supported_account_types: ['savings', 'checking'] },
    { code: 'daviplata', display_name: 'Daviplata', supported_account_types: ['savings'] },
    {
      code: 'davivienda',
      display_name: 'Davivienda',
      supported_account_types: ['savings', 'checking'],
    },
    { code: 'nequi', display_name: 'Nequi', supported_account_types: ['savings'] },
  ],
}

describe('tucopramp/api', () => {
  beforeEach(() => {
    mockFetch.resetMocks()
  })

  describe('getBanks', () => {
    it('returns the 6 bank rows from a 200 response', async () => {
      mockFetch.mockResponseOnce(JSON.stringify(SIX_BANK_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })

      const banks = await getBanks()

      expect(banks).toHaveLength(6)
      expect(banks.map((b) => b.code).sort()).toEqual([
        'bancolombia',
        'bbva',
        'bogota',
        'daviplata',
        'davivienda',
        'nequi',
      ])

      expect(mockFetch).toHaveBeenCalledWith(
        `${TUCOPRAMP_API_BASE_URL}/v1/p2p/banks`,
        expect.objectContaining({ method: 'GET' })
      )
      const init = mockFetch.mock.calls[0][1] as RequestInit
      const headers = new Headers(init?.headers)
      expect(headers.get('X-Wallet-Address')).toBeNull()
      expect(headers.get('X-Wallet-Signature')).toBeNull()
    })

    it('propagates TucopRampError when the proxy is disabled (503)', async () => {
      jest.useRealTimers()
      mockFetch.mockResponse(JSON.stringify({ code: 'proxy_disabled', status: 503 }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })

      let caught: TucopRampError | undefined
      try {
        await getBanks()
      } catch (e) {
        caught = e as TucopRampError
      }
      expect(caught).toBeInstanceOf(TucopRampError)
      expect(caught?.httpStatus).toBe(503)
      expect(caught?.code).toBe('proxy_disabled')
    }, 15_000)
  })

  describe('getReceivingAccount', () => {
    it('returns the Bre-B alias when 200', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({ kind: 'bre_b_key', bre_b_key: '@tucopfinance', display_name: 'TuCop' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      const res = await getReceivingAccount()
      expect(res.bre_b_key).toBe('@tucopfinance')
      expect(res.kind).toBe('bre_b_key')
    })

    it('does not attach wallet headers (public endpoint)', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({ kind: 'bre_b_key', bre_b_key: '@x', display_name: 'x' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      await getReceivingAccount()
      const headers = new Headers((mockFetch.mock.calls[0][1] as RequestInit)?.headers)
      expect(headers.get('X-Wallet-Signature')).toBeNull()
    })
  })

  describe('getLimits', () => {
    const LIMITS_SHAPE = {
      min_order_cop: 100000,
      max_order_cop: 500000,
      max_daily_cop: 1000000,
      max_monthly_cop: 3000000,
    }

    it('returns the 4-field limits object on 200 without wallet auth', async () => {
      mockFetch.mockResponseOnce(JSON.stringify(LIMITS_SHAPE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      const limits = await getLimits()
      expect(limits).toEqual(LIMITS_SHAPE)
      // public endpoint: no wallet signature attached
      const headers = new Headers((mockFetch.mock.calls[0][1] as RequestInit)?.headers)
      expect(headers.get('X-Wallet-Signature')).toBeNull()
      // URL uses the proxy base + upstream path unchanged
      expect(mockFetch.mock.calls[0][0]).toBe(`${TUCOPRAMP_API_BASE_URL}/v1/p2p/limits`)
    })

    it('propagates a TucopRampError on 4xx with envelope code intact', async () => {
      // 400 (not 503) so the transport does not retry: fetchWithTimeout
      // exponentially retries 5xx, which would time out this test.
      mockFetch.mockResponseOnce(
        JSON.stringify({ code: 'invalid_query', detail: 'bad param', status: 400 }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
      await expect(getLimits()).rejects.toMatchObject({
        name: 'TucopRampError',
        code: 'invalid_query',
        httpStatus: 400,
      })
    })
  })

  describe('getMe', () => {
    it('signs GET /v1/p2p/users/me and returns the profile on 200', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({ user_id: 'u1', full_name: 'Test', cedula_last_4: '1234' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      const res = await getMe(makeAuth('0xdead'))
      expect(res.user_id).toBe('u1')
      expect(mockFetch).toHaveBeenCalledWith(
        `${TUCOPRAMP_API_BASE_URL}/v1/p2p/users/me`,
        expect.objectContaining({ method: 'GET' })
      )
      const headers = new Headers((mockFetch.mock.calls[0][1] as RequestInit)?.headers)
      expect(headers.get('X-Wallet-Address')).toBe(TEST_WALLET)
      expect(headers.get('X-Wallet-Signature')).toBe('0xdead')
    })

    it('surfaces 404 wallet_not_linked as TucopRampError', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({
          code: 'wallet_not_linked',
          status: 404,
          detail: 'not linked yet',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
      let caught: TucopRampError | undefined
      try {
        await getMe(makeAuth())
      } catch (e) {
        caught = e as TucopRampError
      }
      expect(caught?.code).toBe('wallet_not_linked')
      expect(caught?.httpStatus).toBe(404)
    })
  })

  describe('updateCedula', () => {
    it('sends PATCH with body + wallet signature and returns the response', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({ userId: 'u1', updated_at: '2026-09-03T10:00:00Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      const res = await updateCedula(makeAuth('0xsig'), {
        new_cedula: '1234567',
        reason: 'wrong id typed on first order',
      })
      expect(res.userId).toBe('u1')

      expect(mockFetch).toHaveBeenCalledWith(
        `${TUCOPRAMP_API_BASE_URL}/v1/p2p/users/cedula`,
        expect.objectContaining({ method: 'PATCH' })
      )
      const init = mockFetch.mock.calls[0][1] as RequestInit
      const headers = new Headers(init?.headers)
      expect(headers.get('X-Wallet-Address')).toBe(TEST_WALLET)
      expect(headers.get('X-Wallet-Signature')).toBe('0xsig')
      // Body byte-per-byte pass-through: PATCH body serialized by client, sig
      // is over the body hash. Verify body reached the transport intact.
      expect(init.body).toBe(
        JSON.stringify({ new_cedula: '1234567', reason: 'wrong id typed on first order' })
      )
    })

    it('surfaces 409 cedula_locked_by_active_order intact', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({
          code: 'cedula_locked_by_active_order',
          status: 409,
          detail: 'active order exists',
          request_id: 'req_lock',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
      await expect(
        updateCedula(makeAuth(), { new_cedula: '9876543', reason: 'x' })
      ).rejects.toMatchObject({
        code: 'cedula_locked_by_active_order',
        httpStatus: 409,
        request_id: 'req_lock',
      })
    })
  })

  describe('getOfframpQuote', () => {
    it('posts the v1.1 body shape and returns the quote', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({
          quote_id: 'q1',
          gross_amount_cop: 200_000,
          gross_amount_copm: 200_000,
          fee_percent: 0.5,
          fee_amount_cop: 1000,
          fee_absorbed_by: 'user',
          net_amount_to_user_cop: 199_000,
          display_text: 'ok',
          remaining_daily_cop: 800_000,
          remaining_monthly_cop: 2_800_000,
          expires_at: '2026-09-01T22:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      const res = await getOfframpQuote(makeAuth(), {
        gross_amount_cop: 200_000,
        payout_method: 'bank_account',
        bank_code: 'bancolombia',
        bank_account_type: 'savings',
        cedula: '1234567890',
      })
      expect(res.quote_id).toBe('q1')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(`${TUCOPRAMP_API_BASE_URL}/v1/p2p/offramp/quote`)
      expect((init as RequestInit).method).toBe('POST')
      expect((init as RequestInit).body).toContain('"gross_amount_cop":200000')
      expect((init as RequestInit).body).toContain('"payout_method":"bank_account"')
    })

    it('rejects with amount_limit_exceeded (409)', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({ code: 'amount_limit_exceeded', status: 409, detail: 'over cap' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
      let caught: TucopRampError | undefined
      try {
        await getOfframpQuote(makeAuth(), {
          gross_amount_cop: 999_999_999,
          payout_method: 'bank_account',
          cedula: '1234567890',
        })
      } catch (e) {
        caught = e as TucopRampError
      }
      expect(caught?.code).toBe('amount_limit_exceeded')
    })
  })

  describe('createOfframpOrder', () => {
    it('sends Idempotency-Key and returns multisig on 200', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({
          order_id: 'ord1',
          status: 'AWAITING_DEPOSIT',
          multisig_address: '0x6399618ab4eA489Ae434F4718b7E572757D95702',
          chain_id: 42220,
          gross_amount_copm: 200_000,
          expires_at: '2026-09-01T23:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      const res = await createOfframpOrder(
        makeAuth(),
        {
          gross_amount_cop: 200_000,
          cedula: '1234567890',
          full_name: 'Tester',
          email: 'tester@example.com',
          payout_method: 'bank_account',
          bank_code: 'bancolombia',
          bank_account_type: 'savings',
          bank_account_number: '111',
          consent_accepted: true,
          quote_id: 'q1',
        },
        'idem-abc'
      )
      expect(res.order_id).toBe('ord1')
      expect(res.status).toBe('AWAITING_DEPOSIT')

      const headers = new Headers((mockFetch.mock.calls[0][1] as RequestInit)?.headers)
      expect(headers.get('Idempotency-Key')).toBe('idem-abc')
    })

    it('surfaces idempotency_conflict (409) on same key with different body', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ code: 'idempotency_conflict', status: 409 }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
      await expect(
        createOfframpOrder(
          makeAuth(),
          {
            gross_amount_cop: 100_000,
            cedula: '1234567890',
            full_name: 'x',
            email: 'x@x.x',
            payout_method: 'bank_account',
            consent_accepted: true,
          },
          'reused-key'
        )
      ).rejects.toMatchObject({ code: 'idempotency_conflict', httpStatus: 409 })
    })
  })

  describe('getOnrampQuote', () => {
    it('posts {gross_amount_cop, cedula} and returns quote', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({
          quote_id: 'q2',
          gross_amount_cop: 100_000,
          gross_amount_copm: 100_000,
          fee_percent: 0,
          fee_amount_cop: 0,
          fee_absorbed_by: 'tucop',
          net_amount_to_user_cop: 100_000,
          display_text: 'ok',
          remaining_daily_cop: 900_000,
          remaining_monthly_cop: 2_900_000,
          expires_at: '2026-09-01T22:30:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      const res = await getOnrampQuote(makeAuth(), {
        gross_amount_cop: 100_000,
        cedula: '1234567890',
      })
      expect(res.quote_id).toBe('q2')
      const body = (mockFetch.mock.calls[0][1] as RequestInit).body as string
      expect(body).toBe('{"gross_amount_cop":100000,"cedula":"1234567890"}')
    })
  })

  describe('createOnrampOrder', () => {
    it('rejects when consent is missing', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({ code: 'consent_required', status: 400, detail: 'consent missing' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
      await expect(
        createOnrampOrder(
          makeAuth(),
          {
            gross_amount_cop: 100_000,
            cedula: '1234567890',
            full_name: 'x',
            email: 'x@x.x',
            // Deliberately invalid payload to exercise the server error path.
            // The openapi types `consent_accepted` as a plain boolean, so no
            // ts-expect-error is needed; the server enforces `true`.
            consent_accepted: false,
          },
          'idem-xyz'
        )
      ).rejects.toMatchObject({ code: 'consent_required', httpStatus: 400 })
    })
  })

  describe('listOrders', () => {
    it('passes cursor + limit as query string, signs base path only', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ orders: [], next_cursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      await listOrders(makeAuth(), { cursor: 'abc', limit: 5 })
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toBe(`${TUCOPRAMP_API_BASE_URL}/v1/p2p/orders?cursor=abc&limit=5`)
    })

    it('sends no query string when no params provided', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ orders: [], next_cursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      await listOrders(makeAuth())
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toBe(`${TUCOPRAMP_API_BASE_URL}/v1/p2p/orders`)
    })
  })

  describe('getOrder', () => {
    it('encodes the orderId into the path', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({
          id: 'ord-1',
          order_type: 'offramp',
          status: 'AWAITING_DEPOSIT',
          gross_amount_cop: 100_000,
          gross_amount_copm: 100_000,
          created_at: '2026-09-01T00:00:00Z',
          expires_at: '2026-09-01T01:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      await getOrder(makeAuth(), 'ord-1')
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toBe(`${TUCOPRAMP_API_BASE_URL}/v1/p2p/orders/ord-1`)
    })

    it('surfaces order_not_found (404)', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ code: 'order_not_found', status: 404 }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
      await expect(getOrder(makeAuth(), 'missing')).rejects.toMatchObject({
        code: 'order_not_found',
        httpStatus: 404,
      })
    })
  })

  describe('cancelOrder', () => {
    it('POSTs to /orders/{id}/cancel with Idempotency-Key', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({ id: 'ord-1', status: 'CANCELLED', cancelled_at: '2026-09-01T00:05:00Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      const res = await cancelOrder(makeAuth(), 'ord-1', 'idem-cancel-1')
      expect(res.status).toBe('CANCELLED')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(`${TUCOPRAMP_API_BASE_URL}/v1/p2p/orders/ord-1/cancel`)
      expect((init as RequestInit).method).toBe('POST')
      const headers = new Headers((init as RequestInit)?.headers)
      expect(headers.get('Idempotency-Key')).toBe('idem-cancel-1')
    })

    it('surfaces order_not_cancelable (409) after deposit landed', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ code: 'order_not_cancelable', status: 409 }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
      await expect(cancelOrder(makeAuth(), 'ord-1', 'idem-x')).rejects.toMatchObject({
        code: 'order_not_cancelable',
        httpStatus: 409,
      })
    })
  })

  describe('getProofUrl', () => {
    it('adds kind as a query param and returns the signed URL', async () => {
      mockFetch.mockResponseOnce(
        JSON.stringify({ url: 'https://x/proof.pdf', expires_at: '2026-09-01T23:00:00Z' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
      const res = await getProofUrl(makeAuth(), 'ord-1', 'operator_outgoing')
      expect(res.url).toBe('https://x/proof.pdf')
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toBe(
        `${TUCOPRAMP_API_BASE_URL}/v1/p2p/orders/ord-1/proof-url?kind=operator_outgoing`
      )
    })
  })

  describe('uploadProof', () => {
    it('sends multipart with wallet headers but no Content-Type override', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ proof_id: 'p1', status: 'AWAITING_REVIEW' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await uploadProof(makeAuth('0xsig'), 'ord-1', {
        uri: 'file:///proof.png',
        name: 'proof.png',
        type: 'image/png',
      })
      expect(res.proof_id).toBe('p1')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe(`${TUCOPRAMP_API_BASE_URL}/v1/p2p/orders/ord-1/proof`)
      const headers = new Headers((init as RequestInit)?.headers)
      expect(headers.get('X-Wallet-Address')).toBe(TEST_WALLET)
      expect(headers.get('X-Wallet-Signature')).toBe('0xsig')
      // We deliberately did NOT set Content-Type; runtime injects multipart/form-data
      // with the boundary. The header should not appear on our explicit headers map.
      expect(headers.get('Content-Type')).toBeNull()
    })

    // Regression guard: server verifies signature against sha256(empty buffer)
    // = e3b0c442...b855, because wallet-auth middleware runs before multer
    // parses the multipart body (see Ramp p2p.uploads.ts:12-17 +
    // wallet-auth.ts:72-74). If the wallet ever regresses to signing the
    // literal empty string, every proof upload returns 401 signature_invalid.
    it('signs multipart with sha256("") body-hash, matching Ramp server side', async () => {
      const capturedMessages: string[] = []
      const authCapturing: TucopRampAuth = {
        walletAddress: TEST_WALLET,
        keychainAccounts: {
          getAccounts: () => [TEST_WALLET],
          isUnlocked: () => true,
          unlock: async () => true,
          getViemAccount: () => ({
            address: TEST_WALLET,
            signMessage: async ({ message }: { message: string }) => {
              capturedMessages.push(message)
              return '0xdeadbeef'
            },
          }),
        } as unknown as KeychainAccounts,
      }
      mockFetch.mockResponseOnce(JSON.stringify({ proof_id: 'p2', status: 'AWAITING_REVIEW' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
      await uploadProof(
        authCapturing,
        'ord-2',
        { uri: 'file:///r.png', name: 'r.png', type: 'image/png' },
        { now: () => 1_700_000_000_000 }
      )
      expect(capturedMessages).toHaveLength(1)
      // Full canonical string, no truncation. If this fails, the wallet is
      // out of sync with the server's signature verification.
      expect(capturedMessages[0]).toBe(
        'TuCOPRamp:POST:/v1/p2p/orders/ord-2/proof:0xabc0000000000000000000000000000000000000:1700000000:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      )
    })

    it('surfaces proof_too_large (400)', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ code: 'proof_too_large', status: 400 }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
      await expect(
        uploadProof(makeAuth(), 'ord-1', {
          uri: 'file:///big.pdf',
          name: 'big.pdf',
          type: 'application/pdf',
        })
      ).rejects.toMatchObject({ code: 'proof_too_large', httpStatus: 400 })
    })
  })
})
