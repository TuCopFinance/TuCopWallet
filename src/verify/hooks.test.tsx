import { act, fireEvent, render } from '@testing-library/react-native'
import { FetchMock } from 'jest-fetch-mock/types'
import React from 'react'
import { Text } from 'react-native'
import { Provider } from 'react-redux'
import { phoneNumberRevoked } from 'src/app/actions'
import Touchable from 'src/components/Touchable'
import { useRevokeCurrentPhoneNumber } from 'src/verify/hooks'
import networkConfig from 'src/web3/networkConfig'
import { createMockStore } from 'test/utils'

const mockFetch = fetch as FetchMock

function TestComponent() {
  const revokePhoneNumber = useRevokeCurrentPhoneNumber()

  return (
    <Touchable onPress={revokePhoneNumber.execute} disabled={revokePhoneNumber.loading}>
      <Text>Revoke</Text>
    </Touchable>
  )
}

describe('useRevokeCurrentPhoneNumber', () => {
  it('revokes the phone number', async () => {
    const store = createMockStore({})
    const { getByText } = render(
      <Provider store={store}>
        <TestComponent />
      </Provider>
    )
    mockFetch.mockResponseOnce(JSON.stringify({ message: 'OK' }), {
      status: 200,
    })

    await act(async () => {
      fireEvent.press(getByText('Revoke'))
    })

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${networkConfig.revokePhoneNumberUrl}/+14155556666`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'tu-cop-intechchain-1234567890',
        },
      }
    )
    expect(store.getActions()).toEqual([phoneNumberRevoked('+14155556666')])
  })

  it('shows an error when the request fails', async () => {
    const store = createMockStore({})
    const { getByText } = render(
      <Provider store={store}>
        <TestComponent />
      </Provider>
    )
    mockFetch.mockResponseOnce(JSON.stringify({ message: 'something went wrong' }), {
      status: 500,
    })

    await act(async () => {
      fireEvent.press(getByText('Revoke'))
    })

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${networkConfig.revokePhoneNumberUrl}/+14155556666`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'tu-cop-intechchain-1234567890',
        },
      }
    )
    expect(store.getActions()).toEqual([])
  })
})
