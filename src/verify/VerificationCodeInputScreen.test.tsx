import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native'
import { FetchMock } from 'jest-fetch-mock/types'
import MockDate from 'mockdate'
import React from 'react'
import * as Keychain from 'react-native-keychain'
import SmsRetriever from 'react-native-sms-retriever'
import { Provider } from 'react-redux'
import { showError } from 'src/alert/actions'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { sleep } from 'src/utils/sleep'
import VerificationCodeInputScreen from 'src/verify/VerificationCodeInputScreen'
import networkConfig from 'src/web3/networkConfig'
import MockedNavigator from 'test/MockedNavigator'
import { createMockStore } from 'test/utils'

const mockFetch = fetch as FetchMock

const mockedKeychain = jest.mocked(Keychain)
mockedKeychain.getGenericPassword.mockResolvedValue({
  username: 'some username',
  password: 'someSignedMessage',
  service: 'some service',
  storage: 'some string',
})

const mockedSmsRetriever = jest.mocked(SmsRetriever)

const e164Number = '+31619123456'
const walletAddress = '0xabc'
const store = createMockStore({
  web3: {
    account: walletAddress,
  },
  app: {
    inviterAddress: '0xabc',
  },
})

const renderComponent = () =>
  render(
    <Provider store={store}>
      <MockedNavigator
        component={VerificationCodeInputScreen}
        params={{
          countryCallingCode: '+31',
          e164Number,
          verificationCompletionScreen: Screens.OnboardingSuccessScreen,
        }}
      />
    </Provider>
  )

// The source code now calls checkPhoneInKeylessBackupSystem before verifyPhoneNumber,
// which adds an extra fetch call to cabGetEncryptedMnemonicUrl/check-phone.
// This helper mocks a response for that initial check (returning exists: false by default).
const mockKeylessBackupCheckResponse = (exists = false) => {
  mockFetch.mockResponseOnce(JSON.stringify({ exists }), { status: 200 })
}

// Expected headers and body for the verifyPhoneNumber request
const expectedVerifyPhoneNumberRequest = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'tu-cop-intechchain-1234567890',
  },
  body: JSON.stringify({ phone: e164Number, wallet: walletAddress }),
}

// Expected headers and body for the verifySmsCode request
const expectedVerifySmsCodeRequest = (smsCode: string) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'tu-cop-intechchain-1234567890',
  },
  body: JSON.stringify({ phone: e164Number, otp: smsCode, wallet: walletAddress }),
})

