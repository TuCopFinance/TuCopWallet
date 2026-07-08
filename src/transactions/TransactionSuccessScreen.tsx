import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes } from 'src/components/Button'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import TokenDisplay, { formatValueToDisplay } from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import Touchable from 'src/components/Touchable'
import ArrowRightThick from 'src/icons/navigation/ArrowRightThick'
import DollarsIcon from 'src/icons/tokens/DollarsIcon'
import BigNumber from 'bignumber.js'
import { DOLARES_VIRTUAL_TOKEN_ID } from 'src/dollarsSpend'
import { getDollarTokenLabelKey } from 'src/tokens/dollarGroup'
import { useTokenInfo } from 'src/tokens/hooks'
import { noHeaderGestureDisabled } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
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
  } = route.params
  const hasLegs = Array.isArray(legs) && legs.length > 0

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

// Renders the on-chain amount (via TokenDisplay, which already caps decimals
// and routes through `getTokenSymbol`) and appends the brand-specific dollar
// label when the token is one of the four dollar stablecoins (USDT / USDC /
// USDm / USAT). This way the success screen reads e.g. "0.04 Tether USD"
// instead of the generic "0.04 Dolares" - the user can tell which concrete
// brand actually landed in their wallet.
function TokenAmountWithBrand({
  amount,
  tokenId,
  testID,
  textStyle,
}: {
  amount: string
  tokenId: string
  testID: string
  textStyle: object
}) {
  const { t } = useTranslation()
  const tokenInfo = useTokenInfo(tokenId)
  const brandLabelKey = getDollarTokenLabelKey(tokenId)
  // Multi-swap aggregates arrive with the virtual "Dolares" tokenId so the
  // header row renders as "3.00 Dolares" instead of picking one specific
  // stablecoin brand. There is no on-chain token registered for the virtual
  // id (useTokenInfo returns undefined), so we short-circuit here with a
  // plain amount + "Dolares" label. The per-leg breakdown further down uses
  // the concrete tokenIds and still routes through the normal brand path.
  if (tokenId === DOLARES_VIRTUAL_TOKEN_ID) {
    return (
      <View style={styles.brandRow}>
        <DollarsIcon size={24} testID={`${testID}/Icon`} />
        <Text style={textStyle} testID={testID}>
          {`${formatValueToDisplay(new BigNumber(amount))} ${t('assets.dollars')}`}
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.brandRow}>
      {tokenInfo && <TokenIcon token={tokenInfo} size={IconSize.SMALL} testID={`${testID}/Icon`} />}
      {brandLabelKey ? (
        <>
          <TokenDisplay
            amount={amount}
            tokenId={tokenId}
            showLocalAmount={false}
            showSymbol={false}
            hideSign={true}
            style={textStyle}
            testID={testID}
          />
          <Text style={textStyle}>{` ${t(brandLabelKey)}`}</Text>
        </>
      ) : (
        <TokenDisplay
          amount={amount}
          tokenId={tokenId}
          showLocalAmount={false}
          hideSign={true}
          style={textStyle}
          testID={testID}
        />
      )}
    </View>
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
  },
})

export default TransactionSuccessScreen
