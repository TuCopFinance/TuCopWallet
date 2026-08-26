import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Button, { BtnSizes } from 'src/components/Button'
import FeeSummary, { FeeComponent } from 'src/components/FeeSummary'
import StateCard from 'src/components/StateCard'
import StickyCtaBottom from 'src/components/StickyCtaBottom'
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

  // Provider fallback: if the saga didn't dispatch (metadata missing) but
  // this is a 'swap' type success, assume Squid — that's the default venue
  // for TuCop swaps. The Uniswap V4 path always dispatches so no risk of
  // mislabelling that one.
  const provider = feeMetadata?.provider ?? (type === 'swap' ? 'squid' : undefined)

  // Build the FeeSummary components (mirrors the pre-confirm SwapTransactionDetails):
  //   - Network fee: use the resolved fee token via useTokenInfo so FeeSummary
  //     shows both the token amount + the ≈ COP conversion.
  //   - App fee: Squid integrator cut in USD, converted to USDm equivalent so
  //     FeeSummary can sum it into the same aggregate line. The pre-confirm
  //     shows the same "X CELO + Y USDm ≈ COP$Z" pattern.
  const networkFeeToken = useTokenInfo(networkFee?.amount.tokenId)
  const usdmToken = useTokenInfo(
    // Look up USDm to use as the display token for the app fee. Absent on
    // fresh install; when missing we simply drop the app fee from the
    // aggregate row rather than mislabelling it against another token.
    'celo-mainnet:0x765de816845861e75a25fca122bb6898b8b1282a'
  )
  const feeSummaryComponents = ((): FeeComponent[] => {
    const components: FeeComponent[] = []
    if (networkFee && networkFeeToken) {
      components.push({
        amount: new BigNumber(networkFee.amount.value),
        token: networkFeeToken,
      })
    }
    if (appFeeUsd) {
      const parsed = new BigNumber(appFeeUsd)
      if (parsed.isFinite() && parsed.gt(0) && usdmToken) {
        components.push({ amount: parsed, token: usdmToken })
      }
    }
    return components
  })()

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
        <StateCard variant="success" title={title} subtitle={subtitle}>
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
                <Text style={styles.feeLabel}>{t('swapScreen.transactionDetails.fees')}</Text>
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
        </StateCard>
      </View>

      <StickyCtaBottom>
        <Button
          size={BtnSizes.FULL}
          text={t('continue')}
          onPress={handleContinue}
          testID="TransactionSuccess/Continue"
        />
      </StickyCtaBottom>
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
  detailsContainer: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.Regular16,
    gap: Spacing.Regular16,
    marginTop: Spacing.Regular16,
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
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.Regular16,
    marginTop: Spacing.Smallest8,
  },
  feeLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    flex: 1,
  },
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
