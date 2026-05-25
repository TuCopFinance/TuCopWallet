import { getLastClaimTimestamp } from 'src/subsidies/subsidyEventHistory'
import { Address } from 'viem'

const SUBSIDY_CLAIMED_TOPIC = '0x00767507495bd1c757db9a339df732dd8507033a8806ece6261167c15afa3af5'
const WALLET: Address = '0x1726cf86da996bc4b2f393e713f6f8ef83f2e4f6'
const PADDED_WALLET = '0x0000000000000000000000001726cf86da996bc4b2f393e713f6f8ef83f2e4f6'

const mockFetchResponse = (status: number, body: unknown) => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  })
}

describe('getLastClaimTimestamp', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  it('returns the timestamp of the most recent event matching the beneficiary', async () => {
    mockFetchResponse(200, {
      events: [
        {
          topics: [SUBSIDY_CLAIMED_TOPIC, '0x' + '00'.repeat(32), PADDED_WALLET],
          timeStamp: '0x60000000', // 1610612736
          blockNumber: '0x100',
        },
        {
          topics: [SUBSIDY_CLAIMED_TOPIC, '0x' + '00'.repeat(32), PADDED_WALLET],
          timeStamp: '0x70000000', // 1879048192 (later)
          blockNumber: '0x200',
        },
      ],
    })

    const result = await getLastClaimTimestamp(WALLET)
    expect(result).toBe(0x70000000)
  })

  it('returns undefined when no events match the beneficiary', async () => {
    mockFetchResponse(200, {
      events: [
        {
          topics: [
            SUBSIDY_CLAIMED_TOPIC,
            '0x' + '00'.repeat(32),
            '0x000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          ],
          timeStamp: '0x60000000',
          blockNumber: '0x100',
        },
      ],
    })

    const result = await getLastClaimTimestamp(WALLET)
    expect(result).toBeUndefined()
  })

  it('returns undefined when events array is empty', async () => {
    mockFetchResponse(200, { events: [] })

    const result = await getLastClaimTimestamp(WALLET)
    expect(result).toBeUndefined()
  })

  it('returns undefined when backend returns HTTP 502', async () => {
    mockFetchResponse(502, { error: 'etherscan unreachable' })

    const result = await getLastClaimTimestamp(WALLET)
    expect(result).toBeUndefined()
  })

  it('returns undefined when fetch throws (network error)', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'))

    const result = await getLastClaimTimestamp(WALLET)
    expect(result).toBeUndefined()
  })

  it('matches beneficiary regardless of topic position (defensive against ABI mismatch)', async () => {
    mockFetchResponse(200, {
      events: [
        {
          // beneficiary appears in topic[1] instead of topic[2]
          topics: [SUBSIDY_CLAIMED_TOPIC, PADDED_WALLET],
          timeStamp: '0x67abcdef',
          blockNumber: '0x123',
        },
      ],
    })

    const result = await getLastClaimTimestamp(WALLET)
    expect(result).toBe(0x67abcdef)
  })

  it('calls backend with the correct query params', async () => {
    mockFetchResponse(200, { events: [] })
    await getLastClaimTimestamp(WALLET)

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(fetchCall).toContain('https://tucop-backend-production.up.railway.app/events')
    expect(fetchCall).toContain('address=0x947c6db1569edc9fd37b017b791ca0f008ab4946')
    expect(fetchCall).toContain('topic0=' + SUBSIDY_CLAIMED_TOPIC)
  })
})
