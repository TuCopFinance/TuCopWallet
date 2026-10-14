import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import Clipboard from '@react-native-clipboard/clipboard'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import Dialog from 'src/components/Dialog'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import DownArrowIcon from 'src/icons/navigation/DownArrowIcon'
import { navigateBack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { addConsentBreadcrumb } from 'src/tucopramp/consentBreadcrumb'
import ErrorFooter from 'src/tucopramp/ErrorFooter'
import { errorMessageKey } from 'src/tucopramp/errorCopy'
import { formatCop, formatPercent } from 'src/tucopramp/format'
import {
  DOCUMENT_TYPES,
  DocumentType,
  MAX_DOCUMENT_LENGTH,
  getDocumentAutoCapitalize,
  getDocumentKeyboardType,
  isValidDocument,
  sanitizeDocument,
} from 'src/tucopramp/limits'
import { toTitleCase } from 'src/tucopramp/nameFormat'
import { PickerModal } from 'src/tucopramp/PickerModal'
import {
  MAX_ACCOUNT_NUMBER_LENGTH,
  MAX_BREB_KEY_LENGTH,
  MAX_NAME_LENGTH,
  formatAmountDigits,
  isValidBankAccountNumber,
  isValidBreBKey,
  isValidEmail,
  parseAmountDigits,
  sanitizeAmountDigits,
  sanitizeDigits,
  sanitizePersonName,
} from 'src/tucopramp/validation'
import {
  cancelOfframpOrder,
  checkActiveOfframpOrder,
  fetchBanks,
  fetchOfframpProofUrl,
  fetchUserProfile,
  pollOfframpOrder,
  requestOfframpQuote,
  sendOfframpDeposit,
  stopOfframpPolling,
  submitOfframpOrder,
} from 'src/tucopramp/saga'
import {
  banksSelector,
  effectiveLimitsSelector,
  offrampActiveCheckStatusSelector,
  offrampActiveOrderDetailSelector,
  offrampActiveOrderIdSelector,
  offrampActiveOrderMissingMultisigSelector,
  offrampCurrentOrderSelector,
  offrampDepositTxErrorCodeSelector,
  offrampDepositTxHashSelector,
  offrampDepositTxStatusSelector,
  offrampErrorCodeSelector,
  offrampErrorRemainingDailySelector,
  offrampErrorRemainingMonthlySelector,
  offrampErrorRequestIdSelector,
  offrampErrorRetryAfterSecondsSelector,
  offrampLastPayoutSelector,
  offrampLastQuoteSelector,
  offrampProofUrlErrorCodeSelector,
  offrampProofUrlLoadingSelector,
  offrampProofUrlSelector,
  offrampSavedPayoutProfilesSelector,
  offrampStatusSelector,
  userProfileSelector,
} from 'src/tucopramp/selectors'
import {
  offrampDepositRetry,
  offrampEditRequest,
  offrampReset,
  offrampRetryAfterError,
} from 'src/tucopramp/slice'
import { BankAccountType, PayoutMethod } from 'src/tucopramp/types'
import { usePrepareSendTransactions } from 'src/send/usePrepareSendTransactions'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTokenInfo } from 'src/tokens/hooks'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { NetworkId } from 'src/transactions/types'
import { getFeeCurrencyAndAmounts } from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransaction } from 'src/viem/preparedTransactionSerialization'
import Logger from 'src/utils/Logger'
import { COPM_TOKEN_ID_MAINNET, networkIdToChainId } from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'

type Props = NativeStackScreenProps<StackParamList, Screens.TuCOPRampOfframpFlow>

// TuCOPRamp legal terms URL. Reuses the existing TuCop TOS since Legal has
// not published a TuCOPRamp-specific version yet; when they do, update this
// constant (and the onramp mirror) in the same commit + confirm with Ops.
const TUCOPRAMP_TERMS_URL = 'https://tucop.xyz/terminos-y-condiciones/'

// Prepare results that mean the wallet cannot pay the COPm transfer + gas.
type BalanceIssue =
  | 'insufficient_balance'
  | 'need-decrease-spend-amount-for-gas'
  | 'not-enough-balance-for-gas'

const BALANCE_ISSUE_COPY: Record<BalanceIssue, string> = {
  insufficient_balance: 'tucopramp.balanceErrors.insufficientBalance',
  'need-decrease-spend-amount-for-gas': 'tucopramp.balanceErrors.needDecreaseForGas',
  'not-enough-balance-for-gas': 'tucopramp.balanceErrors.notEnoughForGas',
}

function isBalanceIssue(code: string | null): code is BalanceIssue {
  return !!code && code in BALANCE_ISSUE_COPY
}

