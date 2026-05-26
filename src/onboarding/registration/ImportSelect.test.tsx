import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import 'react-native'
import { Provider } from 'react-redux'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import ImportSelect from 'src/onboarding/registration/ImportSelect'
import { createMockStore, getMockStackScreenProps } from 'test/utils'

jest.mock('src/analytics/AppAnalytics')
const mockScreenProps = getMockStackScreenProps(Screens.ImportSelect)

describe('ImportSelect', () => {
  it('renders correctly with only the recovery-phrase option (keyless backup hidden)', () => {
    const { getByText, queryByText } = render(
      <Provider store={createMockStore()}>
        <ImportSelect {...mockScreenProps} />
      </Provider>
    )

    expect(getByText('importSelect.title')).toBeTruthy()
    expect(getByText('importSelect.description')).toBeTruthy()
    expect(getByText('importSelect.recoveryPhrase.title')).toBeTruthy()
    expect(getByText('importSelect.recoveryPhrase.description')).toBeTruthy()
    // Keyless backup option is intentionally hidden until known bugs are fixed.
    expect(queryByText('importSelect.emailAndPhone.title')).toBeNull()
  })

  it('should be able to navigate to mnemonic restore', () => {
    const { getByTestId } = render(
      <Provider store={createMockStore()}>
        <ImportSelect {...mockScreenProps} />
      </Provider>
    )

    fireEvent.press(getByTestId('ImportSelect/Mnemonic'))
    expect(navigate).toHaveBeenCalledWith(Screens.ImportWallet, { clean: true })
  })
})
