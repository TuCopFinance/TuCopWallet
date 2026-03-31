import BigNumber from 'bignumber.js'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { EarnEvents } from 'src/analytics/Events'
import TokenDisplay from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import { useEarnPositionProviderName } from 'src/earn/hooks'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import TransactionFeedItemImage from 'src/transactions/feed/TransactionFeedItemImage'
import {
  EarnClaimReward,
  EarnDeposit,
  EarnSwapDeposit,
  EarnWithdraw,
  TokenTransactionTypeV2,
} from 'src/transactions/types'
import { formatFeedTime } from 'src/utils/time'

interface Props {
  transaction: EarnWithdraw | EarnDeposit | EarnClaimReward | EarnSwapDeposit
}

export default function EarnFeedItem({ transaction }: Props) {
  const { t, i18n } = useTranslation()
  const providerName = useEarnPositionProviderName(
    transaction.type === TokenTransactionTypeV2.EarnSwapDeposit
      ? transaction.deposit.providerId
      : transaction.providerId
  )
  const formattedTime = formatFeedTime(transaction.timestamp, i18n)

  let title: string
  let subtitle: string
  let amountValue: BigNumber
  let tokenId: string

  switch (transaction.type) {
    case TokenTransactionTypeV2.EarnSwapDeposit:
      title = t('earnFlow.transactionFeed.earnDepositTitle')
      subtitle = t('earnFlow.transactionFeed.earnDepositSubtitle', { providerName })
      amountValue = new BigNumber(-transaction.deposit.outAmount.value)
      tokenId = transaction.deposit.outAmount.tokenId
      break
    case TokenTransactionTypeV2.EarnDeposit:
      title = t('earnFlow.transactionFeed.earnDepositTitle')
      subtitle = t('earnFlow.transactionFeed.earnDepositSubtitle', { providerName })
      amountValue = new BigNumber(-transaction.outAmount.value)
      tokenId = transaction.outAmount.tokenId
      break
    case TokenTransactionTypeV2.EarnWithdraw:
      title = t('earnFlow.transactionFeed.earnWithdrawTitle')
      subtitle = t('earnFlow.transactionFeed.earnWithdrawSubtitle', { providerName })
      amountValue = new BigNumber(transaction.inAmount.value)
      tokenId = transaction.inAmount.tokenId
      break
    case TokenTransactionTypeV2.EarnClaimReward:
      title = t('earnFlow.transactionFeed.earnClaimTitle')
      subtitle = t('earnFlow.transactionFeed.earnClaimSubtitle', { providerName })
      amountValue = new BigNumber(transaction.amount.value)
      tokenId = transaction.amount.tokenId
      break
  }

  const isPositive =
    transaction.type !== TokenTransactionTypeV2.EarnDeposit &&
    transaction.type !== TokenTransactionTypeV2.EarnSwapDeposit

  return (
    <Touchable
      testID={`EarnFeedItem/${transaction.transactionHash}`}
      onPress={() => {
        AppAnalytics.track(EarnEvents.earn_feed_item_select, { origin: transaction.type })
        navigate(Screens.TransactionDetailsScreen, { transaction })
      }}
    >
      <View style={styles.container}>
        <TransactionFeedItemImage
          status={transaction.status}
          transactionType={transaction.type}
          networkId={transaction.networkId}
        />
        <View style={styles.contentContainer}>
          {/* Row 1: Title + Amount */}
          <View style={styles.row}>
            <Text style={styles.title} testID={'EarnFeedItem/title'} numberOfLines={1}>
              {title}
            </Text>
            <TokenDisplay
              amount={amountValue}
              tokenId={tokenId}
              showLocalAmount={true}
              showExplicitPositiveSign={true}
              style={[styles.amount, isPositive && { color: Colors.accent }]}
              testID={'EarnFeedItem/amount'}
            />
          </View>
          {/* Row 2: Subtitle + Token Amount */}
          <View style={styles.row}>
            <Text style={styles.subtitle} testID={'EarnFeedItem/subtitle'} numberOfLines={1}>
              {subtitle}
            </Text>
            <TokenDisplay
              amount={amountValue}
              tokenId={tokenId}
              showLocalAmount={false}
              showSymbol={true}
              hideSign={true}
              style={styles.tokenAmount}
              testID={'EarnFeedItem/tokenAmount'}
            />
          </View>
          {/* Row 3: Timestamp */}
          <Text style={styles.timestamp} testID={'EarnFeedItem/timestamp'}>
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
    color: Colors.gray3,
    marginTop: 2,
  },
  title: {
    ...typeScale.labelMedium,
    flex: 1,
  },
  subtitle: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    flex: 1,
  },
  amount: {
    ...typeScale.labelMedium,
    color: Colors.black,
    textAlign: 'right',
  },
  tokenAmount: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    textAlign: 'right',
  },
})
