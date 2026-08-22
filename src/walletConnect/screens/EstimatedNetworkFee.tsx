import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import FeeSummary from 'src/components/FeeSummary'
import SkeletonPlaceholder from 'src/components/SkeletonPlaceholder'
import { useSelector } from 'src/redux/hooks'
import { NETWORK_NAMES } from 'src/shared/conts'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { nativeFeeCurrencySelector, tokensByIdSelector } from 'src/tokens/selectors'
import { TokenBalance, TokenBalances } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import {
  getEstimatedGasFee,
  getFeeCurrencyToken,
  getFeeDecimals,
} from 'src/viem/prepareTransactions'
import {
  SerializableTransactionRequest,
  getPreparedTransaction,
} from 'src/viem/preparedTransactionSerialization'

const TAG = 'WalletConnect/EstimatedNetworkFee'

interface Props {
  isLoading: boolean
  networkId: NetworkId
  transactions: SerializableTransactionRequest[]
}

function getNetworkFee(
  transactions: SerializableTransactionRequest[],
  networkId: NetworkId,
  tokensById: TokenBalances,
  nativeFeeCurrency: TokenBalance | undefined
) {
  try {
    const preparedTransactions = transactions.map(getPreparedTransaction)
    const feeCurrency = getFeeCurrencyToken(
      preparedTransactions,
      networkId,
      tokensById,
      nativeFeeCurrency
    )
    if (!feeCurrency) {
      Logger.warn(TAG, 'No fee token info found', { transactions, networkId })
      return null
    }

    const feeDecimals = getFeeDecimals(preparedTransactions, feeCurrency)
    return {
      token: feeCurrency,
      amount: getEstimatedGasFee(preparedTransactions).shiftedBy(-feeDecimals),
    }
  } catch (error) {
    Logger.warn(TAG, 'Failed to get estimated gas fee', error)
    return null
  }
}

export default function EstimatedNetworkFee({ isLoading, networkId, transactions }: Props) {
  const { t } = useTranslation()

  const tokensById = useSelector((state) => tokensByIdSelector(state, [networkId]))
  const nativeFeeCurrency = useSelector((state) => nativeFeeCurrencySelector(state, networkId))
  const networkFee = getNetworkFee(transactions, networkId, tokensById, nativeFeeCurrency)

  const networkName = NETWORK_NAMES[networkId]

  if (!networkFee || !networkName) {
    Logger.warn(TAG, 'Insufficient information to display fee details', {
      networkName,
      transactions,
    })
    return null
  }

  return (
    <View style={styles.container} testID="EstimatedNetworkFee">
      <Text style={styles.labelText}>
        {t('walletConnectRequest.estimatedNetworkFee', { networkName })}
      </Text>
      <View>
        <View style={isLoading ? styles.contentLoading : undefined}>
          <FeeSummary
            layout="stacked"
            components={[{ amount: networkFee.amount, token: networkFee.token }]}
            primaryStyle={styles.amountPrimaryText}
            secondaryStyle={styles.amountSecondaryText}
            testID="EstimatedNetworkFee/Amount"
          />
        </View>
        {!!isLoading && (
          <View style={StyleSheet.absoluteFill} testID="EstimatedNetworkFee/Loading">
            <SkeletonPlaceholder
              borderRadius={100} // ensure rounded corners with font scaling
              backgroundColor={Colors.gray2}
              highlightColor={Colors.white}
            >
              <View style={styles.loader} />
            </SkeletonPlaceholder>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.Thick24,
  },
  labelText: {
    ...typeScale.labelXSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Tiny4,
  },
  amountPrimaryText: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  amountSecondaryText: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
  },
  contentLoading: {
    opacity: 0,
  },
  loader: {
    height: '100%',
    width: 100,
  },
})
