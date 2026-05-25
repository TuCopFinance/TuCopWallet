import { render } from '@testing-library/react-native'
import * as React from 'react'
import ErrorBoundary from 'src/app/ErrorBoundary'

jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }))
jest.mock('react-native-share', () => ({ open: jest.fn().mockResolvedValue({}) }))
jest.mock('src/utils/AppRestart', () => ({ restartApp: jest.fn() }))

jest.mock('src/utils/errors', () => ({
  classifyError: () => ({
    publicMessageKey: 'errors.public.generic',
    publicMessageFallback: 'Algo no salio como esperabamos',
    severity: 'error',
    technical: {
      appVersion: '1.0.0',
      buildNumber: '1',
      platform: 'android',
      osVersion: '14',
      language: 'es-419',
      network: 'celo-mainnet',
      chainId: 42220,
      timestamp: '2026-05-25T00:00:00Z',
      errorName: 'Error',
      errorMessage: 'Snap!',
    },
  }),
}))

const ErrorComponent = () => {
  throw new Error('Snap!')
}

describe('ErrorBoundary', () => {
  it('catches the errors and renders ErrorMessage fullscreen', () => {
    const wrapper = render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>
    )

    expect(wrapper.getAllByText('oops')).toHaveLength(1)
  })
})
