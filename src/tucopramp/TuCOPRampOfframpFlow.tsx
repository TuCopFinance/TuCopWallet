import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import DownArrowIcon from 'src/icons/navigation/DownArrowIcon'
import { navigateBack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { getCachedLimits, isValidCedula } from 'src/tucopramp/limits'
import {
  cancelOfframpOrder,
  fetchBanks,
  fetchOfframpProofUrl,
  fetchUserProfile,
  pollOfframpOrder,
  requestOfframpQuote,
  submitOfframpOrder,
} from 'src/tucopramp/saga'
import {
  banksSelector,
  offrampCurrentOrderSelector,
  offrampErrorCodeSelector,
  offrampLastQuoteSelector,
  offrampProofUrlErrorCodeSelector,
  offrampProofUrlLoadingSelector,
  offrampProofUrlSelector,
  offrampStatusSelector,
} from 'src/tucopramp/selectors'
import { offrampReset } from 'src/tucopramp/slice'
import { BankAccountType, PayoutMethod } from 'src/tucopramp/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.TuCOPRampOfframpFlow>

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
  const [cedula, setCedula] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [fullName, setFullName] = useState<string>('')
  const [openPicker, setOpenPicker] = useState<null | 'bank' | 'accountType'>(null)

  useEffect(() => {
    dispatch(fetchBanks())
    dispatch(fetchUserProfile())
    return () => {
      dispatch(offrampReset())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (banks && banks.length > 0 && !bankCode) {
      setBankCode(banks[0].code)
    }
  }, [banks, bankCode])

  useEffect(() => {
    if (status === 'awaiting-deposit' && order?.order_id) {
      dispatch(pollOfframpOrder({ orderId: order.order_id }))
    }
  }, [status, order, dispatch])

  // On COMPLETED, try to fetch the operator's outgoing-transfer proof. Server
  // returns 404 if none exists (older orders, or Ops has not attached a proof
  // yet); we hide the proof block in that case rather than showing an error.
  // Refetches when the cached URL crosses its expires_at deadline (server
  // TTL 300s per guide sec 10). The re-fetch is idempotent + cheap.
  useEffect(() => {
    if (status !== 'completed' || !order?.order_id) return
    const stillFresh = proofUrl && new Date(proofUrl.expires_at).getTime() > Date.now() + 5_000
    if (stillFresh || proofUrlLoading) return
    dispatch(fetchOfframpProofUrl({ orderId: order.order_id, kind: 'operator_outgoing' }))
  }, [status, order, proofUrl, proofUrlLoading, dispatch])

  const amountNum = useMemo(() => Number(amount) || 0, [amount])
  const limits = getCachedLimits()
  const amountValid = amountNum >= limits.min_order_cop && amountNum <= limits.max_order_cop

  const selectedBank = useMemo(() => banks?.find((b) => b.code === bankCode), [banks, bankCode])

  const payoutFieldsValid = useMemo(() => {
    if (payoutMethod === 'bre_b_key') {
      return breBKey.trim().length >= 3 && breBKey.trim().length <= 100
    }
    return (
      bankCode.length > 0 &&
      bankAccountNumber.trim().length >= 4 &&
      (selectedBank?.supported_account_types ?? []).includes(bankAccountType)
    )
  }, [payoutMethod, breBKey, bankCode, bankAccountNumber, bankAccountType, selectedBank])

  const formValid = amountValid && isValidCedula(cedula) && email.includes('@') && payoutFieldsValid

  const onRequestQuote = () => {
    if (!formValid) return
    dispatch(
      requestOfframpQuote({
        gross_amount_cop: amountNum,
        payout_method: payoutMethod,
        bank_code: payoutMethod === 'bank_account' ? bankCode : undefined,
        bank_account_type: payoutMethod === 'bank_account' ? bankAccountType : undefined,
        cedula,
      })
    )
  }

  const onSubmitOrder = () => {
    if (!quote) return
    dispatch(
      submitOfframpOrder({
        body: {
          gross_amount_cop: amountNum,
          cedula,
          full_name: fullName || 'TuCop user',
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

  const onCancelOrder = () => {
    if (order?.order_id) {
      dispatch(cancelOfframpOrder({ orderId: order.order_id }))
    }
  }

  const onStartOver = () => {
    dispatch(offrampReset())
  }

  const onCloseAndExit = () => {
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('tucopramp.offrampTitle')}</Text>

        {(status === 'idle' || status === 'quoting' || status === 'quote-ready') && (
          <View>
            <Text style={styles.label}>{t('tucopramp.amountLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('tucopramp.amountPlaceholder') ?? ''}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              editable={status === 'idle'}
              testID="tucopramp-offramp-amount"
            />
            {!amountValid && amount.length > 0 && (
              <Text style={styles.helper}>
                {t('tucopramp.amountRange', {
                  min: limits.min_order_cop.toLocaleString('es-CO'),
                  max: limits.max_order_cop.toLocaleString('es-CO'),
                })}
              </Text>
            )}

            <Text style={styles.label}>{t('tucopramp.payoutMethodLabel')}</Text>
            <View style={styles.segmentRow}>
              <Button
                text={t('tucopramp.payoutMethod_bank_account')}
                onPress={() => setPayoutMethod('bank_account')}
                type={payoutMethod === 'bank_account' ? BtnTypes.PRIMARY : BtnTypes.SECONDARY}
                size={BtnSizes.SMALL}
                testID="tucopramp-offramp-payout-bank"
              />
              <View style={styles.segmentSpacer} />
              <Button
                text={t('tucopramp.payoutMethod_bre_b_key')}
                onPress={() => setPayoutMethod('bre_b_key')}
                type={payoutMethod === 'bre_b_key' ? BtnTypes.PRIMARY : BtnTypes.SECONDARY}
                size={BtnSizes.SMALL}
                testID="tucopramp-offramp-payout-breb"
              />
            </View>

            {payoutMethod === 'bank_account' && (
              <View>
                <Text style={styles.label}>{t('tucopramp.bankLabel')}</Text>
                {bankOptions.length > 0 ? (
                  <TouchableOpacity
                    style={styles.pickerTouchable}
                    onPress={() => setOpenPicker('bank')}
                    testID="tucopramp-offramp-bank"
                    accessibilityRole="button"
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
                  onChangeText={setBankAccountNumber}
                  editable={status === 'idle'}
                  testID="tucopramp-offramp-account-number"
                />
              </View>
            )}

            {payoutMethod === 'bre_b_key' && (
              <View>
                <Text style={styles.label}>{t('tucopramp.breBKeyLabel')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('tucopramp.breBKeyPlaceholder') ?? ''}
                  autoCapitalize="none"
                  value={breBKey}
                  onChangeText={setBreBKey}
                  editable={status === 'idle'}
                  testID="tucopramp-offramp-brebkey"
                />
                <Text style={styles.helper}>{t('tucopramp.breBKeyHelp')}</Text>
              </View>
            )}

            <Text style={styles.label}>{t('tucopramp.fullNameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              editable={status === 'idle'}
              testID="tucopramp-offramp-fullname"
            />

            <Text style={styles.label}>{t('tucopramp.cedulaLabel')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={cedula}
              onChangeText={setCedula}
              editable={status === 'idle'}
              testID="tucopramp-offramp-cedula"
            />

            <Text style={styles.label}>{t('tucopramp.emailLabel')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={status === 'idle'}
              testID="tucopramp-offramp-email"
            />

            {status === 'quoting' && <ActivityIndicator style={styles.spinner} />}

            {status === 'idle' && (
              <Button
                text={t('tucopramp.getQuoteCta')}
                onPress={onRequestQuote}
                size={BtnSizes.FULL}
                type={BtnTypes.PRIMARY}
                disabled={!formValid}
                testID="tucopramp-offramp-get-quote"
              />
            )}

            {status === 'quote-ready' && quote && (
              <View style={styles.quoteBox}>
                <Text style={styles.quoteLabel}>{t('tucopramp.quoteReceivedLabel')}</Text>
                <Text style={styles.quoteAmount}>
                  {quote.net_amount_to_user_cop.toLocaleString('es-CO')} COP
                </Text>
                <Text style={styles.quoteFee}>
                  {t('tucopramp.quoteFee', { fee: quote.fee_amount_cop.toLocaleString('es-CO') })}
                </Text>
                <Button
                  text={t('tucopramp.confirmSendCta')}
                  onPress={onSubmitOrder}
                  size={BtnSizes.FULL}
                  type={BtnTypes.PRIMARY}
                  testID="tucopramp-offramp-confirm"
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

        {(status === 'awaiting-deposit' ||
          status === 'deposit-confirmed' ||
          status === 'processing') &&
          order && (
            <View>
              <Text style={styles.statusHeading}>
                {status === 'awaiting-deposit'
                  ? t('tucopramp.awaitingDepositHeading')
                  : t('tucopramp.processingHeading')}
              </Text>
              <Text style={styles.body}>
                {t('tucopramp.awaitingDepositBody', {
                  amount: order.gross_amount_copm.toLocaleString('es-CO'),
                })}
              </Text>
              {status !== 'awaiting-deposit' && <ActivityIndicator style={styles.spinner} />}
              {status === 'awaiting-deposit' && (
                <Button
                  text={t('tucopramp.cancelCta')}
                  onPress={onCancelOrder}
                  size={BtnSizes.FULL}
                  type={BtnTypes.SECONDARY}
                  testID="tucopramp-offramp-cancel"
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
                {!!proofUrl && !proofUrlLoading && (
                  <Image
                    source={{ uri: proofUrl.url }}
                    style={styles.proofImage}
                    resizeMode="contain"
                    testID="tucopramp-offramp-proof-image"
                  />
                )}
                {/* Hide the error entirely on 404 order_not_found or missing
                    proof - Ops may not have attached one for this order. Only
                    surface real errors (network, proxy_disabled, etc.). */}
                {!!proofUrlErrorCode &&
                  proofUrlErrorCode !== 'order_not_found' &&
                  !proofUrlLoading && (
                    <Text style={styles.proofError}>
                      {t('tucopramp.offramp.completed.proofError')}
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

        {status === 'error' && (
          <View style={styles.centered}>
            <Text style={styles.errorHeading}>{t('tucopramp.errorHeading')}</Text>
            <Text style={styles.body}>
              {errorCode ? t(`tucopramp.errors.${errorCode}`, t('tucopramp.errors.unknown')) : ''}
            </Text>
            <Button
              text={t('tucopramp.retryCta')}
              onPress={onStartOver}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              testID="tucopramp-offramp-retry"
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
    </SafeAreaView>
  )
}

interface PickerModalProps<T> {
  visible: boolean
  title: string
  options: { value: T; label: string }[]
  selectedValue: T | undefined
  testIdPrefix: string
  onClose(): void
  onSelect(value: T): void
}

// Bottom-sheet-styled picker rendered as a native Modal so it escapes the
// parent ScrollView's z-index layer entirely. Works around the known RN iOS
// gotcha where the shared src/components/Dropdown (position: absolute +
// zIndex) is overlapped by sibling form fields inside a ScrollView.
function PickerModal<T extends string>({
  visible,
  title,
  options,
  selectedValue,
  testIdPrefix,
  onClose,
  onSelect,
}: PickerModalProps<T>) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.pickerBackdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.pickerSheet}>
        <View style={styles.pickerHandle} />
        <Text style={styles.pickerTitle}>{title}</Text>
        <ScrollView style={styles.pickerList}>
          {options.map((opt) => {
            const isSelected = opt.value === selectedValue
            return (
              <TouchableOpacity
                key={String(opt.value)}
                style={styles.pickerRow}
                onPress={() => {
                  onSelect(opt.value)
                  onClose()
                }}
                testID={`${testIdPrefix}-${opt.value}`}
              >
                <Text style={[styles.pickerRowText, isSelected && styles.pickerRowTextSelected]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
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
  },
  helper: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
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
  pickerTouchable: {
    padding: Spacing.Small12,
    borderColor: Colors.gray2,
    borderRadius: 4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerValue: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    flexShrink: 1,
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  pickerSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: Spacing.Small12,
    paddingBottom: Spacing.Thick24,
    paddingHorizontal: Spacing.Regular16,
  },
  pickerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray2,
    marginBottom: Spacing.Regular16,
  },
  pickerTitle: {
    ...typeScale.titleSmall,
    color: Colors.black,
    marginBottom: Spacing.Regular16,
  },
  pickerList: {
    flexGrow: 0,
  },
  pickerRow: {
    paddingVertical: Spacing.Small12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray1,
  },
  pickerRowText: {
    ...typeScale.bodyMedium,
    color: Colors.black,
  },
  pickerRowTextSelected: {
    color: Colors.accent,
    fontWeight: '600',
  },
})

export default TuCOPRampOfframpFlow
