import { NativeStackScreenProps } from '@react-navigation/native-stack'
import _ from 'lodash'
import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { showMessage } from 'src/alert/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents, TabHomeEvents } from 'src/analytics/Events'
import { AppState } from 'src/app/actions'
import { appStateSelector, phoneNumberVerifiedSelector } from 'src/app/selectors'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import Touchable from 'src/components/Touchable'
import { ALERT_BANNER_DURATION, DEFAULT_TESTNET, SHOW_TESTNET_BANNER } from 'src/config'
import { CICOFlow, FiatExchangeFlow } from 'src/fiatExchanges/utils'
import { refreshAllBalances, visitHome } from 'src/home/actions'
import Add from 'src/icons/quick-actions/Add'
import SwapArrows from 'src/icons/SwapArrows'
import ArrowVertical from 'src/icons/tab-home/ArrowVertical'
import Send from 'src/icons/tab-home/Send'
import Swap from 'src/icons/tab-home/Swap'
import Withdraw from 'src/icons/tab-home/Withdraw'
import { importContacts } from 'src/identity/actions'
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
import { useCashOutTokens, useCCOP, useUSDT } from 'src/tokens/hooks'
import { hasGrantedContactsPermission } from 'src/utils/contacts'

type Props = NativeStackScreenProps<StackParamList, Screens.TabHome>

function TabHome(_props: Props) {
  const { t } = useTranslation()

  const appState = useSelector(appStateSelector)
  const recipientCache = useSelector(phoneRecipientCacheSelector)
  const isNumberVerified = useSelector(phoneNumberVerifiedSelector)

  const dispatch = useDispatch()
  const addCKESBottomSheetRef = useRef<BottomSheetModalRefType>(null)

  useEffect(() => {
    dispatch(visitHome())
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

  const cKESToken = useCCOP()
  const cUSDToken = useUSDT()

  function onPressAddCKES() {
    AppAnalytics.track(TabHomeEvents.add_ckes)
    if (cUSDToken?.balance.isZero()) {
      !!cKESToken &&
        navigate(Screens.FiatExchangeAmount, {
          tokenId: cKESToken.tokenId,
          flow: CICOFlow.CashIn,
          tokenSymbol: cKESToken.symbol,
        })
    } else {
      addCKESBottomSheetRef.current?.snapToIndex(0)
    }
  }

  function onPressSendMoney() {
    AppAnalytics.track(TabHomeEvents.send_money)
    !!cKESToken &&
      navigate(Screens.SendSelectRecipient, {
        defaultTokenIdOverride: cKESToken.tokenId,
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
    !!cKESToken &&
      !!cUSDToken &&
      navigate(Screens.SwapScreenWithBack, {
        fromTokenId: cKESToken.tokenId,
        toTokenId: cUSDToken.tokenId,
      })
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

  return (
    <SafeAreaView testID="TabHome" style={styles.container} edges={[]}>
      <FlatCard testID="FlatCard/AddCKES" onPress={onPressAddCKES}>
        <View style={styles.column}>
          {!!cKESToken && (
            <TokenIcon token={cKESToken} showNetworkIcon={false} size={IconSize.LARGE} />
          )}
          <Text style={styles.ctaText}>{t('tabHome.addCKES')}</Text>
        </View>
      </FlatCard>
      <View style={styles.row}>
        <View style={styles.flex}>
          <FlatCard testID="FlatCard/SendMoney" onPress={onPressSendMoney}>
            <View style={styles.column}>
              <Send />
              <Text style={styles.ctaText}>{t('tabHome.sendMoney')}</Text>
            </View>
          </FlatCard>
        </View>
        <View style={styles.flex}>
          <FlatCard testID="FlatCard/ReceiveMoney" onPress={onPressRecieveMoney}>
            <View style={styles.column}>
              <ArrowVertical />
              <Text style={styles.ctaText}>{t('tabHome.receiveMoney')}</Text>
            </View>
          </FlatCard>
        </View>
      </View>
      <FlatCard testID="FlatCard/HoldUSD" onPress={onPressHoldUSD}>
        <View style={styles.row}>
          <Swap />
          <View style={styles.flex}>
            <Text style={styles.ctaText}>{t('tabHome.holdUSD')}</Text>
            <Text style={styles.ctaSubText}>{t('tabHome.swapToUSD')}</Text>
          </View>
        </View>
      </FlatCard>
      <FlatCard testID="FlatCard/Withdraw" onPress={onPressWithdraw}>
        <View style={styles.row}>
          <Withdraw />
          <Text style={styles.ctaText}>{t('tabHome.withdraw')}</Text>
        </View>
      </FlatCard>
      <AddCCOPBottomSheet forwardedRef={addCKESBottomSheetRef} />
    </SafeAreaView>
  )
}

function FlatCard({
  onPress,
  testID,
  ...props
}: {
  children: React.ReactNode
  onPress: () => void
  testID: string
}) {
  return (
    <Touchable
      borderRadius={Spacing.Small12}
      style={styles.flatCard}
      testID={testID}
      onPress={onPress}
      {...props}
    />
  )
}

function AddCCOPBottomSheet({
  forwardedRef,
}: {
  forwardedRef: React.RefObject<BottomSheetModalRefType>
}) {
  const { t } = useTranslation()
  const cKESToken = useCCOP()
  const cUSDToken = useUSDT()

  function onPressSwapFromCusd() {
    AppAnalytics.track(TabHomeEvents.add_ckes_from_swap)
    !!cUSDToken &&
      !!cKESToken &&
      navigate(Screens.SwapScreenWithBack, {
        fromTokenId: cUSDToken.tokenId,
        toTokenId: cKESToken.tokenId,
      })
    forwardedRef.current?.dismiss()
  }

  function onPressPurchaseCkes() {
    AppAnalytics.track(TabHomeEvents.add_ckes_from_cash_in)
    !!cKESToken &&
      navigate(Screens.FiatExchangeAmount, {
        tokenId: cKESToken.tokenId,
        flow: CICOFlow.CashIn,
        tokenSymbol: cKESToken.symbol,
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
  container: {
    flex: 1,
    // Padding applied to the content of the screen on sides and top
    // No padding applied to the bottom by default incase of a scrollable screen
    paddingHorizontal: variables.contentPadding,
    paddingTop: variables.contentPadding,
    position: 'relative',
    gap: Spacing.Regular16,
  },
  flatCard: {
    backgroundColor: 'white',
    padding: Spacing.Regular16,
    borderRadius: Spacing.Small12,
    borderColor: Colors.black,
    borderWidth: 1,
  },
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
    gap: Spacing.Regular16,
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
})

export default TabHome
