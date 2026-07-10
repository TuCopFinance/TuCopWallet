import { render } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'
import { Provider } from 'react-redux'
import { createMockStore } from 'test/utils'
import { PinRequiredGate } from './PinRequiredGate'

const mockPinTransactional = jest.fn()
const mockEndTransactional = jest.fn()
jest.mock('src/pincode/PasswordCache', () => ({
  pinTransactional: (...args: any[]) => mockPinTransactional(...args),
  endTransactional: (...args: any[]) => mockEndTransactional(...args),
}))

describe('PinRequiredGate', () => {
  const address = '0x1111111111111111111111111111111111111111'
  beforeEach(() => {
    mockPinTransactional.mockClear()
    mockEndTransactional.mockClear()
  })

  it('pins the cache on mount with the current wallet address', () => {
    render(
      <Provider store={createMockStore({ web3: { account: address } })}>
        <PinRequiredGate>
          <Text>child</Text>
        </PinRequiredGate>
      </Provider>
    )
    expect(mockPinTransactional).toHaveBeenCalledWith(address)
    expect(mockEndTransactional).not.toHaveBeenCalled()
  })

  it('ends the lock on unmount', () => {
    const { unmount } = render(
      <Provider store={createMockStore({ web3: { account: address } })}>
        <PinRequiredGate>
          <Text>child</Text>
        </PinRequiredGate>
      </Provider>
    )
    unmount()
    expect(mockEndTransactional).toHaveBeenCalledWith(address)
  })

  it('does nothing if address is null', () => {
    render(
      <Provider store={createMockStore({ web3: { account: null } })}>
        <PinRequiredGate>
          <Text>child</Text>
        </PinRequiredGate>
      </Provider>
    )
    expect(mockPinTransactional).not.toHaveBeenCalled()
  })

  it('renders children', () => {
    const { getByText } = render(
      <Provider store={createMockStore({ web3: { account: address } })}>
        <PinRequiredGate>
          <Text>child</Text>
        </PinRequiredGate>
      </Provider>
    )
    expect(getByText('child')).toBeTruthy()
  })
})
