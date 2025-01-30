import React from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { hideWalletBalancesSelector } from 'src/app/selectors'
import { HideBalanceButton } from 'src/components/TokenBalance'
import { refreshAllBalances } from 'src/home/actions'
import { getLocalCurrencySymbol } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTotalTokenBalance } from 'src/tokens/hooks'
import { cCOPFirstTokensListSelector } from 'src/tokens/selectors'
import { TokenBalanceItem } from 'src/tokens/TokenBalanceItem'
import { getSupportedNetworkIdsForTokenBalances } from 'src/tokens/utils'
import Logger from 'src/utils/Logger'

function TabWallet() {
  const dispatch = useDispatch()
  const [refreshing, setRefreshing] = React.useState(false)

  const onRefresh = React.useCallback(() => {
    setRefreshing(true)
    dispatch(refreshAllBalances())
    setRefreshing(false)
  }, [])

  const hideWalletBalances = useSelector(hideWalletBalancesSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const { decimalSeparator } = getNumberFormatSettings()
  const { t } = useTranslation()

  const supportedNetworkIds = getSupportedNetworkIdsForTokenBalances()
  const tokens = useSelector((state) => cCOPFirstTokensListSelector(state, supportedNetworkIds))

  Logger.info('TOKEN', tokens)
  Logger.info('supportedNetworkIds', supportedNetworkIds)
  const totalTokenBalanceLocal = useTotalTokenBalance()
  const balanceDisplay = hideWalletBalances
    ? `XX${decimalSeparator}XX`
    : totalTokenBalanceLocal?.toFormat(2)
  return (
    <View style={styles.container} testID="TabWallet">
      <Text style={styles.balanceTitle}>{t('tabHome.myWallet')}</Text>
      <View style={styles.row}>
        <Text style={styles.totalBalance} testID={'TotalTokenBalance'}>
          {!hideWalletBalances && localCurrencySymbol}
          {balanceDisplay}
        </Text>
        <HideBalanceButton hideBalance={hideWalletBalances} />
      </View>
      <ScrollView
        contentContainerStyle={styles.contentContainerStyle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {tokens.map((token, index) => (
          <TokenBalanceItem
            token={token}
            key={index}
            onPress={() => {
              navigate(Screens.TokenDetails, { tokenId: token.tokenId })
              // AppAnalytics.track(AssetsEvents.tap_asset, {
              //   ...getTokenAnalyticsProps(token),
              //   title: token.symbol,
              //   description: token.name,
              //   assetType: 'token',
              // })
            }}
            hideBalances={hideWalletBalances}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.Smallest8,
    marginTop: Spacing.Smallest8,
  },
  totalBalance: {
    ...typeScale.titleLarge,
    color: Colors.primary,
  },
  contentContainerStyle: { marginTop: Spacing.Large32 },
  balanceTitle: {
    ...typeScale.bodyLarge,
    color: Colors.secondary,
    margin: 'auto',
    textAlign: 'center',
    marginTop: 24,
  },
})

export default TabWallet
