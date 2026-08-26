import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native'
import FeeSummary, { FeeComponent } from 'src/components/FeeSummary'
import RowDivider from 'src/components/RowDivider'
import TokenAmountWithBrand from 'src/components/TokenAmountWithBrand'
import { formatValueToDisplay, getTokenSymbol } from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import { useSelector } from 'src/redux/hooks'
import { NETWORK_NAMES } from 'src/shared/conts'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { formatSwapProvider } from 'src/swap/formatSwapProvider'
import { useTokenInfo, useTokensList } from 'src/tokens/hooks'
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
  const [routeDetailExpanded, setRouteDetailExpanded] = useState(false)

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

  // Fees for the aggregate FeeSummary row (mirrors SwapTransactionDetails +
  // TransactionSuccessScreen): pick the best network fee source (indexer
  // wins when non-zero, receipt fallback otherwise), then pool any indexer
  // AppFee OR the slice-persisted Squid integrator fee alongside it. The
  // cross-chain fee (if any) also folds into the aggregate.
  const feesForDisplay = useMemo(() => {
    if (indexerNetworkFeeIsUsable || !receiptNetworkFee) return transaction.fees
    const withoutBadFee = transaction.fees.filter((f) => f.type !== FeeType.SecurityFee)
    return [...withoutBadFee, receiptNetworkFee]
  }, [transaction.fees, indexerNetworkFeeIsUsable, receiptNetworkFee])

  const securityFee = feesForDisplay.find((f) => f.type === FeeType.SecurityFee)
  const indexerAppFee = feesForDisplay.find((f) => f.type === FeeType.AppFee)
  const crossChainFee = feesForDisplay.find((f) => f.type === FeeType.CrossChainFee)
  const securityFeeToken = useTokenInfo(securityFee?.amount.tokenId)
  const indexerAppFeeToken = useTokenInfo(indexerAppFee?.amount.tokenId)
  const crossChainFeeToken = useTokenInfo(crossChainFee?.amount.tokenId)
  // Slice-persisted Squid integrator fee, denominated in USD. Rendered
  // against USDm so FeeSummary can convert to local; skipped entirely when
  // the indexer already supplied AppFee to avoid double-counting.
  const usdmToken = useTokenInfo('celo-mainnet:0x765de816845861e75a25fca122bb6898b8b1282a')

  const feeSummaryComponents = useMemo((): FeeComponent[] => {
    const components: FeeComponent[] = []
    if (securityFee && securityFeeToken) {
      components.push({
        amount: new BigNumber(securityFee.amount.value),
        token: securityFeeToken,
      })
    }
    if (indexerAppFee && indexerAppFeeToken) {
      components.push({
        amount: new BigNumber(indexerAppFee.amount.value),
        token: indexerAppFeeToken,
      })
    } else if (feeMetadata?.appFeeUsd && usdmToken) {
      const parsed = new BigNumber(feeMetadata.appFeeUsd)
      if (parsed.isFinite() && parsed.gt(0)) {
        components.push({ amount: parsed, token: usdmToken })
      }
    }
    if (crossChainFee && crossChainFeeToken) {
      components.push({
        amount: new BigNumber(crossChainFee.amount.value),
        token: crossChainFeeToken,
      })
    }
    return components
  }, [
    securityFee,
    securityFeeToken,
    indexerAppFee,
    indexerAppFeeToken,
    crossChainFee,
    crossChainFeeToken,
    feeMetadata,
    usdmToken,
  ])

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

      {feeSummaryComponents.length > 0 && (
        <View style={styles.row} testID="SwapContent/Fees">
          <Text style={styles.bodyText}>{t('swapScreen.transactionDetails.fees')}</Text>
          <View style={styles.feeValueColumn}>
            <FeeSummary
              layout="stacked"
              components={feeSummaryComponents}
              primaryStyle={styles.feeValuePrimary}
              secondaryStyle={styles.feeValueSecondary}
              testID="SwapContent/Fees/Summary"
            />
          </View>
        </View>
      )}
      {!!feeMetadata?.provider && (
        <View testID="SwapContent/RouteReveal">
          <Touchable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
              setRouteDetailExpanded((v) => !v)
            }}
            testID="SwapContent/RouteReveal/Toggle"
          >
            <View style={styles.row}>
              <Text style={styles.bodyText}>{t('swapScreen.transactionDetails.routeDetail')}</Text>
              <Text style={styles.currencyAmountPrimaryText}>
                {routeDetailExpanded
                  ? t('swapScreen.transactionDetails.routeDetailCollapse')
                  : t('swapScreen.transactionDetails.routeDetailExpand')}
              </Text>
            </View>
          </Touchable>
          {routeDetailExpanded && (
            <View style={[styles.row, styles.routeSubRow]}>
              <Text style={styles.routeSubLabel}>
                {t('swapScreen.transactionDetails.routeLabel')}
              </Text>
              <Text style={styles.currencyAmountPrimaryText}>
                {formatSwapProvider(feeMetadata.provider)}
              </Text>
            </View>
          )}
        </View>
      )}
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
  // Fee row typography mirrors SwapTransactionDetails + TransactionSuccessScreen:
  // fees are complementary info, so primary uses bodySmall/gray4 and the
  // ≈ COP conversion goes bodyXSmall/gray4.
  feeValueColumn: {
    alignItems: 'flex-end',
  },
  feeValuePrimary: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    textAlign: 'right',
  },
  feeValueSecondary: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
    textAlign: 'right',
  },
  routeSubRow: {
    paddingLeft: Spacing.Regular16,
  },
  routeSubLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    flex: 1,
  },
})
