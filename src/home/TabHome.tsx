import { NativeStackScreenProps } from '@react-navigation/native-stack'
import _ from 'lodash'
import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Shadow } from 'react-native-shadow-2'
import { showMessage } from 'src/alert/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents, TabHomeEvents } from 'src/analytics/Events'
import { AppState } from 'src/app/actions'
import {
  appStateSelector,
  hideWalletBalancesSelector,
  phoneNumberVerifiedSelector,
} from 'src/app/selectors'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import RadialGradientBackground from 'src/components/RadialGradientBackground'
import { HideBalanceButton } from 'src/components/TokenBalance'
import Touchable from 'src/components/Touchable'
import { ALERT_BANNER_DURATION, DEFAULT_TESTNET, SHOW_TESTNET_BANNER } from 'src/config'
import { CICOFlow, FiatExchangeFlow } from 'src/fiatExchanges/utils'
import { refreshAllBalances, visitHome } from 'src/home/actions'
import Add from 'src/icons/quick-actions/Add'
import SwapArrows from 'src/icons/SwapArrows'
import AddCCOP from 'src/icons/tab-home/AddCCOP'
import ArrowVertical from 'src/icons/tab-home/ArrowVertical'
import Send from 'src/icons/tab-home/Send'
import Swap from 'src/icons/tab-home/Swap'
import Withdraw from 'src/icons/tab-home/Withdraw'
import { importContacts } from 'src/identity/actions'
import { getLocalCurrencySymbol } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { phoneRecipientCacheSelector } from 'src/recipients/reducer'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { initializeSentryUserContext } from 'src/sentry/actions'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import { useCashOutTokens, useCCOP, useTotalTokenBalance, useUSDT } from 'src/tokens/hooks'
import { hasGrantedContactsPermission } from 'src/utils/contacts'
import { CCOP_TOKEN_ID_MAINNET } from 'src/web3/networkConfig'

type Props = NativeStackScreenProps<StackParamList, Screens.TabHome>

