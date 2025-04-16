import { NativeStackScreenProps } from '@react-navigation/native-stack'
import _ from 'lodash'
import React, { useEffect, useRef } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Shadow } from 'react-native-shadow-2'
import { showMessage } from 'src/alert/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { TabHomeEvents } from 'src/analytics/Events'
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
import i18n from 'src/i18n'
import Add from 'src/icons/quick-actions/Add'
import QuickActionsWithdraw from 'src/icons/quick-actions/Withdraw'
import SwapArrows from 'src/icons/SwapArrows'
import ArrowVertical from 'src/icons/tab-home/ArrowVertical'
import Recharge from 'src/icons/tab-home/Recharge'
import Send from 'src/icons/tab-home/Send'
import Swap from 'src/icons/tab-home/Swap'
import { importContacts } from 'src/identity/actions'
import { getLocalCurrencySymbol } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { phoneRecipientCacheSelector } from 'src/recipients/reducer'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { initializeSentryUserContext } from 'src/sentry/actions'
import Colors from 'src/styles/colors'
import { Inter, typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import { useCCOP, useTotalTokenBalance, useUSDT } from 'src/tokens/hooks'
import { hasGrantedContactsPermission } from 'src/utils/contacts'
import Earn from './earn.svg'

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

  const onPressRecharge = React.useCallback(() => {
    navigate(Screens.FiatExchangeCurrencyBottomSheet, { flow: FiatExchangeFlow.CashIn })
  }, [])

  function onPressSendMoney() {
    AppAnalytics.track(TabHomeEvents.send_money)
    navigate(Screens.SendSelectRecipient, {
      defaultTokenIdOverride: cCCOPToken.tokenId,
    })
  }

  // function goToSpend() {
  //   navigate(Screens.FiatExchangeCurrencyBottomSheet, { flow: FiatExchangeFlow.Spend })
  //   AppAnalytics.track(FiatExchangeEvents.cico_landing_select_flow, {
  //     flow: FiatExchangeFlow.Spend,
  //   })
  // }

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

  function onPressWithdraw() {
    // navigate(Screens.FiatExchangeAmount, {
    //   tokenId: cCCOPToken.tokenId,
    //   flow: CICOFlow.CashOut,
    //   tokenSymbol: cCCOPToken.symbol,
    // })

    navigate(Screens.WebViewScreen, {
      uri: 'https://app.buckspay.xyz/',
    })

    // AppAnalytics.track(TabHomeEvents.withdraw)
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
        <View style={styles.totalBalanceContainer}>
          <Text style={styles.balanceTitle}>{t('tabHome.myWallet')}</Text>
          <View style={styles.totalBalanceRow}>
            <Text style={styles.totalBalance} testID={'TotalTokenBalance'}>
              {!hideWalletBalances && localCurrencySymbol}
              {balanceDisplay}
            </Text>
            <HideBalanceButton hideBalance={hideWalletBalances} />
          </View>

          <View style={styles.row}>
            <View style={[styles.flex, { alignItems: 'center' }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.actionButtonsContainer}
              >
                <FlatCard type="scrollmenu" testID="FlatCard/SendMoney" onPress={onPressSendMoney}>
                  <View style={styles.actionButton}>
                    <Send />
                  </View>
                  <Text style={[styles.textPrimary, styles.actionButtonText]}>
                    {t('tabHome.sendMoney')}
                  </Text>
                </FlatCard>

                <FlatCard
                  type="scrollmenu"
                  testID="FlatCard/ReceiveMoney"
                  onPress={onPressRecieveMoney}
                >
                  <View style={styles.actionButton}>
                    <ArrowVertical />
                  </View>
                  <Text style={[styles.textPrimary, styles.actionButtonText]}>
                    {t('tabHome.receiveMoney')}
                  </Text>
                </FlatCard>

                <FlatCard type="scrollmenu" testID="FlatCard/AddCCOP" onPress={onPressRecharge}>
                  <View style={styles.actionButton}>
                    <Recharge />
                  </View>
                  <Text style={[styles.textPrimary, styles.actionButtonText]}>
                    {t('tabHome.addCCOP')}
                  </Text>
                </FlatCard>

                <FlatCard type="scrollmenu" testID="FlatCard/spendMoney" onPress={onPressWithdraw}>
                  <View style={styles.actionButton}>
                    <QuickActionsWithdraw color={Colors.primary} />
                  </View>
                  <Text style={[styles.textPrimary, styles.actionButtonText]}>
                    {t('tabHome.spendMoney')}
                  </Text>
                </FlatCard>
              </ScrollView>
            </View>
          </View>
        </View>

        <Shadow
          style={styles.shadow2}
          offset={[0, 0]}
          distance={10} // Add this to remove bottom shadow
          startColor="rgba(190, 201, 255, 0.28)"
          sides={{ bottom: false }} // Add this to specifically disable bottom shadow
        >
          <View style={[styles.containerShadow, styles.noBottomShadow]}>
            <FlatCard testID="FlatCard/swapToUSD" onPress={onPressHoldUSD}>
              <View style={[styles.row, { paddingVertical: 8 }]}>
                <Swap />
                <Text style={[styles.ctaText]}>{t('tabHome.swapToUSD')}</Text>
              </View>
            </FlatCard>

            {/* <FlatCard testID="FlatCard/HoldUSD" onPress={onPressHoldUSD}>
              <View style={styles.row}>
                <Swap />
                <View style={styles.flex}>
                  <Text style={styles.ctaText}>{t('tabHome.holdUSD')}</Text>
                  <Text style={styles.ctaSubText}>{t('tabHome.swapToUSD')}</Text>
                </View>
              </View>
            </FlatCard> */}

            <FlatCard testID="FlatCard/Earn" onPress={onPressEarn}>
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

            {/* <FlatCard testID="FlatCard/Withdraw" onPress={onPressWithdraw}>
              <View style={styles.row}>
                <Withdraw />
                <Text style={styles.ctaText}>{t('tabHome.withdraw')}</Text>
              </View>
            </FlatCard> */}
          </View>
        </Shadow>
      </ScrollView>

      <AddCCOPBottomSheet forwardedRef={addCCOPBottomSheetRef} />
    </SafeAreaView>
  )
}

export function FlatCard({
  onPress,
  testID,
  type,
  children,
}: {
  children: React.ReactNode
  onPress: () => void
  testID: string
  type?: 'primary' | 'scrollmenu'
}) {
  const card_styles = {
    primary: styles.flatCardPrimary,
    scrollmenu: styles.flatCardScrollMenu,
    default: styles.flatCard,
  }

  const flatStyle = card_styles[type || 'default']
  return type !== 'scrollmenu' ? (
    <Shadow style={styles.shadow} offset={[0, 4]} startColor="rgba(190, 201, 255, 0.28)">
      <Touchable borderRadius={Spacing.Small12} style={flatStyle} testID={testID} onPress={onPress}>
        <>
          {type === 'primary' && <RadialGradientBackground style={styles.grandient} />}
          {children}
        </>
      </Touchable>
    </Shadow>
  ) : (
    <Touchable borderRadius={Spacing.Small12} style={flatStyle} testID={testID} onPress={onPress}>
      <>{children}</>
    </Touchable>
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

  function onPressPurchaseCCOP() {
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
        <FlatCard testID="FlatCard/PurchaseCCOP" onPress={onPressPurchaseCCOP}>
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
    paddingHorizontal: variables.contentPadding,
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
    borderBottomWidth: 0,
    gap: 17,
  },
  noBottomShadow: {
    shadowOffset: { width: 0, height: 0 },
    elevation: 0, // For Android
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
    padding: Platform.select({ ios: 16, android: 13 }),
    width: '100%',
    borderRadius: Spacing.Small12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flatCardScrollMenu: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    zIndex: 1,
  },
  flatCardPrimary: {
    position: 'relative',
    height: 62,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  grandient: {
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    height: 124,
    width: 124,
  },
  textPrimary: { color: Colors.primary },
  // column: {
  //   flexDirection: 'column',
  //   justifyContent: 'center',
  //   alignItems: 'center',
  //   gap: Spacing.Smallest8,
  // },
  ctaText: {
    ...typeScale.bodySmall,
    color: Colors.gray6,
    letterSpacing: -0.16,
  },
  // ctaSubText: {
  //   ...typeScale.bodySmall,
  //   color: Colors.black,
  // },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    marginBottom: 30,
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
    marginLeft: 1,
    marginTop: 0,
  },

  shadow: {
    width: '100%',
    borderRadius: 15,
  },
  shadow2: {
    width: '100%',
  },
  actionButtonsContainer: {
    gap: Spacing.Thick24,
    marginTop: Spacing.Large32,
    marg: 'auto',
  },
  actionButton: {
    flexDirection: 'column',
    backgroundColor: Colors.primary10,
    padding: 16,
    background: '#EEEFFF',
    marginBottom: Spacing.Smallest8,
    borderRadius: 12,
  },
  actionButtonText: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 20,
    letterSpacing: -0.12,
    fontFamily: Inter.Regular,
  },
})

export default TabHome
