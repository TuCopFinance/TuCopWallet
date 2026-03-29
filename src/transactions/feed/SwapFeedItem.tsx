import BigNumber from 'bignumber.js'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { HomeEvents } from 'src/analytics/Events'
import TokenDisplay from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import { useTokenInfo } from 'src/tokens/hooks'
import TransactionFeedItemImage from 'src/transactions/feed/TransactionFeedItemImage'
import { TokenExchange, TokenTransactionTypeV2 } from 'src/transactions/types'
import { formatFeedTime } from 'src/utils/time'
import networkConfig from 'src/web3/networkConfig'

interface Props {
  transaction: TokenExchange
}

function SwapFeedItem({ transaction }: Props) {
  const { t, i18n } = useTranslation()
  const incomingTokenInfo = useTokenInfo(transaction.inAmount.tokenId)
  const outgoingTokenInfo = useTokenInfo(transaction.outAmount.tokenId)
  const formattedTime = formatFeedTime(transaction.timestamp, i18n)

  const handleOpenTransactionDetails = () => {
    navigate(Screens.TransactionDetailsScreen, { transaction: transaction })
    AppAnalytics.track(HomeEvents.transaction_feed_item_select, {
      itemType: transaction.type,
    })
  }

  const isCrossChainSwap = transaction.type === TokenTransactionTypeV2.CrossChainSwapTransaction

  // Get friendly token name - also accepts tokenId for when token info isn't available
  const getTokenName = (token: any, tokenId?: string) => {
    // First check by tokenId (works even when token info not loaded)
    const idToCheck = tokenId || token?.tokenId
    if (idToCheck) {
      if (idToCheck === networkConfig.copmTokenId) {
        return t('assets.pesos')
      }
      if (idToCheck === networkConfig.usdtTokenId) {
        return t('assets.dollars')
      }
      if (idToCheck === networkConfig.xaut0TokenId) {
        return t('assets.gold')
      }
    }

    if (!token) {
      // Fallback: try to detect XAUt0 by address in tokenId
      if (idToCheck?.toLowerCase().includes('0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff')) {
        return t('assets.gold')
      }
      return '...'
    }

    // Check by symbol as fallback
    const symbol = token.symbol?.toLowerCase() || ''
    if (symbol === 'copm' || symbol === 'ccop') {
      return t('assets.pesos')
    }
    if (symbol === 'usdt' || symbol === 'usd₮' || symbol === 'usdt0') {
      return t('assets.dollars')
    }
    if (symbol === 'xaut0' || symbol === 'xaut') {
      return t('assets.gold')
    }

    return token.name ?? token.symbol ?? '...'
  }

  return (
    <Touchable testID="SwapFeedItem" onPress={handleOpenTransactionDetails}>
      <View style={styles.container}>
        <TransactionFeedItemImage
          status={transaction.status}
          transactionType={transaction.type}
          networkId={transaction.networkId}
          hideNetworkIcon={isCrossChainSwap}
        />
        <View style={styles.contentContainer}>
          <Text style={styles.title} testID={'SwapFeedItem/title'} numberOfLines={1}>
            {t('swapScreen.title')}
          </Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle} testID={'SwapFeedItem/subtitle'} numberOfLines={1}>
              {isCrossChainSwap
                ? t('transactionFeed.crossChainSwapTransactionLabel')
                : t('feedItemSwapPath', {
                    token1: getTokenName(outgoingTokenInfo, transaction.outAmount.tokenId),
                    token2: getTokenName(incomingTokenInfo, transaction.inAmount.tokenId),
                  })}
            </Text>
            <Text style={styles.timestamp} testID={'SwapFeedItem/timestamp'}>
              {formattedTime}
            </Text>
          </View>
        </View>
        <View style={styles.tokenAmountContainer}>
          {
            // for cross chain swaps specifically, the inAmount value is empty
            // until the transaction is completed on the destination network
            !new BigNumber(transaction.inAmount.value).isNaN() && (
              <TokenDisplay
                amount={transaction.inAmount.value}
                tokenId={transaction.inAmount.tokenId}
                showLocalAmount={false}
                showSymbol={true}
                showExplicitPositiveSign={true}
                hideSign={false}
                style={styles.amount}
                testID={'SwapFeedItem/incomingAmount'}
              />
            )
          }

          <TokenDisplay
            amount={-transaction.outAmount.value}
            tokenId={transaction.outAmount.tokenId}
            showLocalAmount={false}
            showSymbol={true}
            hideSign={false}
            style={styles.tokenAmount}
            testID={'SwapFeedItem/outgoingAmount'}
          />
        </View>
      </View>
    </Touchable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingVertical: Spacing.Small12,
    paddingHorizontal: variables.contentPadding,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: variables.contentPadding,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Tiny4,
  },
  timestamp: {
    ...typeScale.bodySmall,
    color: colors.gray3,
    fontSize: 11,
  },
  title: {
    ...typeScale.labelMedium,
  },
  subtitle: {
    ...typeScale.bodySmall,
    color: colors.gray4,
  },
  tokenAmountContainer: {
    maxWidth: '50%',
  },
  amount: {
    ...typeScale.labelMedium,
    color: colors.accent,
    flexWrap: 'wrap',
    textAlign: 'right',
  },
  tokenAmount: {
    ...typeScale.bodySmall,
    color: colors.gray4,
    flexWrap: 'wrap',
    textAlign: 'right',
  },
})

export default SwapFeedItem
