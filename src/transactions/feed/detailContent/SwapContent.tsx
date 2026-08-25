import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import RowDivider from 'src/components/RowDivider'
import TokenAmountWithBrand from 'src/components/TokenAmountWithBrand'
import { formatValueToDisplay, getTokenSymbol } from 'src/components/TokenDisplay'
import { LocalCurrencyCode, LocalCurrencySymbol } from 'src/localCurrency/consts'
import {
  getLocalCurrencyCode,
  getLocalCurrencySymbol,
  usdToLocalCurrencyRateSelector,
} from 'src/localCurrency/selectors'
import { useSelector } from 'src/redux/hooks'
import { NETWORK_NAMES } from 'src/shared/conts'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTokensList } from 'src/tokens/hooks'
import FeeRowItem from 'src/transactions/feed/detailContent/FeeRowItem'
import { useReceiptNetworkFee } from 'src/transactions/useReceiptNetworkFee'
import {
  FeeType,
  TokenExchange,
  TokenTransactionTypeV2,
  TransactionStatus,
} from 'src/transactions/types'
export interface Props {
  transaction: TokenExchange
}

// Note that this is tested from TransactionDetailsScreen.test.tsx
export default function SwapContent({ transaction }: Props) {
  const { t } = useTranslation()
  const tokensList = useTokensList()

  const fromToken = tokensList.find((token) => token.tokenId === transaction.outAmount.tokenId)
  const toToken = tokensList.find((token) => token.tokenId === transaction.inAmount.tokenId)
  const isCrossChainSwap = transaction.type === TokenTransactionTypeV2.CrossChainSwapTransaction
  // EIP-7702 atomic batches list every leg in fromTokenAmounts. When >1, the
  // detail screen renders one "swapFrom" row per leg so the user sees the full
  // breakdown. Exchange rate is suppressed because there is no single rate
  // when the inputs are heterogeneous.
  const fromLegs = transaction.fromTokenAmounts ?? []
  const isMultiLegSwap = fromLegs.length > 1

  const showExchangeRate =
    !isMultiLegSwap &&
    transaction.status === TransactionStatus.Complete &&
    !new BigNumber(transaction.inAmount.value).isNaN() &&
    !!fromToken &&
    !!toToken

  // Fall back to reading the receipt off-chain whenever the upstream feed
  // either omits the SecurityFee entirely OR ships it with a zero value or
  // an unresolvable token (Valora legacy feed does this for atomic 7702
  // batches; TuCop backend indexer does it for wallets outside its watched
  // set + while its RPC lags). Any of those cases would otherwise render
  // as "Tarifa de red -" on the detail screen even after this row was wired.
  const indexerNetworkFee = transaction.fees.find((f) => f.type === FeeType.SecurityFee)
  const indexerNetworkFeeIsUsable =
    !!indexerNetworkFee && new BigNumber(indexerNetworkFee.amount.value).gt(0)
  const { fee: receiptNetworkFee } = useReceiptNetworkFee({
    transactionHash: transaction.transactionHash,
    networkId: transaction.networkId,
    skip: indexerNetworkFeeIsUsable || transaction.status !== TransactionStatus.Complete,
  })
  // Swap slice records the Squid integrator fee per-txHash at completion
  // time (see swap/slice.feeMetadataByTxHash + the 4 sagas that dispatch
  // recordSwapFeeMetadata). This lets the tx-details 'Cambiar' screen
  // render 'Tarifa del proveedor' consistently with the immediate success
  // screen — the backend indexer doesn't emit AppFee for these paths and
  // the row would otherwise disappear once the pending tx settles.
  const feeMetadata = useSelector(
    (state) => state.swap.feeMetadataByTxHash[transaction.transactionHash.toLowerCase()]
  )
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const localCurrencyCode = useSelector(getLocalCurrencyCode)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const appFeeLocalLabel = useMemo(() => {
    const indexerAppFee = transaction.fees.find((f) => f.type === FeeType.AppFee)
    // Indexer-supplied AppFee (already rendered by the FeeRowItem below via
    // feesForDisplay) takes precedence to avoid duplicating the row.
    if (indexerAppFee) return null
    if (!feeMetadata) return null
    const parsed = new BigNumber(feeMetadata.appFeeUsd)
    if (!parsed.isFinite() || parsed.lte(0)) return null
    if (!usdToLocalRate) return `≈ $${parsed.toFormat(2)}`
    const localAmount = parsed.multipliedBy(usdToLocalRate)
    const decimals = localCurrencyCode === LocalCurrencyCode.COP ? 0 : 2
    return `≈ ${localCurrencySymbol}${localAmount.toFormat(decimals)}`
  }, [transaction.fees, feeMetadata, usdToLocalRate, localCurrencyCode, localCurrencySymbol])

  const feesForDisplay = useMemo(() => {
    if (indexerNetworkFeeIsUsable || !receiptNetworkFee) return transaction.fees
    // Drop the zero/broken SecurityFee (if any) before appending the
    // synthesized one so FeeRowItem does not pick the placeholder first.
    const withoutBadFee = transaction.fees.filter((f) => f.type !== FeeType.SecurityFee)
    return [...withoutBadFee, receiptNetworkFee]
  }, [transaction.fees, indexerNetworkFeeIsUsable, receiptNetworkFee])

  return (
    <View style={styles.contentContainer}>
      {isMultiLegSwap ? (
        fromLegs.map((leg, idx) => (
          <View style={styles.row} key={`${leg.tokenId}-${idx}`}>
            <Text style={styles.bodyText}>{t('swapTransactionDetailPage.swapFrom')}</Text>
            <TokenAmountWithBrand
              amount={leg.value.toString()}
              tokenId={leg.tokenId}
              textStyle={styles.currencyAmountPrimaryText}
              testID={`SwapContent/swapFrom/${idx}`}
            />
          </View>
        ))
      ) : (
        <View style={styles.row}>
          <Text style={styles.bodyText}>{t('swapTransactionDetailPage.swapFrom')}</Text>
          <TokenAmountWithBrand
            amount={transaction.outAmount.value.toString()}
            tokenId={transaction.outAmount.tokenId}
            textStyle={styles.currencyAmountPrimaryText}
            testID="SwapContent/swapFrom"
          />
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.bodyText}>{t('swapTransactionDetailPage.swapTo')}</Text>
        <TokenAmountWithBrand
          amount={transaction.inAmount.value.toString()}
          tokenId={transaction.inAmount.tokenId}
          textStyle={styles.currencyAmountPrimaryText}
          showApprox={
            !!transaction.inAmount.value && transaction.status === TransactionStatus.Pending
          }
          testID="SwapContent/swapTo"
        />
      </View>
      {isCrossChainSwap && !!fromToken && !!toToken && (
        <View style={styles.row}>
          <Text style={styles.bodyText}>{t('swapTransactionDetailPage.network')}</Text>
          <Text style={styles.bodyText}>
            {t('swapTransactionDetailPage.networkValue', {
              fromNetwork: NETWORK_NAMES[fromToken.networkId],
              toNetwork: NETWORK_NAMES[toToken.networkId],
            })}
          </Text>
        </View>
      )}

      {(showExchangeRate || feesForDisplay.length > 0) && <RowDivider />}

      {showExchangeRate && (
        <View style={styles.row}>
          <Text style={styles.bodyText}>{t('swapTransactionDetailPage.rate')}</Text>
          <Text testID="SwapContent/rate" style={styles.currencyAmountPrimaryText}>
            {`1 ${getTokenSymbol(t, fromToken.symbol, fromToken.tokenId)} ≈ ${formatValueToDisplay(
              new BigNumber(transaction.inAmount.value).dividedBy(transaction.outAmount.value)
            )} ${getTokenSymbol(t, toToken.symbol, toToken.tokenId)}`}
          </Text>
        </View>
      )}

      <FeeRowItem
        fees={feesForDisplay}
        feeType={FeeType.SecurityFee}
        transactionStatus={transaction.status}
      />
      <FeeRowItem
        fees={feesForDisplay}
        feeType={FeeType.AppFee}
        transactionStatus={transaction.status}
      />
      {!!appFeeLocalLabel && (
        <View style={styles.row} testID="SwapContent/AppFee/FromMetadata">
          <Text style={styles.bodyText}>{t('swapScreen.transactionDetails.appFee')}</Text>
          <Text style={styles.currencyAmountPrimaryText}>{appFeeLocalLabel}</Text>
        </View>
      )}
      <FeeRowItem
        fees={feesForDisplay}
        feeType={FeeType.CrossChainFee}
        transactionStatus={transaction.status}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  contentContainer: {
    gap: Spacing.Smallest8,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.Regular16,
  },
  bodyText: {
    ...typeScale.bodyMedium,
    color: Colors.black,
  },
  currencyAmountPrimaryText: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    textAlign: 'right',
  },
})
