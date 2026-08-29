import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes } from 'src/components/Button'
import FeeSummary, { FeeComponent } from 'src/components/FeeSummary'
import { LabelWithInfo } from 'src/components/LabelWithInfo'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
import Celebration from 'src/icons/misc/Celebration'
import TokenAmountWithBrand from 'src/components/TokenAmountWithBrand'
import TokenDisplay from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import ArrowRightThick from 'src/icons/navigation/ArrowRightThick'
import { noHeaderGestureDisabled } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { formatSwapProvider } from 'src/swap/formatSwapProvider'
import { useTokenInfo } from 'src/tokens/hooks'
import { nativeFeeCurrencySelector, tokensByIdSelector } from 'src/tokens/selectors'
import { TxFeeDetailsBottomSheet } from 'src/transactions/TxFeeDetailsBottomSheet'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { blockExplorerUrls, networkIdToNetwork } from 'src/web3/networkConfig'

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
    legs,
    appFeeUsd,
  } = route.params
  const hasLegs = Array.isArray(legs) && legs.length > 0
  const [routeDetailExpanded, setRouteDetailExpanded] = useState(false)
  const feeDetailsBottomSheetRef = useRef<BottomSheetModalRefType>(null)

  // Provider + saga-computed network fee — recorded by the saga into
  // swap.feeMetadata at completion.
  const feeMetadata = useSelector((state) =>
    transactionHash ? state.swap.feeMetadataByTxHash[transactionHash.toLowerCase()] : undefined
  )

  // Inline receipt fetch as the absolute fallback: if the saga did not
  // persist a fee (any of the many upstream failure modes we've iterated
  // through), fetch the receipt directly here. Guaranteed to produce a
  // value as long as viem can reach Forno + the tx is on chain. Runs
  // exactly once per screen mount (no reselect churn).
  const nativeFeeCurrency = useSelector((state) =>
    networkId ? nativeFeeCurrencySelector(state, networkId) : undefined
  )
  const tokensByIdRaw = useSelector((state) =>
    networkId ? tokensByIdSelector(state, [networkId]) : {}
  )
  const [inlineFee, setInlineFee] = useState<{ value: string; tokenId: string } | null>(null)
  useEffect(() => {
    if (!transactionHash || !networkId) return
    if (feeMetadata?.networkFeeValue) return // saga already persisted it
    const network = networkIdToNetwork[networkId]
    if (!network) return
    const client = publicClient[network]
    if (!client) return
    let cancelled = false
    void (async () => {
      try {
        const [receipt, tx] = await Promise.all([
          client.getTransactionReceipt({ hash: transactionHash as `0x${string}` }),
          client.getTransaction({ hash: transactionHash as `0x${string}` }),
        ])
        if (cancelled) return
        const feeWei = new BigNumber(receipt.gasUsed.toString()).multipliedBy(
          receipt.effectiveGasPrice.toString()
        )
        const feeCurrencyAddress = (tx as { feeCurrency?: string | null }).feeCurrency
        if (feeCurrencyAddress) {
          const lookup = feeCurrencyAddress.toLowerCase()
          const match = Object.values(tokensByIdRaw).find(
            (t) =>
              t?.feeCurrencyAdapterAddress?.toLowerCase() === lookup ||
              t?.address?.toLowerCase() === lookup
          )
          if (match) {
            const decimals = match.feeCurrencyAdapterDecimals ?? match.decimals
            setInlineFee({ value: feeWei.shiftedBy(-decimals).toString(), tokenId: match.tokenId })
            return
          }
        }
        // Native CELO gas OR unresolved CIP-64: display against synthesized
        // CELO entry so at least SOMETHING renders.
        if (nativeFeeCurrency) {
          setInlineFee({
            value: feeWei.shiftedBy(-nativeFeeCurrency.decimals).toString(),
            tokenId: nativeFeeCurrency.tokenId,
          })
        }
      } catch (err) {
        Logger.warn('TransactionSuccessScreen', 'inline fee fetch failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
    // networkId + transactionHash + feeMetadata.networkFeeValue are primitives;
    // nativeFeeCurrency + tokensByIdRaw read via closure inside effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionHash, networkId, feeMetadata?.networkFeeValue])

  const networkFee =
    feeMetadata?.networkFeeValue && feeMetadata?.networkFeeTokenId
      ? {
          amount: { value: feeMetadata.networkFeeValue, tokenId: feeMetadata.networkFeeTokenId },
        }
      : inlineFee
        ? { amount: { value: inlineFee.value, tokenId: inlineFee.tokenId } }
        : null

  // Provider fallback: if the saga didn't dispatch (metadata missing) assume
  // Squid for any exchange-shaped success type. TuCop's gold buy/sell + swap
  // all route through Squid by default. The Uniswap V4 path (single-leg
  // USDT<->COPm) always dispatches so no risk of mislabelling that one.
  // Types NOT in this set (send, earn) keep provider undefined and the
  // "Ruta del intercambio" row hides for them.
  const providerFallbackTypes = new Set(['swap', 'goldBuy', 'goldSell'])
  const provider =
    feeMetadata?.provider ?? (providerFallbackTypes.has(type as string) ? 'squid' : undefined)

  // Two separate FeeComponents (network + provider) so the detail sheet can
  // show them as their own rows like the pre-confirm 'Desglose' section.
  // Aggregate FeeSummary in the inline row folds both, matching the
  // pre-confirm inline row.
  const networkFeeToken = useTokenInfo(networkFee?.amount.tokenId)
  const fromToken = useTokenInfo(fromTokenId)
  const networkFeeComponent: FeeComponent | undefined =
    networkFee && networkFeeToken
      ? { amount: new BigNumber(networkFee.amount.value), token: networkFeeToken }
      : undefined
  // Prefer the saga-persisted `feeMetadata.appFeeUsd` over the route param.
  // Route param is only populated by the swap saga's multi-leg navigate call
  // (dollarsSpend legacy loop) and left undefined by every other caller
  // including gold buy/sell + saga7702 atomic + single-leg swap — those all
  // rely on the feeMetadata dispatch. Falling back to route param covers the
  // legacy multi-leg path; missing both means the row hides (correct: fee
  // truly unknown, e.g. saga bailed before recording).
  const effectiveAppFeeUsd = feeMetadata?.appFeeUsd ?? appFeeUsd
  const providerFeeComponent: FeeComponent | undefined = (() => {
    if (!effectiveAppFeeUsd || !fromToken?.priceUsd) return undefined
    const usd = new BigNumber(effectiveAppFeeUsd)
    if (!usd.isFinite() || usd.lte(0)) return undefined
    const asFromToken = usd.dividedBy(fromToken.priceUsd)
    if (!asFromToken.isFinite() || asFromToken.lte(0)) return undefined
    return { amount: asFromToken, token: fromToken }
  })()
  const feeSummaryComponents: FeeComponent[] = [networkFeeComponent, providerFeeComponent].filter(
    (c): c is FeeComponent => !!c
  )

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

  const titleKey = `transactionSuccess.${type}.title`
  const subtitleKey = `transactionSuccess.${type}.subtitle`
  // i18next falls back to the default keys gracefully if `type` is unknown.
  const title = t(titleKey, { defaultValue: t('transactionSuccess.default.title') })
  const subtitle = t(subtitleKey, { defaultValue: t('transactionSuccess.default.subtitle') })

  const isSend = type === 'send'
  const showFromToDetails = !isSend

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.iconBg}>
            <Celebration size={64} color={Colors.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <View style={styles.detailsContainer}>
          {isSend ? (
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
              {showFromToDetails && (
                <>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('transactionSuccess.from')}</Text>
                    <TokenAmountWithBrand
                      amount={fromAmount}
                      tokenId={fromTokenId}
                      testID="TransactionSuccess/FromAmount"
                      textStyle={styles.tokenDisplay}
                    />
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('transactionSuccess.to')}</Text>
                    <TokenAmountWithBrand
                      amount={toAmount}
                      tokenId={toTokenId}
                      testID="TransactionSuccess/ToAmount"
                      textStyle={styles.tokenDisplay}
                    />
                  </View>
                  {hasLegs && (
                    <View style={styles.breakdownContainer}>
                      <Text style={styles.breakdownHeader}>
                        {t('transactionSuccess.breakdownHeader')}
                      </Text>
                      {legs!.map((leg, idx) => (
                        <View
                          style={styles.breakdownRow}
                          key={`${leg.transactionHash}-${idx}`}
                          testID={`TransactionSuccess/Leg${idx}`}
                        >
                          <TokenAmountWithBrand
                            amount={leg.fromAmount}
                            tokenId={leg.fromTokenId}
                            testID={`TransactionSuccess/Leg${idx}/From`}
                            textStyle={styles.breakdownAmount}
                          />
                          <ArrowRightThick size={12} color={Colors.gray4} />
                          <TokenAmountWithBrand
                            amount={leg.toAmount}
                            tokenId={toTokenId}
                            testID={`TransactionSuccess/Leg${idx}/To`}
                            textStyle={styles.breakdownAmount}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </>
          )}

          {/* Fee + route pattern mirrors src/swap/SwapTransactionDetails so
                the confirm sheet and the success screen read identically:
                ONE 'Tarifas' row summing network fee + integrator fee with
                FeeSummary (stacked, bodySmall gray4 primary + bodyXSmall
                gray4 secondary), and ONE 'Ruta del intercambio' expand /
                collapse toggle revealing 'Ejecutado por Squid' as a sub-row. */}
          {feeSummaryComponents.length > 0 && (
            <View style={styles.feeRow} testID="TransactionSuccess/Fees">
              <LabelWithInfo
                label={t('swapScreen.transactionDetails.fees')}
                onPress={() => feeDetailsBottomSheetRef.current?.snapToIndex(0)}
                labelStyle={styles.feeLabel}
                style={styles.feeLabelTouchable}
                numberOfLines={1}
                testID="TransactionSuccess/Fees/MoreInfo"
              />
              <View style={styles.feeValueColumn}>
                <FeeSummary
                  layout="stacked"
                  components={feeSummaryComponents}
                  primaryStyle={styles.feeValuePrimary}
                  secondaryStyle={styles.feeValueSecondary}
                  testID="TransactionSuccess/Fees/Summary"
                />
              </View>
            </View>
          )}

          {!!provider && (
            <View testID="TransactionSuccess/RouteReveal">
              <Touchable
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
                  setRouteDetailExpanded((v) => !v)
                }}
                testID="TransactionSuccess/RouteReveal/Toggle"
              >
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>
                    {t('swapScreen.transactionDetails.routeDetail')}
                  </Text>
                  <Text style={styles.providerValue}>
                    {routeDetailExpanded
                      ? t('swapScreen.transactionDetails.routeDetailCollapse')
                      : t('swapScreen.transactionDetails.routeDetailExpand')}
                  </Text>
                </View>
              </Touchable>
              {routeDetailExpanded && (
                <View style={[styles.feeRow, styles.routeSubRow]}>
                  <Text style={styles.routeSubLabel}>
                    {t('swapScreen.transactionDetails.routeLabel')}
                  </Text>
                  <Text style={styles.providerValue}>{formatSwapProvider(provider)}</Text>
                </View>
              )}
            </View>
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
                <ArrowRightThick size={16} color={Colors.primary} />
              </View>
            </Touchable>
          )}
        </View>
      </View>

      <StickyCtaBottom>
        <Button
          size={BtnSizes.FULL}
          text={t('continue')}
          onPress={handleContinue}
          testID="TransactionSuccess/Continue"
        />
      </StickyCtaBottom>

      <TxFeeDetailsBottomSheet
        forwardedRef={feeDetailsBottomSheetRef}
        networkFee={networkFeeComponent}
        providerFee={providerFeeComponent}
      />
    </SafeAreaView>
  )
}

TransactionSuccessScreen.navigationOptions = () => ({
  ...noHeaderGestureDisabled,
})

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.Thick24,
  },
  iconBg: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.Thick24,
  },
  title: {
    ...typeScale.labelLarge,
    color: Colors.black,
    textAlign: 'center',
    paddingTop: Spacing.Smallest8,
    paddingBottom: Spacing.Regular16,
  },
  subtitle: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
    textAlign: 'center',
  },
  // Detail card matches pre-confirm SwapTransactionDetails.styles.container
  // (bordered, no shadow, 16px padding, 16px gap).
  detailsContainer: {
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 12,
    padding: Spacing.Regular16,
    gap: Spacing.Regular16,
  },
  detailRow: {
    flexDirection: 'column',
    gap: Spacing.Smallest8,
  },
  breakdownContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray2,
    paddingTop: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  breakdownHeader: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.Smallest8,
  },
  breakdownAmount: {
    ...typeScale.bodySmall,
    color: Colors.black,
  },
  detailLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  tokenDisplay: {
    ...typeScale.labelMedium,
    color: Colors.black,
  },
  // Fee-row styles mirror src/swap/SwapTransactionDetails so the success
  // screen reads identically to the confirm sheet: bodySmall gray4 for the
  // label + primary line (fees are complementary info), bodyXSmall gray4
  // for the ≈ COP secondary line. Provider row reuses feeLabel + a black
  // bodySmall value (identity, not fee amount).
  // NB: NO `flex: 1` on the row — detailsContainer is a column with no
  // fixed height, so flex:1 on a row would collapse it to height 0 and
  // the Tarifa / Proveedor block silently disappeared.
  // Label has fixed natural width (flexShrink:0 stops the value column
  // from squeezing "Tarifas" into "Tarifa\ns"); value column takes
  // remaining space and shrinks its inner content when needed. Mirrors
  // pre-confirm layout.
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Regular16,
    marginTop: Spacing.Smallest8,
  },
  feeLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  // Override LabelWithInfo's internal touchable flex:1 so the label doesn't
  // fight the value column for row width. Label stays natural width; value
  // column takes the remainder.
  feeLabelTouchable: {
    flex: 0,
    flexShrink: 0,
  },
  feeValueColumn: {
    flex: 1,
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
  providerValue: {
    ...typeScale.bodySmall,
    color: Colors.black,
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
  recipientText: {
    ...typeScale.labelMedium,
    color: Colors.black,
  },
  poolText: {
    ...typeScale.labelMedium,
    color: Colors.black,
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
    color: Colors.primary,
  },
})

export default TransactionSuccessScreen
