import { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Shadow } from 'react-native-shadow-2'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { TabHomeEvents } from 'src/analytics/Events'
import { AppState } from 'src/app/actions'
import { appStateSelector, phoneNumberVerifiedSelector } from 'src/app/selectors'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import RadialGradientBackground from 'src/components/RadialGradientBackground'
import BalanceCard from 'src/components/BalanceCard'
import Touchable from 'src/components/Touchable'
import EarthquakeDonationSheet from 'src/donation/earthquake/EarthquakeDonationSheet'
import { useFeatureGate } from 'src/statsig/hooks'
import { StatsigFeatureGates } from 'src/statsig/types'
import { CICOFlow } from 'src/fiatExchanges/utils'
import { refreshAllBalances, visitHome } from 'src/home/actions'
import Add from 'src/icons/quick-actions/Add'
import QuickActionsWithdraw from 'src/icons/quick-actions/Withdraw'
import SwapArrows from 'src/icons/actions/SwapArrows'
import Receive from 'src/icons/tab-home/Receive'
import Recharge from 'src/icons/tab-home/Recharge'
import Send from 'src/icons/tab-home/Send'
import Swap from 'src/icons/tab-home/Swap'
import Grow from 'src/icons/tab-home/Grow'
import { bucksPayFlowStatusSelector } from 'src/buckspay/selectors'
import { DOLARES_VIRTUAL_TOKEN_ID } from 'src/dollarsSpend'
import { importContacts } from 'src/identity/actions'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { phoneRecipientCacheSelector } from 'src/recipients/reducer'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import { useCOPm, useUSDT } from 'src/tokens/hooks'
import { hasGrantedContactsPermission } from 'src/utils/contacts'
import GoldEntrypoint from 'src/gold/GoldEntrypoint'

type Props = NativeStackScreenProps<StackParamList, Screens.TabHome>

// Module-level flag so the earthquake donation popup shows exactly ONCE
// per JS session. Reset happens on native process kill (prod) and on JS
// reload (dev), matching "cada apertura de la app" campaign spec. Any
// remount of TabHome within the same session (tab switch, navigation
// pop) does NOT re-trigger the popup.
let earthquakeDonationShownThisSession = false

