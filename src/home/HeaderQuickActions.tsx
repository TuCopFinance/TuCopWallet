import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { TabHomeEvents } from 'src/analytics/Events'
import { bucksPayFlowStatusSelector } from 'src/buckspay/selectors'
import { CICOFlow } from 'src/fiatExchanges/utils'
import QuickActionsWithdraw from 'src/icons/quick-actions/Withdraw'
import Receive from 'src/icons/tab-home/Receive'
import Recharge from 'src/icons/tab-home/Recharge'
import Send from 'src/icons/tab-home/Send'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import Touchable from 'src/components/Touchable'
import { useCOPm, useUSDT } from 'src/tokens/hooks'

/**
 * Compact icon-only version of HomeQuickActions rendered inside the
 * tab-header `headerLeft` slot. Replaces the standalone bar that used
 * to live below the balance card so Home / Wallet tabs open with a
 * single top row (quick actions on the left, send / QR / settings on
 * the right) instead of stacking a full-width bar under the header.
 *
 * Handlers duplicated from HomeQuickActions so both surfaces can move
 * independently in the future if the design splits again. Small enough
 * to not warrant a shared hook yet - if a third consumer appears,
 * extract `useQuickActionHandlers` into src/home/quickActionHandlers.ts.
 */
export default function HeaderQuickActions() {
  const { t } = useTranslation()
  const COPmToken = useCOPm()
  const USDTToken = useUSDT()
  const bucksPayFlowStatus = useSelector(bucksPayFlowStatusSelector)

  const onPressSendMoney = () => {
    if (!COPmToken) return
    AppAnalytics.track(TabHomeEvents.send_money)
    navigate(Screens.SendSelectRecipient, {
      defaultTokenIdOverride: COPmToken.tokenId,
    })
  }

  const onPressReceiveMoney = () => {
    AppAnalytics.track(TabHomeEvents.receive_money)
    navigate(Screens.QRNavigator, { screen: Screens.QRCode })
  }

  const onPressRecharge = () => {
    if (!USDTToken) return
    navigate(Screens.FiatExchangeAmount, {
      tokenId: USDTToken.tokenId,
      flow: CICOFlow.CashIn,
      tokenSymbol: USDTToken.symbol,
    })
  }

  const onPressWithdraw = () => {
    if (bucksPayFlowStatus === 'tracking' || bucksPayFlowStatus === 'submitting-to-api') {
      navigate(Screens.BucksPayStatus)
    } else {
      navigate(Screens.SelectOfframpProvider)
    }
  }

  return (
    <View style={styles.row}>
      <Touchable style={styles.item} onPress={onPressSendMoney} testID="Header/SendMoney">
        <View style={styles.itemInner}>
          <View style={styles.iconWrap}>
            <Send size={22} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {t('tabHome.sendMoney')}
          </Text>
        </View>
      </Touchable>
      <Touchable style={styles.item} onPress={onPressReceiveMoney} testID="Header/ReceiveMoney">
        <View style={styles.itemInner}>
          <View style={styles.iconWrap}>
            <Receive size={22} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {t('tabHome.receiveMoney')}
          </Text>
        </View>
      </Touchable>
      <Touchable style={styles.item} onPress={onPressRecharge} testID="Header/AddCOPm">
        <View style={styles.itemInner}>
          <View style={styles.iconWrap}>
            <Recharge size={22} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {t('tabHome.addCOPm')}
          </Text>
        </View>
      </Touchable>
      <Touchable style={styles.item} onPress={onPressWithdraw} testID="Header/SpendMoney">
        <View style={styles.itemInner}>
          <View style={styles.iconWrap}>
            <QuickActionsWithdraw color={Colors.primary} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {t('tabHome.spendMoney')}
          </Text>
        </View>
      </Touchable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  item: {
    minWidth: 44,
  },
  itemInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typeScale.bodyXSmall,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: 2,
    fontSize: 10,
    lineHeight: 12,
  },
})
