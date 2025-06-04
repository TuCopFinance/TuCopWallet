import { useRef, useState } from 'react'
import { useAsync, useAsyncCallback } from 'react-async-hook'
import { e164NumberSelector } from 'src/account/selectors'
import { showError } from 'src/alert/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { PhoneVerificationEvents } from 'src/analytics/Events'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { phoneNumberRevoked, phoneNumberVerificationCompleted } from 'src/app/actions'
import { inviterAddressSelector } from 'src/app/selectors'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Logger from 'src/utils/Logger'
import getPhoneHash from 'src/utils/getPhoneHash'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'verify/hooks'

export enum PhoneNumberVerificationStatus {
  NONE,
  SUCCESSFUL,
  FAILED,
}

// Función auxiliar para verificar si el número existe en el sistema de keyless backup
async function checkPhoneInKeylessBackupSystem(
  phoneNumber: string,
  walletAddress: string
): Promise<boolean> {
  try {
    Logger.debug(
      `${TAG}/checkPhoneInKeylessBackupSystem`,
      'Checking if phone exists in keyless backup system'
    )

    const response = await fetch(`${networkConfig.cabGetEncryptedMnemonicUrl}/check-phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${networkConfig.cabApiKey}`,
      },
      body: JSON.stringify({
        phone: phoneNumber,
        wallet: walletAddress,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      return data.exists === true
    }

    return false
  } catch (error) {
    Logger.debug(
      `${TAG}/checkPhoneInKeylessBackupSystem`,
      'Error checking keyless backup system:',
      error
    )
    return false
  }
}

export function useVerifyPhoneNumber(phoneNumber: string, countryCallingCode: string) {
  const verificationCodeRequested = useRef(false)

  const dispatch = useDispatch()
  const address = useSelector(walletAddressSelector)
  const inviterAddress = useSelector(inviterAddressSelector)

  const [verificationStatus, setVerificationStatus] = useState(PhoneNumberVerificationStatus.NONE)
  const [verificationId, setVerificationId] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [shouldResendSms, setShouldResendSms] = useState(false)

  const resendSms = () => {
    verificationCodeRequested.current = false
    setShouldResendSms(true)
  }

  const handleRequestVerificationCodeError = (error: Error) => {
    Logger.debug(
      `${TAG}/requestVerificationCode`,
      'Received error from verifyPhoneNumber service',
      error
    )
    setShouldResendSms(false)
    dispatch(showError(ErrorMessages.PHONE_NUMBER_VERIFICATION_FAILURE))
  }

  const handleVerifySmsError = (error: Error) => {
    AppAnalytics.track(PhoneVerificationEvents.phone_verification_code_verify_error)
    Logger.debug(
      `${TAG}/validateVerificationCode`,
      `Received error from verifySmsCode service for verificationId: ${verificationId}`,
      error
    )
    setVerificationStatus(PhoneNumberVerificationStatus.FAILED)
    setSmsCode('')
  }

  const handleAlreadyVerified = async () => {
    Logger.debug(`${TAG}/requestVerificationCode`, 'Phone number already verified')

    setShouldResendSms(false)
    verificationCodeRequested.current = true
    AppAnalytics.track(PhoneVerificationEvents.phone_verification_restore_success)

    setVerificationStatus(PhoneNumberVerificationStatus.SUCCESSFUL)
    dispatch(phoneNumberVerificationCompleted(phoneNumber, countryCallingCode))
  }

  useAsync(
    async () => {
      if (verificationCodeRequested.current && !shouldResendSms) {
        // verificationCodeRequested prevents the verification request from
        // being fired multiple times, due to hot reloading during development
        Logger.debug(
          `${TAG}/requestVerificationCode`,
          'Skipping request to verifyPhoneNumber since a request was already initiated'
        )
        return
      }

      Logger.debug(`${TAG}/requestVerificationCode`, 'Initiating request to verifyPhoneNumber')

      // Primero verificar si el número ya existe en el sistema de keyless backup
      if (address) {
        const existsInKeylessBackup = await checkPhoneInKeylessBackupSystem(phoneNumber, address)
        if (existsInKeylessBackup) {
          Logger.debug(
            `${TAG}/requestVerificationCode`,
            'Phone number found in keyless backup system, auto-verifying'
          )
          await handleAlreadyVerified()
          return
        }
      }

      const response = await fetch(networkConfig.verifyPhoneNumberUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'tu-cop-intechchain-1234567890',
        },
        body: JSON.stringify({
          phone: phoneNumber,
          wallet: address,
        }),
      })
      if (response.ok) {
        return response
      } else {
        throw new Error(await response.text())
      }
    },

    [phoneNumber, shouldResendSms],
    {
      onError: async (error: Error) => {
        if (error?.message.includes('Phone number already verified')) {
          await handleAlreadyVerified()
        } else {
          handleRequestVerificationCodeError(error)
        }
      },
      onSuccess: async (response?: Response) => {
        if (!response) {
          return
        }

        const { data } = await response.json()
        setVerificationId(address!)
        setShouldResendSms(false)
        verificationCodeRequested.current = true

        AppAnalytics.track(PhoneVerificationEvents.phone_verification_code_request_success)
        Logger.debug(
          `${TAG}/requestVerificationCode`,
          'Successfully initiated phone number verification with verificationId: ',
          data.verificationId
        )
      },
    }
  )

  useAsync(
    async () => {
      // add verificationId to this hook, in case the SMS is received by the
      // user before the successful response from verifyPhoneNumber service
      if (!smsCode || !verificationId) {
        return
      }

      AppAnalytics.track(PhoneVerificationEvents.phone_verification_code_verify_start)
      Logger.debug(
        `${TAG}/validateVerificationCode`,
        'Initiating request to verifySmsCode with verificationId: ',
        verificationId
      )

      Logger.debug(`${TAG}/validateVerificationCode`, 'phoneNumber: ', phoneNumber)

      Logger.debug(`${TAG}/validateVerificationCode`, 'smsCode: ', smsCode)

      // const signedMessage = await retrieveSignedMessage()
      const response = await fetch(networkConfig.verifySmsCodeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // authorization: `${networkConfig.authHeaderIssuer} ${address}:${signedMessage}`,
          'x-api-key': 'tu-cop-intechchain-1234567890',
        },
        body: JSON.stringify({
          phone: phoneNumber,
          // verificationId,
          otp: smsCode,
          // clientPlatform: Platform.OS,
          // clientVersion: DeviceInfo.getVersion(),
          wallet: address,
        }),
      })

      if (response.ok) {
        return response
      } else {
        throw new Error(await response.text())
      }
    },
    [smsCode, phoneNumber, verificationId],
    {
      onSuccess: async (response?: Response) => {
        if (!response) {
          return
        }

        AppAnalytics.track(PhoneVerificationEvents.phone_verification_code_verify_success, {
          phoneNumberHash: getPhoneHash(phoneNumber),
          inviterAddress,
        })
        Logger.debug(`${TAG}/validateVerificationCode`, 'Successfully verified phone number')
        setVerificationStatus(PhoneNumberVerificationStatus.SUCCESSFUL)
        dispatch(phoneNumberVerificationCompleted(phoneNumber, countryCallingCode))
      },
      onError: handleVerifySmsError,
    }
  )

  return {
    resendSms,
    setSmsCode,
    verificationStatus,
  }
}

