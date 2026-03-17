import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { bucksPayLastBankDetailsSelector } from 'src/buckspay/selectors'
import {
  AccountType,
  BUCKSPAY_MAX_AMOUNT,
  BUCKSPAY_MIN_AMOUNT,
  COLOMBIAN_BANKS,
  ColombianBank,
  DEFAULT_BANK,
} from 'src/buckspay/types'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import Dropdown from 'src/components/Dropdown'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useSelector } from 'src/redux/hooks'
import { useCOPm } from 'src/tokens/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

type Props = NativeStackScreenProps<StackParamList, Screens.BucksPayBankForm>

function BucksPayBankForm({ navigation }: Props) {
  const { t } = useTranslation()
  const lastBankDetails = useSelector(bucksPayLastBankDetailsSelector)
  const copmToken = useCOPm()
  const copmBalance = copmToken?.balance.toNumber() ?? 0

  const initialBank =
    COLOMBIAN_BANKS.find((b) => b.name === lastBankDetails?.bankName) ?? DEFAULT_BANK

  const [amount, setAmount] = useState('')
  const [selectedBank, setSelectedBank] = useState<ColombianBank>(initialBank)
  const [accountType, setAccountType] = useState<AccountType>(
    lastBankDetails?.accountType ?? selectedBank.accountType[0]
  )
  const [accountNumber, setAccountNumber] = useState(lastBankDetails?.accountNumber ?? '')
  const [bankCountry] = useState(lastBankDetails?.bankCountry ?? 'Colombia')

  const isNequiType = accountType === 'nequi'

  const bankOptions = useMemo(
    () => COLOMBIAN_BANKS.map((bank) => ({ value: bank.id, label: bank.name })),
    []
  )

  const accountTypeOptions = useMemo(
    () =>
      selectedBank.accountType.map((type) => ({
        value: type,
        label: t(`buckspay.accountType_${type}`),
      })),
    [selectedBank, t]
  )

  function onBankSelected(bankId: string) {
    const bank = COLOMBIAN_BANKS.find((b) => b.id === bankId)
    if (bank) {
      setSelectedBank(bank)
      setAccountType(bank.accountType[0])
    }
  }

  const parsedAmount = parseFloat(amount) || 0
  const amountError = useMemo(() => {
    if (!amount || parsedAmount <= 0) return null
    if (parsedAmount < BUCKSPAY_MIN_AMOUNT) {
      return t('buckspay.amountBelowMin', { min: BUCKSPAY_MIN_AMOUNT.toLocaleString() })
    }
    if (parsedAmount > BUCKSPAY_MAX_AMOUNT) {
      return t('buckspay.amountAboveMax', { max: BUCKSPAY_MAX_AMOUNT.toLocaleString() })
    }
    if (parsedAmount > copmBalance) {
      return t('buckspay.insufficientBalance', { balance: copmBalance.toLocaleString() })
    }
    return null
  }, [parsedAmount, amount, copmBalance, t])

  const isFormValid =
    parsedAmount >= BUCKSPAY_MIN_AMOUNT &&
    parsedAmount <= BUCKSPAY_MAX_AMOUNT &&
    parsedAmount <= copmBalance &&
    accountNumber.trim().length > 0

  function onPressContinue() {
    navigate(Screens.BucksPayConfirm, {
      amount,
      bankDetails: {
        bankName: selectedBank.name,
        accountNumber: accountNumber.trim(),
        accountType,
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
            style={[styles.input, amountError ? styles.inputError : undefined]}
            value={amount}
            onChangeText={setAmount}
            placeholder={t('buckspay.amountPlaceholder') ?? ''}
            keyboardType="decimal-pad"
            testID="buckspay-amount-input"
          />
          {amountError && <Text style={styles.errorText}>{amountError}</Text>}
        </View>

        <View style={[styles.fieldContainer, { zIndex: 2 }]}>
          <Text style={styles.label}>{t('buckspay.bankNameLabel')}</Text>
          <Dropdown
            options={bankOptions}
            onValueSelected={onBankSelected}
            defaultLabel={selectedBank.name}
            testId="buckspay-bank-dropdown"
          />
        </View>

        {selectedBank.accountType.length > 1 && (
          <View style={[styles.fieldContainer, { zIndex: 1 }]}>
            <Text style={styles.label}>{t('buckspay.accountTypeLabel')}</Text>
            <Dropdown
              options={accountTypeOptions}
              onValueSelected={(val: AccountType) => setAccountType(val)}
              defaultLabel={t(`buckspay.accountType_${accountType}`)}
              testId="buckspay-account-type-dropdown"
            />
          </View>
        )}

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {isNequiType ? t('buckspay.phoneNumberLabel') : t('buckspay.accountNumberLabel')}
          </Text>
          <TextInput
            style={styles.input}
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder={
              (isNequiType
                ? t('buckspay.phoneNumberPlaceholder')
                : t('buckspay.accountNumberPlaceholder')) ?? ''
            }
            keyboardType={isNequiType ? 'phone-pad' : 'number-pad'}
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
  inputError: {
    borderColor: Colors.errorDark,
  },
  errorText: {
    ...typeScale.bodyXSmall,
    color: Colors.errorDark,
    marginTop: Spacing.Tiny4,
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
