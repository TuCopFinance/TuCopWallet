import { render } from '@testing-library/react-native'
import * as React from 'react'
import TransactionResultSheet from 'src/components/TransactionResultSheet'
import type { ErrorClass } from 'src/lib/errors'
import type { ConnectivityTransition } from 'src/lib/connectivity'

const makeError = (kind: ErrorClass['kind']): ErrorClass => ({
  kind,
  message: `mock ${kind}`,
  retryable: true,
})

describe('TransactionResultSheet', () => {
  it('renders nothing when not visible', () => {
    const { queryByTestId } = render(
      <TransactionResultSheet visible={false} status="succeeded" noun="envio" />
    )
    expect(queryByTestId('TransactionResultSheet')).toBeNull()
  })

  it('renders success message on succeeded status', () => {
    const { getByText, getByTestId } = render(
      <TransactionResultSheet visible={true} status="succeeded" noun="envio" />
    )
    expect(getByTestId('TransactionResultSheet')).toBeTruthy()
    expect(getByText(/result\.succeeded/)).toBeTruthy()
  })

  it('renders connectivity message when history shows a disconnect (regardless of errorClass)', () => {
    const history: ConnectivityTransition[] = [
      { at: 1, isConnected: true },
      { at: 2, isConnected: false },
    ]
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="cambio"
        errorClass={makeError('revert')}
        connectivityHistory={history}
      />
    )
    expect(getByText(/result\.connectivity/)).toBeTruthy()
  })

  it('renders connectivity message when errorClass kind is connectivity (no history needed)', () => {
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="envio"
        errorClass={makeError('connectivity')}
      />
    )
    expect(getByText(/result\.connectivity/)).toBeTruthy()
  })

  it('renders app-backgrounded message', () => {
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="envio"
        errorClass={makeError('app-backgrounded')}
      />
    )
    expect(getByText(/result\.appBackgrounded/)).toBeTruthy()
  })

  it('renders gas-insufficient message', () => {
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="envio"
        errorClass={makeError('gas-insufficient')}
      />
    )
    expect(getByText(/result\.gasInsufficient/)).toBeTruthy()
  })

  it('renders slippage message', () => {
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="cambio"
        errorClass={makeError('slippage')}
      />
    )
    expect(getByText(/result\.slippage/)).toBeTruthy()
  })

  it('renders revert message', () => {
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="envio"
        errorClass={makeError('revert')}
      />
    )
    expect(getByText(/result\.revert/)).toBeTruthy()
  })

  it('renders rpc-timeout message', () => {
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="envio"
        errorClass={makeError('rpc-timeout')}
      />
    )
    expect(getByText(/result\.rpcTimeout/)).toBeTruthy()
  })

  it('renders unknown message when no errorClass is provided on failure', () => {
    const { getByText } = render(
      <TransactionResultSheet visible={true} status="failed" noun="envio" />
    )
    expect(getByText(/result\.unknown/)).toBeTruthy()
  })

  it('renders unknown message for unmapped error kinds (e.g. user-rejected)', () => {
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="envio"
        errorClass={makeError('user-rejected')}
      />
    )
    expect(getByText(/result\.unknown/)).toBeTruthy()
  })

  it('includes the noun in the translation params', () => {
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="retiro a pesos"
        errorClass={makeError('revert')}
      />
    )
    // mock for i18n appends JSON-serialised options after the key
    expect(getByText(/"noun":"retiro a pesos"/)).toBeTruthy()
  })

  it('connectivity history with only connected transitions does NOT trigger connectivity branch', () => {
    const history: ConnectivityTransition[] = [
      { at: 1, isConnected: true },
      { at: 2, isConnected: true },
    ]
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="envio"
        errorClass={makeError('revert')}
        connectivityHistory={history}
      />
    )
    expect(getByText(/result\.revert/)).toBeTruthy()
  })

  it('shows retry button on non-success states when onRetry is supplied', () => {
    const onRetry = jest.fn()
    const { getByText } = render(
      <TransactionResultSheet
        visible={true}
        status="failed"
        noun="envio"
        errorClass={makeError('revert')}
        onRetry={onRetry}
      />
    )
    expect(getByText(/common\.retry/)).toBeTruthy()
  })

  it('does NOT show retry button on success state even if onRetry is supplied', () => {
    const onRetry = jest.fn()
    const { queryByText } = render(
      <TransactionResultSheet visible={true} status="succeeded" noun="envio" onRetry={onRetry} />
    )
    expect(queryByText(/common\.retry/)).toBeNull()
  })

  it('shows close button when onClose is supplied', () => {
    const onClose = jest.fn()
    const { getByText } = render(
      <TransactionResultSheet visible={true} status="failed" noun="envio" onClose={onClose} />
    )
    expect(getByText(/common\.close/)).toBeTruthy()
  })
})
