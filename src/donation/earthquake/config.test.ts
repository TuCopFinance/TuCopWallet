import {
  getEarthquakeDonationConfig,
  isEarthquakeDonationEnabled,
} from 'src/donation/earthquake/config'
import { getDynamicConfigParams, getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'

jest.mock('src/statsig')

const mockedGetDynamicConfigParams = getDynamicConfigParams as jest.Mock
const mockedGetFeatureGate = getFeatureGate as jest.Mock

const validRaw = {
  destinationAddress: '0x8c5F869e1a5A39F378612d69c32E84d0114ab7C5',
  matchPercentage: 20,
  presetAmounts: [10000, 50000, 100000, 250000, 500000],
  refiInstagramUrl: 'https://www.instagram.com/reficolombia/',
  refiTwitterUrl: 'https://x.com/ReFiColombia',
  safeExplorerUrl:
    'https://app.safe.global/home?safe=celo:0x8c5F869e1a5A39F378612d69c32E84d0114ab7C5',
}

describe('isEarthquakeDonationEnabled', () => {
  it('proxies through to the SHOW_EARTHQUAKE_DONATION_2026_08 gate', () => {
    mockedGetFeatureGate.mockReturnValueOnce(true)
    expect(isEarthquakeDonationEnabled()).toBe(true)
    expect(mockedGetFeatureGate).toHaveBeenCalledWith(
      StatsigFeatureGates.SHOW_EARTHQUAKE_DONATION_2026_08
    )
  })

  it('returns false when the gate is off', () => {
    mockedGetFeatureGate.mockReturnValueOnce(false)
    expect(isEarthquakeDonationEnabled()).toBe(false)
  })
})

describe('getEarthquakeDonationConfig', () => {
  beforeEach(() => {
    mockedGetDynamicConfigParams.mockReset()
  })

  it('returns the valid raw config unchanged', () => {
    mockedGetDynamicConfigParams.mockReturnValueOnce(validRaw)
    const cfg = getEarthquakeDonationConfig()
    expect(cfg.destinationAddress.toLowerCase()).toBe('0x8c5f869e1a5a39f378612d69c32e84d0114ab7c5')
    expect(cfg.matchPercentage).toBe(20)
    expect(cfg.presetAmounts).toEqual([10000, 50000, 100000, 250000, 500000])
    expect(cfg.refiInstagramUrl).toContain('instagram.com')
    expect(cfg.refiTwitterUrl).toContain('x.com')
    expect(cfg.safeExplorerUrl).toContain('safe.global')
  })

  it('falls back to defaults when destinationAddress is not a valid EVM address', () => {
    mockedGetDynamicConfigParams.mockReturnValueOnce({
      ...validRaw,
      destinationAddress: 'not-an-address',
    })
    const cfg = getEarthquakeDonationConfig()
    expect(cfg.destinationAddress.toLowerCase()).toBe('0x8c5f869e1a5a39f378612d69c32e84d0114ab7c5')
  })

  it('clamps matchPercentage out-of-range to the default', () => {
    mockedGetDynamicConfigParams.mockReturnValueOnce({
      ...validRaw,
      matchPercentage: 500, // absurd, backend must not surface this
    })
    const cfg = getEarthquakeDonationConfig()
    expect(cfg.matchPercentage).toBe(20)
  })

  it('coerces string preset amounts to numbers and drops non-numeric entries', () => {
    mockedGetDynamicConfigParams.mockReturnValueOnce({
      ...validRaw,
      presetAmounts: ['10000', '50000', 'bogus', -100, 100000],
    })
    const cfg = getEarthquakeDonationConfig()
    expect(cfg.presetAmounts).toEqual([10000, 50000, 100000])
  })

  it('reverts to default presets when the array is empty after sanitization', () => {
    mockedGetDynamicConfigParams.mockReturnValueOnce({
      ...validRaw,
      presetAmounts: ['x', 'y', -1],
    })
    const cfg = getEarthquakeDonationConfig()
    expect(cfg.presetAmounts).toEqual([10000, 50000, 100000, 250000, 500000])
  })
})
