import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import TokenDisplay from 'src/components/TokenDisplay'
import TokenIcon from 'src/components/TokenIcon'
import Touchable from 'src/components/Touchable'
import Warning from 'src/icons/status/Warning'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { TokenBalance } from 'src/tokens/slice'
import networkConfig from 'src/web3/networkConfig'

interface Props {
  token: TokenBalance
  balanceUsdErrorFallback?: string
  onPress?: () => void
  containerStyle?: ViewStyle
  showPriceUsdUnavailableWarning?: boolean
  hideBalances?: boolean
  testIdPrefix?: string
}

export const TokenBalanceItem = ({
  token,
  onPress,
  containerStyle,
  balanceUsdErrorFallback,
  showPriceUsdUnavailableWarning,
  testIdPrefix = '',
  hideBalances = false,
}: Props) => {
  const { t } = useTranslation()

  const getTokenName = (token: any) => {
    if (token.tokenId === networkConfig.copmTokenId) {
      return t('assets.pesos')
    }

    if (token.tokenId === networkConfig.usdtTokenId) {
      return t('assets.dollars')
    }
    return token.name
  }

  const Content = (
    <View style={[styles.container, containerStyle]} testID="TokenBalanceItem">
      <TokenIcon token={token} />
      <View style={styles.textContainer}>
        <View style={styles.row}>
          <Text
            numberOfLines={1}
            style={styles.label}
            testID={`${testIdPrefix}${token.symbol}Symbol`}
          >
            {getTokenName(token)}
          </Text>
          {showPriceUsdUnavailableWarning && !token.priceUsd && <Warning size={16} />}
        </View>
        <View style={styles.balanceContainer}>
          {!hideBalances ? (
            <>
              <TokenDisplay
                style={styles.amount}
                amount={token.balance}
                tokenId={token.tokenId}
                showSymbol={true}
                hideSign={true}
                showLocalAmount={false}
                testID={`${token.symbol}Balance`}
              />
              <TokenDisplay
                style={styles.subAmount}
                amount={token.balance}
                tokenId={token.tokenId}
                showSymbol={false}
                hideSign={true}
                showLocalAmount={true}
                errorFallback={balanceUsdErrorFallback}
              />
            </>
          ) : (
            <Text style={styles.amount}>••••••</Text>
          )}
        </View>
      </View>
      {!!token.bridge && (
        <Text
          testID="BridgeLabel"
          numberOfLines={1}
          style={[styles.subLabel, { color: colors.infoDark }]}
        >
          {t('assets.bridge', { bridge: token.bridge })}
        </Text>
      )}
    </View>
  )

  return onPress ? (
    <Touchable onPress={onPress} testID={`TokenBalanceItemTouchable/${token.tokenId}`}>
      {Content}
    </Touchable>
  ) : (
    Content
  )
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.Thick24,
    marginVertical: Spacing.Regular16,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.Small12,
  },
  textContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    ...typeScale.labelMedium,
    overflow: 'hidden',
    flexShrink: 1,
    marginRight: Spacing.Smallest8,
  },
  balanceContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    ...typeScale.labelMedium,
  },
  subAmount: {
    ...typeScale.bodyXXSmall,
    color: colors.gray3,
  },
  subLabel: {
    ...typeScale.bodySmall,
    overflow: 'hidden',
    flexShrink: 1,
    color: colors.gray3,
  },
})