function TabHome(_props: Props) {
  const { t } = useTranslation()

  const appState = useSelector(appStateSelector)
  const recipientCache = useSelector(phoneRecipientCacheSelector)
  const isNumberVerified = useSelector(phoneNumberVerifiedSelector)

  const dispatch = useDispatch()
  const addCCOPBottomSheetRef = useRef<BottomSheetModalRefType>(null)

  const [refreshing, setRefreshing] = React.useState(false)

  useEffect(() => {
    dispatch(visitHome())
  }, [])

  const onRefresh = React.useCallback(() => {
    setRefreshing(true)
    dispatch(refreshAllBalances())
    setRefreshing(false)
  }, [])

  const showTestnetBanner = () => {
    dispatch(
      showMessage(
        t('testnetAlert.1', { testnet: _.startCase(DEFAULT_TESTNET) }),
        ALERT_BANNER_DURATION,
        null,
        null,
        t('testnetAlert.0', { testnet: _.startCase(DEFAULT_TESTNET) })
      )
    )
  }

  const tryImportContacts = async () => {
    // Skip if contacts have already been imported or the user hasn't verified their phone number.
    if (Object.keys(recipientCache).length || !isNumberVerified) {
      return
    }

    const contactPermissionStatusGranted = await hasGrantedContactsPermission()
    if (contactPermissionStatusGranted) {
      dispatch(importContacts())
    }
  }

  useEffect(() => {
    // TODO find a better home for this, its unrelated to wallet home
    dispatch(initializeSentryUserContext())
    if (SHOW_TESTNET_BANNER) {
      showTestnetBanner()
    }

    // Waiting 1/2 sec before triggering to allow
    // rest of feed to load unencumbered
    setTimeout(tryImportContacts, 500)
  }, [])

  useEffect(() => {
    if (appState === AppState.Active) {
      dispatch(refreshAllBalances())
    }
  }, [appState])

  const cCCOPToken: any = useCCOP()
  const USDTToken = useUSDT()

  const onPressAddCCOP = React.useCallback(() => {
    if (USDTToken?.balance.isZero()) {
      !!cCCOPToken &&
        navigate(Screens.FiatExchangeAmount, {
          tokenId: cCCOPToken.tokenId || CCOP_TOKEN_ID_MAINNET,
          flow: CICOFlow.CashIn,
          tokenSymbol: cCCOPToken.symbol,
        })
    } else {
      addCCOPBottomSheetRef.current?.snapToIndex(0)
    }
  }, [cCCOPToken.tokenId, USDTToken?.tokenId])

  function onPressSendMoney() {
    AppAnalytics.track(TabHomeEvents.send_money)
    !!cCCOPToken &&
      navigate(Screens.SendSelectRecipient, {
        defaultTokenIdOverride: cCCOPToken.tokenId,
      })
  }

  function onPressRecieveMoney() {
    AppAnalytics.track(TabHomeEvents.receive_money)
    navigate(Screens.QRNavigator, {
      screen: Screens.QRCode,
    })
  }

  function onPressHoldUSD() {
    AppAnalytics.track(TabHomeEvents.hold_usd)
    !!cCCOPToken &&
      !!USDTToken &&
      navigate(Screens.SwapScreenWithBack, {
        fromTokenId: cCCOPToken.tokenId,
        toTokenId: USDTToken.tokenId,
      })
  }

  function onPressEarn() {
    navigate(Screens.EarnHome)
  }

  const cashOutTokens = useCashOutTokens(true)

  function onPressWithdraw() {
    const availableCashOutTokens = cashOutTokens.filter((token) => !token.balance.isZero())
    const numAvailableCashOutTokens = availableCashOutTokens.length
    if (
      numAvailableCashOutTokens === 1 ||
      (numAvailableCashOutTokens === 0 && cashOutTokens.length === 1)
    ) {
      const { tokenId, symbol } =
        numAvailableCashOutTokens === 1 ? availableCashOutTokens[0] : cashOutTokens[0]
      navigate(Screens.FiatExchangeAmount, {
        tokenId,
        flow: CICOFlow.CashOut,
        tokenSymbol: symbol,
      })
    } else {
      navigate(Screens.FiatExchangeCurrencyBottomSheet, { flow: FiatExchangeFlow.CashOut })
      AppAnalytics.track(FiatExchangeEvents.cico_landing_select_flow, {
        flow: FiatExchangeFlow.CashOut,
      })
    }
    AppAnalytics.track(TabHomeEvents.withdraw)
  }

  const hideWalletBalances = useSelector(hideWalletBalancesSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const { decimalSeparator } = getNumberFormatSettings()

  const totalTokenBalanceLocal = useTotalTokenBalance()
  const balanceDisplay = hideWalletBalances
    ? `XX${decimalSeparator}XX`
    : totalTokenBalanceLocal?.toFormat(2)

  return (
    <SafeAreaView testID="TabHome" style={styles.container} edges={[]}>
      <View style={styles.totalBalanceContainer}>
        <Text style={styles.balanceTitle}>{t('tabHome.myWallet')}</Text>
        <View style={styles.totalBalanceRow}>
          <Text style={styles.totalBalance} testID={'TotalTokenBalance'}>
            {!hideWalletBalances && localCurrencySymbol}
            {balanceDisplay}
          </Text>
          <HideBalanceButton hideBalance={hideWalletBalances} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollStyle}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.containerShadow}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <FlatCard type="primary" testID="FlatCard/SendMoney" onPress={onPressSendMoney}>
                <View style={styles.row}>
                  <Send />
                  <Text style={styles.textWhite}>{t('tabHome.sendMoney')}</Text>
                </View>
              </FlatCard>
            </View>

            <View style={styles.flex}>
              <FlatCard type="primary" testID="FlatCard/ReceiveMoney" onPress={onPressRecieveMoney}>
                <View style={styles.row}>
                  <ArrowVertical />
                  <Text style={styles.textWhite}>{t('tabHome.receiveMoney')}</Text>
                </View>
              </FlatCard>
            </View>
          </View>

          <FlatCard testID="FlatCard/AddCKES" onPress={onPressAddCCOP}>
            <View style={styles.column}>
              <AddCCOP />
              <Text style={styles.ctaText}>{t('tabHome.addCCOP')}</Text>
            </View>
          </FlatCard>

          <FlatCard testID="FlatCard/HoldUSD" onPress={onPressHoldUSD}>
            <View style={styles.row}>
              <Swap />
              <View style={styles.flex}>
                <Text style={styles.ctaText}>{t('tabHome.holdUSD')}</Text>
                <Text style={styles.ctaSubText}>{t('tabHome.swapToUSD')}</Text>
              </View>
            </View>
          </FlatCard>

          <FlatCard testID="FlatCard/Earn" onPress={onPressEarn}>
            <View style={styles.row}>
              <Withdraw />
              <Text style={styles.ctaText}>Invierte tus dolares</Text>
            </View>
          </FlatCard>

          <FlatCard testID="FlatCard/Withdraw" onPress={onPressWithdraw}>
            <View style={styles.row}>
              <Withdraw />
              <Text style={styles.ctaText}>{t('tabHome.withdraw')}</Text>
            </View>
          </FlatCard>
        </View>
      </ScrollView>
      <AddCCOPBottomSheet forwardedRef={addCCOPBottomSheetRef} />
    </SafeAreaView>
  )
}

