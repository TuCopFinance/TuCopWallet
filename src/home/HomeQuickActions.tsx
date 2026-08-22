import React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { TabHomeEvents } from 'src/analytics/Events'
import { bucksPayFlowStatusSelector } from 'src/buckspay/selectors'
import { CICOFlow } from 'src/fiatExchanges/utils'
import { FlatCard } from 'src/home/TabHome'
import QuickActionsWithdraw from 'src/icons/quick-actions/Withdraw'
import Receive from 'src/icons/tab-home/Receive'
import Recharge from 'src/icons/tab-home/Recharge'
import Send from 'src/icons/tab-home/Send'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useCOPm, useUSDT } from 'src/tokens/hooks'

/**
 * Send / Receive / Recharge / Spend row shared by TabHome and TabWallet.
 * Kept as a single component so any addition (e.g. a fifth action) shows
 * up on every tab that hosts it without drift.
 */
function HomeQuickActions() {
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
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionButtonsContainer}
      >
        <FlatCard type="scrollmenu" testID="FlatCard/SendMoney" onPress={onPressSendMoney}>
          <View style={styles.actionButton}>
            <Send />
          </View>
          <Text style={styles.actionButtonText}>{t('tabHome.sendMoney')}</Text>
        </FlatCard>

        <FlatCard type="scrollmenu" testID="FlatCard/ReceiveMoney" onPress={onPressReceiveMoney}>
          <View style={styles.actionButton}>
            <Receive />
          </View>
          <Text style={styles.actionButtonText}>{t('tabHome.receiveMoney')}</Text>
        </FlatCard>

        <FlatCard type="scrollmenu" testID="FlatCard/AddCOPm" onPress={onPressRecharge}>
          <View style={styles.actionButton}>
            <Recharge />
          </View>
          <Text style={styles.actionButtonText}>{t('tabHome.addCOPm')}</Text>
        </FlatCard>

        <FlatCard type="scrollmenu" testID="FlatCard/spendMoney" onPress={onPressWithdraw}>
          <View style={styles.actionButton}>
            <QuickActionsWithdraw color={Colors.primary} />
          </View>
          <Text style={styles.actionButtonText}>{t('tabHome.spendMoney')}</Text>
        </FlatCard>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    alignItems: 'center',
  },
  actionButtonsContainer: {
    gap: Spacing.Thick24,
    alignSelf: 'center',
    paddingHorizontal: Spacing.Regular16,
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
    color: Colors.primary,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: -0.12,
  },
})

export default HomeQuickActions
