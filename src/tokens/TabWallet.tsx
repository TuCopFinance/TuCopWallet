import React, { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { Shadow } from 'react-native-shadow-2'
import { hideWalletBalancesSelector } from 'src/app/selectors'
import SectionHead from 'src/components/SectionHead'
import { HideBalanceButton } from 'src/components/TokenBalance'
import Touchable from 'src/components/Touchable'
import GoldIconSelector from 'src/gold/GoldIconSelector'
import { useXaut0Balance } from 'src/gold/useXaut0Balance'
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
import { useTotalBalanceWithInvestments } from 'src/tokens/hooks'
import { COPmFirstTokensListSelector } from 'src/tokens/selectors'
import { TokenBalanceItem } from 'src/tokens/TokenBalanceItem'
import { getSupportedNetworkIdsForTokenBalances } from 'src/tokens/utils'
import Logger from 'src/utils/Logger'
import Grow from 'src/icons/tab-home/Grow'
import networkConfig from 'src/web3/networkConfig'

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
  const allTokens = useSelector((state) => COPmFirstTokensListSelector(state, supportedNetworkIds))

  // Filter out XAUt0 from regular tokens (it will be shown in investments section)
  const regularTokens = useMemo(() => {
    return allTokens.filter((token) => token.tokenId !== networkConfig.xaut0TokenId)
  }, [allTokens])

  // Get gold balance directly from blockchain
  const { balance: goldBalance } = useXaut0Balance()

  // Get total balance including investments (centralized calculation)
  const { totalBalance, goldLocalValue } = useTotalBalanceWithInvestments(goldBalance)

  Logger.info('TOKEN', allTokens)
  Logger.info('supportedNetworkIds', supportedNetworkIds)

  const balanceDisplay = hideWalletBalances ? `XX${decimalSeparator}XX` : totalBalance.toFormat(2)

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
                {/* Money Section - Pesos & Dollars */}
                <SectionHead text={t('assets.yourMoney')} style={styles.sectionHeaderFirst} />
                {regularTokens.map((token, index) => (
                  <TokenBalanceItem
                    token={token}
                    key={index}
                    onPress={() => {
                      navigate(Screens.TokenDetails, { tokenId: token.tokenId })
                    }}
                    hideBalances={hideWalletBalances}
                  />
                ))}

                {/* Investments Section - Gold */}
                <SectionHead text={t('assets.yourInvestments')} style={styles.sectionHeader} />
                <Touchable onPress={() => navigate(Screens.GoldHome)} testID="GoldBalanceItem">
                  <View style={styles.goldItem}>
                    <GoldIconSelector size={32} />
                    <View style={styles.goldTextContainer}>
                      <View>
                        <Text style={styles.goldLabel}>{t('assets.gold')}</Text>
                      </View>
                      <View style={styles.goldBalanceContainer}>
                        {!hideWalletBalances ? (
                          <>
                            <Text style={styles.goldBalance}>{goldBalance.toFormat(6)} Oro</Text>
                            {goldLocalValue && (
                              <Text style={styles.goldLocalValue}>
                                {localCurrencySymbol}
                                {goldLocalValue.toFormat(2)}
                              </Text>
                            )}
                          </>
                        ) : (
                          <Text style={styles.goldBalance}>••••••</Text>
                        )}
                      </View>
                    </View>
                  </View>
                </Touchable>
              </View>

              <View style={{ marginHorizontal: 20 }}>
                <FlatCard type="scrollmenu" testID="FlatCard/Earn" onPress={onPressEarn}>
                  <View style={[styles.row, { paddingVertical: 8 }]}>
                    <Grow size={25} />
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
    ...typeScale.labelSemiBoldSmall,
    color: Colors.gray6,
  },
  sectionHeaderFirst: {
    marginTop: 0,
    paddingVertical: 0,
    paddingHorizontal: Spacing.Thick24,
    marginBottom: Spacing.Smallest8,
  },
  sectionHeader: {
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Smallest8,
    paddingVertical: 0,
    paddingHorizontal: Spacing.Thick24,
    borderTopWidth: 1,
    borderTopColor: Colors.gray2,
    paddingTop: Spacing.Regular16,
  },
  goldItem: {
    marginHorizontal: Spacing.Thick24,
    marginVertical: Spacing.Regular16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Small12,
  },
  goldTextContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goldLabel: {
    ...typeScale.labelMedium,
  },
  goldBalanceContainer: {
    alignItems: 'flex-end',
  },
  goldBalance: {
    ...typeScale.labelMedium,
  },
  goldLocalValue: {
    ...typeScale.bodyXXSmall,
    color: Colors.gray3,
  },
})

export default TabWallet
