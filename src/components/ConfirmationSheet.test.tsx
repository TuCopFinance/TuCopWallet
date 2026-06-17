import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import { ConfirmationSheet } from 'src/components/ConfirmationSheet'
import { createMockStore } from 'test/utils'

describe('ConfirmationSheet', () => {
  const baseProps = {
    visible: true,
    noun: 'cambio' as const,
    reviewRows: [
      { label: 'You pay', value: '10 USDm' },
      { label: 'You receive', value: '~38000 COPm' },
    ],
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  it('renders review rows when visible', () => {
    const { getByText } = render(
      <Provider store={createMockStore({})}>
        <ConfirmationSheet {...baseProps} />
      </Provider>
    )
    expect(getByText('You pay')).toBeTruthy()
    expect(getByText('10 USDm')).toBeTruthy()
  })

  it('does not render when visible=false', () => {
    const { queryByText } = render(
      <Provider store={createMockStore({})}>
        <ConfirmationSheet {...baseProps} visible={false} />
      </Provider>
    )
    expect(queryByText('You pay')).toBeNull()
  })

  it('shows pre-flight advisory modal on confirm tap', () => {
    const { getByText } = render(
      <Provider store={createMockStore({})}>
        <ConfirmationSheet {...baseProps} />
      </Provider>
    )
    fireEvent.press(getByText(/confirmar|confirm/i))
    expect(getByText(/no cierres la app|don.{1,2}t close the app/i)).toBeTruthy()
    expect(baseProps.onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm after advisory continue', () => {
    const { getByText } = render(
      <Provider store={createMockStore({})}>
        <ConfirmationSheet {...baseProps} />
      </Provider>
    )
    fireEvent.press(getByText(/confirmar|confirm/i))
    fireEvent.press(getByText(/continuar|continue/i))
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel from sheet cancel button', () => {
    const { getByText } = render(
      <Provider store={createMockStore({})}>
        <ConfirmationSheet {...baseProps} />
      </Provider>
    )
    fireEvent.press(getByText(/cancelar|cancel/i))
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1)
  })
})