// Single screen master that drives the full off-ramp flow via conditional
// rendering on the redux flow status. Keeps navigation shallow.
function TuCOPRampOfframpFlow(_props: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const status = useSelector(offrampStatusSelector)
  const banks = useSelector(banksSelector)
  const quote = useSelector(offrampLastQuoteSelector)
  const order = useSelector(offrampCurrentOrderSelector)
  const errorCode = useSelector(offrampErrorCodeSelector)
  const proofUrl = useSelector(offrampProofUrlSelector)
  const proofUrlLoading = useSelector(offrampProofUrlLoadingSelector)
  const proofUrlErrorCode = useSelector(offrampProofUrlErrorCodeSelector)

  const [amount, setAmount] = useState('')
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('bank_account')
  const [bankCode, setBankCode] = useState<string>('')
  const [bankAccountType, setBankAccountType] = useState<BankAccountType>('savings')
  const [bankAccountNumber, setBankAccountNumber] = useState<string>('')
  const [breBKey, setBreBKey] = useState<string>('')
  const [documentType, setDocumentType] = useState<DocumentType>('CC')
  const [cedula, setCedula] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [firstName, setFirstName] = useState<string>('')
  const [lastName, setLastName] = useState<string>('')
  const [openPicker, setOpenPicker] = useState<null | 'bank' | 'accountType' | 'docType'>(null)
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false)
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState<boolean>(false)
  const errorRetryAfterSeconds = useSelector(offrampErrorRetryAfterSecondsSelector)
  const errorRequestId = useSelector(offrampErrorRequestIdSelector)
  const errorRemainingDaily = useSelector(offrampErrorRemainingDailySelector)
  const errorRemainingMonthly = useSelector(offrampErrorRemainingMonthlySelector)
  const limits = useSelector(effectiveLimitsSelector)

  const walletAddress = useSelector(walletAddressSelector)
  const copmTokenInfo = useTokenInfo(COPM_TOKEN_ID_MAINNET)
  const feeCurrencies = useSelector((state) =>
    feeCurrenciesSelector(state, NetworkId['celo-mainnet'])
  )
  const depositTxHash = useSelector(offrampDepositTxHashSelector)
  const depositTxStatus = useSelector(offrampDepositTxStatusSelector)
  const depositTxErrorCode = useSelector(offrampDepositTxErrorCodeSelector)
  const activeCheckStatus = useSelector(offrampActiveCheckStatusSelector)
  const activeOrderId = useSelector(offrampActiveOrderIdSelector)
  const activeOrderMissingMultisig = useSelector(offrampActiveOrderMissingMultisigSelector)
  const activeOrderDetail = useSelector(offrampActiveOrderDetailSelector)
  const lastPayout = useSelector(offrampLastPayoutSelector)
  const userProfile = useSelector(userProfileSelector)
  const savedPayoutProfiles = useSelector(offrampSavedPayoutProfilesSelector)
  const { prepareTransactionsResult, refreshPreparedTransactions, clearPreparedTransactions } =
    usePrepareSendTransactions()
  // Guards against dispatching sendOfframpDeposit twice for the same order
  // when the component re-renders (usePrepareSendTransactions result updates,
  // poll ticks, etc.). The saga is also takeLeading so a stray double-tap
  // wouldn't broadcast twice either way; this ref keeps the UI honest.
  const dispatchedSendOrderIdRef = useRef<string | null>(null)
  const [autoSendError, setAutoSendError] = useState<string | null>(null)
  // Bumped by "Intentar de nuevo" on a failed deposit to re-run the prepare.
  const [prepareAttempt, setPrepareAttempt] = useState(0)
  // The attempt whose deposit prepare has resolved. The send effect only
  // signs a result from the current attempt, never a stale one (e.g. the tx
  // prepared before a revert, whose nonce is already used).
  const [preparedAttempt, setPreparedAttempt] = useState(-1)
  const [activeReferenceCopied, setActiveReferenceCopied] = useState<boolean>(false)
  const [proofImageFailed, setProofImageFailed] = useState(false)

  // The order the screen follows: the one created here (kept across leaving
  // the screen while it is open) or the one resumed from the server.
  const trackedOrderId = order?.order_id ?? activeOrderId
  const pollActive =
    status === 'awaiting-deposit' || status === 'deposit-confirmed' || status === 'processing'

  // maxFeeAmount is expressed in the fee currency (COPm on Celo when the user
  // pays fees with COPm). Since 1 COPm = 1 COP always, we render it directly
  // as COP without any FX conversion.
  const { maxFeeAmount, feeCurrency: feeTokenInfo } =
    getFeeCurrencyAndAmounts(prepareTransactionsResult)

  useEffect(() => {
    dispatch(fetchBanks())
    dispatch(fetchUserProfile())
    // Enforce one-active-order-at-a-time: ask the server whether the wallet
    // already has an in-flight offramp order BEFORE the user starts filling
    // the form. If there is one, the resume view takes over; if not, the
    // fresh form path is unlocked.
    dispatch(checkActiveOfframpOrder())
    return () => {
      dispatch(stopOfframpPolling())
      dispatch(offrampReset())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Prefill payout section from the most recent completed order. Only runs
  // when the user has not typed anything into those fields yet (to avoid
  // stomping user input). The full bank_account_number is never prefilled -
  // server returns only last_4 for privacy - so bank_account_number always
  // starts empty for the user to re-enter.
  useEffect(() => {
    if (!lastPayout) return
    if (lastPayout.method === 'bre_b_key') {
      if (!breBKey && lastPayout.bre_b_key) {
        setBreBKey(lastPayout.bre_b_key)
        setPayoutMethod('bre_b_key')
      }
      return
    }
    // Only while the user has not picked a bank: the last payout's bank and
    // account type are a suggestion, never an override of a choice.
    if (lastPayout.method === 'bank_account' && lastPayout.bank_code && !bankCode) {
      setBankCode(lastPayout.bank_code)
      if (lastPayout.bank_account_type) {
        setBankAccountType(lastPayout.bank_account_type as BankAccountType)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPayout?.method, lastPayout?.bank_code, lastPayout?.bre_b_key])

  // Prefill personal info from the /me endpoint. Server persists the user's
  // full_name and primary_email so the second order onwards autofills them.
  // cedula is intentionally omitted: server only returns cedula_last_4 for
  // privacy, so the user must always retype the full number. full_name is
  // split into given / family halves for the two-input form: an even word
  // count splits down the middle, an odd count places the extra word on
  // the given-name side (Colombian convention where 2+2 is most common but
  // 1+2 or 2+1 also occur).
  useEffect(() => {
    if (!userProfile) return
    if (userProfile.primary_email && !email) {
      setEmail(userProfile.primary_email)
    }
    if (userProfile.full_name && !firstName && !lastName) {
      const words = userProfile.full_name.trim().split(/\s+/)
      const givenCount = Math.ceil(words.length / 2)
      setFirstName(words.slice(0, givenCount).join(' '))
      setLastName(words.slice(givenCount).join(' '))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.primary_email, userProfile?.full_name])

  // Destination-match override. As the user types a Bre-B key or a full bank
  // account, look for a saved payout profile that shares the destination.
  // When a match hits, OVERWRITE the personal info (nombres, apellidos,
  // cedula, email) with the ones tied to that specific destination. This
  // handles the "one wallet, many beneficiaries" case: e.g. sending to
  // spouse's account should not carry over the /me profile's name; the
  // user typed the same account before with different personal info and we
  // reuse it exactly. Bank_account_type is also overwritten because it
  // pairs 1:1 with the account number.
  useEffect(() => {
    if (savedPayoutProfiles.length === 0) return
    const match = savedPayoutProfiles.find((p) => {
      if (payoutMethod === 'bre_b_key') {
        return p.method === 'bre_b_key' && !!breBKey && p.bre_b_key === breBKey.trim()
      }
      return (
        p.method === 'bank_account' &&
        !!bankAccountNumber &&
        !!bankCode &&
        p.bank_code === bankCode &&
        p.bank_account_number === bankAccountNumber.trim()
      )
    })
    if (!match) return
    if (match.full_name) {
      const words = match.full_name.trim().split(/\s+/)
      const givenCount = Math.ceil(words.length / 2)
      setFirstName(words.slice(0, givenCount).join(' '))
      setLastName(words.slice(givenCount).join(' '))
    }
    if (match.cedula) setCedula(match.cedula)
    if (match.email) setEmail(match.email)
    if (
      match.method === 'bank_account' &&
      match.bank_account_type &&
      match.bank_account_type !== bankAccountType
    ) {
      setBankAccountType(match.bank_account_type as BankAccountType)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breBKey, bankAccountNumber, bankCode, payoutMethod, savedPayoutProfiles])

  // No bank is preselected: a first-time user must pick one ("Selecciona un
  // banco"), and a returning user gets the last payout's bank (see above).

  // One poller per open order, for every non-final status. Keyed on the
  // order id + "is open" so moving between open statuses does not restart
  // the poller, which tracks transitions across ticks. Stopped on close.
  useEffect(() => {
    if (pollActive && trackedOrderId) {
      dispatch(pollOfframpOrder({ orderId: trackedOrderId }))
    }
  }, [pollActive, trackedOrderId, dispatch])

  // Re-poll right away when the app comes back to the foreground, also after
  // the poller gave up (poll-timeout).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && trackedOrderId && (pollActive || status === 'poll-timeout')) {
        dispatch(pollOfframpOrder({ orderId: trackedOrderId }))
      }
    })
    return () => subscription.remove()
  }, [pollActive, status, trackedOrderId, dispatch])

  // On COMPLETED, try to fetch the operator's outgoing-transfer proof.
  // Refetches when the cached URL crosses its expires_at deadline (server
  // TTL 300s per guide sec 10). Never refetches after a failure: a 404
  // (proof_not_found / order_not_found) means no receipt yet and renders as
  // such, anything else shows the error once.
  useEffect(() => {
    if (status !== 'completed' || !trackedOrderId) return
    if (proofUrlErrorCode) return
    const stillFresh = proofUrl && new Date(proofUrl.expires_at).getTime() > Date.now() + 5_000
    if (stillFresh || proofUrlLoading) return
    dispatch(fetchOfframpProofUrl({ orderId: trackedOrderId, kind: 'operator_outgoing' }))
  }, [status, trackedOrderId, proofUrl, proofUrlLoading, proofUrlErrorCode, dispatch])

  useEffect(() => {
    setProofImageFailed(false)
  }, [proofUrl?.url])

  // Prepare the COPm transfer once the quote is ready so we can display the
  // network fee in the breakdown card BEFORE the user hits Confirm. The real
  // deposit address is only known after order creation, so we estimate against
  // the wallet's own address (ERC-20 transfer gas is destination-independent
  // for this purpose). This is an estimate, not the tx that gets sent.
  useEffect(() => {
    if (status !== 'quote-ready' || !quote || !copmTokenInfo || !walletAddress) {
      return
    }
    clearPreparedTransactions()
    refreshPreparedTransactions({
      amount: new BigNumber(quote.gross_amount_copm),
      token: copmTokenInfo,
      recipientAddress: walletAddress,
      walletAddress,
      feeCurrencies,
    }).catch(() => {
      // Estimation failures are non-fatal: usePrepareSendTransactions already
      // logs via its own onError. We just fall through and hide the network
      // fee row when no result is available.
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, quote?.quote_id, walletAddress, copmTokenInfo?.tokenId])

  // Once the order exists and we are in awaiting-deposit, re-prepare the tx
  // against the REAL multisig address and auto-dispatch sendOfframpDeposit.
  // The wallet is the depositor: the user already consented at the confirm
  // step, so we broadcast the transfer on their behalf inside a saga that
  // stays local to the offramp flow (no navigate-away to a generic
  // TransactionSuccessScreen), then the existing poller moves the order to
  // deposit-confirmed/processing/completed. The chain_id guard refuses to
  // auto-send if the server ever returns anything other than Celo mainnet -
  // the wallet is Celo-only so any other chain_id would mean the funds land
  // on the wrong network.
  const orderChainMatches =
    !!order && order.chain_id === networkIdToChainId[NetworkId['celo-mainnet']]

  useEffect(() => {
    if (status !== 'awaiting-deposit' || !order || !copmTokenInfo || !walletAddress) {
      return
    }
    if (!orderChainMatches) {
      setAutoSendError('chain_mismatch')
      return
    }
    if (dispatchedSendOrderIdRef.current === order.order_id) {
      return
    }
    // A broadcast tx (or one in flight, or a failure waiting for the user's
    // "Intentar de nuevo") must never trigger a new send on re-entry.
    if (depositTxStatus !== 'idle') {
      return
    }
    clearPreparedTransactions()
    setAutoSendError(null)
    const attempt = prepareAttempt
    refreshPreparedTransactions({
      amount: new BigNumber(order.gross_amount_copm),
      token: copmTokenInfo,
      recipientAddress: order.multisig_address,
      walletAddress,
      feeCurrencies,
    })
      .then(() => setPreparedAttempt(attempt))
      .catch(() => {
        setAutoSendError('prepare_failed')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    status,
    order?.order_id,
    walletAddress,
    copmTokenInfo?.tokenId,
    orderChainMatches,
    prepareAttempt,
  ])

  useEffect(() => {
    if (
      status !== 'awaiting-deposit' ||
      !order ||
      !copmTokenInfo ||
      !walletAddress ||
      !orderChainMatches ||
      !prepareTransactionsResult ||
      preparedAttempt !== prepareAttempt ||
      depositTxStatus !== 'idle' ||
      dispatchedSendOrderIdRef.current === order.order_id
    ) {
      return
    }
    // The wallet cannot cover the transfer + gas: say so instead of
    // spinning on "Preparando la transferencia" forever.
    if (prepareTransactionsResult.type !== 'possible') {
      setAutoSendError(prepareTransactionsResult.type)
      return
    }
    const tx = prepareTransactionsResult.transactions[0]
    if (!tx) return
    // CRITICAL destination guard. The quote-ready estimation and the
    // awaiting-deposit prepare share the same useAsyncCallback instance, so
    // during the render cycle where the clear + refresh happen the cached
    // result in the closure may still be the estimation's self-transfer
    // (recipientAddress = walletAddress). Broadcasting that would send the
    // user's COPm to themselves and register as "success". Refuse to sign
    // anything whose destination is not the real multisig for THIS order.
    // Requires a COPm ERC-20 transfer(to, amount) call: data must be at least
    // 4 (selector) + 32 (padded address) = 68 bytes; bytes 4..36 are the
    // recipient address, left-padded to 32.
    const rawData = tx.data ?? ''
    const dataHex = rawData.startsWith('0x') ? rawData.slice(2) : rawData
    if (dataHex.length < 8 + 64) {
      Logger.warn(
        'tucopramp/deposit-guard',
        'Prepared tx data too short to carry an ERC-20 transfer selector + recipient'
      )
      return
    }
    const recipientHex = '0x' + dataHex.slice(8 + 24, 8 + 64).toLowerCase()
    const expectedHex = order.multisig_address.toLowerCase()
    const toHex = (tx.to ?? '').toLowerCase()
    const copmHex = COPM_TOKEN_ID_MAINNET.split(':')[1].toLowerCase()
    if (toHex !== copmHex) {
      Logger.warn(
        'tucopramp/deposit-guard',
        `Prepared tx target ${toHex} is not the COPm contract ${copmHex}. Refusing to sign.`
      )
      return
    }
    if (recipientHex !== expectedHex) {
      Logger.warn(
        'tucopramp/deposit-guard',
        `Prepared tx recipient ${recipientHex} does not match multisig ${expectedHex}. Refusing to sign.`
      )
      return
    }
    dispatchedSendOrderIdRef.current = order.order_id
    dispatch(
      sendOfframpDeposit({
        orderId: order.order_id,
        multisigAddress: order.multisig_address,
        amountCopm: order.gross_amount_copm,
        serializablePreparedTransaction: getSerializablePreparedTransaction(tx),
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    status,
    order?.order_id,
    prepareTransactionsResult,
    depositTxStatus,
    preparedAttempt,
    prepareAttempt,
  ])

  // `amount` holds digits only; the input renders it with es-CO dots.
  const amountNum = useMemo(() => parseAmountDigits(amount), [amount])
  const copmBalance = copmTokenInfo?.balance ?? null
  const amountAboveBalance =
    !!copmBalance && amountNum > 0 && copmBalance.isLessThan(new BigNumber(amountNum))
  const amountValid =
    amountNum >= limits.min_order_cop && amountNum <= limits.max_order_cop && !amountAboveBalance

  const selectedBank = useMemo(() => banks?.find((b) => b.code === bankCode), [banks, bankCode])

  const payoutFieldsValid = useMemo(() => {
    if (payoutMethod === 'bre_b_key') {
      return isValidBreBKey(breBKey)
    }
    return (
      bankCode.length > 0 &&
      isValidBankAccountNumber(bankAccountNumber) &&
      (selectedBank?.supported_account_types ?? []).includes(bankAccountType)
    )
  }, [payoutMethod, breBKey, bankCode, bankAccountNumber, bankAccountType, selectedBank])

  const firstNameValid = firstName.trim().length > 0
  const lastNameValid = lastName.trim().length > 0
  const cedulaValid = isValidDocument(documentType, cedula)
  const emailValid = isValidEmail(email)
  const formValid =
    amountValid && cedulaValid && emailValid && payoutFieldsValid && firstNameValid && lastNameValid

  // Network fee: only shown when the estimated fee currency is COPm, so it
  // reads as "X pesos" without any FX conversion (1 COPm = 1 COP). With CELO
  // or USDT as fee currency the row is hidden rather than mixing units.
  const isFeeCopm = !!feeTokenInfo && feeTokenInfo.tokenId === COPM_TOKEN_ID_MAINNET
  const networkFeeCop = isFeeCopm && maxFeeAmount ? Math.ceil(maxFeeAmount.toNumber()) : null

  // Can the wallet pay the quoted COPm (plus gas when gas is paid in COPm)?
  // Checked on the confirm step so no order is created for a deposit that
  // cannot be sent.
  let quoteBalanceIssue: BalanceIssue | null = null
  if (status === 'quote-ready' && quote) {
    if (prepareTransactionsResult && prepareTransactionsResult.type !== 'possible') {
      quoteBalanceIssue = prepareTransactionsResult.type
    } else if (copmBalance && copmBalance.isLessThan(quote.gross_amount_copm)) {
      quoteBalanceIssue = 'insufficient_balance'
    } else if (
      copmBalance &&
      networkFeeCop !== null &&
      copmBalance.isLessThan(new BigNumber(quote.gross_amount_copm).plus(networkFeeCop))
    ) {
      quoteBalanceIssue = 'need-decrease-spend-amount-for-gas'
    }
  }

  const proofIsPdf = !!proofUrl && /\.pdf(?:$|[?#])/i.test(proofUrl.url)
  const proofNotAvailable =
    proofUrlErrorCode === 'proof_not_found' || proofUrlErrorCode === 'order_not_found'

  // Deposit step state for the awaiting-deposit view.
  const depositFailed =
    depositTxStatus === 'failed' || (!!autoSendError && autoSendError !== 'chain_mismatch')
  const depositErrorText = autoSendError
    ? isBalanceIssue(autoSendError)
      ? t(BALANCE_ISSUE_COPY[autoSendError], {
          balance: formatCop(copmBalance?.toNumber() ?? 0),
        })
      : t('tucopramp.autoSendError')
    : depositTxStatus === 'failed'
      ? t(
          `tucopramp.depositTxErrors.${depositTxErrorCode ?? 'broadcast_failed'}`,
          t('tucopramp.depositTxErrors.broadcast_failed')
        )
      : null
  const progressAmountCopm = order?.gross_amount_copm ?? activeOrderDetail?.gross_amount_copm ?? 0
  // Waiting / processing view: from the local order, or (resumed past
  // AWAITING_DEPOSIT without a local copy) from the server detail.
  const showOrderProgress =
    (status === 'awaiting-deposit' && !!order) ||
    ((status === 'deposit-confirmed' || status === 'processing') &&
      (!!order || !!activeOrderDetail))

  const onRequestQuote = () => {
    if (!formValid) return
    dispatch(
      requestOfframpQuote({
        gross_amount_cop: amountNum,
        payout_method: payoutMethod,
        bank_code: payoutMethod === 'bank_account' ? bankCode : undefined,
        bank_account_type: payoutMethod === 'bank_account' ? bankAccountType : undefined,
        cedula,
        document_type: documentType,
      })
    )
  }

  const onSubmitOrder = () => {
    if (!quote || !consentAccepted) return
    // Consent breadcrumb before the order request goes out: any error event
    // that follows will carry proof of when consent was recorded.
    addConsentBreadcrumb('offramp')
    dispatch(
      submitOfframpOrder({
        body: {
          gross_amount_cop: amountNum,
          cedula,
          document_type: documentType,
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email,
          payout_method: payoutMethod,
          ...(payoutMethod === 'bank_account'
            ? {
                bank_code: bankCode,
                bank_account_type: bankAccountType,
                bank_account_number: bankAccountNumber.trim(),
              }
            : { bre_b_key: breBKey.trim() }),
          consent_accepted: true,
          quote_id: quote.quote_id,
        },
      })
    )
  }

  // Retry from the error view. Also re-checks the server for an open order:
  // if an earlier attempt did create one (e.g. a timeout on our side), the
  // check resumes it instead of letting the user create a second one.
  const onRetryAfterError = () => {
    dispatch(offrampRetryAfterError())
    dispatch(checkActiveOfframpOrder())
  }

  const onEditRequest = () => {
    setConsentAccepted(false)
    dispatch(offrampEditRequest())
  }

  const onRetryDeposit = () => {
    dispatchedSendOrderIdRef.current = null
    setAutoSendError(null)
    dispatch(offrampDepositRetry())
    setPrepareAttempt((n) => n + 1)
  }

  const onRefreshOrder = () => {
    if (trackedOrderId) {
      dispatch(pollOfframpOrder({ orderId: trackedOrderId }))
    }
  }

  const onCloseAndExit = () => {
    dispatch(stopOfframpPolling())
    dispatch(offrampReset())
    navigateBack()
  }

  const bankOptions = useMemo(
    () => (banks ?? []).map((b) => ({ value: b.code, label: b.display_name })),
    [banks]
  )

  const accountTypeOptions = useMemo(() => {
    const supported = selectedBank?.supported_account_types ?? ['savings', 'checking']
    return supported.map((v) => ({
      value: v as BankAccountType,
      label: t(`tucopramp.accountType_${v}`),
    }))
  }, [selectedBank, t])

  const documentTypeOptions = useMemo(
    () =>
      DOCUMENT_TYPES.map((v) => ({
        value: v,
        label: t(`tucopramp.documentType.${v}`),
      })),
    [t]
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hide the outer page title when the missing-multisig block is on,
            since that block already owns the H1. Prevents the double-title
            stack. */}
        {!(
          activeCheckStatus === 'done' &&
          !!activeOrderId &&
          activeOrderMissingMultisig &&
          status === 'awaiting-deposit'
        ) && <Text style={styles.title}>{t('tucopramp.offrampTitle')}</Text>}

        {/* Hold the whole screen behind a spinner while we ask the server if
            there is already an active order. Prevents the user from typing
            into a fresh form that will get rejected once we know the truth. */}
        {activeCheckStatus === 'checking' && status === 'idle' && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.helper}>{t('tucopramp.checkingActiveOrder')}</Text>
          </View>
        )}

        {/* Server has an active AWAITING_DEPOSIT order but the local slice
            was wiped so we lack the multisig_address to broadcast. Renders
            the full order detail (amount, payout, dates, reference id) so
            the user knows what is open before they contact support. */}
        {activeCheckStatus === 'done' &&
          !!activeOrderId &&
          activeOrderMissingMultisig &&
          status === 'awaiting-deposit' &&
          activeOrderDetail && (
            <View style={styles.activeOrderRoot}>
              <Text style={styles.activeOrderTitle}>{t('tucopramp.activeOrderExistsHeading')}</Text>
              <Text style={styles.activeOrderSubtitle}>
                {t('tucopramp.activeOrderMissingMultisigBody')}
              </Text>

              <View style={styles.activeOrderList}>
                <View style={styles.activeOrderInlineRow}>
                  <Text style={styles.activeOrderInlineLabel}>
                    {t('tucopramp.activeOrder.amountLabel')}
                  </Text>
                  <Text style={styles.activeOrderInlineValue}>
                    {t('tucopramp.amountPesos', {
                      amount: formatCop(activeOrderDetail.gross_amount_cop),
                    })}
                  </Text>
                </View>
                <View style={styles.activeOrderRowDivider} />
                <View style={styles.activeOrderInlineRow}>
                  <Text style={styles.activeOrderInlineLabel}>
                    {t('tucopramp.activeOrder.netReceiveLabel')}
                  </Text>
                  <Text style={styles.activeOrderInlineValue}>
                    {t('tucopramp.amountPesos', {
                      amount: formatCop(activeOrderDetail.net_amount_to_user_cop),
                    })}
                  </Text>
                </View>
                <View style={styles.activeOrderRowDivider} />

                <View style={styles.activeOrderStackedBlock}>
                  <Text style={styles.activeOrderInlineLabel}>
                    {t('tucopramp.activeOrder.destinationSection')}
                  </Text>
                  <Text style={styles.activeOrderStackedValue}>
                    {activeOrderDetail.payout?.method === 'bre_b_key'
                      ? t('tucopramp.activeOrder.payoutBreB', {
                          key: activeOrderDetail.payout.bre_b_key ?? '',
                        })
                      : t('tucopramp.activeOrder.payoutBankAccount', {
                          bank:
                            banks?.find((b) => b.code === activeOrderDetail.payout?.bank_code)
                              ?.display_name ??
                            activeOrderDetail.payout?.bank_code ??
                            '',
                          last4: activeOrderDetail.payout?.bank_account_number_last_4 ?? '',
                        })}
                  </Text>
                </View>
                <View style={styles.activeOrderRowDivider} />

                <View style={styles.activeOrderInlineRow}>
                  <Text style={styles.activeOrderInlineLabel}>
                    {t('tucopramp.activeOrder.createdLabel')}
                  </Text>
                  <Text style={styles.activeOrderInlineValue}>
                    {new Date(activeOrderDetail.created_at).toLocaleString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.activeOrderRowDivider} />
                <View style={styles.activeOrderInlineRow}>
                  <Text style={styles.activeOrderInlineLabel}>
                    {t('tucopramp.activeOrder.expiresLabel')}
                  </Text>
                  <Text style={styles.activeOrderInlineValue}>
                    {new Date(activeOrderDetail.expires_at).toLocaleString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.activeOrderRowDivider} />

                <View style={styles.activeOrderStackedBlock}>
                  <Text style={styles.activeOrderInlineLabel}>
                    {t('tucopramp.activeOrder.referenceSection')}
                  </Text>
                  <Text
                    style={styles.activeOrderReferenceValue}
                    selectable
                    testID="tucopramp-active-order-reference-id"
                  >
                    {activeOrderDetail.id}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Clipboard.setString(activeOrderDetail.id)
                      setActiveReferenceCopied(true)
                      setTimeout(() => setActiveReferenceCopied(false), 2000)
                    }}
                    testID="tucopramp-active-order-reference-copy"
                  >
                    <Text style={styles.activeOrderCopyLink}>
                      {activeReferenceCopied
                        ? t('tucopramp.activeOrder.referenceCopied')
                        : t('tucopramp.activeOrder.referenceCopy')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.activeOrderFooter}>
                <InLineNotification
                  variant={NotificationVariant.Info}
                  description={t('tucopramp.activeOrderCancelHint')}
                  style={styles.activeOrderNotice}
                  testID="tucopramp-active-order-cancel-hint"
                />
                {/* Cancel is the primary action here: the slice comment says
                    "user must cancel + retry" for this stuck state (server has
                    an AWAITING_DEPOSIT order but wallet lost the multisig, so
                    the deposit tx cannot be broadcast). Backing out only
                    without cancelling leaves the daily cap locked for 24h.
                    Never when a deposit tx exists: the pesos are on the way. */}
                {depositTxHash ? (
                  <Text style={styles.body} testID="tucopramp-offramp-active-deposit-on-the-way">
                    {t('tucopramp.depositSubmittedBody')}
                  </Text>
                ) : (
                  <Button
                    text={t('tucopramp.cancelOrderButton')}
                    onPress={() => setCancelConfirmVisible(true)}
                    size={BtnSizes.FULL}
                    type={BtnTypes.PRIMARY}
                    testID="tucopramp-offramp-active-cancel"
                  />
                )}
                <Button
                  text={t('tucopramp.backCta')}
                  onPress={onCloseAndExit}
                  size={BtnSizes.FULL}
                  type={BtnTypes.SECONDARY}
                  style={styles.cancelOrderButton}
                  testID="tucopramp-offramp-active-back"
                />
              </View>
            </View>
          )}

        {(status === 'idle' || status === 'quoting') && activeCheckStatus !== 'checking' && (
          <View>
            <Text style={styles.label}>{t('tucopramp.amountLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('tucopramp.amountPlaceholder') ?? ''}
              keyboardType="number-pad"
              value={formatAmountDigits(amount)}
              onChangeText={(v) => setAmount(sanitizeAmountDigits(v))}
              editable={status === 'idle'}
              testID="tucopramp-offramp-amount"
            />
            {amount.length === 0 || amountNum === 0 ? (
              <Text style={styles.helper}>
                {t('tucopramp.amountRange', {
                  min: formatCop(limits.min_order_cop),
                  max: formatCop(limits.max_order_cop),
                })}
              </Text>
            ) : amountNum < limits.min_order_cop ? (
              <InLineNotification
                variant={NotificationVariant.Error}
                description={t('tucopramp.amountBelowMin', {
                  min: formatCop(limits.min_order_cop),
                })}
                style={styles.amountAlert}
                testID="tucopramp-offramp-amount-below-min"
              />
            ) : amountNum > limits.max_order_cop ? (
              <InLineNotification
                variant={NotificationVariant.Error}
                description={t('tucopramp.amountAboveMax', {
                  max: formatCop(limits.max_order_cop),
                })}
                style={styles.amountAlert}
                testID="tucopramp-offramp-amount-above-max"
              />
            ) : amountAboveBalance && copmBalance ? (
              <InLineNotification
                variant={NotificationVariant.Error}
                description={t('tucopramp.balanceErrors.insufficientBalance', {
                  balance: formatCop(copmBalance.toNumber()),
                })}
                style={styles.amountAlert}
                testID="tucopramp-offramp-amount-above-balance"
              />
            ) : null}

            <Text style={styles.label}>{t('tucopramp.payoutMethodLabel')}</Text>
            <View style={styles.segmentRow}>
              <Button
                text={t('tucopramp.payoutMethod_bank_account')}
                onPress={() => setPayoutMethod('bank_account')}
                type={payoutMethod === 'bank_account' ? BtnTypes.PRIMARY : BtnTypes.SECONDARY}
                size={BtnSizes.SMALL}
                disabled={status !== 'idle'}
                testID="tucopramp-offramp-payout-bank"
              />
              <View style={styles.segmentSpacer} />
              <Button
                text={t('tucopramp.payoutMethod_bre_b_key')}
                onPress={() => setPayoutMethod('bre_b_key')}
                type={payoutMethod === 'bre_b_key' ? BtnTypes.PRIMARY : BtnTypes.SECONDARY}
                size={BtnSizes.SMALL}
                disabled={status !== 'idle'}
                testID="tucopramp-offramp-payout-breb"
              />
            </View>
            <Text style={styles.helper}>
              {payoutMethod === 'bre_b_key'
                ? t('tucopramp.payoutEta_bre_b_key')
                : t('tucopramp.payoutEta_bank_account')}
            </Text>

            {payoutMethod === 'bank_account' && (
              <View>
                <Text style={styles.label}>{t('tucopramp.bankLabel')}</Text>
                {bankOptions.length > 0 ? (
                  <TouchableOpacity
                    style={styles.pickerTouchable}
                    onPress={() => setOpenPicker('bank')}
                    testID="tucopramp-offramp-bank"
                    accessibilityRole="button"
                    disabled={status !== 'idle'}
                    accessibilityState={{ disabled: status !== 'idle' }}
                  >
                    <Text style={styles.pickerValue}>
                      {selectedBank?.display_name ?? t('tucopramp.bankPickerDefault')}
                    </Text>
                    <DownArrowIcon color={Colors.accent} strokeWidth={2} />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.helper}>{t('tucopramp.bankListLoading')}</Text>
                )}

                <Text style={styles.label}>{t('tucopramp.accountTypeLabel')}</Text>
                <TouchableOpacity
                  style={styles.pickerTouchable}
                  onPress={() => setOpenPicker('accountType')}
                  testID="tucopramp-offramp-account-type"
                  accessibilityRole="button"
                  disabled={status !== 'idle'}
                  accessibilityState={{ disabled: status !== 'idle' }}
                >
                  <Text style={styles.pickerValue}>
                    {t(`tucopramp.accountType_${bankAccountType}`)}
                  </Text>
                  <DownArrowIcon color={Colors.accent} strokeWidth={2} />
                </TouchableOpacity>

                <Text style={styles.label}>{t('tucopramp.accountNumberLabel')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('tucopramp.accountNumberPlaceholder') ?? ''}
                  keyboardType="numeric"
                  value={bankAccountNumber}
                  onChangeText={(v) =>
                    setBankAccountNumber(sanitizeDigits(v, MAX_ACCOUNT_NUMBER_LENGTH))
                  }
                  maxLength={MAX_ACCOUNT_NUMBER_LENGTH}
                  editable={status === 'idle'}
                  testID="tucopramp-offramp-account-number"
                />
                {bankAccountNumber.length > 0 && !isValidBankAccountNumber(bankAccountNumber) && (
                  <Text style={styles.helperError}>{t('tucopramp.accountNumberInvalid')}</Text>
                )}
              </View>
            )}

            {payoutMethod === 'bre_b_key' && (
              <View>
                <Text style={styles.label}>{t('tucopramp.breBKeyLabel')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('tucopramp.breBKeyPlaceholder') ?? ''}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={breBKey}
                  onChangeText={(v) => setBreBKey(v.slice(0, MAX_BREB_KEY_LENGTH))}
                  maxLength={MAX_BREB_KEY_LENGTH}
                  editable={status === 'idle'}
                  testID="tucopramp-offramp-brebkey"
                />
                <Text style={styles.helper}>{t('tucopramp.breBKeyHelp')}</Text>
                {breBKey.trim().length > 0 && !isValidBreBKey(breBKey) && (
                  <Text style={styles.helperError}>{t('tucopramp.breBKeyInvalid')}</Text>
                )}
              </View>
            )}

            <Text style={styles.label}>{t('tucopramp.firstNameLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('tucopramp.firstNamePlaceholder') ?? ''}
              autoCapitalize="words"
              autoCorrect={false}
              value={firstName}
              onChangeText={(v) => setFirstName(toTitleCase(sanitizePersonName(v)))}
              maxLength={MAX_NAME_LENGTH}
              editable={status === 'idle'}
              testID="tucopramp-offramp-firstname"
            />

            <Text style={styles.label}>{t('tucopramp.lastNameLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('tucopramp.lastNamePlaceholder') ?? ''}
              autoCapitalize="words"
              autoCorrect={false}
              value={lastName}
              onChangeText={(v) => setLastName(toTitleCase(sanitizePersonName(v)))}
              maxLength={MAX_NAME_LENGTH}
              editable={status === 'idle'}
              testID="tucopramp-offramp-lastname"
            />

            <Text style={styles.label}>{t('tucopramp.documentTypeLabel')}</Text>
            <TouchableOpacity
              style={styles.pickerTouchable}
              onPress={() => setOpenPicker('docType')}
              testID="tucopramp-offramp-doc-type-picker"
              accessibilityRole="button"
              disabled={status !== 'idle'}
              accessibilityState={{ disabled: status !== 'idle' }}
            >
              <Text style={styles.pickerValue}>{t(`tucopramp.documentType.${documentType}`)}</Text>
              <DownArrowIcon color={Colors.accent} strokeWidth={2} />
            </TouchableOpacity>

            <Text style={styles.label}>{t('tucopramp.documentValueLabel')}</Text>
            <TextInput
              style={styles.input}
              keyboardType={getDocumentKeyboardType(documentType)}
              autoCapitalize={getDocumentAutoCapitalize(documentType)}
              autoCorrect={false}
              value={cedula}
              onChangeText={(v) => setCedula(sanitizeDocument(documentType, v))}
              maxLength={MAX_DOCUMENT_LENGTH}
              editable={status === 'idle'}
              testID="tucopramp-offramp-cedula"
            />
            {cedula.length > 0 && !cedulaValid && (
              <Text style={styles.helperError}>
                {t(`tucopramp.documentInvalid.${documentType}`)}
              </Text>
            )}

            <Text style={styles.label}>{t('tucopramp.emailLabel')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              editable={status === 'idle'}
              testID="tucopramp-offramp-email"
            />
            {email.length > 0 && !emailValid && (
              <Text style={styles.helperError}>{t('tucopramp.emailInvalid')}</Text>
            )}

            {status === 'quoting' && <ActivityIndicator style={styles.spinner} />}

            {status === 'idle' && (
              <View style={styles.ctaSpacer}>
                <Button
                  text={t('tucopramp.getQuoteCta')}
                  onPress={onRequestQuote}
                  size={BtnSizes.FULL}
                  type={BtnTypes.PRIMARY}
                  disabled={!formValid}
                  testID="tucopramp-offramp-get-quote"
                />
              </View>
            )}
          </View>
        )}

        {status === 'quote-ready' && quote && (
          <View style={styles.confirmView}>
            <Text style={styles.confirmSubtitle}>{t('tucopramp.confirmSubtitle')}</Text>

            {(() => {
              // TuCOP absorbs the fee whenever the net amount the user receives
              // is greater than (gross - fee). Compute how much of the fee was
              // covered so we can render the accounting row that makes the math
              // add up: send - fee + (covered by TuCOP) = you receive.
              const coveredByTuCop = Math.max(
                0,
                quote.net_amount_to_user_cop - (amountNum - quote.fee_amount_cop)
              )
              return (
                <View style={styles.breakdownCard}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>
                      {t('tucopramp.breakdown.amountToSend')}
                    </Text>
                    <Text style={styles.breakdownValue}>
                      {t('tucopramp.amountPesos', { amount: formatCop(amountNum) })}
                    </Text>
                  </View>
                  {/* The product has no fee today: the row only shows if the
                      server ever quotes one. */}
                  {quote.fee_amount_cop > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>
                        {t('tucopramp.breakdown.offrampCommission', {
                          percent: formatPercent(
                            amountNum > 0 ? (quote.fee_amount_cop / amountNum) * 100 : 0
                          ),
                        })}
                      </Text>
                      <Text style={styles.breakdownValue}>
                        {t('tucopramp.amountPesos', { amount: formatCop(quote.fee_amount_cop) })}
                      </Text>
                    </View>
                  )}
                  {networkFeeCop !== null && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>
                        {t('tucopramp.breakdown.networkFee')}
                      </Text>
                      <Text style={styles.breakdownValue}>
                        {t('tucopramp.amountPesos', { amount: formatCop(networkFeeCop) })}
                      </Text>
                    </View>
                  )}
                  {coveredByTuCop > 0 && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>
                        {t('tucopramp.breakdown.assumedByTuCop')}
                      </Text>
                      <Text style={styles.breakdownValueNegative}>
                        {t('tucopramp.amountPesos', { amount: formatCop(-coveredByTuCop) })}
                      </Text>
                    </View>
                  )}
                  <View style={styles.breakdownDivider} />
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownTotalLabel}>
                      {t('tucopramp.breakdown.youReceive')}
                    </Text>
                    <Text style={styles.breakdownTotalValue}>
                      {t('tucopramp.amountPesos', {
                        amount: formatCop(quote.net_amount_to_user_cop),
                      })}
                    </Text>
                  </View>
                  {quote.fee_amount_cop === 0 && (
                    <Text style={styles.noFeeNote} testID="tucopramp-offramp-no-fee">
                      {t('tucopramp.noFee')}
                    </Text>
                  )}
                </View>
              )
            })()}

            <Text style={styles.helper} testID="tucopramp-offramp-remaining-limits">
              {t('tucopramp.remainingLimits', {
                daily: formatCop(quote.remaining_daily_cop),
                monthly: formatCop(quote.remaining_monthly_cop),
              })}
            </Text>

            {!!quoteBalanceIssue && (
              <InLineNotification
                variant={NotificationVariant.Error}
                description={t(BALANCE_ISSUE_COPY[quoteBalanceIssue], {
                  balance: formatCop(copmBalance?.toNumber() ?? 0),
                })}
                style={styles.amountAlert}
                testID="tucopramp-offramp-quote-balance-error"
              />
            )}

            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => setConsentAccepted((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consentAccepted }}
              testID="tucopramp-offramp-consent"
            >
              <View
                style={[styles.consentCheckbox, consentAccepted && styles.consentCheckboxChecked]}
              >
                {consentAccepted && <Text style={styles.consentCheckmark}>✓</Text>}
              </View>
              <View style={styles.consentTextBlock}>
                <Text style={styles.consentLabel}>{t('tucopramp.consent.label')}</Text>
                <Text
                  style={styles.consentLink}
                  onPress={() =>
                    Linking.openURL(TUCOPRAMP_TERMS_URL).catch(() => {
                      Logger.warn('tucopramp/terms-link', 'Failed to open the terms URL')
                    })
                  }
                >
                  {t('tucopramp.consent.linkText')}
                </Text>
              </View>
            </TouchableOpacity>
            <Button
              text={t('tucopramp.confirmSendCta')}
              onPress={onSubmitOrder}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              disabled={!consentAccepted || !!quoteBalanceIssue}
              testID="tucopramp-offramp-confirm"
              style={styles.confirmCta}
            />
            <Button
              text={t('tucopramp.editCta')}
              onPress={onEditRequest}
              size={BtnSizes.FULL}
              type={BtnTypes.SECONDARY}
              testID="tucopramp-offramp-edit"
              style={styles.confirmCta}
            />
          </View>
        )}

        {status === 'creating-order' && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.helper}>{t('tucopramp.creatingOrder')}</Text>
          </View>
        )}

        {showOrderProgress && (
          <View>
            <Text style={styles.statusHeading} testID="tucopramp-offramp-status-heading">
              {status !== 'awaiting-deposit'
                ? t('tucopramp.processingHeading')
                : depositFailed
                  ? t('tucopramp.depositFailedHeading')
                  : depositTxStatus === 'submitting'
                    ? t('tucopramp.sendingDepositHeading')
                    : depositTxHash
                      ? t('tucopramp.depositSubmittedHeading')
                      : t('tucopramp.preparingDepositHeading')}
            </Text>
            <Text style={styles.body} testID="tucopramp-offramp-status-body">
              {status !== 'awaiting-deposit'
                ? t('tucopramp.processingBody')
                : depositFailed
                  ? t('tucopramp.depositFailedBody')
                  : depositTxStatus === 'submitting'
                    ? t('tucopramp.sendingDepositBody', {
                        amount: formatCop(progressAmountCopm),
                      })
                    : depositTxHash
                      ? t('tucopramp.depositSubmittedBody')
                      : t('tucopramp.preparingDepositBody', {
                          amount: formatCop(progressAmountCopm),
                        })}
            </Text>
            {!depositFailed && autoSendError !== 'chain_mismatch' && (
              <ActivityIndicator style={styles.spinner} />
            )}
            {!!depositTxHash && (
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(`https://celoscan.io/tx/${depositTxHash}`).catch(() => {
                    Logger.warn(
                      'tucopramp/deposit-hash-link',
                      `Failed to open Celoscan for ${depositTxHash}`
                    )
                  })
                }
                style={styles.txHashRow}
                testID="tucopramp-offramp-deposit-tx-hash"
              >
                <Text style={styles.txHashLabel}>{t('tucopramp.depositTxLabel')}</Text>
                <Text style={styles.txHashValue} numberOfLines={1} ellipsizeMode="middle">
                  {depositTxHash}
                </Text>
                <Text style={styles.txHashLink}>{t('tucopramp.viewOnCeloscan')}</Text>
              </TouchableOpacity>
            )}
            {status === 'awaiting-deposit' && autoSendError === 'chain_mismatch' && (
              <InLineNotification
                variant={NotificationVariant.Error}
                description={t('tucopramp.autoSendError')}
                style={styles.amountAlert}
                testID="tucopramp-offramp-auto-send-error"
              />
            )}
            {status === 'awaiting-deposit' && depositFailed && !!depositErrorText && (
              <InLineNotification
                variant={NotificationVariant.Error}
                description={depositErrorText}
                style={styles.amountAlert}
                testID="tucopramp-offramp-deposit-tx-error"
              />
            )}
            {status === 'awaiting-deposit' && depositFailed && (
              <Button
                text={t('tucopramp.retryDepositCta')}
                onPress={onRetryDeposit}
                type={BtnTypes.PRIMARY}
                size={BtnSizes.FULL}
                style={styles.cancelOrderButton}
                testID="tucopramp-offramp-retry-deposit"
              />
            )}
            {/* Cancel escape hatch: only while no deposit is on its way (never
                sent, or failed). Once a tx is broadcast the server may confirm
                any second; hiding the button avoids users racing their own
                money into a 409. Always the secondary action. */}
            {status === 'awaiting-deposit' &&
              (depositFailed || (depositTxStatus === 'idle' && !depositTxHash)) && (
                <Button
                  text={t('tucopramp.cancelOrderButton')}
                  onPress={() => setCancelConfirmVisible(true)}
                  type={BtnTypes.SECONDARY}
                  size={BtnSizes.FULL}
                  style={styles.cancelOrderButton}
                  testID="tucopramp-offramp-cancel-order-button"
                />
              )}
          </View>
        )}

        {status === 'cancelling' && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.helper}>{t('tucopramp.cancelling')}</Text>
          </View>
        )}

        {(status === 'completed' ||
          status === 'cancelled' ||
          status === 'expired' ||
          status === 'refunded' ||
          status === 'refund-owed') && (
          <View style={styles.centered}>
            <Text style={styles.statusHeading}>
              {status === 'completed'
                ? t('tucopramp.completed')
                : status === 'refunded'
                  ? t('tucopramp.refunded')
                  : status === 'refund-owed'
                    ? t('tucopramp.refundOwed')
                    : status === 'expired'
                      ? t('tucopramp.expired')
                      : t('tucopramp.cancelled')}
            </Text>

            {/* Terminal-state body explains what just happened and what the
                user can do next. Kept per-state because "cancelaste" reads
                very different from "se vencio" or "recibiras reembolso". */}
            {status !== 'completed' && (
              <Text style={styles.terminalBody}>
                {status === 'refunded'
                  ? t('tucopramp.refundedBody')
                  : status === 'refund-owed'
                    ? t('tucopramp.refundOwedBody')
                    : status === 'expired'
                      ? t('tucopramp.expiredBody')
                      : t('tucopramp.cancelledBody')}
              </Text>
            )}

            {status === 'completed' && (
              <View style={styles.proofBlock}>
                <Text style={styles.proofTitle}>{t('tucopramp.offramp.completed.proofTitle')}</Text>
                {proofUrlLoading && (
                  <View style={styles.proofLoadingRow}>
                    <ActivityIndicator />
                    <Text style={styles.helper}>
                      {t('tucopramp.offramp.completed.proofLoading')}
                    </Text>
                  </View>
                )}
                {!!proofUrl &&
                  !proofUrlLoading &&
                  (proofIsPdf || proofImageFailed ? (
                    // PDFs (and anything the Image component cannot decode)
                    // open outside the app instead of rendering an empty box.
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(proofUrl.url).catch(() => {
                          Logger.warn('tucopramp/proof-link', 'Failed to open the payout receipt')
                        })
                      }
                      accessibilityRole="link"
                      testID="tucopramp-offramp-proof-link"
                    >
                      <Text style={styles.txHashLink}>
                        {t('tucopramp.offramp.completed.viewProof')}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Image
                      source={{ uri: proofUrl.url }}
                      style={styles.proofImage}
                      resizeMode="contain"
                      onError={() => setProofImageFailed(true)}
                      testID="tucopramp-offramp-proof-image"
                    />
                  ))}
                {/* 404 proof_not_found / order_not_found: Ops has not
                    attached a receipt (yet). Not an error. Only real errors
                    (network, proxy_disabled, etc.) surface as such. */}
                {!!proofUrlErrorCode && !proofUrlLoading && (
                  <Text
                    style={proofNotAvailable ? styles.helper : styles.proofError}
                    testID="tucopramp-offramp-proof-status"
                  >
                    {proofNotAvailable
                      ? t('tucopramp.offramp.completed.proofNotYet')
                      : t('tucopramp.offramp.completed.proofError')}
                  </Text>
                )}
              </View>
            )}

            <Button
              text={t('tucopramp.closeCta')}
              onPress={onCloseAndExit}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              testID="tucopramp-offramp-close"
            />
          </View>
        )}

        {status === 'poll-timeout' && (
          <View style={styles.centered}>
            <Text style={styles.statusHeading}>{t('tucopramp.pollTimeout.heading')}</Text>
            <Text style={styles.terminalBody} testID="tucopramp-offramp-poll-timeout-body">
              {t('tucopramp.pollTimeout.body')}
            </Text>
            <Button
              text={t('tucopramp.pollTimeout.refreshCta')}
              onPress={onRefreshOrder}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              testID="tucopramp-offramp-poll-refresh"
            />
            <Button
              text={t('tucopramp.closeCta')}
              onPress={onCloseAndExit}
              size={BtnSizes.FULL}
              type={BtnTypes.SECONDARY}
              style={styles.cancelOrderButton}
              testID="tucopramp-offramp-poll-close"
            />
          </View>
        )}

        {status === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorHeading}>{t('tucopramp.errorHeading')}</Text>
            <Text style={styles.body} testID="tucopramp-offramp-error-body">
              {t(errorMessageKey(errorCode), { defaultValue: t('tucopramp.errors.unknown') })}
            </Text>
            {errorCode === 'amount_limit_exceeded' && (
              <Text style={styles.terminalBody} testID="tucopramp-offramp-error-limits">
                {errorRemainingDaily !== null || errorRemainingMonthly !== null
                  ? t('tucopramp.remainingLimits', {
                      daily: formatCop(errorRemainingDaily ?? limits.max_daily_cop),
                      monthly: formatCop(errorRemainingMonthly ?? limits.max_monthly_cop),
                    })
                  : t('tucopramp.limitsSummary', {
                      daily: formatCop(limits.max_daily_cop),
                      monthly: formatCop(limits.max_monthly_cop),
                    })}
              </Text>
            )}
            <ErrorFooter
              errorCode={errorCode}
              retryAfterSeconds={errorRetryAfterSeconds}
              requestId={errorRequestId}
              onRetry={onRetryAfterError}
              retryButtonTestId="tucopramp-offramp-retry"
            />
          </View>
        )}
      </ScrollView>

      <PickerModal
        visible={openPicker === 'bank'}
        title={t('tucopramp.bankPickerTitle')}
        options={bankOptions}
        selectedValue={bankCode}
        testIdPrefix="tucopramp-offramp-bank-option"
        searchable
        searchPlaceholder={t('tucopramp.bankPickerSearchPlaceholder') ?? ''}
        noResultsText={t('tucopramp.bankPickerNoResults') ?? ''}
        onClose={() => setOpenPicker(null)}
        onSelect={(value) => {
          setBankCode(value)
          const bank = banks?.find((b) => b.code === value)
          const supported = bank?.supported_account_types ?? []
          if (!supported.includes(bankAccountType) && supported.length > 0) {
            setBankAccountType(supported[0] as BankAccountType)
          }
        }}
      />

      <PickerModal<BankAccountType>
        visible={openPicker === 'accountType'}
        title={t('tucopramp.accountTypePickerTitle')}
        options={accountTypeOptions}
        selectedValue={bankAccountType}
        testIdPrefix="tucopramp-offramp-account-type-option"
        onClose={() => setOpenPicker(null)}
        onSelect={setBankAccountType}
      />

      <PickerModal<DocumentType>
        visible={openPicker === 'docType'}
        title={t('tucopramp.documentType.pickerTitle')}
        options={documentTypeOptions}
        selectedValue={documentType}
        testIdPrefix="tucopramp-offramp-doc-type-option"
        onClose={() => setOpenPicker(null)}
        onSelect={(v) => {
          setDocumentType(v)
          // Re-sanitize the current value against the new type's rules so a
          // CC "12345" that was OK becomes empty when the user switches to
          // NUIP (which requires exactly 10 digits) or to PAS (which needs
          // alphanumeric). Prevents a submit body with a mismatched
          // (type, cedula) pair that would 400 on the server.
          setCedula(sanitizeDocument(v, cedula))
        }}
      />

      <Dialog
        isVisible={cancelConfirmVisible}
        title={t('tucopramp.cancelConfirmTitle')}
        actionText={t('tucopramp.cancelConfirmYes') ?? ''}
        actionPress={() => {
          setCancelConfirmVisible(false)
          // Two entry points can open this dialog:
          //   1) awaiting-deposit block with the freshly-created `order` in
          //      slice state (normal happy path after createOfframpOrder).
          //   2) activeOrderMissingMultisig block where the slice only holds
          //      `activeOrderDetail` from checkActiveOfframpOrder (recovering
          //      a server-side order after cold boot / reinstall).
          // Prefer the fresh order if present, fall back to the recovered id.
          const orderId = order?.order_id ?? activeOrderDetail?.id
          if (orderId) {
            dispatch(cancelOfframpOrder({ orderId }))
          }
        }}
        secondaryActionText={t('tucopramp.cancelConfirmNo') ?? ''}
        secondaryActionPress={() => setCancelConfirmVisible(false)}
        onBackgroundPress={() => setCancelConfirmVisible(false)}
        testID="tucopramp-offramp-cancel-confirm"
      >
        {t('tucopramp.cancelConfirmBody')}
      </Dialog>
    </SafeAreaView>
  )
}

