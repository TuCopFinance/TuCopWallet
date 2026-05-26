import { render } from '@testing-library/react-native'
import React from 'react'
import ErrorMessage from 'src/components/ErrorMessage/ErrorMessage'

jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }))
jest.mock('react-native-share', () => ({ open: jest.fn().mockResolvedValue({}) }))

// Mock the full errors module so tests don't need networkConfig or DeviceInfo
jest.mock('src/utils/errors', () => ({
  classifyError: (error: unknown) => ({
    publicMessageKey: 'errors.public.insufficient_gas',
    publicMessageFallback: 'Saldo insuficiente para la comision de red',
    severity: 'warning',
    technical: {
      appVersion: '1.118.3',
      buildNumber: '253',
      platform: 'android',
      osVersion: '14',
      language: 'es-419',
      network: 'celo-mainnet',
      chainId: 42220,
      timestamp: '2026-05-24T00:00:00Z',
      errorName: 'NotEnoughBalance',
      errorMessage: String(error),
    },
  }),
}))

// i18n mock returns the key, so assertions use the i18n key
describe('ErrorMessage', () => {
  it('renders banner variant with the public message key', () => {
    const { getByText } = render(
      <ErrorMessage
        error={new Error('not-enough-balance-for-gas')}
        context={{ screen: 'SendConfirmation' }}
        variant="banner"
      />
    )
    expect(getByText(/errors\.public\.insufficient_gas/)).toBeTruthy()
  })

  it('renders fullscreen variant', () => {
    const { getByText } = render(
      <ErrorMessage
        error={new Error('execution reverted')}
        context={{ screen: 'TransactionSuccessScreen' }}
        variant="fullscreen"
      />
    )
    expect(getByText(/errors\.public\.insufficient_gas/)).toBeTruthy()
  })

  it('renders inline variant', () => {
    const { getByText } = render(
      <ErrorMessage error="something totally unexpected" variant="inline" />
    )
    expect(getByText(/errors\.public\.insufficient_gas/)).toBeTruthy()
  })
})
