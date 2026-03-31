import BigNumber from 'bignumber.js'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { HomeEvents } from 'src/analytics/Events'
import TokenDisplay from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import { jumpstartReclaimFlowStarted } from 'src/jumpstart/slice'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useDispatch } from 'src/redux/hooks'
import { getDynamicConfigParams } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs } from 'src/statsig/types'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import { useTokenInfo } from 'src/tokens/hooks'
import TransactionFeedItemImage from 'src/transactions/feed/TransactionFeedItemImage'
import { useTransferFeedDetails } from 'src/transactions/transferFeedUtils'
import { TokenTransfer } from 'src/transactions/types'
import { formatFeedTime } from 'src/utils/time'
import { isPresent } from 'src/utils/typescript'
interface Props {
  transfer: TokenTransfer
}

function TransferFeedItem({ transfer }: Props) {
  const { i18n } = useTranslation()
  const dispatch = useDispatch()
  const { amount, timestamp } = transfer
  const isJumpstart = isJumpstartTransaction(transfer)
  const formattedTime = formatFeedTime(timestamp, i18n)

  const openTransferDetails = () => {
    if (isJumpstart) {
      dispatch(jumpstartReclaimFlowStarted())
      navigate(Screens.JumpstartTransactionDetailsScreen, { transaction: transfer })
    } else {
      navigate(Screens.TransactionDetailsScreen, { transaction: transfer })
    }

    AppAnalytics.track(HomeEvents.transaction_feed_item_select, {
      itemType: transfer.type,
    })
  }

  const tokenInfo = useTokenInfo(amount.tokenId)
  const showTokenAmount = !amount.localAmount && !tokenInfo?.priceUsd

  const { title, subtitle, recipient, customLocalAmount } = useTransferFeedDetails(
    transfer,
    isJumpstart
  )

  const colorStyle = new BigNumber(amount.value).isPositive() ? { color: colors.accent } : {}

  return (
    <Touchable testID="TransferFeedItem" onPress={openTransferDetails}>
      <View style={styles.container}>
        <TransactionFeedItemImage
          recipient={recipient}
          status={transfer.status}
          transactionType={transfer.type}
          isJumpstart={isJumpstart}
          networkId={transfer.networkId}
        />
        <View style={styles.contentContainer}>
          {/* Row 1: Title + Amount */}
          <View style={styles.row}>
            <Text style={styles.title} testID={'TransferFeedItem/title'} numberOfLines={1}>
              {title}
            </Text>
            <TokenDisplay
              amount={amount.value}
              tokenId={amount.tokenId}
              localAmount={customLocalAmount ?? amount.localAmount}
              showExplicitPositiveSign={true}
              showLocalAmount={!showTokenAmount}
              style={[styles.amount, colorStyle]}
              testID={'TransferFeedItem/amount'}
            />
          </View>
          {/* Row 2: Subtitle + Token Amount */}
          <View style={styles.row}>
            <Text style={styles.subtitle} testID={'TransferFeedItem/subtitle'} numberOfLines={1}>
              {subtitle}
            </Text>
            <TokenDisplay
              amount={amount.value}
              tokenId={amount.tokenId}
              showLocalAmount={false}
              showSymbol={true}
              hideSign={true}
              style={[styles.tokenAmount, { opacity: showTokenAmount ? 0 : 1 }]}
              testID={'TransferFeedItem/tokenAmount'}
            />
          </View>
          {/* Row 3: Timestamp */}
          <Text style={styles.timestamp} testID={'TransferFeedItem/timestamp'}>
            {formattedTime}
          </Text>
        </View>
      </View>
    </Touchable>
  )
}

function isJumpstartTransaction(tx: TokenTransfer) {
  const jumpstartConfig = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.WALLET_JUMPSTART_CONFIG]
  ).jumpstartContracts[tx.networkId]
  const jumpstartAddresses = [
    jumpstartConfig?.contractAddress,
    ...(jumpstartConfig?.retiredContractAddresses ?? []),
  ].filter(isPresent)

  return jumpstartAddresses.includes(tx.address)
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
    color: colors.black,
    textAlign: 'right',
  },
  tokenAmount: {
    ...typeScale.bodySmall,
    color: colors.gray3,
    textAlign: 'right',
  },
})

export default TransferFeedItem