// Platform-native monospace stack for the reference id in the active-order
// card. iOS ships Menlo, Android maps 'monospace' to Droid Sans Mono. Falling
// back to the OS default is more consistent than shipping a bundled font.
const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: Spacing.Thick24 },
  title: { ...typeScale.titleMedium, color: Colors.black, marginBottom: Spacing.Regular16 },
  label: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.gray4,
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Smallest8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    padding: Spacing.Small12,
    ...typeScale.bodyMedium,
    color: Colors.black,
    minHeight: 44,
  },
  helper: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Smallest8,
  },
  amountAlert: {
    marginTop: Spacing.Smallest8,
    marginBottom: Spacing.Smallest8,
  },
  activeOrderRoot: {},
  activeOrderTitle: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  activeOrderSubtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    marginBottom: Spacing.Regular16,
  },
  activeOrderList: {
    marginBottom: Spacing.Regular16,
  },
  activeOrderInlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.Small12,
    gap: Spacing.Regular16,
  },
  activeOrderInlineLabel: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
  activeOrderInlineValue: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
    textAlign: 'right',
    flexShrink: 1,
  },
  activeOrderStackedBlock: {
    paddingVertical: Spacing.Small12,
  },
  activeOrderStackedValue: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
    marginTop: Spacing.Tiny4,
  },
  activeOrderRowDivider: {
    height: 1,
    backgroundColor: Colors.gray2,
  },
  activeOrderReferenceValue: {
    ...typeScale.bodySmall,
    color: Colors.black,
    fontFamily: MONO_FONT,
    marginTop: Spacing.Tiny4,
    marginBottom: Spacing.Smallest8,
  },
  activeOrderCopyLink: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.primary,
  },
  activeOrderFooter: {
    marginTop: Spacing.Regular16,
  },
  activeOrderNotice: {
    marginBottom: Spacing.Regular16,
  },
  helperError: {
    ...typeScale.bodySmall,
    color: Colors.errorDark,
    marginTop: Spacing.Smallest8,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentSpacer: {
    width: Spacing.Small12,
  },
  spinner: { marginVertical: Spacing.Thick24 },
  ctaSpacer: { marginTop: Spacing.Thick24 },
  centered: { alignItems: 'center', paddingVertical: Spacing.Thick24 },
  cancelOrderButton: { marginTop: Spacing.Thick24 },
  txHashRow: {
    backgroundColor: Colors.gray1,
    borderRadius: Spacing.Small12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
  },
  txHashLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginBottom: Spacing.Tiny4,
  },
  txHashValue: {
    ...typeScale.bodySmall,
    color: Colors.black,
    marginBottom: Spacing.Tiny4,
  },
  txHashLink: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.primary,
  },
  statusHeading: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Regular16,
    textAlign: 'center',
  },
  errorHeading: {
    ...typeScale.titleMedium,
    color: Colors.errorDark,
    marginBottom: Spacing.Regular16,
    textAlign: 'center',
  },
  terminalBody: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    textAlign: 'center',
    marginBottom: Spacing.Thick24,
    paddingHorizontal: Spacing.Regular16,
  },
  body: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    textAlign: 'center',
    marginBottom: Spacing.Regular16,
  },
  proofBlock: {
    alignSelf: 'stretch',
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    padding: Spacing.Regular16,
    borderRadius: 12,
    backgroundColor: Colors.gray1,
  },
  proofTitle: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
  proofImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 8,
    backgroundColor: Colors.gray2,
  },
  proofLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.Regular16,
  },
  proofError: {
    ...typeScale.bodySmall,
    color: Colors.errorDark,
    textAlign: 'center',
    marginTop: Spacing.Smallest8,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
  },
  consentCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.gray4,
    marginRight: Spacing.Smallest8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentCheckboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  consentCheckmark: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.white,
  },
  consentTextBlock: {
    flex: 1,
  },
  consentLabel: {
    ...typeScale.bodySmall,
    color: Colors.black,
  },
  consentLink: {
    ...typeScale.bodySmall,
    color: Colors.primary,
    marginTop: Spacing.Tiny4,
    textDecorationLine: 'underline',
  },
  confirmView: {
    marginTop: Spacing.Thick24,
  },
  confirmSubtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    marginBottom: Spacing.Regular16,
  },
  breakdownCard: {
    backgroundColor: Colors.gray1,
    borderRadius: Spacing.Small12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.Smallest8,
  },
  breakdownLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    flex: 1,
    marginRight: Spacing.Small12,
  },
  breakdownValue: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  breakdownValueNegative: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.errorDark,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: Colors.gray2,
    marginVertical: Spacing.Smallest8,
  },
  breakdownTotalLabel: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
    flex: 1,
    marginRight: Spacing.Small12,
  },
  breakdownTotalValue: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.primary,
  },
  noFeeNote: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.successDark,
    marginTop: Spacing.Smallest8,
  },
  confirmCta: {
    marginTop: Spacing.Regular16,
  },
  pickerTouchable: {
    padding: Spacing.Small12,
    borderColor: Colors.gray2,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  pickerValue: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    flexShrink: 1,
  },
})

export default TuCOPRampOfframpFlow
