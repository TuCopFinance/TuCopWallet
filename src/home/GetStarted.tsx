import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import { CICOFlow } from 'src/fiatExchanges/utils'
import AddFunds from 'src/icons/AddFunds'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useCCOP } from 'src/tokens/hooks'

// hardcoding a fallback token symbol in case the token info is not loaded
const DEFAULT_TOKEN_SYMBOL = 'cCOP'

export default function GetStarted() {
  const { t } = useTranslation()
  const cCOPToken = useCCOP()

  const goToAddFunds = () => {
    AppAnalytics.track(FiatExchangeEvents.cico_add_get_started_selected)
    cCOPToken &&
      navigate(Screens.FiatExchangeAmount, {
        flow: CICOFlow.CashIn,
        tokenId: cCOPToken?.tokenId,
        tokenSymbol: cCOPToken?.symbol,
      })
  }

  useEffect(() => {
    AppAnalytics.track(FiatExchangeEvents.cico_add_get_started_impression)
  }, [])

  return (
    <View testID="GetStarted" style={styles.container}>
      <AddFunds />
      <Text style={styles.title}>
        {t('getStartedActivity.title', {
          tokenSymbol: cCOPToken?.symbol ?? DEFAULT_TOKEN_SYMBOL,
        })}
      </Text>
      <View style={styles.ctaContainer}>
        <Button
          testID="GetStarted/cta"
          onPress={goToAddFunds}
          text={t('getStartedActivity.cta', {
            tokenSymbol: cCOPToken?.symbol ?? DEFAULT_TOKEN_SYMBOL,
          })}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          style={styles.cta}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderColor: colors.black,
    borderWidth: 1,
    borderRadius: 12,
    margin: Spacing.Regular16,
    padding: Spacing.Regular16,
    gap: Spacing.Regular16,
    alignItems: 'center',
  },
  title: {
    ...typeScale.labelSemiBoldMedium,
    color: colors.black,
    textAlign: 'center',
    marginHorizontal: Spacing.Large32,
  },
  ctaContainer: {
    flexDirection: 'row',
  },
  cta: {
    flexGrow: 1,
  },
})
