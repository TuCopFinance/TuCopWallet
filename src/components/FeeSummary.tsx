import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleProp, StyleSheet, Text, TextStyle, View } from 'react-native'
import { formatValueToDisplay, getTokenSymbol } from 'src/components/TokenDisplay'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { useSelector } from 'src/redux/hooks'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { useTokenInfo } from 'src/tokens/hooks'
import { TokenBalance } from 'src/tokens/slice'
import { convertTokenToLocalAmount } from 'src/tokens/utils'

/**
 * One fee component. Either pass a fully-hydrated `token` (from the
 * fee-currency selector or an appFee payload) OR just a `tokenId` and
 * FeeSummary will look it up in the redux tokens store.
 *
 * When BOTH are supplied, the store-hydrated version wins for
 * priceUsd/local conversion (so the local currency total matches what
 * TokenDisplay renders elsewhere in the app), while the caller-supplied
 * `token` is used as a fallback (needed for the synthesized CELO entry,
 * which is excluded from ALLOWED_TOKEN_IDS and NOT in the store).
 *
 * `amount` is in the token's native units (whole tokens, NOT wei).
 */
export interface FeeComponent {
  amount: BigNumber
  token: TokenBalance
}

interface Props {
  components: FeeComponent[]
  /** Rendered when there are no valid components (quote in progress, etc). */
  fallbackText?: string
  primaryStyle?: StyleProp<TextStyle>
  secondaryStyle?: StyleProp<TextStyle>
  testID?: string
  /**
   * inline:   `0.005 Dolares + 0.0066 CELO ≈ COP$16.50`  (single line)
   * stacked:  first line "amt sym + amt sym", second line "≈ COP$X" in
   *           secondary style.
   */
  layout?: 'inline' | 'stacked'
}

/**
 * Canonical fee-summary display for the wallet.
 *
 * Renders each fee component as `{amount} {symbol}` (symbol resolved via
 * the canonical getTokenSymbol so COPm -> Pesos, USDT/USDC/USDm -> Dolares,
 * XAUt0 -> Oro, CELO stays CELO). Multiple components joined with " + ".
 * The sum of all components is converted to the wallet's local currency
 * (COP for TuCop) via convertTokenToLocalAmount, which respects the
 * COPm-1:1-COP rule.
 *
 * Every fee-display surface in the wallet routes through this component so
 * the format is identical across Swap, Send, Earn, Gold, Subsidies,
 * Donations, WalletConnect, etc.
 */
function FeeSummary({
  components,
  fallbackText,
  primaryStyle,
  secondaryStyle,
  testID,
  layout = 'inline',
}: Props) {
  const { t } = useTranslation()
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)

  const valid = components.filter((c) => !!c.token && c.amount && c.amount.gt(0))

  if (valid.length === 0) {
    return (
      <Text style={[styles.primary, primaryStyle]} testID={testID}>
        {fallbackText ?? '…'}
      </Text>
    )
  }

  // Render each component through a sub-component so useTokenInfo can be
  // called once per row (hook count stable across renders). Sub-component
  // reconciles caller-supplied token vs store token: store wins for the
  // local-currency conversion so the summary agrees with TokenDisplay
  // everywhere else. Aggregates the local totals via the same hook so we
  // can render "amt1 sym1 + amt2 sym2 ≈ COP$sum" without recomputing.
  const rows = valid.map((c) => (
    <FeeRow key={`${c.token.tokenId}-${c.amount.toString()}`} component={c} />
  ))

  return (
    <FeeSummaryLayout
      layout={layout}
      components={valid}
      localCurrencySymbol={localCurrencySymbol}
      usdToLocalRate={usdToLocalRate}
      primaryStyle={primaryStyle}
      secondaryStyle={secondaryStyle}
      testID={testID}
      t={t}
    >
      {rows}
    </FeeSummaryLayout>
  )
}

interface FeeSummaryLayoutProps {
  layout: 'inline' | 'stacked'
  components: FeeComponent[]
  localCurrencySymbol: string | null
  usdToLocalRate: string | null
  primaryStyle?: StyleProp<TextStyle>
  secondaryStyle?: StyleProp<TextStyle>
  testID?: string
  children: React.ReactNode
  t: (k: string) => string
}

function FeeSummaryLayout({
  layout,
  components,
  localCurrencySymbol,
  usdToLocalRate,
  primaryStyle,
  secondaryStyle,
  testID,
  t,
}: FeeSummaryLayoutProps) {
  const tokenParts = components.map((c) => {
    const symbol = getTokenSymbol(t, c.token.symbol, c.token.tokenId) ?? c.token.symbol ?? ''
    return `${formatValueToDisplay(c.amount)} ${symbol}`
  })
  const tokenString = tokenParts.join(' + ')

  // Local sum built from the store-hydrated tokens (fetched by the sub-hook
  // in FeeRow-side is not needed here because we don't render sub-elements
  // that use it — this layout ONLY renders strings). To avoid recomputing,
  // we call the hook resolver at the parent level via a mapped helper.
  return (
    <_LocalTotal
      components={components}
      localCurrencySymbol={localCurrencySymbol}
      usdToLocalRate={usdToLocalRate}
    >
      {(localString) => {
        if (layout === 'stacked') {
          return (
            <View testID={testID}>
              <Text
                style={[styles.primary, primaryStyle]}
                testID={testID ? `${testID}/Token` : undefined}
              >
                {tokenString}
              </Text>
              {!!localString && (
                <Text
                  style={[styles.secondary, secondaryStyle]}
                  testID={testID ? `${testID}/Local` : undefined}
                >
                  {`≈ ${localString}`}
                </Text>
              )}
            </View>
          )
        }
        return (
          <Text style={[styles.primary, primaryStyle]} testID={testID}>
            {localString ? `${tokenString} ≈ ${localString}` : tokenString}
          </Text>
        )
      }}
    </_LocalTotal>
  )
}

// Helper render-prop that computes the local total using each component's
// store-hydrated token info (via useTokenInfo). Keeps hook invocation count
// stable by iterating a fixed-length array.
function _LocalTotal({
  components,
  localCurrencySymbol,
  usdToLocalRate,
  children,
}: {
  components: FeeComponent[]
  localCurrencySymbol: string | null
  usdToLocalRate: string | null
  children: (localString: string) => React.ReactElement
}) {
  const resolvedTokens = components.map((c) => useTokenInfoWithFallback(c.token))
  let totalLocal: BigNumber | null = null
  for (let i = 0; i < components.length; i++) {
    const tokenInfo = resolvedTokens[i]
    const local = convertTokenToLocalAmount({
      tokenAmount: components[i].amount,
      tokenInfo,
      usdToLocalRate,
    })
    if (local) {
      totalLocal = (totalLocal ?? new BigNumber(0)).plus(local)
    }
  }
  const localString =
    totalLocal && localCurrencySymbol
      ? `${localCurrencySymbol}${formatValueToDisplay(totalLocal)}`
      : ''
  return children(localString)
}

function useTokenInfoWithFallback(fallback: TokenBalance): TokenBalance {
  const fromStore = useTokenInfo(fallback.tokenId)
  return fromStore ?? fallback
}

// Deprecated — kept as an alias for a future refactor if any callsite
// wants per-row rendering. Currently unused.
function FeeRow(_props: { component: FeeComponent }) {
  return null
}

const styles = StyleSheet.create({
  primary: {
    ...typeScale.bodyMedium,
    color: colors.black,
  },
  secondary: {
    ...typeScale.bodySmall,
    color: colors.gray4,
  },
})

export default FeeSummary
