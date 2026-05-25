import { Platform } from 'react-native'
import { buildErrorContext } from 'src/utils/errors/context'

jest.mock('react-native-device-info', () => ({
  getVersion: jest.fn(() => '1.118.3'),
  getBuildNumber: jest.fn(() => '253'),
  getSystemVersion: jest.fn(() => '14'),
}))

jest.mock('src/web3/networkConfig', () => ({
  __esModule: true,
  default: {
    defaultNetworkId: 'celo-mainnet',
  },
  networkIdToChainId: { 'celo-mainnet': 42220 },
}))

describe('buildErrorContext', () => {
  beforeEach(() => {
    Platform.OS = 'android'
  })

  it('truncates wallet address to 0x1234...5678 form', () => {
    const ctx = buildErrorContext({
      error: new Error('boom'),
      partial: {
        walletAddress: '0x0123456789abcdef0123456789abcdef01234567',
      },
    })
    expect(ctx.walletAddress).toBe('0x012345...234567')
  })

  it('omits walletAddress when not provided', () => {
    const ctx = buildErrorContext({ error: new Error('boom') })
    expect(ctx.walletAddress).toBeUndefined()
  })

  it('captures error name, message, and stack', () => {
    const err = new Error('something failed')
    err.name = 'CustomError'
    const ctx = buildErrorContext({ error: err })
    expect(ctx.errorName).toBe('CustomError')
    expect(ctx.errorMessage).toBe('something failed')
    expect(ctx.errorStack).toContain('CustomError')
  })

  it('handles non-Error throwables', () => {
    const ctx = buildErrorContext({ error: 'just a string' })
    expect(ctx.errorName).toBe('UnknownError')
    expect(ctx.errorMessage).toBe('just a string')
  })

  it('injects appVersion, buildNumber, platform, osVersion, network, chainId, timestamp', () => {
    const ctx = buildErrorContext({ error: new Error('boom') })
    expect(ctx.appVersion).toBe('1.118.3')
    expect(ctx.buildNumber).toBe('253')
    expect(ctx.platform).toBe('android')
    expect(ctx.osVersion).toBe('14')
    expect(ctx.network).toBe('celo-mainnet')
    expect(ctx.chainId).toBe(42220)
    expect(ctx.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('passes through caller-provided screen, action, tokenSymbol', () => {
    const ctx = buildErrorContext({
      error: new Error('boom'),
      partial: { screen: 'SendConfirmation', action: 'prepareTransaction', tokenSymbol: 'USDm' },
    })
    expect(ctx.screen).toBe('SendConfirmation')
    expect(ctx.action).toBe('prepareTransaction')
    expect(ctx.tokenSymbol).toBe('USDm')
  })
})
