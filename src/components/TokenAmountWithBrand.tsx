import BigNumber from 'bignumber.js'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import TokenDisplay, { formatValueToDisplay } from 'src/components/TokenDisplay'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import { DOLARES_VIRTUAL_TOKEN_ID } from 'src/dollarsSpend'
import DollarsIcon from 'src/icons/tokens/DollarsIcon'
import { Spacing } from 'src/styles/styles'
import { getDollarTokenLabelKey } from 'src/tokens/dollarGroup'
import { useTokenInfo } from 'src/tokens/hooks'

interface Props {
  amount: string
  tokenId: string
  testID: string
  textStyle: object
}

// Renders the on-chain amount (via TokenDisplay, which already caps decimals
// and routes through `getTokenSymbol`) and appends the brand-specific dollar
// label when the token is one of the four dollar stablecoins (USDT / USDC /
// USDm / USAT). This way the caller reads e.g. "0.04 Tether USD" instead of
// the generic "0.04 Dolares" — the user can tell which concrete brand
// actually landed in their wallet.
//
// Special-cases the virtual "Dolares" tokenId used for multi-swap aggregates
// (no on-chain registry entry) with a plain amount + "Dolares" label.
export default function TokenAmountWithBrand({ amount, tokenId, testID, textStyle }: Props) {
  const { t } = useTranslation()
  const tokenInfo = useTokenInfo(tokenId)
  const brandLabelKey = getDollarTokenLabelKey(tokenId)

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
      {brandLabelKey ? (
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
          <Text style={textStyle}>{` ${t(brandLabelKey)}`}</Text>
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
