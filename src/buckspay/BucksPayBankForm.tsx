import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { bucksPayLastBankDetailsSelector } from 'src/buckspay/selectors'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.BucksPayBankForm>

function BucksPayBankForm({ navigation }: Props) {
  const { t } = useTranslation()
  const lastBankDetails = useSelector(bucksPayLastBankDetailsSelector)

  const [amount, setAmount] = useState('')
  const [bankName, setBankName] = useState(lastBankDetails?.bankName ?? '')
  const [accountNumber, setAccountNumber] = useState(lastBankDetails?.accountNumber ?? '')
  const [bankCountry] = useState(lastBankDetails?.bankCountry ?? 'Colombia')

  const isFormValid =
    amount.length > 0 &&
    parseFloat(amount) > 0 &&
    bankName.trim().length > 0 &&
    accountNumber.trim().length > 0

  function onPressContinue() {
    navigate(Screens.BucksPayConfirm, {
      amount,
      bankDetails: {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        bankCountry,
      },
    })
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('buckspay.bankFormTitle')}</Text>
        <Text style={styles.subtitle}>{t('buckspay.bankFormSubtitle')}</Text>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>{t('buckspay.amountLabel')}</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder={t('buckspay.amountPlaceholder') ?? ''}
            keyboardType="decimal-pad"
            testID="buckspay-amount-input"
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>{t('buckspay.bankNameLabel')}</Text>
          <TextInput
            style={styles.input}
            value={bankName}
            onChangeText={setBankName}
            placeholder={t('buckspay.bankNamePlaceholder') ?? ''}
            autoCapitalize="words"
            testID="buckspay-bank-name-input"
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>{t('buckspay.accountNumberLabel')}</Text>
          <TextInput
            style={styles.input}
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder={t('buckspay.accountNumberPlaceholder') ?? ''}
            keyboardType="number-pad"
            testID="buckspay-account-number-input"
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>{t('buckspay.bankCountryLabel')}</Text>
          <View style={styles.disabledInput}>
            <Text style={styles.disabledText}>{bankCountry}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <Button
          onPress={onPressContinue}
          text={t('buckspay.continue')}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          disabled={!isFormValid}
          testID="buckspay-continue-button"
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    padding: Spacing.Thick24,
  },
  title: {
    ...typeScale.titleMedium,
    color: Colors.black,
    marginBottom: Spacing.Smallest8,
  },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    marginBottom: Spacing.Thick24,
  },
  fieldContainer: {
    marginBottom: Spacing.Regular16,
  },
  label: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
    marginBottom: Spacing.Tiny4,
  },
  input: {
    ...typeScale.bodyMedium,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    paddingHorizontal: Spacing.Small12,
    paddingVertical: Spacing.Small12,
    color: Colors.black,
  },
  disabledInput: {
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    paddingHorizontal: Spacing.Small12,
    paddingVertical: Spacing.Small12,
    backgroundColor: Colors.gray1,
  },
  disabledText: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
  buttonContainer: {
    padding: Spacing.Thick24,
  },
})

export default BucksPayBankForm