function FlatCard({
  onPress,
  testID,
  type,
  children,
}: {
  children: React.ReactNode
  onPress: () => void
  testID: string
  type?: 'primary'
}) {
  const flatStyle = type === 'primary' ? styles.flatCardPrimary : styles.flatCard
  return (
    <Shadow style={styles.shadow} offset={[0, 4]} startColor="rgba(190, 201, 255, 0.28)">
      <Touchable borderRadius={Spacing.Small12} style={flatStyle} testID={testID} onPress={onPress}>
        <>
          {type === 'primary' && <RadialGradientBackground />}
          {children}
        </>
      </Touchable>
    </Shadow>
  )
}

function AddCCOPBottomSheet({
  forwardedRef,
}: {
  forwardedRef: React.RefObject<BottomSheetModalRefType>
}) {
  const { t } = useTranslation()
  const cCCOPToken = useCCOP()
  const USDTToken = useUSDT()

  function onPressSwapFromCusd() {
    // AppAnalytics.track(TabHomeEvents.add_ckes_from_swap)
    !!USDTToken &&
      !!cCCOPToken &&
      navigate(Screens.SwapScreenWithBack, {
        fromTokenId: USDTToken.tokenId,
        toTokenId: cCCOPToken.tokenId,
      })
    forwardedRef.current?.dismiss()
  }

  function onPressPurchaseCkes() {
    // AppAnalytics.track(TabHomeEvents.add_ckes_from_cash_in)
    !!cCCOPToken &&
      navigate(Screens.FiatExchangeAmount, {
        tokenId: cCCOPToken.tokenId,
        flow: CICOFlow.CashIn,
        tokenSymbol: cCCOPToken.symbol,
      })
    forwardedRef.current?.dismiss()
  }

  return (
    <BottomSheet
      title={t('tabHome.addCCOP')}
      forwardedRef={forwardedRef}
      testId="AddCCOPBottomSheet"
    >
      <View style={styles.bottomSheetContainer}>
        <FlatCard testID="FlatCard/AddFromCUSD" onPress={onPressSwapFromCusd}>
          <View style={styles.row}>
            <SwapArrows />
            <View style={styles.flex}>
              <Text style={styles.bottomSheetCtaText}>
                {t('tabHome.addCKESBottomSheet.addCKESFromCUSD')}
              </Text>
              <Text style={styles.bottomSheetCtaSubText}>
                {t('tabHome.addCKESBottomSheet.bySwapping')}
              </Text>
            </View>
          </View>
        </FlatCard>
        <FlatCard testID="FlatCard/PurchaseCKES" onPress={onPressPurchaseCkes}>
          <View style={styles.row}>
            <Add color={Colors.black} />
            <View style={styles.flex}>
              <Text style={styles.bottomSheetCtaText}>
                {t('tabHome.addCKESBottomSheet.purchase')}
              </Text>
              <Text style={styles.bottomSheetCtaSubText}>
                {t('tabHome.addCKESBottomSheet.purchaseDescription')}
              </Text>
            </View>
          </View>
        </FlatCard>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  scrollStyle: {
    flex: 1,
    marginHorizontal: -variables.contentPadding,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: variables.contentPadding,
  },
  containerShadow: {
    flex: 1,
    borderTopRightRadius: 33,
    padding: 22,
    paddingTop: 30,
    borderColor: 'rgba(190, 201, 255, 0.33)',
    borderWidth: 1,
    marginLeft: -17,
    marginRight: -17,
    backgroundColor: 'white',
    gap: 17,
  },
  container: {
    flex: 1,
    paddingHorizontal: variables.contentPadding,
    paddingTop: variables.contentPadding,
    position: 'relative',
    gap: Spacing.Regular16,
    backgroundColor: 'white',
  },
  flatCard: {
    backgroundColor: 'white',
    padding: Spacing.Regular16,
    borderRadius: Spacing.Small12,
    justifyContent: 'center',
  },
  flatCardPrimary: {
    height: 62,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  textWhite: { color: Colors.white },
  column: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.Smallest8,
  },
  ctaText: {
    ...typeScale.labelSemiBoldMedium,
    color: Colors.black,
  },
  ctaSubText: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  flex: {
    flex: 1,
  },
  bottomSheetContainer: {
    gap: Spacing.Regular16,
    paddingVertical: Spacing.Thick24,
  },
  bottomSheetCtaText: {
    ...typeScale.labelMedium,
    color: Colors.black,
  },
  bottomSheetCtaSubText: {
    ...typeScale.bodySmall,
    color: Colors.black,
  },
  totalBalanceContainer: {
    marginTop: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  totalBalanceRow: {
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
  balanceTitle: {
    ...typeScale.bodyLarge,
    color: Colors.secondary,
  },

  shadow: {
    width: '100%',
    borderRadius: 15,
  },
})

export default TabHome
