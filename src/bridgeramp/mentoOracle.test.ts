import { publicClient } from 'src/viem'
import {
  COPM_USDM_RATE_FEED_ID,
  SORTED_ORACLES_ADDRESS_CELO,
  getCopmOracleStatus,
} from 'src/bridgeramp/mentoOracle'

jest.mock('src/viem', () => ({
  publicClient: {
    celo: {
      readContract: jest.fn(),
    },
  },
}))

const readContract = jest.mocked(publicClient.celo.readContract)

// Values read from Celo mainnet on 2026-10-09 22:16 Bogota: the feed had been
// silent since 15:56 and every COPm swap reverted with "no valid median".
const LAST_REPORT = 1791579364
const EXPIRY = BigInt(360)
const RATE = [BigInt('312960000000000000000'), BigInt('1000000000000000000000000')] as const

function mockOracle({ expired, medianTimestamp }: { expired: boolean; medianTimestamp: bigint }) {
  readContract.mockImplementation(async ({ functionName }: any) => {
    switch (functionName) {
      case 'medianTimestamp':
        return medianTimestamp
      case 'isOldestReportExpired':
        return [expired, '0x783F947126Adb7646c2A459B867f5B526D2E6603']
      case 'getTokenReportExpirySeconds':
        return EXPIRY
      case 'medianRate':
        return RATE
      default:
        throw new Error(`unexpected call ${functionName}`)
    }
  })
}

describe('getCopmOracleStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports a stale feed when the oldest report has expired', async () => {
    mockOracle({ expired: true, medianTimestamp: BigInt(LAST_REPORT) })

    const status = await getCopmOracleStatus(LAST_REPORT + 22_816)

    expect(status.fresh).toBe(false)
    expect(status.lastReportAt).toBe(LAST_REPORT)
    expect(status.ageSeconds).toBe(22_816)
    expect(status.expirySeconds).toBe(360)
    expect(status.copPerUsd).toBeCloseTo(3195.3, 0)
  })

  it('reports a fresh feed when the report is recent and not expired', async () => {
    mockOracle({ expired: false, medianTimestamp: BigInt(LAST_REPORT) })

    const status = await getCopmOracleStatus(LAST_REPORT + 120)

    expect(status.fresh).toBe(true)
    expect(status.ageSeconds).toBe(120)
  })

  it('treats a median older than the expiry as stale even if the oracle says not expired', async () => {
    mockOracle({ expired: false, medianTimestamp: BigInt(LAST_REPORT) })

    const status = await getCopmOracleStatus(LAST_REPORT + 361)

    expect(status.fresh).toBe(false)
  })

  it('handles a feed that never reported', async () => {
    readContract.mockImplementation(async ({ functionName }: any) => {
      switch (functionName) {
        case 'medianTimestamp':
          return BigInt(0)
        case 'isOldestReportExpired':
          return [true, '0x0000000000000000000000000000000000000000']
        case 'getTokenReportExpirySeconds':
          return EXPIRY
        case 'medianRate':
          return [BigInt(0), BigInt(0)]
        default:
          throw new Error(`unexpected call ${functionName}`)
      }
    })

    const status = await getCopmOracleStatus(1_000)

    expect(status.fresh).toBe(false)
    expect(status.lastReportAt).toBe(0)
    expect(status.ageSeconds).toBe(Number.POSITIVE_INFINITY)
    expect(status.copPerUsd).toBeNull()
  })

  it('queries SortedOracles for the COPm/USDm rate feed', async () => {
    mockOracle({ expired: false, medianTimestamp: BigInt(LAST_REPORT) })

    await getCopmOracleStatus(LAST_REPORT + 1)

    expect(readContract).toHaveBeenCalledTimes(4)
    for (const call of readContract.mock.calls) {
      expect(call[0]).toMatchObject({
        address: SORTED_ORACLES_ADDRESS_CELO,
        args: [COPM_USDM_RATE_FEED_ID],
      })
    }
  })
})