function TabHome(_props: Props) {
  const { t } = useTranslation()

  const appState = useSelector(appStateSelector)
  const recipientCache = useSelector(phoneRecipientCacheSelector)
  const isNumberVerified = useSelector(phoneNumberVerifiedSelector)

  const dispatch = useDispatch()
  const addCOPmBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const earthquakeDonationPopupRef = useRef<BottomSheetModalRefType>(null)
  const earthquakeDonationCardRef = useRef<BottomSheetModalRefType>(null)
  // Statsig gate is reactive so the popup + card become visible as soon as
  // Statsig finishes loading its bundle, not stuck on the initial
  // Uninitialized default. Prior version used useMemo([]) which froze the
  // false value returned during SDK boot, so any gate created server-side
  // AFTER the last cached bundle stayed hidden for the whole session even
  // if the user force-closed and reopened.
  const earthquakeDonationEnabled = useFeatureGate(
    StatsigFeatureGates.SHOW_EARTHQUAKE_DONATION_2026_08
  )

  const [refreshing, setRefreshing] = React.useState(false)

  useEffect(() => {
    dispatch(visitHome())
  }, [])

  const onRefresh = React.useCallback(() => {
    setRefreshing(true)
    dispatch(refreshAllBalances())
    setRefreshing(false)
  }, [])

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
    // Waiting 1/2 sec before triggering to allow
    // rest of feed to load unencumbered
    setTimeout(tryImportContacts, 500)
  }, [])

  useEffect(() => {
    if (appState === AppState.Active) {
      dispatch(refreshAllBalances())
    }
  }, [appState])

  // Auto-open the Colombia earthquake donation popup once per app-open
  // session. The module-level flag lives in this component's ref so it
  // resets on JS reload (dev) + on native process kill (prod) — i.e.
  // every fresh app start shows it again, per campaign copy. If the user
  // dismisses or donates, the sheet closes and does not reappear until
  // the app is killed and reopened.
  useEffect(() => {
    if (!earthquakeDonationEnabled) return
    if (earthquakeDonationShownThisSession) return
    earthquakeDonationShownThisSession = true
    // Small delay so the sheet slides up after the tab's first render,
    // otherwise it can collide with the initial layout animation.
    const t = setTimeout(() => {
      earthquakeDonationPopupRef.current?.snapToIndex(0)
    }, 800)
    return () => clearTimeout(t)
  }, [earthquakeDonationEnabled])

  const COPmToken: any = useCOPm()
  const USDTToken = useUSDT()

  const onPressRecharge = React.useCallback(() => {
    // Go directly to USDT (Dólares) - no token selection needed for recharge
    if (USDTToken) {
      navigate(Screens.FiatExchangeAmount, {
        tokenId: USDTToken.tokenId,
        flow: CICOFlow.CashIn,
        tokenSymbol: USDTToken.symbol,
      })
    }
  }, [USDTToken])

  function onPressSendMoney() {
    AppAnalytics.track(TabHomeEvents.send_money)
    navigate(Screens.SendSelectRecipient, {
      defaultTokenIdOverride: COPmToken.tokenId,
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
    // Pre-select the aggregated "Dolares" virtual on the TO side so the swap
    // card shows the user's full dollar balance (4.67 across USDT/USDC/USDm)
    // instead of just one concrete token. The swap layer translates virtual
    // back to USDT for the actual settlement (see SwapScreen.quoteToToken).
    !!COPmToken &&
      navigate(Screens.SwapScreenWithBack, {
        fromTokenId: COPmToken.tokenId,
        toTokenId: DOLARES_VIRTUAL_TOKEN_ID,
      })
  }

  function onPressEarn() {
    navigate(Screens.EarnHome)
  }

  function onPressReFiColombiaSubsidies() {
    AppAnalytics.track(TabHomeEvents.refi_medellin_ubi_pressed)
    navigate(Screens.ReFiColombiaSubsidies)
  }

  const bucksPayFlowStatus = useSelector(bucksPayFlowStatusSelector)

  function onPressWithdraw() {
    if (bucksPayFlowStatus === 'tracking' || bucksPayFlowStatus === 'submitting-to-api') {
      navigate(Screens.BucksPayStatus)
    } else {
      navigate(Screens.SelectOfframpProvider)
    }
  }

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
        <BalanceCard testID="TabHome/BalanceCard" />

        <View style={styles.totalBalanceContainer}>
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
                    <Receive />
                  </View>
                  <Text style={[styles.textPrimary, styles.actionButtonText]}>
                    {t('tabHome.receiveMoney')}
                  </Text>
                </FlatCard>

                <FlatCard type="scrollmenu" testID="FlatCard/AddCOPm" onPress={onPressRecharge}>
                  <View style={styles.actionButton}>
                    <Recharge />
                  </View>
                  <Text style={[styles.textPrimary, styles.actionButtonText]}>
                    {t('tabHome.addCOPm')}
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
            {earthquakeDonationEnabled && (
              // Donation card first so it is the very first entrypoint users
              // see under the balance / quick actions. Placed above the swap
              // card intentionally: pinning the campaign to the top of the
              // list is the whole point of the always-visible surface (the
              // popup is one-per-session, but the card has to earn a look
              // every time someone scrolls Home).
              <FlatCard
                testID="FlatCard/EarthquakeDonation"
                onPress={() => earthquakeDonationCardRef.current?.snapToIndex(0)}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardIconBox}>
                    <Image source={require('./refi-colombia-logo.webp')} style={styles.refiLogo} />
                  </View>
                  <View style={styles.cardTextBox}>
                    <Text style={styles.cardText}>{t('tabHome.earthquakeDonation.button')}</Text>
                    <Text style={styles.cardSubText}>
                      {t('tabHome.earthquakeDonation.subtitle')}
                    </Text>
                    <Text style={styles.donationHighlight}>
                      {t('tabHome.earthquakeDonation.highlight')}
                    </Text>
                  </View>
                </View>
              </FlatCard>
            )}

            <FlatCard testID="FlatCard/swapToUSD" onPress={onPressHoldUSD}>
              <View style={styles.cardRow}>
                <View style={styles.cardIconBox}>
                  <Swap />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={styles.cardText}>{t('tabHome.swapToUSD')}</Text>
                  <Text style={styles.cardSubText}>{t('tabHome.swapSubtitle')}</Text>
                </View>
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
              <View style={styles.cardRow}>
                <View style={styles.cardIconBox}>
                  <Grow size={25} />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={styles.cardText}>{t('tabHome.earnSimple')}</Text>
                  <Text style={styles.cardSubText}>{t('tabHome.earnSubtitle')}</Text>
                </View>
              </View>
            </FlatCard>

            <GoldEntrypoint />

            <FlatCard
              testID="FlatCard/ReFiColombiaSubsidies"
              onPress={onPressReFiColombiaSubsidies}
            >
              <View style={styles.cardRow}>
                <View style={styles.cardIconBox}>
                  <Image source={require('./refi-colombia-logo.webp')} style={styles.refiLogo} />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={styles.cardText}>{t('tabHome.reFiColombiaSubsidies.button')}</Text>
                  <Text style={styles.cardSubText}>
                    {t('tabHome.reFiColombiaSubsidies.subtitle')}
                  </Text>
                </View>
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

      <AddCOPmBottomSheet forwardedRef={addCOPmBottomSheetRef} />
      {earthquakeDonationEnabled && (
        <>
          <EarthquakeDonationSheet forwardedRef={earthquakeDonationPopupRef} source="popup" />
          <EarthquakeDonationSheet forwardedRef={earthquakeDonationCardRef} source="card" />
        </>
      )}
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

function AddCOPmBottomSheet({
  forwardedRef,
}: {
  forwardedRef: React.RefObject<BottomSheetModalRefType>
}) {
  const { t } = useTranslation()
  const COPmToken = useCOPm()

  function onPressSwapFromCusd() {
    // AppAnalytics.track(TabHomeEvents.add_ckes_from_swap)
    // Pre-select the aggregated "Dolares" virtual on the FROM side so the
    // user can spend their full dollar balance via the multi-step planner
    // (USAT -> USDm -> USDC -> USDT spend order) instead of being locked to
    // a single concrete token. TO stays COPm.
    !!COPmToken &&
      navigate(Screens.SwapScreenWithBack, {
        fromTokenId: DOLARES_VIRTUAL_TOKEN_ID,
        toTokenId: COPmToken.tokenId,
      })
    forwardedRef.current?.dismiss()
  }

  function onPressPurchaseCOPm() {
    // AppAnalytics.track(TabHomeEvents.add_ckes_from_cash_in)
    !!COPmToken &&
      navigate(Screens.FiatExchangeAmount, {
        tokenId: COPmToken.tokenId,
        flow: CICOFlow.CashIn,
        tokenSymbol: COPmToken.symbol,
      })
    forwardedRef.current?.dismiss()
  }

  return (
    <BottomSheet
      title={t('tabHome.addCOPm')}
      forwardedRef={forwardedRef}
      testId="AddCOPmBottomSheet"
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
        <FlatCard testID="FlatCard/PurchaseCOPm" onPress={onPressPurchaseCOPm}>
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
  // ctaText: {
  //   ...typeScale.bodySmall,
  //   color: Colors.gray6,
  //   letterSpacing: -0.16,
  // },
  // ctaSubText: {
  //   ...typeScale.bodySmall,
  //   color: Colors.gray6,
  //   letterSpacing: -0.16,
  //   fontFamily: Inter.Regular,
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
    alignSelf: 'center',
  },
  actionButton: {
    flexDirection: 'column',
    backgroundColor: '#EEEFFF',
    padding: 16,
    marginBottom: Spacing.Smallest8,
    borderRadius: 12,
  },
  actionButtonText: {
    ...typeScale.bodyXSmall,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: -0.12,
  },
  // iconContainer: {
  //   width: 56,
  //   alignItems: 'center',
  //   justifyContent: 'center',
  // },
  refiLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  // ubiRow: {
  //   alignItems: 'center',
  //   display: 'flex',
  // },
  // textColumn: {
  //   alignItems: 'center',
  //   justifyContent: 'center',
  // },
  // Estilos uniformes para tarjetas grandes
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 40,
    paddingRight: 40,
  },
  cardIconBox: {
    width: 57,
    height: 57,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#EEEFFF',
    borderRadius: 12,
  },
  cardTextBox: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cardText: {
    ...typeScale.labelMedium,
    color: Colors.black,
    textAlign: 'right',
  },
  cardSubText: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
    textAlign: 'right',
    marginTop: 2,
  },
  donationHighlight: {
    ...typeScale.bodyXXSmall,
    color: Colors.gray3,
    textAlign: 'right',
  },
})

export default TabHome
