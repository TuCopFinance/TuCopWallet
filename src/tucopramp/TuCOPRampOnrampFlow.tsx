import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { navigateBack } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { getCachedLimits, isValidCedula } from 'src/tucopramp/limits'
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
  onrampLastQuoteSelector,
  onrampStatusSelector,
  receivingAccountSelector,
} from 'src/tucopramp/selectors'
import { onrampReset } from 'src/tucopramp/slice'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.TuCOPRampOnrampFlow>

// Placeholder ProofFile for the smoke path. Real file picker (react-native-
// image-picker or expo-image-picker) wires in when we polish the UX; the
// current dummy is enough to exercise the saga -> api -> proxy path end to
// end during Phase 5 smoke.
const STUB_PROOF_FILE = {
  uri: 'file:///stub-proof.png',
  name: 'proof.png',
  type: 'image/png',
}

function TuCOPRampOnrampFlow(_props: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const status = useSelector(onrampStatusSelector)
  const account = useSelector(receivingAccountSelector)
  const quote = useSelector(onrampLastQuoteSelector)
  const order = useSelector(onrampCurrentOrderSelector)
  const errorCode = useSelector(onrampErrorCodeSelector)

  const [amount, setAmount] = useState('')
  const [cedula, setCedula] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')

  useEffect(() => {
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
  const formValid = amountValid && isValidCedula(cedula) && email.includes('@')

  const onRequestQuote = () => {
    if (!formValid) return
    dispatch(requestOnrampQuote({ gross_amount_cop: amountNum, cedula }))
  }

  const onSubmitOrder = () => {
    if (!quote) return
    dispatch(
      submitOnrampOrder({
        body: {
          gross_amount_cop: amountNum,
          cedula,
          full_name: fullName || 'TuCop user',
          email,
          consent_accepted: true,
          quote_id: quote.quote_id,
        },
      })
    )
  }

  const onUploadProof = () => {
    if (order?.order_id) {
      dispatch(uploadOnrampProof({ orderId: order.order_id, file: STUB_PROOF_FILE }))
    }
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

            <Text style={styles.label}>{t('tucopramp.fullNameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              editable={status === 'idle'}
              testID="tucopramp-onramp-fullname"
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
              <Button
                text={t('tucopramp.getQuoteCta')}
                onPress={onRequestQuote}
                size={BtnSizes.FULL}
                type={BtnTypes.PRIMARY}
                disabled={!formValid}
                testID="tucopramp-onramp-get-quote"
              />
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
                <Button
                  text={t('tucopramp.confirmCreateOrderCta')}
                  onPress={onSubmitOrder}
                  size={BtnSizes.FULL}
                  type={BtnTypes.PRIMARY}
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
            <Button
              text={t('tucopramp.retryCta')}
              onPress={onStartOver}
              size={BtnSizes.FULL}
              type={BtnTypes.PRIMARY}
              testID="tucopramp-onramp-retry"
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
  },
  helper: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Smallest8,
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
})

export default TuCOPRampOnrampFlow
