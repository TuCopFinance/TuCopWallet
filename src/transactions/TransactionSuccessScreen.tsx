import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button from 'src/components/Button'
import TokenDisplay from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import Celebration from 'src/icons/misc/Celebration'
import ArrowRightThick from 'src/icons/navigation/ArrowRightThick'
import { noHeaderGestureDisabled } from 'src/navigator/Headers'
import { navigate, navigateHome } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTokenInfo } from 'src/tokens/hooks'
import { blockExplorerUrls } from 'src/web3/networkConfig'

type RouteProps = NativeStackScreenProps<StackParamList, Screens.TransactionSuccessScreen>
type Props = RouteProps

function TransactionSuccessScreen({ route }: Props) {
  const { t } = useTranslation()
  const { fromTokenId, toTokenId, fromAmount, toAmount, transactionHash, networkId, type } =
    route.params

  const fromToken = useTokenInfo(fromTokenId)
  const toToken = useTokenInfo(toTokenId)

  const handleViewOnExplorer = () => {
    if (transactionHash && networkId && blockExplorerUrls[networkId]) {
      const explorerUrl = blockExplorerUrls[networkId].baseTxUrl
      navigate(Screens.WebViewScreen, {
        uri: new URL(transactionHash, explorerUrl).toString(),
      })
    }
  }

  const handleContinue = () => {
    navigateHome()
  }

  const getTitle = () => {
    switch (type) {
      case 'swap':
        return t('transactionSuccess.swap.title')
      case 'goldBuy':
        return t('transactionSuccess.goldBuy.title')
      case 'goldSell':
        return t('transactionSuccess.goldSell.title')
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
      default:
        return t('transactionSuccess.default.subtitle')
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Celebration size={64} color={colors.primary} />
        </View>

        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>

        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('transactionSuccess.from')}</Text>
            {fromToken && (
              <TokenDisplay
                amount={fromAmount}
                tokenId={fromTokenId}
                showLocalAmount={true}
                hideSign={true}
                style={styles.tokenDisplay}
                testID="TransactionSuccess/FromAmount"
              />
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('transactionSuccess.to')}</Text>
            {toToken && (
              <TokenDisplay
                amount={toAmount}
                tokenId={toTokenId}
                showLocalAmount={true}
                hideSign={true}
                style={styles.tokenDisplay}
                testID="TransactionSuccess/ToAmount"
              />
            )}
          </View>

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
    </SafeAreaView>
  )
}

TransactionSuccessScreen.navigationOptions = () => ({
  ...noHeaderGestureDisabled,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.Thick24,
    paddingTop: Spacing.Thick24 * 2,
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
    ...typeScale.titleMedium,
    color: colors.black,
    textAlign: 'center',
    marginBottom: Spacing.Smallest8,
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
    paddingHorizontal: Spacing.Thick24,
    paddingVertical: Spacing.Regular16,
  },
  button: {
    width: '100%',
  },
})

export default TransactionSuccessScreen
