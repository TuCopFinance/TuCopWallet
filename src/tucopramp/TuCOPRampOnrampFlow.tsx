import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
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
import { launchImageLibrary } from 'react-native-image-picker'
import type { ImagePickerResponse } from 'react-native-image-picker'
import { navigateBack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { addConsentBreadcrumb } from 'src/tucopramp/consentBreadcrumb'
import ErrorFooter from 'src/tucopramp/ErrorFooter'
import { getCachedLimits, isValidCedula } from 'src/tucopramp/limits'
import { toTitleCase } from 'src/tucopramp/nameFormat'
import {
  fetchReceivingAccount,
  fetchUserProfile,
  pollOnrampOrder,
  requestOnrampQuote,
  submitOnrampOrder,
  uploadOnrampProof,
} from 'src/tucopramp/saga'
import {
  onrampCurrentOrderSelector,
  onrampErrorCodeSelector,
  onrampErrorRequestIdSelector,
  onrampErrorRetryAfterSecondsSelector,
  onrampLastQuoteSelector,
  onrampStatusSelector,
  receivingAccountSelector,
} from 'src/tucopramp/selectors'
import { onrampError, onrampReset } from 'src/tucopramp/slice'
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

// react-native-image-picker MIME whitelist for the Bre-B receipt. Server
// enforces the same list with `proof_invalid_type` (400) if anything else
// slips through. PDFs are not supported by launchImageLibrary today; users
// with a PDF receipt would need a separate document picker (out of scope
// for the first release).
const ALLOWED_PROOF_MIME = ['image/png', 'image/jpeg', 'image/jpg']

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

  const [amount, setAmount] = useState('')
  const [cedula, setCedula] = useState('')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false)

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
    return () => {
      dispatch(onrampReset())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status === 'awaiting-review' && order?.order_id) {
      dispatch(pollOnrampOrder({ orderId: order.order_id }))
    }
  }, [status, order, dispatch])

  const amountNum = useMemo(() => Number(amount) || 0, [amount])
  const limits = getCachedLimits()
  const amountValid = amountNum >= limits.min_order_cop && amountNum <= limits.max_order_cop
  const firstNameValid = firstName.trim().length > 0
  const lastNameValid = lastName.trim().length > 0
  const formValid =
    amountValid && isValidCedula(cedula) && email.includes('@') && firstNameValid && lastNameValid

  const onRequestQuote = () => {
    if (!formValid) return
    dispatch(requestOnrampQuote({ gross_amount_cop: amountNum, cedula }))
  }

  const onSubmitOrder = () => {
    if (!quote || !consentAccepted) return
    addConsentBreadcrumb('onramp')
    dispatch(
      submitOnrampOrder({
        body: {
          gross_amount_cop: amountNum,
          cedula,
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email,
          consent_accepted: true,
          quote_id: quote.quote_id,
        },
      })
    )
  }

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
      return
    }
    if (response.didCancel) return
    const asset = response.assets?.[0]
    if (!asset?.uri || !asset.type || !asset.fileName) {
      Logger.warn(TAG, 'image picker returned incomplete asset', response)
      return
    }
    if (!ALLOWED_PROOF_MIME.includes(asset.type)) {
      // Surface as a soft error via redux so the ErrorFooter shows it; server
      // would also reject with proof_invalid_type, but this saves the round-trip.
      dispatch(onrampError({ code: 'proof_invalid_type' }))
      return
    }
    dispatch(
      uploadOnrampProof({
        orderId: order.order_id,
        file: { uri: asset.uri, name: asset.fileName, type: asset.type },
      })
    )
  }

  const onCloseAndExit = () => {
    dispatch(onrampReset())
    navigateBack()
  }

  const onStartOver = () => {
    dispatch(onrampReset())
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('tucopramp.onrampTitle')}</Text>

        {(status === 'idle' || status === 'quoting' || status === 'quote-ready') && (
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
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              editable={status === 'idle'}
              testID="tucopramp-onramp-amount"
            />
            {!amountValid && amount.length > 0 && (
              <Text style={styles.helper}>
                {t('tucopramp.amountRange', {
                  min: limits.min_order_cop.toLocaleString('es-CO'),
                  max: limits.max_order_cop.toLocaleString('es-CO'),
                })}
              </Text>
            )}

            <Text style={styles.label}>{t('tucopramp.firstNameLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('tucopramp.firstNamePlaceholder') ?? ''}
              autoCapitalize="words"
              autoCorrect={false}
              value={firstName}
              onChangeText={(v) => setFirstName(toTitleCase(v))}
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
              onChangeText={(v) => setLastName(toTitleCase(v))}
              editable={status === 'idle'}
              testID="tucopramp-onramp-lastname"
            />

            <Text style={styles.label}>{t('tucopramp.cedulaLabel')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={cedula}
              onChangeText={setCedula}
              editable={status === 'idle'}
              testID="tucopramp-onramp-cedula"
            />

            <Text style={styles.label}>{t('tucopramp.emailLabel')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={status === 'idle'}
              testID="tucopramp-onramp-email"
            />

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
                <Text style={styles.quoteAmount}>
                  {quote.gross_amount_copm.toLocaleString('es-CO')} COPm
                </Text>
                <Text style={styles.quoteFee}>
                  {t('tucopramp.quoteFee', {
                    fee: quote.fee_amount_cop.toLocaleString('es-CO'),
                  })}
                </Text>
                <TouchableOpacity
                  style={styles.consentRow}
                  onPress={() => setConsentAccepted((v) => !v)}
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
                      onPress={() => Linking.openURL(TUCOPRAMP_TERMS_URL)}
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
            <Text style={styles.statusHeading}>{t('tucopramp.awaitingProofHeading')}</Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>{t('tucopramp.transferToLabel')}</Text>
              <Text style={styles.infoValue}>{order.receiving_account.bre_b_key}</Text>
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>{t('tucopramp.transferAmountLabel')}</Text>
              <Text style={styles.infoValue}>
                {order.gross_amount_cop.toLocaleString('es-CO')} COP
              </Text>
            </View>
            <Text style={styles.body}>{order.instructions}</Text>
            <Button
              text={t('tucopramp.uploadProofCta')}
              onPress={onUploadProof}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              testID="tucopramp-onramp-upload-proof"
            />
          </View>
        )}

        {(status === 'uploading-proof' || status === 'verifying') && (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text style={styles.helper}>{t('tucopramp.uploadingOrVerifying')}</Text>
          </View>
        )}

        {status === 'awaiting-review' && (
          <View style={styles.centered}>
            <Text style={styles.statusHeading}>{t('tucopramp.awaitingReviewHeading')}</Text>
            <Text style={styles.body}>{t('tucopramp.awaitingReviewBody')}</Text>
          </View>
        )}

        {(status === 'completed' || status === 'cancelled' || status === 'expired') && (
          <View style={styles.centered}>
            <Text style={styles.statusHeading}>
              {status === 'completed'
                ? t('tucopramp.completed')
                : status === 'expired'
                  ? t('tucopramp.expired')
                  : t('tucopramp.cancelled')}
            </Text>
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
            <Text style={styles.body}>
              {errorCode ? t(`tucopramp.errors.${errorCode}`, t('tucopramp.errors.unknown')) : ''}
            </Text>
            <ErrorFooter
              errorCode={errorCode}
              retryAfterSeconds={errorRetryAfterSeconds}
              requestId={errorRequestId}
              onRetry={onStartOver}
              retryButtonTestId="tucopramp-onramp-retry"
            />
          </View>
        )}
      </ScrollView>
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
  spinner: { marginVertical: Spacing.Thick24 },
  ctaSpacer: { marginTop: Spacing.Thick24 },
  centered: { alignItems: 'center', paddingVertical: Spacing.Thick24 },
  statusHeading: {
    ...typeScale.titleSmall,
    color: Colors.black,
    marginBottom: Spacing.Regular16,
    textAlign: 'center',
  },
  errorHeading: {
    ...typeScale.titleSmall,
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
  infoLabel: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
  infoValue: { ...typeScale.bodyMedium, color: Colors.black },
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
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
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
