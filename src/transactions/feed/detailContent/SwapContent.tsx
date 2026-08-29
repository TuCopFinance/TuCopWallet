import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { TransactionDetailsEvents } from 'src/analytics/Events'
import { BottomSheetModalRefType } from 'src/components/BottomSheet'
import FeeSummary, { FeeComponent } from 'src/components/FeeSummary'
import { LabelWithInfo } from 'src/components/LabelWithInfo'
import RowDivider from 'src/components/RowDivider'
import TokenAmountWithBrand from 'src/components/TokenAmountWithBrand'
import { formatValueToDisplay, getTokenSymbol } from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useSelector } from 'src/redux/hooks'
import { NETWORK_NAMES } from 'src/shared/conts'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { formatSwapProvider } from 'src/swap/formatSwapProvider'
import { usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { useTokenInfo, useTokensList } from 'src/tokens/hooks'
import { convertLocalToTokenAmount } from 'src/tokens/utils'
import { LegFeeCard, TxFeeDetailsBottomSheet } from 'src/transactions/TxFeeDetailsBottomSheet'
import { useReceiptNetworkFee } from 'src/transactions/useReceiptNetworkFee'
import {
  FeeType,
  TokenExchange,
  TokenTransactionTypeV2,
  TransactionStatus,
} from 'src/transactions/types'
import { blockExplorerUrls } from 'src/web3/networkConfig'
export interface Props {
  transaction: TokenExchange
}

// Note that this is tested from TransactionDetailsScreen.test.tsx
export default function SwapContent({ transaction }: Props) {
  const { t } = useTranslation()
  const tokensList = useTokensList()
  const [routeDetailExpanded, setRouteDetailExpanded] = useState(false)
  const feeDetailsBottomSheetRef = useRef<BottomSheetModalRefType>(null)

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
  // Swap slice records the Squid integrator fee + on-chain network fee per
  // txHash at completion time (see swap/slice.feeMetadataByTxHash + the 4
  // sagas that dispatch recordSwapFeeMetadata). This lets the tx-details
  // 'Cambiar' screen render 'Tarifa del proveedor' + 'Tarifa de red'
  // consistently with the immediate success screen even after backend
  // indexer omits or aggregates them.
  //
  // Multi-leg (Dolares -> Pesos aggregate): the top-level `transactionHash`
  // is the newest leg's hash. Each leg's fee metadata is stored under its
  // own hash. `legBreakdown` pairs each leg (from fromTokenAmounts) with
  // its metadata and derives:
  //   - providerFee: appFeeUsd converted to the leg's fromToken. Squid's
  //     appFee is a spread on the trade (baked into price), NOT a separate
  //     payment. Denominated in fromToken by wallet convention (matches
  //     SwapScreen pre-confirm at src/swap/SwapScreen.tsx:1080-1086).
  //   - networkFee: gas actually paid via the fee-currency picker per leg,
  //     which may cascade across tokens if one gets drained. Read straight
  //     from feeMetadata.networkFeeValue + networkFeeTokenId (already whole
  //     token units, computed from receipt at saga completion time).
  const feeMetadataByTxHash = useSelector((state) => state.swap.feeMetadataByTxHash)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const feeMetadata = feeMetadataByTxHash[transaction.transactionHash.toLowerCase()]

  interface LegBreakdown {
    legIndex: number
    fromTokenId: string
    providerFee?: FeeComponent
    networkFee?: FeeComponent
    transactionHash?: string
  }
  const legBreakdown = useMemo((): LegBreakdown[] => {
    if (!isMultiLegSwap) return []
    // 7702 atomic batch telltale: all legs share the same on-chain tx hash
    // (one atomic tx containing N inner swap calls). Legacy multi-leg
    // emits N distinct hashes (one submit per leg). Detect via unique-hash
    // count so we route to the right data source without depending on the
    // provider string (more robust when Squid renames venues).
    const uniqueHashes = new Set(
      fromLegs
        .map((l) => (l as { transactionHash?: string }).transactionHash?.toLowerCase())
        .filter(Boolean) as string[]
    )
    const is7702Batch = uniqueHashes.size === 1 && !!feeMetadata?.legFees?.length
    if (is7702Batch && feeMetadata?.legFees) {
      // 7702 path: per-leg providerFee comes straight from feeMetadata.legFees
      // (amount already in fromToken units, populated by saga7702). Network
      // fee is genuinely aggregate (one gas payment for the whole atomic
      // batch) and rendered only on the aggregate row, not per-leg.
      return fromLegs.map((leg, idx) => {
        const persisted = feeMetadata.legFees?.[idx]
        const legFromToken = persisted
          ? tokensList.find((t) => t.tokenId === persisted.tokenId)
          : undefined
        let providerFee: FeeComponent | undefined
        if (persisted && legFromToken) {
          const amt = new BigNumber(persisted.amount)
          if (amt.isFinite() && amt.gt(0)) providerFee = { amount: amt, token: legFromToken }
        }
        return {
          legIndex: idx,
          fromTokenId: leg.tokenId,
          providerFee,
          networkFee: undefined,
          transactionHash: transaction.transactionHash.toLowerCase(),
        }
      })
    }
    // Legacy multi-leg: each leg has its own hash + own feeMetadata entry
    // with both provider + network fee. Iterate per-hash and read directly.
    return fromLegs.map((leg, idx) => {
      const hash = (leg as { transactionHash?: string }).transactionHash?.toLowerCase()
      const m = hash ? feeMetadataByTxHash[hash] : undefined
      const legFromToken = tokensList.find((t) => t.tokenId === leg.tokenId)

      let providerFee: FeeComponent | undefined
      if (m?.appFeeUsd && legFromToken && usdToLocalRate) {
        const usd = new BigNumber(m.appFeeUsd)
        if (usd.isFinite() && usd.gt(0)) {
          const asToken = convertLocalToTokenAmount({
            localAmount: usd.multipliedBy(usdToLocalRate),
            tokenInfo: legFromToken,
            usdToLocalRate,
          })
          if (asToken?.gt(0)) providerFee = { amount: asToken, token: legFromToken }
        }
      }

      let networkFee: FeeComponent | undefined
      if (m?.networkFeeValue && m?.networkFeeTokenId) {
        const feeToken = tokensList.find((t) => t.tokenId === m.networkFeeTokenId)
        if (feeToken) {
          const amt = new BigNumber(m.networkFeeValue)
          if (amt.isFinite() && amt.gt(0)) networkFee = { amount: amt, token: feeToken }
        }
      }

      return {
        legIndex: idx,
        fromTokenId: leg.tokenId,
        providerFee,
        networkFee,
        transactionHash: hash,
      }
    })
  }, [
    isMultiLegSwap,
    fromLegs,
    feeMetadataByTxHash,
    feeMetadata,
    tokensList,
    usdToLocalRate,
    transaction.transactionHash,
  ])

  // 7702 batches share one gas payment for the whole batch. Detected via
  // unique-hash count (same telltale as legBreakdown). Passed to the
  // bottom sheet so per-leg cards can label the missing network fee as
  // "compartida" instead of just hiding the row silently.
  const isAtomicBatchedGas = useMemo(() => {
    if (!isMultiLegSwap) return false
    const uniqueHashes = new Set(
      fromLegs
        .map((l) => (l as { transactionHash?: string }).transactionHash?.toLowerCase())
        .filter(Boolean) as string[]
    )
    return uniqueHashes.size === 1 && !!feeMetadata?.legFees?.length
  }, [isMultiLegSwap, fromLegs, feeMetadata])

  // Aggregate multi-leg components: group by fee-token (may span multiple
  // tokens if the picker cascaded network fees, or if legs used different
  // fromTokens for appFee). Emitted as N FeeComponents that FeeSummary
  // joins with " + " and totals in local currency.
  const multiLegProviderFeeComponents = useMemo((): FeeComponent[] => {
    if (legBreakdown.length === 0) return []
    const grouped = new Map<string, FeeComponent>()
    for (const b of legBreakdown) {
      if (!b.providerFee) continue
      const key = b.providerFee.token.tokenId
      const existing = grouped.get(key)
      grouped.set(
        key,
        existing
          ? { amount: existing.amount.plus(b.providerFee.amount), token: existing.token }
          : b.providerFee
      )
    }
    return Array.from(grouped.values())
  }, [legBreakdown])

  const multiLegNetworkFeeComponents = useMemo((): FeeComponent[] => {
    if (legBreakdown.length === 0) return []
    const grouped = new Map<string, FeeComponent>()
    for (const b of legBreakdown) {
      if (!b.networkFee) continue
      const key = b.networkFee.token.tokenId
      const existing = grouped.get(key)
      grouped.set(
        key,
        existing
          ? { amount: existing.amount.plus(b.networkFee.amount), token: existing.token }
          : b.networkFee
      )
    }
    return Array.from(grouped.values())
  }, [legBreakdown])

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
  // Aggregate 'Tarifas' row mirrors the pre-confirm SwapTransactionDetails
  // scheme: network + cross-chain + provider (Squid integrator) fees all
  // rendered as token amounts inside a single FeeSummary. Provider fee
  // priority: (1) indexer's AppFee if present (real on-chain amount +
  // token); (2) fall back to the slice USD estimate divided by the
  // fromToken's priceUsd — the same denomination the pre-confirm uses via
  // `fromAmount × percentage / 100`. Skip silently when the fromToken has
  // no priceUsd (virtual Dolares, fresh install pre-hydration) rather
  // than mislabelling against USDm.
  // Break the fee list into named components so the detail bottom sheet can
  // show each on its own row (matching the pre-confirm Desglose section)
  // while the inline row aggregates them into a single "X + Y ≈ COP$Z".
  const networkFeeComponent: FeeComponent | undefined = useMemo(() => {
    if (!securityFee || !securityFeeToken) return undefined
    return { amount: new BigNumber(securityFee.amount.value), token: securityFeeToken }
  }, [securityFee, securityFeeToken])

  const providerFeeComponent: FeeComponent | undefined = useMemo(() => {
    // Indexer's AppFee wins (real on-chain amount + token) when present.
    if (indexerAppFee && indexerAppFeeToken) {
      return { amount: new BigNumber(indexerAppFee.amount.value), token: indexerAppFeeToken }
    }
    // Single-leg fallback: derive from slice metadata's USD estimate,
    // denominated in fromToken (Squid convention, matches pre-confirm).
    if (!isMultiLegSwap && feeMetadata?.appFeeUsd && fromToken && usdToLocalRate) {
      const usd = new BigNumber(feeMetadata.appFeeUsd)
      if (usd.isFinite() && usd.gt(0)) {
        const asToken = convertLocalToTokenAmount({
          localAmount: usd.multipliedBy(usdToLocalRate),
          tokenInfo: fromToken,
          usdToLocalRate,
        })
        if (asToken?.gt(0)) return { amount: asToken, token: fromToken }
      }
    }
    return undefined
  }, [indexerAppFee, indexerAppFeeToken, isMultiLegSwap, feeMetadata, fromToken, usdToLocalRate])

  const crossChainFeeComponent: FeeComponent | undefined = useMemo(() => {
    if (!crossChainFee || !crossChainFeeToken) return undefined
    return { amount: new BigNumber(crossChainFee.amount.value), token: crossChainFeeToken }
  }, [crossChainFee, crossChainFeeToken])

  // Multi-leg aggregate: prefer per-leg data (grouped by fee-token) so the
  // row honestly reflects heterogeneous fee tokens (e.g. Squid appFee in
  // USDm + USDC + USDT + network gas cascaded to CELO).
  //
  // Network fee source priority in multi-leg:
  //   1. multiLegNetworkFeeComponents (legacy multi-leg: N distinct hashes,
  //      each with its own gas payment; may cascade across tokens)
  //   2. singular networkFeeComponent (7702 atomic batch: one gas payment
  //      shared by the whole batch; also the fallback when legacy legs
  //      happened to share a fee currency and per-leg emission is empty)
  //
  // Provider fee always comes from multiLegProviderFeeComponents (grouped
  // by leg.tokenId for legacy; from feeMetadata.legFees for 7702).
  const feeSummaryComponents: FeeComponent[] = useMemo(() => {
    if (
      isMultiLegSwap &&
      (multiLegProviderFeeComponents.length > 0 || multiLegNetworkFeeComponents.length > 0)
    ) {
      const network =
        multiLegNetworkFeeComponents.length > 0
          ? multiLegNetworkFeeComponents
          : networkFeeComponent
            ? [networkFeeComponent]
            : []
      return [
        ...network,
        ...multiLegProviderFeeComponents,
        ...(crossChainFeeComponent ? [crossChainFeeComponent] : []),
      ]
    }
    return [networkFeeComponent, providerFeeComponent, crossChainFeeComponent].filter(
      (c): c is FeeComponent => !!c
    )
  }, [
    isMultiLegSwap,
    multiLegNetworkFeeComponents,
    multiLegProviderFeeComponents,
    networkFeeComponent,
    providerFeeComponent,
    crossChainFeeComponent,
  ])

  // Per-leg breakdown card list for the bottom sheet. Undefined when
  // single-leg so the sheet falls back to the aggregate-only view.
  const feeLegs: LegFeeCard[] | undefined = useMemo(() => {
    if (!isMultiLegSwap) return undefined
    return legBreakdown.map((b) => ({
      legIndex: b.legIndex,
      fromTokenId: b.fromTokenId,
      providerFee: b.providerFee,
      networkFee: b.networkFee,
    }))
  }, [isMultiLegSwap, legBreakdown])

  return (
    <View style={styles.contentContainer}>
      {isMultiLegSwap ? (
        fromLegs.map((leg, idx) => {
          // Backend delivers per-leg transactionHash (2026-08-28). Wrap in
          // Touchable so the user can drill into that specific leg's tx on
          // Celoscan. Aggregate header link (bottom of screen) points at
          // newest-leg hash only; without this per-leg hop the user cannot
          // reach USDm's or USDC's tx from the aggregate view.
          const legHash = (leg as { transactionHash?: string }).transactionHash
          const canOpenLeg = !!legHash && !!blockExplorerUrls[transaction.networkId]
          const rowContent = (
            <View style={styles.row}>
              <Text style={styles.bodyText}>{t('swapTransactionDetailPage.swapFrom')}</Text>
              <TokenAmountWithBrand
                amount={leg.value.toString()}
                tokenId={leg.tokenId}
                textStyle={styles.currencyAmountPrimaryText}
                testID={`SwapContent/swapFrom/${idx}`}
              />
            </View>
          )
          if (!canOpenLeg) {
            return <View key={`${leg.tokenId}-${idx}`}>{rowContent}</View>
          }
          return (
            <Touchable
              key={`${leg.tokenId}-${idx}`}
              onPress={() => {
                const explorerUrl = blockExplorerUrls[transaction.networkId].baseTxUrl
                navigate(Screens.WebViewScreen, {
                  uri: new URL(legHash, explorerUrl).toString(),
                })
                AppAnalytics.track(
                  TransactionDetailsEvents.transaction_details_tap_block_explorer,
                  {
                    transactionType: transaction.type,
                    transactionStatus: transaction.status,
                  }
                )
              }}
              testID={`SwapContent/swapFromLegLink/${idx}`}
              borderless={true}
            >
              {rowContent}
            </Touchable>
          )
        })
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
          <Text style={styles.metaLabel}>{t('swapTransactionDetailPage.rate')}</Text>
          <Text testID="SwapContent/rate" style={styles.metaValue}>
            {`1 ${getTokenSymbol(t, fromToken.symbol, fromToken.tokenId)} ≈ ${formatValueToDisplay(
              new BigNumber(transaction.inAmount.value).dividedBy(transaction.outAmount.value)
            )} ${getTokenSymbol(t, toToken.symbol, toToken.tokenId)}`}
          </Text>
        </View>
      )}

      {feeSummaryComponents.length > 0 && (
        <View style={styles.row} testID="SwapContent/Fees">
          <LabelWithInfo
            label={t('swapScreen.transactionDetails.fees')}
            onPress={() => feeDetailsBottomSheetRef.current?.snapToIndex(0)}
            labelStyle={styles.metaLabel}
            testID="SwapContent/Fees/MoreInfo"
          />
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
              <Text style={styles.metaLabel}>{t('swapScreen.transactionDetails.routeDetail')}</Text>
              <Text style={styles.metaValue}>
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
              <Text style={styles.metaValue}>{formatSwapProvider(feeMetadata.provider)}</Text>
            </View>
          )}
        </View>
      )}
      <TxFeeDetailsBottomSheet
        forwardedRef={feeDetailsBottomSheetRef}
        networkFee={networkFeeComponent}
        providerFee={providerFeeComponent}
        crossChainFee={crossChainFeeComponent}
        legs={feeLegs}
        toTokenId={transaction.inAmount.tokenId}
        sharedGasNote={isAtomicBatchedGas}
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
  // Secondary rows (Tasas, Tarifas, Ruta del intercambio) mirror pre-confirm
  // SwapTransactionDetails.styles.label / .value: bodySmall gray4 label,
  // bodySmall black value. Kept separate from bodyText/currencyAmountPrimaryText
  // (which stays bodyMedium for the primary Cambiar de/a rows) so tx-details
  // reads the same tier as the confirm sheet without shrinking the header.
  metaLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  metaValue: {
    ...typeScale.bodySmall,
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
