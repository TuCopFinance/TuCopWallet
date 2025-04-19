import { useRef, useState } from 'react'
import { useAsync } from 'react-async-hook'
import { showError } from 'src/alert/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { KeylessBackupEvents } from 'src/analytics/Events'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { appKeyshareIssued } from 'src/keylessBackup/slice'
import { KeylessBackupFlow, KeylessBackupOrigin } from 'src/keylessBackup/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Logger from 'src/utils/Logger'
import { PhoneNumberVerificationStatus } from 'src/verify/hooks'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'keylessBackup/hooks'

export function useVerifyPhoneNumber(
  phoneNumber: string,
  keylessBackupFlow: KeylessBackupFlow,
  origin: KeylessBackupOrigin
) {
  const verificationCodeRequested = useRef(false)

  const dispatch = useDispatch()

  const walletAddress = useSelector(walletAddressSelector)

  const [verificationStatus, setVerificationStatus] = useState(PhoneNumberVerificationStatus.NONE)
  const [issueCodeCompleted, setIssueCodeCompleted] = useState(false)
  const [smsCode, setSmsCode] = useState('')

  // Async hook to make request to get sms code
  useAsync(
    async () => {
      if (verificationCodeRequested.current) {
        // verificationCodeRequested prevents the verification request from
        // being fired multiple times, due to hot reloading during development
        Logger.debug(
          `${TAG}/issueSmsCode`,
          'Skipping request to issueSmsCode since a request was already initiated'
        )
        return
      }

      AppAnalytics.track(KeylessBackupEvents.cab_issue_sms_code_start, {
        keylessBackupFlow,
        origin,
      })
      Logger.debug(`${TAG}/issueSmsCode`, 'Initiating request')
      Logger.debug(`${TAG}/token`, networkConfig.cabApiKey)

      const response = await fetch(networkConfig.cabIssueSmsCodeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${networkConfig.cabApiKey}`,
        },
        body: JSON.stringify({
          phone: phoneNumber,
        }),
      })
      if (response.ok) {
        return response
      } else {
        throw new Error(await response.text())
      }
    },
    [phoneNumber],
    {
      onError: (error: Error) => {
        AppAnalytics.track(KeylessBackupEvents.cab_issue_sms_code_error, {
          keylessBackupFlow,
          origin,
        })
        Logger.debug(`${TAG}/issueSmsCode`, 'Received error from issueSmsCode', error)
        dispatch(showError(ErrorMessages.PHONE_NUMBER_VERIFICATION_FAILURE))
      },
      onSuccess: async (response?: Response) => {
        if (!response) {
          return
        }
        setIssueCodeCompleted(true)
        verificationCodeRequested.current = true

        AppAnalytics.track(KeylessBackupEvents.cab_issue_sms_code_success, {
          keylessBackupFlow,
          origin,
        })
        Logger.debug(`${TAG}/issueSmsCode`, 'Successfully issued sms code')
      },
    }
  )

  // Async hook to post code and get keyshare once user types in code
  useAsync(
    async () => {
      // add issueCodeCompleted to this hook, in case the SMS is received by the
      // user before the successful response from issueSmsCode
      if (!smsCode || !issueCodeCompleted) {
        return
      }

      AppAnalytics.track(KeylessBackupEvents.cab_issue_app_keyshare_start, {
        keylessBackupFlow,
        origin,
      })
      Logger.debug(
        `${TAG}/issueAppKeyshare`,
        'Initiating request to issueAppKeyshare to validate code and issue key share'
      )

      const response = await fetch(networkConfig.cabIssueAppKeyshareUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${networkConfig.cabApiKey}`,
        },
        body: JSON.stringify({
          phone: phoneNumber,
          code: smsCode,
        }),
      })

      if (response.ok) {
        return response
      } else {
        throw new Error(await response.text())
      }
    },
    [smsCode, phoneNumber, issueCodeCompleted],
    {
      onSuccess: async (response?: Response) => {
        if (!response) {
          return
        }

        const { keyshare, sessionId } = await response.json()
        AppAnalytics.track(KeylessBackupEvents.cab_issue_app_keyshare_success, {
          keylessBackupFlow,
          origin,
        })
        Logger.debug(`${TAG}/issueAppKeyShare`, 'Successfully verified sms code and got keyshare')
        setVerificationStatus(PhoneNumberVerificationStatus.SUCCESSFUL)
        dispatch(
          appKeyshareIssued({
            keyshare,
            keylessBackupFlow,
            origin,
            jwt: sessionId,
            walletAddress: walletAddress as string,
            phone: phoneNumber as string,
          })
        )
      },
      onError: (error: Error) => {
        AppAnalytics.track(KeylessBackupEvents.cab_issue_app_keyshare_error, {
          keylessBackupFlow,
          origin,
        })
        Logger.debug(`${TAG}/issueAppKeyShare`, `Received error from issueAppKeyShare`, error)
        setVerificationStatus(PhoneNumberVerificationStatus.FAILED)
        setSmsCode('')
      },
    }
  )

  return {
    setSmsCode,
    verificationStatus,
  }
}
