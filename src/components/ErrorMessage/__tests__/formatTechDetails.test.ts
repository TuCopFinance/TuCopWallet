import { formatTechDetails } from 'src/components/ErrorMessage/formatTechDetails'
import { ErrorContext } from 'src/components/ErrorMessage/types'

const baseCtx: ErrorContext = {
  appVersion: '1.118.3',
  buildNumber: '253',
  platform: 'android',
  osVersion: '14',
  language: 'es-419',
  network: 'celo-mainnet',
  chainId: 42220,
  walletAddress: '0x012345...234567',
  timestamp: '2026-05-24T12:34:56.789Z',
  screen: 'SendConfirmation',
  action: 'prepareTransaction',
  tokenSymbol: 'USDm',
  errorName: 'NotEnoughBalance',
  errorMessage: 'not-enough-balance-for-gas',
}

describe('formatTechDetails', () => {
  it('formats as plain-text key: value lines', () => {
    const out = formatTechDetails(baseCtx)
    expect(out).toContain('errorName: NotEnoughBalance')
    expect(out).toContain('errorMessage: not-enough-balance-for-gas')
    expect(out).toContain('screen: SendConfirmation')
    expect(out).toContain('appVersion: 1.118.3 (253)')
    expect(out).toContain('platform: android 14')
    expect(out).toContain('network: celo-mainnet (chainId 42220)')
    expect(out).toContain('wallet: 0x012345...234567')
    expect(out).toContain('token: USDm')
  })

  it('omits optional fields when missing', () => {
    const out = formatTechDetails({
      ...baseCtx,
      walletAddress: undefined,
      tokenSymbol: undefined,
      screen: undefined,
      action: undefined,
    })
    expect(out).not.toContain('wallet:')
    expect(out).not.toContain('token:')
    expect(out).not.toContain('screen:')
    expect(out).not.toContain('action:')
  })

  it('includes stack on a separate trailing block', () => {
    const out = formatTechDetails({
      ...baseCtx,
      errorStack: 'Error: boom\n  at foo (bar.js:1:2)',
    })
    expect(out).toMatch(/stack:\n\s*Error: boom/)
  })
})