describe('VerificationCodeInputScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.resetMocks()
    store.clearActions()
    MockDate.reset()
  })

  it('displays the correct components and requests for the verification code on mount', async () => {
    // First call: checkPhoneInKeylessBackupSystem (returns exists: false)
    mockKeylessBackupCheckResponse()
    // Second call: verifyPhoneNumber
    mockFetch.mockResponseOnce(JSON.stringify({ data: { verificationId: 'someId' } }), {
      status: 200,
    })
    const { getByText, getByTestId } = renderComponent()

    expect(getByText('phoneVerificationInput.title')).toBeTruthy()
    expect(
      getByText(`phoneVerificationInput.description, {"phoneNumber":"${e164Number}"}`)
    ).toBeTruthy()
    expect(getByText('phoneVerificationInput.help')).toBeTruthy()
    expect(getByTestId('PhoneVerificationCode')).toBeTruthy()
    expect(getByTestId('PhoneVerificationResendSmsBtn')).toBeDisabled()

    // 2 calls: checkPhoneInKeylessBackupSystem + verifyPhoneNumber
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      networkConfig.verifyPhoneNumberUrl,
      expectedVerifyPhoneNumberRequest
    )
  })

  it('displays an error if verification code request fails', async () => {
    // First call: checkPhoneInKeylessBackupSystem
    mockKeylessBackupCheckResponse()
    // Second call: verifyPhoneNumber fails
    mockFetch.mockResponseOnce(JSON.stringify({ message: 'something went wrong' }), { status: 500 })
    renderComponent()

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(store.getActions()).toEqual(
      expect.arrayContaining([showError(ErrorMessages.PHONE_NUMBER_VERIFICATION_FAILURE)])
    )
  })

  it('verifies the sms code', async () => {
    // First call: checkPhoneInKeylessBackupSystem
    mockKeylessBackupCheckResponse()
    // Second call: verifyPhoneNumber
    mockFetch.mockResponseOnce(JSON.stringify({ data: { verificationId: 'someId' } }), {
      status: 200,
    })
    // Third call: verifySmsCode
    mockFetch.mockResponseOnce(JSON.stringify({ message: 'OK' }), {
      status: 200,
    })

    const { getByTestId } = renderComponent()

    await act(() => {
      fireEvent.changeText(getByTestId('PhoneVerificationCode'), '123456')
    })

    // 3 calls: checkPhone + verifyPhoneNumber + verifySmsCode
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      networkConfig.verifySmsCodeUrl,
      expectedVerifySmsCodeRequest('123456')
    )
    expect(getByTestId('PhoneVerificationCode/CheckIcon')).toBeTruthy()

    await act(() => {
      jest.runOnlyPendingTimers()
    })
    expect(navigate).toHaveBeenCalledWith(Screens.OnboardingSuccessScreen)
  })

  it('waits for the verificationId to be captured before verifying sms', async () => {
    mockFetch.mockImplementation(async (url?: string | Request) => {
      if (typeof url === 'string' && url.includes('/check-phone')) {
        // checkPhoneInKeylessBackupSystem
        return new Response(JSON.stringify({ exists: false }))
      }
      if (url === networkConfig.verifyPhoneNumberUrl) {
        await sleep(1000) // some arbitrary network delay
        return new Response(JSON.stringify({ data: { verificationId: 'someId' } }))
      }
      return new Response(JSON.stringify({ message: 'OK' }))
    })

    const { getByTestId } = renderComponent()

    await act(() => {
      // enter the verification code before the verifyPhoneNumber fetch has resolved
      fireEvent.changeText(getByTestId('PhoneVerificationCode'), '123456')
    })

    await act(() => {
      // handle the verification code, and then increment the timer to resolve
      // the network delay
      jest.runOnlyPendingTimers()
    })

    // 3 calls: checkPhone + verifyPhoneNumber + verifySmsCode
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      networkConfig.verifySmsCodeUrl,
      expectedVerifySmsCodeRequest('123456')
    )
    expect(getByTestId('PhoneVerificationCode/CheckIcon')).toBeTruthy()
  })

  // useAndroidSmsCodeRetriever is currently disabled (commented out) in VerificationCodeInput.tsx
  it.skip('reads the SMS code on Android automatically', async () => {
    // First call: checkPhoneInKeylessBackupSystem
    mockKeylessBackupCheckResponse()
    // Second call: verifyPhoneNumber
    mockFetch.mockResponseOnce(JSON.stringify({ data: { verificationId: 'someId' } }), {
      status: 200,
    })
    // Third call: verifySmsCode
    mockFetch.mockResponseOnce(JSON.stringify({ message: 'OK' }), {
      status: 200,
    })

    const { getByTestId, getByText } = renderComponent()

    // Check that the SmsRetriever is started
    await waitFor(() => expect(mockedSmsRetriever.startSmsRetriever).toHaveBeenCalledTimes(1))
    expect(mockedSmsRetriever.addSmsListener).toHaveBeenCalledTimes(1)

    const smsListener = mockedSmsRetriever.addSmsListener.mock.calls[0][0]

    await act(() => {
      // Simulate the SMS code being received
      smsListener({ message: 'Your verification code for App is: 123456 5yaJvJcZt2P' })
    })

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      networkConfig.verifySmsCodeUrl,
      expectedVerifySmsCodeRequest('123456')
    )
    expect(getByText('123456')).toBeTruthy()
    expect(getByTestId('PhoneVerificationCode/CheckIcon')).toBeTruthy()

    await act(() => {
      jest.runOnlyPendingTimers()
    })
    expect(navigate).toHaveBeenCalledWith(Screens.OnboardingSuccessScreen)
  })

  it('handles when phone number already verified', async () => {
    // checkPhoneInKeylessBackupSystem returns false, then verifyPhoneNumber returns 400 with
    // 'Phone number already verified' which triggers handleAlreadyVerified
    mockFetch.mockResponse(JSON.stringify({ message: 'Phone number already verified' }), {
      status: 400,
    })

    renderComponent()

    // 2 calls: checkPhone + verifyPhoneNumber (which fails with "already verified")
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      networkConfig.verifyPhoneNumberUrl,
      expectedVerifyPhoneNumberRequest
    )

    await act(() => {
      jest.runOnlyPendingTimers()
    })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(Screens.OnboardingSuccessScreen))
  })

  it('shows error in verifying sms code', async () => {
    // First call: checkPhoneInKeylessBackupSystem
    mockKeylessBackupCheckResponse()
    // Second call: verifyPhoneNumber
    mockFetch.mockResponseOnce(JSON.stringify({ data: { verificationId: 'someId' } }), {
      status: 200,
    })
    // Third call onward: verifySmsCode fails
    mockFetch.mockRejectedValue(JSON.stringify({ message: 'Not OK' }))

    const { getByTestId } = renderComponent()

    await act(() => {
      fireEvent.changeText(getByTestId('PhoneVerificationCode'), '123456')
    })

    // 3 calls: checkPhone + verifyPhoneNumber + verifySmsCode (rejected)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3))
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      networkConfig.verifySmsCodeUrl,
      expectedVerifySmsCodeRequest('123456')
    )
    expect(getByTestId('PhoneVerificationCode/ErrorIcon')).toBeTruthy()
    expect(store.getActions()).toEqual(
      expect.not.arrayContaining([showError(ErrorMessages.PHONE_NUMBER_VERIFICATION_FAILURE)])
    )

    await act(() => {
      jest.runOnlyPendingTimers()
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('makes a request to resend the sms code and resets the timer', async () => {
    // mockResponse applies to ALL subsequent fetch calls:
    // call 1: checkPhoneInKeylessBackupSystem, call 2: verifyPhoneNumber,
    // call 3: checkPhoneInKeylessBackupSystem (resend), call 4: verifyPhoneNumber (resend)
    mockFetch.mockResponse(JSON.stringify({ data: { verificationId: 'someId' } }), {
      status: 200,
    })
    const dateNow = Date.now()
    MockDate.set(dateNow)
    const { getByTestId } = renderComponent()

    await act(() => {
      MockDate.set(dateNow + 30000) // 30 seconds, matching default resend delay time in ResendButtonWithDelay component
      jest.advanceTimersByTime(1000) // 1 second, to update the timer
    })

    // 2 calls: checkPhone + verifyPhoneNumber
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    fireEvent.press(getByTestId('PhoneVerificationResendSmsBtn'))
    // 4 calls: previous 2 + checkPhone (resend) + verifyPhoneNumber (resend)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4))

    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      networkConfig.verifyPhoneNumberUrl,
      expectedVerifyPhoneNumberRequest
    )
    expect(getByTestId('PhoneVerificationResendSmsBtn')).toBeDisabled()
  })

  it('shows the help dialog', async () => {
    // First call: checkPhoneInKeylessBackupSystem
    mockKeylessBackupCheckResponse()
    // Second call: verifyPhoneNumber
    mockFetch.mockResponseOnce(JSON.stringify({ data: { verificationId: 'someId' } }), {
      status: 200,
    })
    const { getByTestId, getByText } = renderComponent()

    await act(() => {
      fireEvent.press(getByText('phoneVerificationInput.help'))
    })
    await waitFor(() => expect(getByTestId('PhoneVerificationInputHelpDialog')).toBeTruthy())
    const HelpDialog = getByTestId('PhoneVerificationInputHelpDialog')
    expect(within(HelpDialog).getByText('phoneVerificationInput.helpDialog.title')).toBeTruthy()
    expect(within(HelpDialog).getByText('phoneVerificationInput.helpDialog.body')).toBeTruthy()
  })
})
