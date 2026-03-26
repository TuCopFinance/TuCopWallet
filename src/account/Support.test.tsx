import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import 'react-native'
import { Provider } from 'react-redux'
import Support from 'src/account/Support'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { createMockStore } from 'test/utils'

const renderSupport = () =>
  render(
    <Provider store={createMockStore()}>
      <Support />
    </Provider>
  )

describe('Support', () => {
  it('navigates to Contact', () => {
    const contact = renderSupport()
    fireEvent.press(contact.getByTestId('SupportContactLink'))
    expect(navigate).toBeCalledWith(Screens.SupportContact)
  })
})
