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
import { TUCOPRAMP_MAX_ORDER_COP, TUCOPRAMP_MIN_ORDER_COP } from 'src/tucopramp/limits'
import {
  cancelOfframpOrder,
  fetchBanks,
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
  offrampStatusSelector,
  userProfileSelector,
} from 'src/tucopramp/selectors'
import { offrampReset } from 'src/tucopramp/slice'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.TuCOPRampOfframpFlow>

// Single screen master that drives the full off-ramp flow via conditional
// rendering on the redux flow status. Keeps navigation shallow (no nested
// stack of tiny screens) and lets us commit incrementally without breaking
// the flow at the navigator layer.
function TuCOPRampOfframpFlow(_props: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()

  const status = useSelector(offrampStatusSelector)
  const banks = useSelector(banksSelector)
  const profile = useSelector(userProfileSelector)
  const quote = useSelector(offrampLastQuoteSelector)
  const order = useSelector(offrampCurrentOrderSelector)
  const errorCode = useSelector(offrampErrorCodeSelector)

  // Form-local state (survives status transitions until user resets).
  const [amount, setAmount] = useState('')
  const [bankCode, setBankCode] = useState<string>('')
  const [cedula, setCedula] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [fullName, setFullName] = useState<string>('')

  useEffect(() => {
    dispatch(fetchBanks())
    dispatch(fetchUserProfile())
    return () => {
      dispatch(offrampReset())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (profile?.cedula_last_4 && !cedula) {
      // Prefill only the "last 4" surface; user completes the full number.
    }
  }, [profile, cedula])

  useEffect(() => {
    if (banks && banks.length > 0 && !bankCode) {
      setBankCode(banks[0].code)
    }
  }, [banks, bankCode])

  useEffect(() => {
    // Kick off polling once the order lands.
    if (status === 'awaiting-deposit' && order?.order_id) {
      dispatch(pollOfframpOrder({ orderId: order.order_id }))
    }
  }, [status, order, dispatch])

  const amountNum = useMemo(() => Number(amount) || 0, [amount])
  const amountValid = amountNum >= TUCOPRAMP_MIN_ORDER_COP && amountNum <= TUCOPRAMP_MAX_ORDER_COP
  const formValid = amountValid && bankCode.length > 0 && cedula.length >= 6 && email.includes('@')

  const onRequestQuote = () => {
    if (!formValid) return
    dispatch(
      requestOfframpQuote({
        gross_amount_cop: amountNum,
        payout_method: 'bank_account',
        bank_code: bankCode,
        bank_account_type: 'savings',
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
          payout_method: 'bank_account',
          bank_code: bankCode,
          bank_account_type: 'savings',
          bank_account_number: '',
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
                  min: TUCOPRAMP_MIN_ORDER_COP.toLocaleString('es-CO'),
                  max: TUCOPRAMP_MAX_ORDER_COP.toLocaleString('es-CO'),
                })}
              </Text>
            )}

            <Text style={styles.label}>{t('tucopramp.bankLabel')}</Text>
            <TextInput
              style={styles.input}
              value={bankCode}
              onChangeText={setBankCode}
              editable={status === 'idle'}
              testID="tucopramp-offramp-bank"
            />

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
                  {t('tucopramp.quoteFee', {
                    fee: quote.fee_amount_cop.toLocaleString('es-CO'),
                  })}
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

export default TuCOPRampOfframpFlow
