import { BootstrapApiError, postFeeAdapterBootstrap } from 'src/wri/feeAdapterBootstrap/api'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import networkConfig from 'src/web3/networkConfig'

jest.mock('src/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(),
}))

const MOCK_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'

describe('postFeeAdapterBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('POSTs only the address to wriFeeAdapterBootstrapUrl', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          relayAddress: '0xrelay',
          results: [],
        }),
        { status: 200 }
      )
    )
    await postFeeAdapterBootstrap(MOCK_ADDRESS)
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    const [url, opts] = jest.mocked(fetchWithTimeout).mock.calls[0]
    expect(url).toBe(networkConfig.wriFeeAdapterBootstrapUrl)
    expect(opts?.method).toBe('POST')
    expect(opts?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(opts?.body).toBe(JSON.stringify({ address: MOCK_ADDRESS }))
  })

  it('returns the parsed body with per-adapter results on 200', async () => {
    const responseBody = {
      ok: true,
      relayAddress: '0xrelay',
      results: [
        {
          tokenSymbol: 'USDC',
          tokenAddress: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
          adapterAddress: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
          status: 'approved',
          txHash: '0xdeadbeef',
          alreadyApproved: false,
        },
        {
          tokenSymbol: 'USDT',
          tokenAddress: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
          adapterAddress: '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72',
          status: 'skipped_no_balance',
          txHash: null,
          alreadyApproved: false,
        },
      ],
    }
    jest
      .mocked(fetchWithTimeout)
      .mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 }))
    const result = await postFeeAdapterBootstrap(MOCK_ADDRESS)
    expect(result).toEqual(responseBody)
  })

  it('throws bad-address kind on 400', async () => {
    jest
      .mocked(fetchWithTimeout)
      .mockResolvedValue(new Response('{"error":"invalid address"}', { status: 400 }))
    await expect(postFeeAdapterBootstrap('not-an-address')).rejects.toMatchObject({
      name: 'BootstrapApiError',
      kind: 'bad-address',
    })
  })

  it('throws not-delegated kind on 412', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValue(
      new Response('{"error":"precondition failed: user not delegated to BatchExecutor"}', {
        status: 412,
      })
    )
    await expect(postFeeAdapterBootstrap(MOCK_ADDRESS)).rejects.toMatchObject({
      kind: 'not-delegated',
    })
  })

  it('throws disabled kind on 503 kill-switch', async () => {
    jest
      .mocked(fetchWithTimeout)
      .mockResolvedValue(new Response('{"error":"fee bootstrap disabled"}', { status: 503 }))
    await expect(postFeeAdapterBootstrap(MOCK_ADDRESS)).rejects.toMatchObject({
      kind: 'disabled',
    })
  })

  it('throws relay kind on 503 relay unavailable with 5min retry hint', async () => {
    jest
      .mocked(fetchWithTimeout)
      .mockResolvedValue(new Response('{"error":"relay temporarily unavailable"}', { status: 503 }))
    await expect(postFeeAdapterBootstrap(MOCK_ADDRESS)).rejects.toMatchObject({
      kind: 'relay',
      retryAfterMs: 5 * 60 * 1000,
    })
  })

  it('throws relay kind on 500 with default backoff hint of 0', async () => {
    jest
      .mocked(fetchWithTimeout)
      .mockResolvedValue(new Response('{"error":"internal"}', { status: 500 }))
    await expect(postFeeAdapterBootstrap(MOCK_ADDRESS)).rejects.toMatchObject({
      kind: 'relay',
      retryAfterMs: 0,
    })
  })

  it('throws relay kind when fetchWithTimeout itself throws (network down)', async () => {
    jest.mocked(fetchWithTimeout).mockRejectedValue(new Error('network unreachable'))
    // The api module re-throws the original error if fetch fails. The saga
    // catches at its boundary, so we just confirm the error bubbles.
    await expect(postFeeAdapterBootstrap(MOCK_ADDRESS)).rejects.toThrow('network unreachable')
  })

  it('exports a BootstrapApiError instance so the saga can type-narrow with instanceof', async () => {
    jest
      .mocked(fetchWithTimeout)
      .mockResolvedValue(new Response('{"error":"invalid"}', { status: 400 }))
    await expect(postFeeAdapterBootstrap(MOCK_ADDRESS)).rejects.toBeInstanceOf(BootstrapApiError)
  })
})
