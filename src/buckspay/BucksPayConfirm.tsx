import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { offrampStart } from 'src/buckspay/slice'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { InLineNotification, NotificationVariant } from 'src/components/InLineNotification'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { usePrepareSendTransactions } from 'src/send/usePrepareSendTransactions'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useCOPm } from 'src/tokens/hooks'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { NetworkId } from 'src/transactions/types'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { BUCKSPAY_RECEIVER_ADDRESS } from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'

type Props = NativeStackScreenProps<StackParamList, Screens.BucksPayConfirm>

function BucksPayConfirm({ route }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const { amount, bankDetails } = route.params

  const walletAddress = useSelector(walletAddressSelector)
  const copmToken = useCOPm()
  const feeCurrencies = useSelector((state) =>
    feeCurrenciesSelector(state, NetworkId['celo-mainnet'])
  )

  const {
    prepareTransactionsResult,
    refreshPreparedTransactions,
    prepareTransactionError,
    prepareTransactionLoading,
  } = usePrepareSendTransactions()

  useEffect(() => {
    if (walletAddress && copmToken) {
      refreshPreparedTransactions({
        amount: new BigNumber(amount),
        token: copmToken,
        recipientAddress: BUCKSPAY_RECEIVER_ADDRESS,
        walletAddress,
        feeCurrencies,
      })
    }
  }, [walletAddress, copmToken, amount])

  const isPossible = prepareTransactionsResult?.type === 'possible'
  const isNotEnoughGas = prepareTransactionsResult?.type === 'not-enough-balance-for-gas'
  const isNeedDecrease = prepareTransactionsResult?.type === 'need-decrease-spend-amount-for-gas'
  const disableConfirm = !isPossible || prepareTransactionLoading

  const errorMessage = useMemo(() => {
    if (prepareTransactionError) {
      return t('buckspay.errorPreparingTransaction')
    }
    if (isNotEnoughGas) {
      return t('buckspay.notEnoughGas')
    }
    if (isNeedDecrease) {
      return t('buckspay.needDecreaseAmount')
    }
    return null
  }, [prepareTransactionError, isNotEnoughGas, isNeedDecrease, t])

  function onPressConfirm() {
    if (prepareTransactionsResult?.type !== 'possible') {
      return
    }

    const serializedTxs = getSerializablePreparedTransactions(
      prepareTransactionsResult.transactions
    )

    dispatch(
      offrampStart({
        bankDetails,
        preparedTransactions: serializedTxs,
      })
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('buckspay.confirmTitle')}</Text>
        <Text style={styles.subtitle}>{t('buckspay.confirmSubtitle')}</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('buckspay.amountLabel')}</Text>
            <Text style={styles.rowValue}>{amount} COPm</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('buckspay.bankNameLabel')}</Text>
            <Text style={styles.rowValue}>{bankDetails.bankName}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('buckspay.accountTypeLabel')}</Text>
            <Text style={styles.rowValue}>
              {t(`buckspay.accountType_${bankDetails.accountType}`)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {bankDetails.accountType === 'nequi'
                ? t('buckspay.phoneNumberLabel')
                : t('buckspay.accountNumberLabel')}
            </Text>
            <Text style={styles.rowValue}>{bankDetails.accountNumber}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('buckspay.bankCountryLabel')}</Text>
            <Text style={styles.rowValue}>{bankDetails.bankCountry}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('buckspay.receiverLabel')}</Text>
            <Text style={styles.rowValueSmall} numberOfLines={1} ellipsizeMode="middle">
              {BUCKSPAY_RECEIVER_ADDRESS}
            </Text>
          </View>
        </View>

        {prepareTransactionLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>{t('buckspay.preparingTransaction')}</Text>
          </View>
        )}

        {errorMessage && (
          <InLineNotification
            variant={NotificationVariant.Error}
            description={errorMessage}
            style={styles.errorNotification}
          />
        )}
      </View>

      <View style={styles.buttonContainer}>
        <Button
          onPress={onPressConfirm}
          text={t('buckspay.confirm')}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          disabled={disableConfirm}
          showLoading={prepareTransactionLoading}
          testID="buckspay-confirm-button"
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
  content: {
    flex: 1,
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
  card: {
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 12,
    padding: Spacing.Regular16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.Smallest8,
  },
  rowLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  rowValue: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  rowValueSmall: {
    ...typeScale.bodyXSmall,
    color: Colors.black,
    maxWidth: 180,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.gray2,
  },
  buttonContainer: {
    padding: Spacing.Thick24,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  loadingText: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  errorNotification: {
    marginTop: Spacing.Regular16,
  },
})

export default BucksPayConfirm
