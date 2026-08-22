import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import FeeSummary from 'src/components/FeeSummary'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { AppFeeAmount, SwapFeeAmount } from 'src/swap/types'

interface Props {
  forwardedRef: React.RefObject<BottomSheetModalRefType>
  appFee?: AppFeeAmount
  crossChainFee?: SwapFeeAmount
  networkFee?: SwapFeeAmount
  fetchingSwapQuote: boolean
}

function FeeAmount({
  fee,
  showMaxAmount,
  isLoading,
}: {
  fee: SwapFeeAmount | undefined
  showMaxAmount?: boolean
  isLoading: boolean
}) {
  const { t } = useTranslation()

  const feeAmount = showMaxAmount ? fee?.maxAmount : fee?.amount
  const isFeeZero = feeAmount && feeAmount.isZero()
  const loadingText = t('loading')
  const fallbackText = t('unknown')
  const zeroFeeText = t('swapScreen.transactionDetails.swapFeeWaived')

  if (isLoading) {
    return <Text style={styles.feeAmountText}>{loadingText}</Text>
  }
  if (isFeeZero) {
    return <Text style={styles.feeAmountText}>{zeroFeeText}</Text>
  }
  if (!fee || !fee.token || !feeAmount) {
    return <Text style={styles.feeAmountText}>{fallbackText}</Text>
  }
  return (
    <FeeSummary
      layout="inline"
      components={[{ amount: feeAmount, token: fee.token }]}
      primaryStyle={styles.feeAmountText}
    />
  )
}

function FeeInfoBottomSheet({
  forwardedRef,
  crossChainFee,
  appFee,
  networkFee,
  fetchingSwapQuote,
}: Props) {
  const { t } = useTranslation()

  return (
    <BottomSheet
      forwardedRef={forwardedRef}
      title={t('swapScreen.transactionDetails.fees')}
      testId="FeeInfoBottomSheet"
    >
      <Text style={styles.label}>{t('swapScreen.transactionDetails.feesBreakdown')}</Text>
      <View style={styles.row} testID="SwapScreen/FeeInfoBottomSheet/EstimatedNetworkFee">
        <Text style={styles.bodyText}>
          {t('swapScreen.transactionDetails.estimatedNetworkFee')}
        </Text>
        <FeeAmount fee={networkFee} isLoading={fetchingSwapQuote} />
      </View>
      <View style={styles.row} testID="SwapScreen/FeeInfoBottomSheet/MaxNetworkFee">
        <Text style={styles.bodyText}>{t('swapScreen.transactionDetails.maxNetworkFee')}</Text>
        <FeeAmount fee={networkFee} showMaxAmount isLoading={fetchingSwapQuote} />
      </View>

      <View style={styles.divider} />
      <View style={styles.row} testID="SwapScreen/FeeInfoBottomSheet/AppFee">
        <Text style={styles.bodyText}>{t('swapScreen.transactionDetails.appFee')}</Text>
        <FeeAmount fee={appFee} isLoading={fetchingSwapQuote} />
      </View>

      {crossChainFee && (
        <>
          <View style={styles.divider} />
          <View style={styles.row} testID="SwapScreen/FeeInfoBottomSheet/EstimatedCrossChainFee">
            <Text style={styles.bodyText}>
              {t('swapScreen.transactionDetails.estimatedCrossChainFee')}
            </Text>
            <FeeAmount fee={crossChainFee} isLoading={fetchingSwapQuote} />
          </View>
          <View style={styles.row} testID="SwapScreen/FeeInfoBottomSheet/MaxCrossChainFee">
            <Text style={styles.bodyText}>
              {t('swapScreen.transactionDetails.maxCrossChainFee')}
            </Text>
            <FeeAmount fee={crossChainFee} showMaxAmount isLoading={fetchingSwapQuote} />
          </View>
        </>
      )}

      <View style={styles.moreInfoContainer}>
        <Text style={styles.label}>{t('swapScreen.transactionDetails.feesMoreInfoLabel')}</Text>
        <Text style={styles.infoText}>
          <Trans
            i18nKey={'swapScreen.transactionDetails.feesInfo'}
            context={
              crossChainFee && appFee?.percentage.gt(0)
                ? 'crossChainWithAppFee'
                : crossChainFee
                  ? 'crossChain'
                  : appFee?.percentage.gt(0)
                    ? 'sameChainWithAppFee'
                    : 'sameChain'
            }
            tOptions={{
              appFeePercentage: appFee?.percentage.toFormat(),
            }}
          />
        </Text>
      </View>

      <Button
        type={BtnTypes.SECONDARY}
        size={BtnSizes.FULL}
        onPress={() => {
          forwardedRef.current?.close()
        }}
        text={t('swapScreen.transactionDetails.infoDismissButton')}
      />
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.Tiny4,
    gap: Spacing.Smallest8,
  },
  divider: {
    marginVertical: Spacing.Small12,
    height: 1,
    backgroundColor: Colors.gray2,
    width: '100%',
  },
  label: {
    ...typeScale.labelSemiBoldSmall,
    paddingVertical: Spacing.Tiny4,
  },
  bodyText: {
    ...typeScale.bodySmall,
  },
  feeAmountText: {
    ...typeScale.bodySmall,
    textAlign: 'right',
    flex: 1,
  },
  infoText: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  moreInfoContainer: {
    marginTop: Spacing.Large32,
    marginBottom: Spacing.XLarge48,
    gap: Spacing.Smallest8,
  },
})

export default FeeInfoBottomSheet
