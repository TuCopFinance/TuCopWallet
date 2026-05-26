import { showErrorMessage, __resetActiveSheet } from 'src/components/ErrorMessage/showErrorMessage'

// Mock classifyError to avoid real networkConfig/DeviceInfo dependencies
jest.mock('src/utils/errors', () => ({
  classifyError: (error: unknown) => ({
    publicMessageKey: 'errors.public.generic',
    publicMessageFallback: 'Algo no salio como esperabamos',
    severity: 'error',
    technical: {
      appVersion: '1.118.3',
      buildNumber: '253',
      platform: 'android',
      osVersion: '14',
      language: 'es-419',
      network: 'celo-mainnet',
      chainId: 42220,
      timestamp: '2026-05-24T00:00:00Z',
      errorName: 'Error',
      errorMessage: String(error),
    },
  }),
}))

describe('showErrorMessage', () => {
  beforeEach(() => __resetActiveSheet())

  it('does not throw for variant=sheet', () => {
    expect(() =>
      showErrorMessage({
        error: new Error('boom'),
        context: { screen: 'Test' },
        variant: 'sheet',
      })
    ).not.toThrow()
  })

  it('does not throw for variant=toast', () => {
    expect(() =>
      showErrorMessage({
        error: new Error('boom'),
        variant: 'toast',
      })
    ).not.toThrow()
  })

  it('does not throw for variant=alert', () => {
    expect(() =>
      showErrorMessage({
        error: new Error('boom'),
        variant: 'alert',
      })
    ).not.toThrow()
  })
})
