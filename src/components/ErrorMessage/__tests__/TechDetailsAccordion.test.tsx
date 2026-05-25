import { fireEvent, render } from '@testing-library/react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import Share from 'react-native-share'
import React from 'react'
import TechDetailsAccordion from 'src/components/ErrorMessage/TechDetailsAccordion'
import { ErrorContext } from 'src/components/ErrorMessage/types'

jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }))
jest.mock('react-native-share', () => ({ open: jest.fn().mockResolvedValue({}) }))

const ctx: ErrorContext = {
  appVersion: '1.118.3',
  buildNumber: '253',
  platform: 'android',
  osVersion: '14',
  language: 'es-419',
  network: 'celo-mainnet',
  chainId: 42220,
  timestamp: '2026-05-24T00:00:00Z',
  errorName: 'Test',
  errorMessage: 'boom',
}

// i18n mock returns the key, so t('errors.sheet.techDetailsToggle') => 'errors.sheet.techDetailsToggle'
describe('TechDetailsAccordion', () => {
  it('is collapsed by default', () => {
    const { queryByText, getByText } = render(<TechDetailsAccordion context={ctx} />)
    expect(getByText(/errors\.sheet\.techDetailsToggle/)).toBeTruthy()
    expect(queryByText(/errorName: Test/)).toBeNull()
  })

  it('expands when the toggle is tapped', () => {
    const { getByText, queryByText } = render(<TechDetailsAccordion context={ctx} />)
    fireEvent.press(getByText(/errors\.sheet\.techDetailsToggle/))
    expect(queryByText(/errorName: Test/)).toBeTruthy()
  })

  it('copies the formatted text to clipboard when Copy is tapped', () => {
    const { getByText } = render(<TechDetailsAccordion context={ctx} />)
    fireEvent.press(getByText(/errors\.sheet\.techDetailsToggle/))
    fireEvent.press(getByText(/errors\.sheet\.copyButton/))
    expect(Clipboard.setString).toHaveBeenCalledWith(expect.stringContaining('errorName: Test'))
  })

  it('opens native share with formatted text when Share is tapped', async () => {
    const { getByText } = render(<TechDetailsAccordion context={ctx} />)
    fireEvent.press(getByText(/errors\.sheet\.techDetailsToggle/))
    fireEvent.press(getByText(/errors\.sheet\.shareButton/))
    expect(Share.open).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('errorName: Test'),
      })
    )
  })
})
