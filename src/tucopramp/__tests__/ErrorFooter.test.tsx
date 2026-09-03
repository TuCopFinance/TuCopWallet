import Clipboard from '@react-native-clipboard/clipboard'
import { act, fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import ErrorFooter from 'src/tucopramp/ErrorFooter'
import { createMockStore } from 'test/utils'

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}))

function renderFooter(props: React.ComponentProps<typeof ErrorFooter>) {
  return render(
    <Provider store={createMockStore({})}>
      <ErrorFooter {...props} />
    </Provider>
  )
}

describe('ErrorFooter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders null when no props are populated', () => {
    const { toJSON } = renderFooter({ errorCode: 'invalid_body' })
    expect(toJSON()).toBeNull()
  })

  it('renders a countdown for rate_limited + retryAfterSeconds and disables retry until 0', () => {
    const onRetry = jest.fn()
    const { getByTestId } = renderFooter({
      errorCode: 'rate_limited',
      retryAfterSeconds: 3,
      onRetry,
    })
    expect(getByTestId('tucopramp-error-retry-countdown')).toHaveTextContent(/3/)

    // Advance 2 seconds via fake timers
    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(getByTestId('tucopramp-error-retry-countdown')).toHaveTextContent(/1/)

    // Still disabled while counting down
    const retryBtn = getByTestId('tucopramp-error-retry')
    fireEvent.press(retryBtn)
    expect(onRetry).not.toHaveBeenCalled()

    // Advance to 0 -> re-enabled
    act(() => {
      jest.advanceTimersByTime(2000)
    })
    fireEvent.press(retryBtn)
    expect(onRetry).toHaveBeenCalled()
  })

  it('does NOT render a countdown when the code is not rate_limited', () => {
    const { queryByTestId } = renderFooter({
      errorCode: 'invalid_body',
      retryAfterSeconds: 30,
      onRetry: jest.fn(),
    })
    expect(queryByTestId('tucopramp-error-retry-countdown')).toBeNull()
  })

  it('renders request_id + copies to clipboard on press', () => {
    const { getByTestId } = renderFooter({
      errorCode: 'invalid_body',
      requestId: 'req_deadbeef',
    })
    expect(getByTestId('tucopramp-error-request-id')).toHaveTextContent('req_deadbeef')
    fireEvent.press(getByTestId('tucopramp-error-copy-request-id'))
    expect(Clipboard.setString).toHaveBeenCalledWith('req_deadbeef')
  })
})
