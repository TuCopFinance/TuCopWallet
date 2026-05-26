import { render } from '@testing-library/react-native'
import React from 'react'
import ErrorSheet from 'src/components/ErrorMessage/ErrorSheet'
import { ClassifiedError } from 'src/components/ErrorMessage/types'

jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }))
jest.mock('react-native-share', () => ({ open: jest.fn().mockResolvedValue({}) }))

const classified: ClassifiedError = {
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
    errorMessage: 'not-enough-balance-for-gas',
  },
}

// i18n mock returns the key, so t('errors.public.insufficient_gas', fallback) => 'errors.public.insufficient_gas'
describe('ErrorSheet', () => {
  it('renders the public message key', () => {
    const { getByText } = render(<ErrorSheet classified={classified} />)
    expect(getByText(/errors\.public\.insufficient_gas/)).toBeTruthy()
  })

  it('renders the tech details accordion', () => {
    const { getByText } = render(<ErrorSheet classified={classified} />)
    expect(getByText(/errors\.sheet\.techDetailsToggle/)).toBeTruthy()
  })
})
