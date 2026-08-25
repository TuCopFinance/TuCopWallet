import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import TokenAmountWithBrand from 'src/components/TokenAmountWithBrand'
import TokenDisplay from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import ArrowRightThick from 'src/icons/navigation/ArrowRightThick'
import { LocalCurrencyCode, LocalCurrencySymbol } from 'src/localCurrency/consts'
import {
  getLocalCurrencyCode,
  getLocalCurrencySymbol,
  usdToLocalCurrencyRateSelector,
} from 'src/localCurrency/selectors'
import { noHeaderGestureDisabled } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useReceiptNetworkFee } from 'src/transactions/useReceiptNetworkFee'
import { blockExplorerUrls } from 'src/web3/networkConfig'

type RouteProps = NativeStackScreenProps<StackParamList, Screens.TransactionSuccessScreen>
type Props = RouteProps

function TransactionSuccessScreen({ route }: Props) {
  const { t } = useTranslation()
  const {
    fromTokenId,
    toTokenId,
    fromAmount,
    toAmount,
    transactionHash,
    networkId,
    type,
    recipientAddress,
    recipientName,
    poolName,
    legs,
    appFeeUsd,
  } = route.params
  const hasLegs = Array.isArray(legs) && legs.length > 0

  // Pull the on-chain network fee off the receipt so the immediate success
  // screen shows the actual gas paid — the tx-details screen has the same
  // fix but the user hits this one first, right after Confirm.
  const { fee: networkFee } = useReceiptNetworkFee({
    transactionHash: transactionHash ?? '',
    networkId: networkId!,
    skip: !transactionHash || !networkId,
  })

  // Squid integrator fee arrives from the saga as an absolute USD amount
  // (already deducted from the delivered token by Squid at quote time; no
  // separate on-chain transfer). Convert to local currency for display so
  // the user reads "≈ COP $X" without doing the mental USD math themselves.
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const localCurrencyCode = useSelector(getLocalCurrencyCode)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const appFeeLocalLabel = (() => {
    if (!appFeeUsd) return null
    const parsed = new BigNumber(appFeeUsd)
    if (!parsed.isFinite() || parsed.lte(0)) return null
    if (!usdToLocalRate) return `≈ $${parsed.toFormat(2)}` // fallback: raw USD
    const localAmount = parsed.multipliedBy(usdToLocalRate)
    const decimals = localCurrencyCode === LocalCurrencyCode.COP ? 0 : 2
    return `≈ ${localCurrencySymbol}${localAmount.toFormat(decimals)}`
  })()

  const handleViewOnExplorer = () => {
    if (transactionHash && networkId && blockExplorerUrls[networkId]) {
      const explorerUrl = blockExplorerUrls[networkId].baseTxUrl
      navigate(Screens.WebViewScreen, {
        uri: new URL(transactionHash, explorerUrl).toString(),
      })
    }
  }

  const handleContinue = () => {
    navigate(Screens.TabActivity)
  }

  const titleKey = `transactionSuccess.${type}.title`
  const subtitleKey = `transactionSuccess.${type}.subtitle`
  // i18next falls back to the default keys gracefully if `type` is unknown.
  const title = t(titleKey, { defaultValue: t('transactionSuccess.default.title') })
  const subtitle = t(subtitleKey, { defaultValue: t('transactionSuccess.default.subtitle') })

  const isSend = type === 'send'
  const showFromToDetails = !isSend

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <StateCard variant="success" title={title} subtitle={subtitle}>
          <View style={styles.detailsContainer}>
            {isSend ? (
              <>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('transactionSuccess.amount')}</Text>
                  <TokenDisplay
                    amount={fromAmount}
                    tokenId={fromTokenId}
                    showLocalAmount={false}
                    hideSign={true}
                    style={styles.tokenDisplay}
                    testID="TransactionSuccess/Amount"
                  />
                </View>
                {(!!recipientName || !!recipientAddress) && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('transactionSuccess.recipient')}</Text>
                    <Text style={styles.recipientText} testID="TransactionSuccess/Recipient">
                      {recipientName || recipientAddress}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <>
                {!!poolName && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('transactionSuccess.pool')}</Text>
                    <Text style={styles.poolText} testID="TransactionSuccess/Pool">
                      {poolName}
                    </Text>
                  </View>
                )}
                {showFromToDetails && (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('transactionSuccess.from')}</Text>
                      <TokenAmountWithBrand
                        amount={fromAmount}
                        tokenId={fromTokenId}
                        testID="TransactionSuccess/FromAmount"
                        textStyle={styles.tokenDisplay}
                      />
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{t('transactionSuccess.to')}</Text>
                      <TokenAmountWithBrand
                        amount={toAmount}
                        tokenId={toTokenId}
                        testID="TransactionSuccess/ToAmount"
                        textStyle={styles.tokenDisplay}
                      />
                    </View>
                    {hasLegs && (
                      <View style={styles.breakdownContainer}>
                        <Text style={styles.breakdownHeader}>
                          {t('transactionSuccess.breakdownHeader')}
                        </Text>
                        {legs!.map((leg, idx) => (
                          <View
                            style={styles.breakdownRow}
                            key={`${leg.transactionHash}-${idx}`}
                            testID={`TransactionSuccess/Leg${idx}`}
                          >
                            <TokenAmountWithBrand
                              amount={leg.fromAmount}
                              tokenId={leg.fromTokenId}
                              testID={`TransactionSuccess/Leg${idx}/From`}
                              textStyle={styles.breakdownAmount}
                            />
                            <ArrowRightThick size={12} color={Colors.gray4} />
                            <TokenAmountWithBrand
                              amount={leg.toAmount}
                              tokenId={toTokenId}
                              testID={`TransactionSuccess/Leg${idx}/To`}
                              textStyle={styles.breakdownAmount}
                            />
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            {/* Fee rows follow the same layout convention as FeeRowItem in
                src/transactions/feed/detailContent — single row with label
                left + crypto/local amounts stacked right — so the immediate
                success screen and the deferred tx-details screen read
                identically. Complementary info: bodyMedium for both label
                and primary value, bodySmall + gray3 for the secondary
                local-currency line. */}
            {networkFee && (
              <View style={styles.feeRow} testID="TransactionSuccess/NetworkFee">
                <Text style={styles.feeLabel}>{t('transactionFeed.networkFee')}</Text>
                <View style={styles.feeValueColumn}>
                  <TokenDisplay
                    amount={networkFee.amount.value}
                    tokenId={networkFee.amount.tokenId}
                    showLocalAmount={false}
                    hideSign={true}
                    showSymbol={true}
                    style={styles.feeValuePrimary}
                    testID="TransactionSuccess/NetworkFee/Crypto"
                  />
                  <TokenDisplay
                    amount={networkFee.amount.value}
                    tokenId={networkFee.amount.tokenId}
                    showLocalAmount={true}
                    hideSign={true}
                    style={styles.feeValueSecondary}
                    testID="TransactionSuccess/NetworkFee/Local"
                  />
                </View>
              </View>
            )}

            {!!appFeeLocalLabel && (
              <View style={styles.feeRow} testID="TransactionSuccess/AppFee">
                <Text style={styles.feeLabel}>{t('swapScreen.transactionDetails.appFee')}</Text>
                <Text style={styles.feeValuePrimary} testID="TransactionSuccess/AppFee/Local">
                  {appFeeLocalLabel}
                </Text>
              </View>
            )}

            {!!transactionHash && !!networkId && !!blockExplorerUrls[networkId] && (
              <Touchable
                style={styles.explorerLink}
                onPress={handleViewOnExplorer}
                testID="TransactionSuccess/ViewExplorer"
              >
                <View style={styles.explorerLinkContent}>
                  <Text style={styles.explorerLinkText}>
                    {t('transactionSuccess.viewOnExplorer')}
                  </Text>
                  <ArrowRightThick size={16} color={Colors.primary} />
                </View>
              </Touchable>
            )}
          </View>
        </StateCard>
      </View>

      <StickyCtaBottom>
        <Button
          size={BtnSizes.FULL}
          text={t('continue')}
          onPress={handleContinue}
          testID="TransactionSuccess/Continue"
        />
      </StickyCtaBottom>
    </SafeAreaView>
  )
}

TransactionSuccessScreen.navigationOptions = () => ({
  ...noHeaderGestureDisabled,
})

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  detailsContainer: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.Regular16,
    gap: Spacing.Regular16,
    marginTop: Spacing.Regular16,
  },
  detailRow: {
    flexDirection: 'column',
    gap: Spacing.Smallest8,
  },
  breakdownContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray2,
    paddingTop: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  breakdownHeader: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.Smallest8,
  },
  breakdownAmount: {
    ...typeScale.bodySmall,
    color: Colors.black,
  },
  detailLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  tokenDisplay: {
    ...typeScale.labelMedium,
    color: Colors.black,
  },
  // Fee-row styles mirror src/transactions/feed/detailContent/FeeRowItem so
  // the immediate success screen and the deferred tx-details 'Cambiar'
  // screen read identically. Any change here should propagate to
  // FeeRowItem.styles (or vice versa) to keep both surfaces uniform.
  feeRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.Regular16,
    marginTop: Spacing.Smallest8,
  },
  feeLabel: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    flex: 1,
  },
  feeValueColumn: {
    alignItems: 'flex-end',
  },
  feeValuePrimary: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    textAlign: 'right',
  },
  feeValueSecondary: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    textAlign: 'right',
  },
  recipientText: {
    ...typeScale.labelMedium,
    color: Colors.black,
  },
  poolText: {
    ...typeScale.labelMedium,
    color: Colors.black,
    fontWeight: '600',
  },
  explorerLink: {
    marginTop: Spacing.Smallest8,
    paddingVertical: Spacing.Smallest8,
  },
  explorerLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.Tiny4,
  },
  explorerLinkText: {
    ...typeScale.labelSmall,
    color: Colors.primary,
  },
})

export default TransactionSuccessScreen
