import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { offrampStart } from 'src/buckspay/slice'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { BUCKSPAY_RECEIVER_ADDRESS } from 'src/web3/networkConfig'

type Props = NativeStackScreenProps<StackParamList, Screens.BucksPayConfirm>

function BucksPayConfirm({ route }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const { amount, bankDetails } = route.params

  function onPressConfirm() {
    dispatch(
      offrampStart({
        bankDetails,
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
            <Text style={styles.rowLabel}>{t('buckspay.accountNumberLabel')}</Text>
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
      </View>

      <View style={styles.buttonContainer}>
        <Button
          onPress={onPressConfirm}
          text={t('buckspay.confirm')}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
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
})

export default BucksPayConfirm
