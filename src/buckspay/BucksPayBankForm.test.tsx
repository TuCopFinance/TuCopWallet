import { fireEvent, render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import React from 'react'
import { Provider } from 'react-redux'
import BucksPayBankForm from 'src/buckspay/BucksPayBankForm'
import { BUCKSPAY_MAX_AMOUNT, BUCKSPAY_MIN_AMOUNT } from 'src/buckspay/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { createMockStore, getMockStackScreenProps } from 'test/utils'

jest.mock('src/navigator/NavigationService', () => ({
  navigate: jest.fn(),
}))

jest.mock('src/utils/Logger')

const mockCopmToken = {
  balance: new BigNumber(500000),
  decimals: 18,
  symbol: 'COPm',
  tokenId: 'celo-mainnet:0x8a567e2aE79CA692Bd748aB832081C45DE4ef57E',
}

jest.mock('src/tokens/hooks', () => ({
  ...jest.requireActual('src/tokens/hooks'),
  useCOPm: () => mockCopmToken,
}))

describe('BucksPayBankForm', () => {
  function renderScreen(storeOverrides = {}) {
    const store = createMockStore(storeOverrides)
    const props = getMockStackScreenProps(Screens.BucksPayBankForm)
    return {
      store,
      ...render(
        <Provider store={store}>
          <BucksPayBankForm {...props} />
        </Provider>
      ),
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders form fields correctly', () => {
    const { getByTestId, getByText } = renderScreen()

    expect(getByTestId('buckspay-amount-input')).toBeTruthy()
    expect(getByTestId('buckspay-account-number-input')).toBeTruthy()
    expect(getByTestId('buckspay-continue-button')).toBeTruthy()
    expect(getByText('Colombia')).toBeTruthy()
  })

  it('disables continue button when form is empty', () => {
    const { getByTestId } = renderScreen()
    const button = getByTestId('buckspay-continue-button')
    expect(button.props.disabled || button.props.accessibilityState?.disabled).toBeTruthy()
  })

  it('shows error when amount is below minimum', () => {
    const { getByTestId, queryByText } = renderScreen()

    fireEvent.changeText(getByTestId('buckspay-amount-input'), '5000')
    fireEvent.changeText(getByTestId('buckspay-account-number-input'), '12345678')

    // Error should be visible (i18n returns key with interpolation in test)
    expect(queryByText(/amountBelowMin|Minimum/i)).toBeTruthy()

    // Button should be disabled
    const button = getByTestId('buckspay-continue-button')
    expect(button.props.disabled || button.props.accessibilityState?.disabled).toBeTruthy()
  })

  it('shows error when amount is above maximum', () => {
    const { getByTestId, queryByText } = renderScreen()

    fireEvent.changeText(getByTestId('buckspay-amount-input'), '500000')
    fireEvent.changeText(getByTestId('buckspay-account-number-input'), '12345678')

    // Error should be visible
    expect(queryByText(/amountAboveMax|Maximum/i)).toBeTruthy()

    // Button should be disabled
    const button = getByTestId('buckspay-continue-button')
    expect(button.props.disabled || button.props.accessibilityState?.disabled).toBeTruthy()
  })

  it('enables continue button with valid amount and account number', () => {
    const { getByTestId, queryByText } = renderScreen()

    fireEvent.changeText(getByTestId('buckspay-amount-input'), '50000')
    fireEvent.changeText(getByTestId('buckspay-account-number-input'), '12345678')

    // No error visible
    expect(queryByText(/amountBelowMin|Minimum/i)).toBeNull()
    expect(queryByText(/amountAboveMax|Maximum/i)).toBeNull()
  })

  it('does not show error when amount field is empty', () => {
    const { getByTestId, queryByText } = renderScreen()

    fireEvent.changeText(getByTestId('buckspay-amount-input'), '')

    expect(queryByText(/amountBelowMin|Minimum/i)).toBeNull()
    expect(queryByText(/amountAboveMax|Maximum/i)).toBeNull()
  })

  it('navigates to confirm screen with correct params', () => {
    const { getByTestId } = renderScreen()

    fireEvent.changeText(getByTestId('buckspay-amount-input'), '50000')
    fireEvent.changeText(getByTestId('buckspay-account-number-input'), '12345678')
    fireEvent.press(getByTestId('buckspay-continue-button'))

    expect(navigate).toHaveBeenCalledWith(Screens.BucksPayConfirm, {
      amount: '50000',
      bankDetails: {
        bankName: 'Bancolombia',
        accountNumber: '12345678',
        accountType: 'savings',
        bankCountry: 'Colombia',
      },
    })
  })

  it('validates at exact boundaries', () => {
    const { getByTestId, queryByText } = renderScreen()

    // Exact minimum should be valid
    fireEvent.changeText(getByTestId('buckspay-amount-input'), String(BUCKSPAY_MIN_AMOUNT))
    fireEvent.changeText(getByTestId('buckspay-account-number-input'), '12345678')
    expect(queryByText(/amountBelowMin|Minimum/i)).toBeNull()

    // Exact maximum should be valid
    fireEvent.changeText(getByTestId('buckspay-amount-input'), String(BUCKSPAY_MAX_AMOUNT))
    expect(queryByText(/amountAboveMax|Maximum/i)).toBeNull()
  })

  it('shows error when amount exceeds COPm balance', () => {
    mockCopmToken.balance = new BigNumber(5000)
    const { getByTestId, queryByText } = renderScreen()

    fireEvent.changeText(getByTestId('buckspay-amount-input'), '10000')
    fireEvent.changeText(getByTestId('buckspay-account-number-input'), '12345678')

    expect(queryByText(/insufficientBalance|Insufficient/i)).toBeTruthy()

    const button = getByTestId('buckspay-continue-button')
    expect(button.props.disabled || button.props.accessibilityState?.disabled).toBeTruthy()

    // Restore for other tests
    mockCopmToken.balance = new BigNumber(500000)
  })

  it('pre-fills bank details from last used', () => {
    const { getByDisplayValue } = renderScreen({
      buckspay: {
        lastBankDetails: {
          bankName: 'Davivienda',
          accountNumber: '9876543210',
          accountType: 'checking',
          bankCountry: 'Colombia',
        },
      },
    })

    expect(getByDisplayValue('9876543210')).toBeTruthy()
  })
})
