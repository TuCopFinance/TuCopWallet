import {
  createFirstPartyDestination,
  createWithdrawQuote,
  createWithdrawal,
  getParty,
  partyCanTransact,
} from 'src/bridgeramp/api'
import { openWalletPartySession, platformFetch } from 'src/bridgeramp/platformClient'
import { TucopRampError } from 'src/tucopramp/types'

jest.mock('src/utils/Logger')
jest.mock('src/fiatconnect/clients', () => ({
  getSiweSigningFunction: jest.fn(() => async (message: string) => `0xsig:${message}`),
}))

const BASE = 'https://proxy.test/api/tucopramp'
const USER = '0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856'

function response(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('platformFetch', () => {
  it('sends the party session and idempotency key and parses JSON', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { ok: true }))
    const result = await platformFetch<{ ok: boolean }>({
      method: 'POST',
      path: '/v1/destinations',
      body: { ownership: 'first_party' },
      partySession: 'tps_abc',
      idempotencyKey: 'idem-1',
      baseUrl: BASE,
      fetchImpl,
    })
    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/v1/destinations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TuCOPRamp-Party-Session': 'tps_abc',
        'Idempotency-Key': 'idem-1',
      },
      body: JSON.stringify({ ownership: 'first_party' }),
    })
  })

  it('omits optional headers and returns undefined on an empty body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(204))
    const result = await platformFetch<void>({
      method: 'DELETE',
      path: '/v1/destinations/dst_1',
      baseUrl: BASE,
      fetchImpl,
    })
    expect(result).toBeUndefined()
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({})
  })

  it('throws a TucopRampError with the server code on non-2xx', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        response(
          409,
          { code: 'party_not_verified', detail: 'finish KYC', request_id: 'req_1' },
          { 'Retry-After': '30' }
        )
      )
    await expect(
      platformFetch({ method: 'GET', path: '/v1/parties/me', baseUrl: BASE, fetchImpl })
    ).rejects.toMatchObject<Partial<TucopRampError>>({
      httpStatus: 409,
      code: 'party_not_verified',
      message: 'finish KYC',
      request_id: 'req_1',
      retryAfterSeconds: 30,
    })
  })

  it('refuses paths that are not upstream /v1 paths', async () => {
    await expect(
      platformFetch({ method: 'GET', path: '/api/tucopramp/v1/parties/me', fetchImpl: jest.fn() })
    ).rejects.toThrow('upstream /v1/ path')
  })
})

describe('openWalletPartySession', () => {
  it('fetches a nonce, signs the message as given and exchanges it', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(response(200, { nonce: 'n-1', message: 'TuCOP wants you to sign' }))
      .mockResolvedValueOnce(
        response(200, {
          token: 'tps_1',
          method: 'wallet',
          expires_at: '2026-10-10T19:00:00Z',
          party_id: null,
        })
      )
    const session = await openWalletPartySession(USER, {} as any, { baseUrl: BASE, fetchImpl })
    expect(session.token).toBe('tps_1')
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `${BASE}/v1/sessions/wallet/nonce`,
      expect.objectContaining({ body: JSON.stringify({ address: USER }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      `${BASE}/v1/sessions/wallet`,
      expect.objectContaining({
        body: JSON.stringify({
          address: USER,
          nonce: 'n-1',
          signature: '0xsig:TuCOP wants you to sign',
        }),
      })
    )
    // Session endpoints never carry an Idempotency-Key.
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBeUndefined()
  })
})

describe('api wrappers', () => {
  const party = {
    id: 'pty_1',
    type: 'individual' as const,
    status: {
      kyc: 'approved',
      tos: 'accepted',
      endorsements: [{ name: 'cop', status: 'approved' }],
    },
    restricted: false,
    created_at: '',
    updated_at: '',
  }

  it('getParty hits /v1/parties/me with the session', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, party))
    await expect(getParty('tps_1', { baseUrl: BASE, fetchImpl })).resolves.toEqual(party)
    expect(fetchImpl.mock.calls[0][0]).toBe(`${BASE}/v1/parties/me`)
    expect(fetchImpl.mock.calls[0][1].headers['X-TuCOPRamp-Party-Session']).toBe('tps_1')
  })

  it('partyCanTransact needs KYC, TOS and the cop endorsement', () => {
    expect(partyCanTransact(party)).toBe(true)
    expect(partyCanTransact({ ...party, restricted: true })).toBe(false)
    expect(partyCanTransact({ ...party, status: { ...party.status, kyc: 'pending' } })).toBe(false)
    expect(
      partyCanTransact({
        ...party,
        status: { ...party.status, endorsements: [{ name: 'cop', status: 'pending' }] },
      })
    ).toBe(false)
  })

  it('createFirstPartyDestination never sends an owner_name', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(202, { id: 'dst_1', status: 'pending' }))
    await createFirstPartyDestination('tps_1', '3001234567', 'idem-2', { baseUrl: BASE, fetchImpl })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      ownership: 'first_party',
      bre_b_key: '3001234567',
    })
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe('idem-2')
  })

  it('withdraw quote and withdrawal carry the product and the return address', async () => {
    const fetchImpl = jest.fn().mockImplementation(async () => response(200, {}))
    await createWithdrawQuote(
      'tps_1',
      { destination_id: 'dst_1', source_amount: { amount: '247.338318', asset: 'USDC' } },
      'idem-3',
      { baseUrl: BASE, fetchImpl }
    )
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      product: 'withdraw',
      destination_id: 'dst_1',
      source_amount: { amount: '247.338318', asset: 'USDC' },
    })
    await createWithdrawal('tps_1', { quote_id: 'qte_1', return_address: USER }, 'idem-4', {
      baseUrl: BASE,
      fetchImpl,
    })
    expect(fetchImpl.mock.calls[1][0]).toBe(`${BASE}/v1/withdrawals`)
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      quote_id: 'qte_1',
      return_address: USER,
    })
  })
})
