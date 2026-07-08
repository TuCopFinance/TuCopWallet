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

interface Props {
  amount: string
  tokenId: string
  testID: string
  textStyle: object
}

// Renders the on-chain amount (via TokenDisplay, which already caps decimals
// and routes through `getTokenSymbol`) and appends the correct label:
// - Virtual "Dolares" tokenId (used for multi-swap aggregates) -> "Dolares".
// - Concrete dollar-family tokens (USDT / USDC / USDm / USAT) -> their ticker,
//   because "Dolares" is reserved for the aggregate view and the specific
//   ticker is the canonical way to distinguish them elsewhere in the app
//   (swap picker, tokens.md rule).
// - Everything else -> TokenDisplay default (uses on-chain symbol).
export default function TokenAmountWithBrand({ amount, tokenId, testID, textStyle }: Props) {
  const { t } = useTranslation()
  const tokenInfo = useTokenInfo(tokenId)
  const ticker = getDollarTokenTicker(tokenId)

  if (tokenId === DOLARES_VIRTUAL_TOKEN_ID) {
    return (
      <View style={styles.brandRow}>
        <DollarsIcon size={24} testID={`${testID}/Icon`} />
        <Text style={textStyle} testID={testID}>
          {`${formatValueToDisplay(new BigNumber(amount))} ${t('assets.dollars')}`}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.brandRow}>
      {tokenInfo && <TokenIcon token={tokenInfo} size={IconSize.SMALL} testID={`${testID}/Icon`} />}
      {ticker ? (
        <>
          <TokenDisplay
            amount={amount}
            tokenId={tokenId}
            showLocalAmount={false}
            showSymbol={false}
            hideSign={true}
            style={textStyle}
            testID={testID}
          />
          <Text style={textStyle}>{` ${ticker}`}</Text>
        </>
      ) : (
        <TokenDisplay
          amount={amount}
          tokenId={tokenId}
          showLocalAmount={false}
          hideSign={true}
          style={textStyle}
          testID={testID}
        />
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
