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
  // EIP-7702 atomic batches from the TuCop indexer feed (and from the
  // fetch-Blockscout classifier for the same batches) populate
  // fromTokenAmounts with every leg of the batch. When every leg is a
  // dollar-family token (USDT/USDC/USDm/USAT), the user's mental model
  // treats the whole thing as one "Dolares -> Pesos" swap of the total,
  // matching the swap flow UI where the aggregate is picked as "Dolares".
  // We collapse the subtitle to "Dolares > Pesos" and show the summed
  // outgoing amount as "Dolares", ignoring the per-leg tokenIds.
  const fromLegCount = transaction.fromTokenAmounts?.length ?? 0
  const isMultiLegSwap = fromLegCount > 1
  const DOLLAR_FAMILY_TOKEN_IDS = new Set(
    [
      networkConfig.usdtTokenId,
      networkConfig.usdcTokenId,
      networkConfig.usdmTokenId,
      networkConfig.usatTokenId,
    ].filter(Boolean)
  )
  const isMultiDollarSwap =
    isMultiLegSwap &&
    (transaction.fromTokenAmounts ?? []).every((leg) => DOLLAR_FAMILY_TOKEN_IDS.has(leg.tokenId))
  const multiDollarOutgoingTotal = isMultiDollarSwap
    ? (transaction.fromTokenAmounts ?? [])
        .reduce((sum, leg) => sum.plus(new BigNumber(leg.value)), new BigNumber(0))
        .toFixed()
    : null

  // Get friendly token name - also accepts tokenId for when token info isn't available.
  // Per .claude/rules/tokens.md the entire USAT/USDm/USDC/USDT group is shown as
  // "Dolares" in the UI; only XAUt0 is "Oro" and COPm is "Pesos".
  //
  // For the swap feed we go one step further: when the concrete dollar-family
  // token is known (USDT / USDC / USDm / USAT), we append the underlying symbol
  // in parens so the user can distinguish "Dolares (USDT)" vs "Dolares (USDC)"
  // when they scroll through a Pesos -> Dolares history full of legs. Multi-leg
  // swaps skip this suffix because the subtitle is a count ("3 monedas a Pesos").
  const getTokenName = (token: any, tokenId?: string) => {
    // First check by tokenId (works even when token info not loaded)
    const idToCheck = tokenId || token?.tokenId
    if (idToCheck) {
      if (idToCheck === networkConfig.copmTokenId) {
        return t('assets.pesos')
      }
      if (idToCheck === networkConfig.usdtTokenId) {
        return `${t('assets.dollars')} (USDT)`
      }
      if (idToCheck === networkConfig.usdcTokenId) {
        return `${t('assets.dollars')} (USDC)`
      }
      if (idToCheck === networkConfig.usdmTokenId) {
        return `${t('assets.dollars')} (USDm)`
      }
      if (idToCheck === networkConfig.usatTokenId) {
        return `${t('assets.dollars')} (USAT)`
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

    // Check by symbol as fallback. Note 'cusd' is the legacy on-chain symbol for
    // USDm and 'usat' is sometimes shown lowercased; both must collapse to Dolares.
    const symbol = token.symbol?.toLowerCase() || ''
    if (symbol === 'copm' || symbol === 'ccop') {
      return t('assets.pesos')
    }
    // Symbol-fallback path: same "Dolares (X)" convention as the tokenId
    // branch above, so a swap row without token registry hydration still
    // disambiguates between the concrete dollar-family assets.
    if (symbol === 'usdt' || symbol === 'usd₮' || symbol === 'usdt0') {
      return `${t('assets.dollars')} (USDT)`
    }
    if (symbol === 'usdc') {
      return `${t('assets.dollars')} (USDC)`
    }
    if (symbol === 'usdm' || symbol === 'cusd') {
      return `${t('assets.dollars')} (USDm)`
    }
    if (symbol === 'usat') {
      return `${t('assets.dollars')} (USAT)`
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
          {/* Row 1: Title + Incoming Amount (same pattern as TransferFeedItem) */}
          <View style={styles.row}>
            <Text style={styles.title} testID={'SwapFeedItem/title'} numberOfLines={1}>
              {t('feedItemSwapTitle')}
            </Text>
            {!new BigNumber(transaction.inAmount.value).isNaN() && (
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
            )}
          </View>
          {/* Row 2: Subtitle + Outgoing Amount. adjustsFontSizeToFit lets the
              subtitle scale down when the concrete "(USDT)" / "(USDC)" suffix
              would otherwise truncate; other feed items don't need this
              because their subtitles are short. */}
          <View style={styles.row}>
            <Text
              style={styles.subtitle}
              testID={'SwapFeedItem/subtitle'}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
            >
              {isCrossChainSwap
                ? t('transactionFeed.crossChainSwapTransactionLabel')
                : isMultiDollarSwap
                  ? t('feedItemSwapPath', {
                      token1: t('assets.dollars'),
                      token2: getTokenName(incomingTokenInfo, transaction.inAmount.tokenId),
                    })
                  : isMultiLegSwap
                    ? t('feedItemSwapPathMulti', {
                        count: fromLegCount,
                        token2: getTokenName(incomingTokenInfo, transaction.inAmount.tokenId),
                      })
                    : t('feedItemSwapPath', {
                        token1: getTokenName(outgoingTokenInfo, transaction.outAmount.tokenId),
                        token2: getTokenName(incomingTokenInfo, transaction.inAmount.tokenId),
                      })}
            </Text>
            {isMultiDollarSwap && multiDollarOutgoingTotal ? (
              <Text style={styles.tokenAmount} testID={'SwapFeedItem/outgoingAmount'}>
                {`-${new BigNumber(multiDollarOutgoingTotal).toFixed(2)} ${t('assets.dollars')}`}
              </Text>
            ) : (
              <TokenDisplay
                amount={-transaction.outAmount.value}
                tokenId={transaction.outAmount.tokenId}
                showLocalAmount={false}
                showSymbol={true}
                hideSign={false}
                style={styles.tokenAmount}
                testID={'SwapFeedItem/outgoingAmount'}
              />
            )}
          </View>
          {/* Row 3: Timestamp */}
          <Text style={styles.timestamp} testID={'SwapFeedItem/timestamp'}>
            {formattedTime}
          </Text>
        </View>
      </View>
    </Touchable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingVertical: Spacing.Small12,
    paddingHorizontal: variables.contentPadding,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: variables.contentPadding,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timestamp: {
    ...typeScale.bodyXXSmall,
    color: colors.gray3,
    marginTop: 2,
  },
  title: {
    ...typeScale.labelMedium,
    flex: 1,
  },
  subtitle: {
    ...typeScale.bodySmall,
    color: colors.gray3,
    flex: 1,
  },
  amount: {
    ...typeScale.labelMedium,
    color: colors.accent,
    textAlign: 'right',
  },
  tokenAmount: {
    ...typeScale.bodySmall,
    color: colors.gray3,
    textAlign: 'right',
  },
})

export default SwapFeedItem
