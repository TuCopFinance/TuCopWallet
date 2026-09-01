import { FetchMock } from 'jest-fetch-mock'
import { getBanks } from 'src/tucopramp/api'
import { TucopRampError } from 'src/tucopramp/types'
import { TUCOPRAMP_API_BASE_URL } from 'src/web3/networkConfig'

const mockFetch = fetch as FetchMock

jest.mock('src/utils/Logger')

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

describe('getBanks', () => {
  beforeEach(() => {
    mockFetch.resetMocks()
  })

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
    const bancolombia = banks.find((b) => b.code === 'bancolombia')
    expect(bancolombia?.display_name).toBe('Bancolombia')
    expect(bancolombia?.supported_account_types).toEqual(['savings', 'checking'])

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
    // fetchWithTimeout retries 5xx up to MAX_ATTEMPTS with real backoff, so we
    // need real timers and a mockResponse (not mockResponseOnce) that answers
    // every attempt of the retry loop.
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
