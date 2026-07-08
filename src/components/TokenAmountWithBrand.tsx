import BigNumber from 'bignumber.js'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import TokenDisplay, { formatValueToDisplay } from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import { DOLARES_VIRTUAL_TOKEN_ID } from 'src/dollarsSpend'
import DollarsIcon from 'src/icons/tokens/DollarsIcon'
import { Spacing } from 'src/styles/styles'
import { getDollarTokenTicker } from 'src/tokens/dollarGroup'
import { useTokenInfo } from 'src/tokens/hooks'
import networkConfig from 'src/web3/networkConfig'

interface Props {
  amount: string
  tokenId: string
  testID: string
  textStyle: object
  showApprox?: boolean
}

// Renders `amount` `[icon]` `label`, in that order, per the project label
// convention:
// - Virtual "Dolares" (multi-swap aggregate) -> DollarsIcon + "Dolares".
// - Concrete dollar-family (USDT / USDC / USDm / USAT) -> token icon + ticker,
//   because "Dolares" is reserved for the aggregate view and the specific
//   ticker is the canonical way to distinguish them elsewhere in the app
//   (swap picker, tokens.md rule).
// - COPm -> token icon + "Pesos".
// - Everything else -> token icon + on-chain symbol via TokenDisplay default.
export default function TokenAmountWithBrand({
  amount,
  tokenId,
  testID,
  textStyle,
  showApprox,
}: Props) {
  const { t } = useTranslation()
  const tokenInfo = useTokenInfo(tokenId)
  const ticker = getDollarTokenTicker(tokenId)
  const approxPrefix = showApprox ? '≈ ' : ''

  if (tokenId === DOLARES_VIRTUAL_TOKEN_ID) {
    return (
      <View style={styles.brandRow}>
        <Text style={textStyle} testID={testID}>
          {`${approxPrefix}${formatValueToDisplay(new BigNumber(amount))}`}
        </Text>
        <DollarsIcon size={24} testID={`${testID}/Icon`} />
        <Text style={textStyle}>{t('assets.dollars')}</Text>
      </View>
    )
  }

  const explicitLabel = ticker ?? (tokenId === networkConfig.copmTokenId ? t('assets.pesos') : null)

  return (
    <View style={styles.brandRow}>
      {explicitLabel ? (
        <>
          <TokenDisplay
            amount={amount}
            tokenId={tokenId}
            showLocalAmount={false}
            showSymbol={false}
            hideSign={true}
            showApprox={showApprox}
            style={textStyle}
            testID={testID}
          />
          {tokenInfo && (
            <TokenIcon token={tokenInfo} size={IconSize.SMALL} testID={`${testID}/Icon`} />
          )}
          <Text style={textStyle}>{explicitLabel}</Text>
        </>
      ) : (
        <>
          {tokenInfo && (
            <TokenIcon token={tokenInfo} size={IconSize.SMALL} testID={`${testID}/Icon`} />
          )}
          <TokenDisplay
            amount={amount}
            tokenId={tokenId}
            showLocalAmount={false}
            hideSign={true}
            showApprox={showApprox}
            style={textStyle}
            testID={testID}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
  },
})
