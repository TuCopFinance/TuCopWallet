import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  AppState,
  Linking,
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
import { launchImageLibrary } from 'react-native-image-picker'
import type { ImagePickerResponse } from 'react-native-image-picker'
import DownArrowIcon from 'src/icons/navigation/DownArrowIcon'
import { navigateBack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { addConsentBreadcrumb } from 'src/tucopramp/consentBreadcrumb'
import ErrorFooter from 'src/tucopramp/ErrorFooter'
import { errorMessageKey } from 'src/tucopramp/errorCopy'
import { formatCop } from 'src/tucopramp/format'
import {
  DOCUMENT_TYPES,
  DocumentType,
  MAX_DOCUMENT_LENGTH,
  getDocumentAutoCapitalize,
  getDocumentKeyboardType,
  isValidDocument,
  sanitizeDocument,
} from 'src/tucopramp/limits'
import { PickerModal } from 'src/tucopramp/PickerModal'
import { toTitleCase } from 'src/tucopramp/nameFormat'
import {
  MAX_NAME_LENGTH,
  formatAmountDigits,
  isValidEmail,
  parseAmountDigits,
  sanitizeAmountDigits,
  sanitizePersonName,
} from 'src/tucopramp/validation'
import {
  cancelOnrampOrder,
  checkActiveOnrampOrder,
  fetchReceivingAccount,
  fetchUserProfile,
  pollOnrampOrder,
  requestOnrampQuote,
  stopOnrampPolling,
  submitOnrampOrder,
  uploadOnrampProof,
} from 'src/tucopramp/saga'
import {
  effectiveLimitsSelector,
  onrampActiveCheckStatusSelector,
  onrampCurrentOrderSelector,
  onrampErrorCodeSelector,
  onrampErrorRemainingDailySelector,
  onrampErrorRemainingMonthlySelector,
  onrampErrorRequestIdSelector,
  onrampErrorRetryAfterSecondsSelector,
  onrampLastQuoteSelector,
  onrampProofRejectedForRetrySelector,
  onrampProofUploadErrorCodeSelector,
  onrampStatusSelector,
  receivingAccountSelector,
} from 'src/tucopramp/selectors'
import {
  onrampEditRequest,
  onrampProofUploadFailed,
  onrampReset,
  onrampRetryAfterError,
} from 'src/tucopramp/slice'
import Logger from 'src/utils/Logger'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.TuCOPRampOnrampFlow>

// Legal terms URL (see TuCOPRampOfframpFlow for context). Kept as separate
// constants per file to keep the flows self-contained; if Legal publishes
// a TuCOPRamp-specific URL, update both in the same commit.
const TUCOPRAMP_TERMS_URL = 'https://tucop.xyz/terminos-y-condiciones/'

const TAG = 'tucopramp/OnrampFlow'

// react-native-image-picker MIME whitelist for the Bre-B receipt. The server
// also accepts PDF (proof_invalid_type otherwise), but the wallet has no
// document picker dependency, so receipts are PNG / JPEG images only and the
// proof_invalid_type copy says so.
const ALLOWED_PROOF_MIME = ['image/png', 'image/jpeg', 'image/jpg']
// Server cap (proof_too_large). Checked before uploading to save the trip.
const MAX_PROOF_BYTES = 10 * 1024 * 1024

// Statuses with an open order the poller follows (also during the upload
// step, so an order that expires or is cancelled by an operator is noticed
// before a late upload).
const POLLED_STATUSES = ['awaiting-proof-upload', 'uploading-proof', 'awaiting-review', 'verifying']

function proofFileName(uri: string, type: string): string {
  const fromUri = uri.split('?')[0].split('/').pop()
  if (fromUri && /\.[a-z0-9]+$/i.test(fromUri)) return fromUri
  return `comprobante.${type === 'image/png' ? 'png' : 'jpg'}`
}

function TuCOPRampOnrampFlow(_props: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const status = useSelector(onrampStatusSelector)
  const account = useSelector(receivingAccountSelector)
  const quote = useSelector(onrampLastQuoteSelector)
  const order = useSelector(onrampCurrentOrderSelector)
  const errorCode = useSelector(onrampErrorCodeSelector)
  const errorRetryAfterSeconds = useSelector(onrampErrorRetryAfterSecondsSelector)
  const errorRequestId = useSelector(onrampErrorRequestIdSelector)
  const errorRemainingDaily = useSelector(onrampErrorRemainingDailySelector)
  const errorRemainingMonthly = useSelector(onrampErrorRemainingMonthlySelector)
  const proofRejectedForRetry = useSelector(onrampProofRejectedForRetrySelector)
  const proofUploadErrorCode = useSelector(onrampProofUploadErrorCodeSelector)
  const activeCheckStatus = useSelector(onrampActiveCheckStatusSelector)
  const limits = useSelector(effectiveLimitsSelector)

  // `amount` holds digits only; the input renders it with es-CO dots.
  const [amount, setAmount] = useState('')
  const [documentType, setDocumentType] = useState<DocumentType>('CC')
  const [cedula, setCedula] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false)
  const [docTypePickerOpen, setDocTypePickerOpen] = useState<boolean>(false)
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState<boolean>(false)

  const orderId = order?.order_id ?? null
  const pollActive = POLLED_STATUSES.includes(status)

  useEffect(() => {
    // Defensive: the on-ramp entry in WithdrawSpend is already gated on
    // SHOW_TUCOPRAMP_ONRAMP, but a deep link or test harness could land here
    // with the gate OFF. Redirect back without dispatching so no traffic
    // reaches Ramp for a feature that is not enabled for this user cohort.
    if (!getFeatureGate(StatsigFeatureGates.SHOW_TUCOPRAMP_ONRAMP)) {
      navigateBack()
      return
    }
    dispatch(fetchReceivingAccount())
    dispatch(fetchUserProfile())
    // Resume an open on-ramp order (the user may have paid already) instead
    // of offering a fresh form.
    dispatch(checkActiveOnrampOrder())
    return () => {
      dispatch(stopOnrampPolling())
      dispatch(onrampReset())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One poller per open order, keyed on the order id + "is open" so moving
  // between open statuses does not restart it (rejection detection relies on
  // the poller seeing consecutive server statuses). Stopped on close.
  useEffect(() => {
    if (pollActive && orderId) {
      dispatch(pollOnrampOrder({ orderId }))
    }
  }, [pollActive, orderId, dispatch])

  // Re-poll right away when the app returns to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && orderId && (pollActive || status === 'poll-timeout')) {
        dispatch(pollOnrampOrder({ orderId }))
      }
    })
    return () => subscription.remove()
  }, [pollActive, status, orderId, dispatch])

  const amountNum = useMemo(() => parseAmountDigits(amount), [amount])
  const amountValid = amountNum >= limits.min_order_cop && amountNum <= limits.max_order_cop
  const firstNameValid = firstName.trim().length > 0
  const lastNameValid = lastName.trim().length > 0
  const cedulaValid = isValidDocument(documentType, cedula)
  const emailValid = isValidEmail(email)
  const formValid = amountValid && cedulaValid && emailValid && firstNameValid && lastNameValid

  const onRequestQuote = () => {
    if (!formValid) return
    dispatch(
      requestOnrampQuote({ gross_amount_cop: amountNum, cedula, document_type: documentType })
    )
  }

  const onSubmitOrder = () => {
    if (!quote || !consentAccepted) return
    addConsentBreadcrumb('onramp')
    dispatch(
      submitOnrampOrder({
        body: {
          gross_amount_cop: amountNum,
          document_type: documentType,
          cedula,
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email,
          consent_accepted: true,
          quote_id: quote.quote_id,
        },
      })
    )
  }

  // Every failure here stays on the upload step as an inline error: the
  // order is open and the user may have paid already.
  const onUploadProof = async () => {
    if (!order?.order_id) return
    let response: ImagePickerResponse
    try {
      response = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: false,
        selectionLimit: 1,
        // presentationStyle is iOS-only; leaves default on Android.
        presentationStyle: 'formSheet',
      })
    } catch (err) {
      Logger.warn(TAG, 'launchImageLibrary threw', err)
      dispatch(onrampProofUploadFailed({ code: 'proof_picker_failed' }))
      return
    }
    if (response.didCancel) return
    if (response.errorCode) {
      Logger.warn(TAG, `image picker failed: ${response.errorCode}`)
      dispatch(
        onrampProofUploadFailed({
          code:
            response.errorCode === 'permission' ? 'proof_picker_permission' : 'proof_picker_failed',
        })
      )
      return
    }
    const asset = response.assets?.[0]
    if (!asset?.uri || !asset.type) {
      Logger.warn(TAG, 'image picker returned incomplete asset')
      dispatch(onrampProofUploadFailed({ code: 'proof_picker_failed' }))
      return
    }
    if (!ALLOWED_PROOF_MIME.includes(asset.type)) {
      // Server would also reject with proof_invalid_type; this saves the trip.
      dispatch(onrampProofUploadFailed({ code: 'proof_invalid_type' }))
      return
    }
    if (asset.fileSize !== undefined && asset.fileSize > MAX_PROOF_BYTES) {
      dispatch(onrampProofUploadFailed({ code: 'proof_too_large' }))
      return
    }
    dispatch(
      uploadOnrampProof({
        orderId: order.order_id,
        file: {
          uri: asset.uri,
          // Some Android pickers omit fileName; derive one from the uri.
          name: asset.fileName ?? proofFileName(asset.uri, asset.type),
          type: asset.type,
        },
      })
    )
  }

  const onCloseAndExit = () => {
    dispatch(stopOnrampPolling())
    dispatch(onrampReset())
    navigateBack()
  }

  // Retry from the error view; also re-checks the server for an open order
  // an earlier (timed-out) attempt may have created.
  const onRetryAfterError = () => {
    dispatch(onrampRetryAfterError())
    dispatch(checkActiveOnrampOrder())
  }

  const onEditRequest = () => {
    setConsentAccepted(false)
    dispatch(onrampEditRequest())
  }

  const onRefreshOrder = () => {
    if (orderId) {
      dispatch(pollOnrampOrder({ orderId }))
    }
  }

  const documentTypeOptions = useMemo(
    () =>
      DOCUMENT_TYPES.map((v) => ({
        value: v,
        label: t(`tucopramp.documentType.${v}`),
      })),
    [t]
  )

  const showForm =
    (status === 'idle' || status === 'quoting' || status === 'quote-ready') &&
    !(status === 'idle' && activeCheckStatus === 'checking')

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('tucopramp.onrampTitle')}</Text>

        {status === 'idle' && activeCheckStatus === 'checking' && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.helper}>{t('tucopramp.checkingActiveOrder')}</Text>
          </View>
        )}

        {showForm && (
          <View>
            {account && (
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>{t('tucopramp.receivingAccountLabel')}</Text>
                <Text style={styles.infoValue}>{account.bre_b_key}</Text>
              </View>
            )}

            <Text style={styles.label}>{t('tucopramp.amountLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('tucopramp.amountPlaceholder') ?? ''}
              keyboardType="number-pad"
              value={formatAmountDigits(amount)}
              onChangeText={(v) => setAmount(sanitizeAmountDigits(v))}
              editable={status === 'idle'}
              testID="tucopramp-onramp-amount"
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
                testID="tucopramp-onramp-amount-below-min"
              />
            ) : amountNum > limits.max_order_cop ? (
              <InLineNotification
                variant={NotificationVariant.Error}
                description={t('tucopramp.amountAboveMax', {
                  max: formatCop(limits.max_order_cop),
                })}
                style={styles.amountAlert}
                testID="tucopramp-onramp-amount-above-max"
              />
            ) : null}

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
              testID="tucopramp-onramp-firstname"
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
              testID="tucopramp-onramp-lastname"
            />

            <Text style={styles.label}>{t('tucopramp.documentTypeLabel')}</Text>
            <TouchableOpacity
              style={styles.pickerTouchable}
              onPress={() => setDocTypePickerOpen(true)}
              testID="tucopramp-onramp-doc-type-picker"
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
              testID="tucopramp-onramp-cedula"
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
              testID="tucopramp-onramp-email"
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
                  testID="tucopramp-onramp-get-quote"
                />
              </View>
            )}

            {status === 'quote-ready' && quote && (
              <View style={styles.quoteBox}>
                <Text style={styles.quoteLabel}>{t('tucopramp.quoteReceivedLabel')}</Text>
                <Text style={styles.quoteAmount} testID="tucopramp-onramp-quote-amount">
                  {t('tucopramp.amountDigitalPesos', {
                    amount: formatCop(quote.gross_amount_copm),
                  })}
                </Text>
                {quote.fee_amount_cop > 0 ? (
                  <Text style={styles.quoteFee}>
                    {t('tucopramp.quoteFee', { fee: formatCop(quote.fee_amount_cop) })}
                  </Text>
                ) : (
                  <Text style={styles.noFeeNote} testID="tucopramp-onramp-no-fee">
                    {t('tucopramp.noFee')}
                  </Text>
                )}
                <Text style={styles.quoteFee} testID="tucopramp-onramp-remaining-limits">
                  {t('tucopramp.remainingLimits', {
                    daily: formatCop(quote.remaining_daily_cop),
                    monthly: formatCop(quote.remaining_monthly_cop),
                  })}
                </Text>
                <TouchableOpacity
                  style={styles.consentRow}
                  onPress={() => setConsentAccepted((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consentAccepted }}
                  testID="tucopramp-onramp-consent"
                >
                  <View
                    style={[
                      styles.consentCheckbox,
                      consentAccepted && styles.consentCheckboxChecked,
                    ]}
                  >
                    {consentAccepted && <Text style={styles.consentCheckmark}>✓</Text>}
                  </View>
                  <View style={styles.consentTextBlock}>
                    <Text style={styles.consentLabel}>{t('tucopramp.consent.label')}</Text>
                    <Text
                      style={styles.consentLink}
                      onPress={() =>
                        Linking.openURL(TUCOPRAMP_TERMS_URL).catch(() => {
                          Logger.warn(TAG, 'Failed to open the terms URL')
                        })
                      }
                    >
                      {t('tucopramp.consent.linkText')}
                    </Text>
                  </View>
                </TouchableOpacity>
                <Button
                  text={t('tucopramp.confirmCreateOrderCta')}
                  onPress={onSubmitOrder}
                  size={BtnSizes.FULL}
                  type={BtnTypes.PRIMARY}
                  disabled={!consentAccepted}
                  testID="tucopramp-onramp-create-order"
                />
                <Button
                  text={t('tucopramp.editCta')}
                  onPress={onEditRequest}
                  size={BtnSizes.FULL}
                  type={BtnTypes.SECONDARY}
                  style={styles.cancelOrderButton}
                  testID="tucopramp-onramp-edit"
                />
              </View>
            )}
          </View>
        )}

        {status === 'creating-order' && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.helper}>{t('tucopramp.creatingOrder')}</Text>
          </View>
        )}

        {status === 'awaiting-proof-upload' && order && (
          <View>
            {proofRejectedForRetry && (
              <View style={styles.rejectionBanner} testID="tucopramp-onramp-proof-rejected-banner">
                <Text style={styles.rejectionBannerTitle}>
                  {t('tucopramp.proofRejectedForRetryTitle')}
                </Text>
                <Text style={styles.rejectionBannerBody}>
                  {t('tucopramp.proofRejectedForRetryBody')}
                </Text>
              </View>
            )}
            <Text style={styles.statusHeading}>{t('tucopramp.awaitingProofHeading')}</Text>
            {!!order.receiving_account.bre_b_key && (
              <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>{t('tucopramp.transferToLabel')}</Text>
                <Text style={styles.infoValue} selectable testID="tucopramp-onramp-transfer-to">
                  {order.receiving_account.bre_b_key}
                </Text>
              </View>
            )}
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>{t('tucopramp.transferAmountLabel')}</Text>
              <Text style={styles.infoValue} testID="tucopramp-onramp-transfer-amount">
                {t('tucopramp.amountPesos', { amount: formatCop(order.gross_amount_cop) })}
              </Text>
            </View>
            {!!order.instructions && <Text style={styles.body}>{order.instructions}</Text>}
            {!!proofUploadErrorCode && (
              <InLineNotification
                variant={NotificationVariant.Error}
                description={t(errorMessageKey(proofUploadErrorCode), {
                  defaultValue: t('tucopramp.errors.proof_upload_failed'),
                })}
                style={styles.amountAlert}
                testID="tucopramp-onramp-upload-error"
              />
            )}
            <Button
              text={
                proofUploadErrorCode ? t('tucopramp.retryUploadCta') : t('tucopramp.uploadProofCta')
              }
              onPress={onUploadProof}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              testID="tucopramp-onramp-upload-proof"
            />
            {/* Cancel escape hatch: on-ramp is cancelable only while status ===
                AWAITING_PROOF. Server returns 409 order_not_cancelable if the
                proof already uploaded and moved to AWAITING_REVIEW; the saga
                treats that as a race and resumes the poll. */}
            <Button
              text={t('tucopramp.cancelOrderButton')}
              onPress={() => setCancelConfirmVisible(true)}
              size={BtnSizes.FULL}
              type={BtnTypes.SECONDARY}
              style={styles.cancelOrderButton}
              testID="tucopramp-onramp-cancel-order-button"
            />
          </View>
        )}

        {status === 'cancelling' && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.helper}>{t('tucopramp.cancelling')}</Text>
          </View>
        )}

        {status === 'uploading-proof' && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.helper}>{t('tucopramp.uploadingProof')}</Text>
          </View>
        )}

        {(status === 'awaiting-review' || status === 'verifying') && (
          <View style={styles.centered}>
            <Text style={styles.statusHeading}>
              {status === 'verifying'
                ? t('tucopramp.verifyingHeading')
                : t('tucopramp.awaitingReviewHeading')}
            </Text>
            <Text style={styles.body}>
              {status === 'verifying'
                ? t('tucopramp.verifyingBody')
                : t('tucopramp.awaitingReviewBody')}
            </Text>
            <ActivityIndicator style={styles.spinner} />
          </View>
        )}

        {status === 'poll-timeout' && (
          <View style={styles.centered}>
            <Text style={styles.statusHeading}>{t('tucopramp.pollTimeout.heading')}</Text>
            <Text style={styles.terminalBody} testID="tucopramp-onramp-poll-timeout-body">
              {t('tucopramp.pollTimeout.body')}
            </Text>
            <Button
              text={t('tucopramp.pollTimeout.refreshCta')}
              onPress={onRefreshOrder}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              testID="tucopramp-onramp-poll-refresh"
            />
            <Button
              text={t('tucopramp.closeCta')}
              onPress={onCloseAndExit}
              size={BtnSizes.FULL}
              type={BtnTypes.SECONDARY}
              style={styles.cancelOrderButton}
              testID="tucopramp-onramp-poll-close"
            />
          </View>
        )}

        {(status === 'completed' ||
          status === 'rejected' ||
          status === 'cancelled' ||
          status === 'expired') && (
          <View style={styles.centered}>
            <Text style={styles.statusHeading} testID="tucopramp-onramp-final-heading">
              {status === 'completed'
                ? t('tucopramp.completed')
                : status === 'rejected'
                  ? t('tucopramp.rejected')
                  : status === 'expired'
                    ? t('tucopramp.expired')
                    : t('tucopramp.cancelled')}
            </Text>
            {status !== 'completed' && (
              <Text style={styles.terminalBody}>
                {status === 'rejected'
                  ? t('tucopramp.rejectedBody')
                  : status === 'expired'
                    ? t('tucopramp.expiredBody')
                    : t('tucopramp.cancelledBody')}
              </Text>
            )}
            {status === 'rejected' && !!orderId && (
              <Text style={styles.referenceValue} selectable testID="tucopramp-onramp-reference">
                {t('tucopramp.orderReference', { id: orderId })}
              </Text>
            )}
            <Button
              text={t('tucopramp.closeCta')}
              onPress={onCloseAndExit}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              testID="tucopramp-onramp-close"
            />
          </View>
        )}

        {status === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorHeading}>{t('tucopramp.errorHeading')}</Text>
            <Text style={styles.body} testID="tucopramp-onramp-error-body">
              {t(errorMessageKey(errorCode), { defaultValue: t('tucopramp.errors.unknown') })}
            </Text>
            {errorCode === 'amount_limit_exceeded' && (
              <Text style={styles.terminalBody} testID="tucopramp-onramp-error-limits">
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
              retryButtonTestId="tucopramp-onramp-retry"
            />
          </View>
        )}
      </ScrollView>

      <Dialog
        isVisible={cancelConfirmVisible}
        title={t('tucopramp.cancelConfirmTitle')}
        actionText={t('tucopramp.cancelConfirmYes') ?? ''}
        actionPress={() => {
          setCancelConfirmVisible(false)
          if (order?.order_id) {
            dispatch(cancelOnrampOrder({ orderId: order.order_id }))
          }
        }}
        secondaryActionText={t('tucopramp.cancelConfirmNo') ?? ''}
        secondaryActionPress={() => setCancelConfirmVisible(false)}
        onBackgroundPress={() => setCancelConfirmVisible(false)}
        testID="tucopramp-onramp-cancel-confirm"
      >
        {t('tucopramp.cancelConfirmBody')}
      </Dialog>

      <PickerModal<DocumentType>
        visible={docTypePickerOpen}
        title={t('tucopramp.documentType.pickerTitle')}
        options={documentTypeOptions}
        selectedValue={documentType}
        testIdPrefix="tucopramp-onramp-doc-type-option"
        onClose={() => setDocTypePickerOpen(false)}
        onSelect={(v) => {
          setDocumentType(v)
          setCedula(sanitizeDocument(v, cedula))
        }}
      />
    </SafeAreaView>
  )
}

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
  helperError: {
    ...typeScale.bodySmall,
    color: Colors.errorDark,
    marginTop: Spacing.Smallest8,
  },
  spinner: { marginVertical: Spacing.Thick24 },
  ctaSpacer: { marginTop: Spacing.Thick24 },
  centered: { alignItems: 'center', paddingVertical: Spacing.Thick24 },
  cancelOrderButton: { marginTop: Spacing.Regular16 },
  terminalBody: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    textAlign: 'center',
    marginBottom: Spacing.Thick24,
    paddingHorizontal: Spacing.Regular16,
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
  body: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    textAlign: 'center',
    marginBottom: Spacing.Regular16,
  },
  infoBox: {
    backgroundColor: Colors.gray1,
    borderRadius: 12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
  },
  rejectionBanner: {
    backgroundColor: Colors.errorLight,
    borderRadius: 12,
    padding: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
  },
  rejectionBannerTitle: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.error,
    marginBottom: Spacing.Smallest8,
  },
  rejectionBannerBody: {
    ...typeScale.bodySmall,
    color: Colors.black,
  },
  infoLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
  infoValue: { ...typeScale.labelSemiBoldSmall, color: Colors.black },
  quoteBox: {
    backgroundColor: Colors.gray1,
    borderRadius: 12,
    padding: Spacing.Regular16,
    marginTop: Spacing.Thick24,
  },
  quoteLabel: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
  quoteAmount: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  quoteFee: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
  noFeeNote: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.successDark,
    marginBottom: Spacing.Smallest8,
  },
  referenceValue: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    textAlign: 'center',
    marginBottom: Spacing.Regular16,
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
})

export default TuCOPRampOnrampFlow
