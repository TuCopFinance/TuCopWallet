import React from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { Shadow } from 'react-native-shadow-2'
import { hideWalletBalancesSelector } from 'src/app/selectors'
import { HideBalanceButton } from 'src/components/TokenBalance'
import { refreshAllBalances } from 'src/home/actions'
import { FlatCard } from 'src/home/TabHome'
import i18n from 'src/i18n'
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
import Earn from './../home/earn.svg'

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

  function onPressEarn() {
    navigate(Screens.EarnHome)
  }

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
      <View style={{ flex: 1, justifyContent: 'space-between', marginBottom: 28 }}>
        <ScrollView
          contentContainerStyle={[styles.contentContainerStyle, { flexGrow: 1 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          style={{ flex: 1 }}
        >
          <View style={styles.shadowContainer}>
            <Shadow
              style={[styles.shadow, { justifyContent: 'space-between' }]}
              distance={10}
              offset={[0, 0]}
              startColor="rgba(190, 201, 255, 0.28)"
            >
              <View>
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
              </View>

              <View style={{ marginHorizontal: 20 }}>
                <FlatCard type="scrollmenu" testID="FlatCard/Earn" onPress={onPressEarn}>
                  <View style={[styles.row, { paddingVertical: 8 }]}>
                    <Earn />
                    <Text style={styles.ctaText}>
                      <Trans
                        i18n={i18n}
                        i18nKey="tabHome.earn"
                        components={[<Text key={0} style={{ fontWeight: '700' }} />]}
                      />
                    </Text>
                  </View>
                </FlatCard>
              </View>
            </Shadow>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadowContainer: {
    flex: 1,
    backgroundColor: Colors.white,
    paddingHorizontal: 24,
    paddingVertical: 10,
    width: '100%',
    borderRadius: 15,
  },
  shadow: {
    borderRadius: 15,
    backgroundColor: Colors.white,
    paddingVertical: 10,
    height: '100%',
    width: '99%',
  },
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
  ctaText: {
    ...typeScale.bodySmall,
    color: Colors.gray6,
    letterSpacing: -0.16,
  },
})

export default TabWallet
