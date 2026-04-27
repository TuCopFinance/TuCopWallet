import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Button from 'src/components/Button'
import TokenDisplay from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import Celebration from 'src/icons/misc/Celebration'
import ArrowRightThick from 'src/icons/navigation/ArrowRightThick'
import { noHeaderGestureDisabled } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import colors from 'src/styles/colors'
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
  } = route.params

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

  const getTitle = () => {
    switch (type) {
      case 'swap':
        return t('transactionSuccess.swap.title')
      case 'goldBuy':
        return t('transactionSuccess.goldBuy.title')
      case 'goldSell':
        return t('transactionSuccess.goldSell.title')
      case 'send':
        return t('transactionSuccess.send.title')
      case 'earnDeposit':
        return t('transactionSuccess.earnDeposit.title')
      case 'earnWithdraw':
        return t('transactionSuccess.earnWithdraw.title')
      case 'earnClaim':
        return t('transactionSuccess.earnClaim.title')
      default:
        return t('transactionSuccess.default.title')
    }
  }

  const getSubtitle = () => {
    switch (type) {
      case 'swap':
        return t('transactionSuccess.swap.subtitle')
      case 'goldBuy':
        return t('transactionSuccess.goldBuy.subtitle')
      case 'goldSell':
        return t('transactionSuccess.goldSell.subtitle')
      case 'send':
        return t('transactionSuccess.send.subtitle')
      case 'earnDeposit':
        return t('transactionSuccess.earnDeposit.subtitle')
      case 'earnWithdraw':
        return t('transactionSuccess.earnWithdraw.subtitle')
      case 'earnClaim':
        return t('transactionSuccess.earnClaim.subtitle')
      default:
        return t('transactionSuccess.default.subtitle')
    }
  }

  const showFromToDetails = () => {
    // Send only shows the sent amount, not from/to
    return type !== 'send'
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Celebration size={64} color={colors.primary} />
        </View>

        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>

        <View style={styles.detailsContainer}>
          {type === 'send' ? (
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
              {showFromToDetails() && (
                <>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('transactionSuccess.from')}</Text>
                    <TokenDisplay
                      amount={fromAmount}
                      tokenId={fromTokenId}
                      showLocalAmount={false}
                      hideSign={true}
                      style={styles.tokenDisplay}
                      testID="TransactionSuccess/FromAmount"
                    />
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('transactionSuccess.to')}</Text>
                    <TokenDisplay
                      amount={toAmount}
                      tokenId={toTokenId}
                      showLocalAmount={false}
                      hideSign={true}
                      style={styles.tokenDisplay}
                      testID="TransactionSuccess/ToAmount"
                    />
                  </View>
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
                <ArrowRightThick size={16} color={colors.primary} />
              </View>
            </Touchable>
          )}
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          style={styles.button}
          text={t('continue')}
          onPress={handleContinue}
          testID="TransactionSuccess/Continue"
        />
      </View>
    </View>
  )
}

TransactionSuccessScreen.navigationOptions = () => ({
  ...noHeaderGestureDisabled,
})

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.Large32,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    padding: Spacing.Regular16,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.Thick24,
  },
  title: {
    ...typeScale.labelLarge,
    color: colors.black,
    textAlign: 'center',
    paddingTop: Spacing.Smallest8,
    paddingBottom: Spacing.Regular16,
  },
  subtitle: {
    ...typeScale.bodyMedium,
    color: colors.gray4,
    textAlign: 'center',
    marginBottom: Spacing.Large32,
  },
  detailsContainer: {
    width: '100%',
    backgroundColor: colors.gray1,
    borderRadius: 12,
    padding: Spacing.Regular16,
    gap: Spacing.Regular16,
  },
  detailRow: {
    flexDirection: 'column',
    gap: Spacing.Smallest8,
  },
  detailLabel: {
    ...typeScale.bodySmall,
    color: colors.gray4,
  },
  tokenDisplay: {
    ...typeScale.labelMedium,
    color: colors.black,
  },
  recipientText: {
    ...typeScale.labelMedium,
    color: colors.black,
  },
  poolText: {
    ...typeScale.labelMedium,
    color: colors.black,
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
    color: colors.primary,
  },
  buttonContainer: {
    flexDirection: 'row',
  },
  button: {
    minWidth: 200,
    width: '100%',
    alignSelf: 'stretch',
    flex: 1,
    flexDirection: 'column',
  },
})

export default TransactionSuccessScreen