// This is only used from the dev menu for now
// TODO: use i18n if this need to be used in prod
export function useRevokeCurrentPhoneNumber() {
  const address = useSelector(walletAddressSelector)
  const e164Number = useSelector(e164NumberSelector)
  const dispatch = useDispatch()

  const revokePhoneNumber = useAsyncCallback(
    async () => {
      Logger.debug(
        `${TAG}/revokeVerification`,
        'Initiating request to revoke phone number verification',
        { address, e164Number }
      )
      AppAnalytics.track(PhoneVerificationEvents.phone_verification_revoke_start)

      if (!address || !e164Number) {
        throw new Error('No phone number in the store')
      }

      // const signedMessage = await retrieveSignedMessage()
      const response = await fetch(`${networkConfig.revokePhoneNumberUrl}/${e164Number}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'tu-cop-intechchain-1234567890',
        },
        // body: JSON.stringify({
        //   phoneNumber: e164Number,
        //   clientPlatform: Platform.OS,
        //   clientVersion: DeviceInfo.getVersion(),
        // }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      return e164Number
    },
    {
      onSuccess: (e164Number) => {
        AppAnalytics.track(PhoneVerificationEvents.phone_verification_revoke_success)
        dispatch(phoneNumberRevoked(e164Number))
      },
      onError: (error: Error) => {
        AppAnalytics.track(PhoneVerificationEvents.phone_verification_revoke_error)
        Logger.warn(`${TAG}/revokeVerification`, 'Error revoking verification', error)
      },
    }
  )

  return revokePhoneNumber
}
