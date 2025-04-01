import BigNumber from 'bignumber.js'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { Shadow } from 'react-native-shadow-2'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import Touchable from 'src/components/Touchable'
import { useDollarsToLocalAmount } from 'src/localCurrency/hooks'
import { getLocalCurrencySymbol } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

export default function MarranitosPoolCard({
  pool,
  testID = 'PoolCard',
}: {
  pool: any
  testID?: string
}) {
  const { positionId, appId, appName, tokens, networkId, balance } = pool
  const { t } = useTranslation()
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  // const { poolBalanceInUsd } = useMemo(() => getEarnPositionBalanceValues({ pool }), [pool])
  // const poolBalanceInFiat = useDollarsToLocalAmount(poolBalanceInUsd) ?? null
  const poolBalanceInFiat = useDollarsToLocalAmount(0) ?? null
  const rewardAmountInUsd = 0
  // const rewardAmountInUsd = useMemo(
  //   () =>
  //     earningItems
  //       .reduce(
  //         (acc, earnItem) =>
  //           acc.plus(
  //             new BigNumber(earnItem.amount).times(
  //               allTokens[earnItem.tokenId]?.priceUsd ?? new BigNumber(0)
  //             )
  //           ),
  //         new BigNumber(0)
  //       )
  //       .toFixed(2),
  //   [earningItems]
  // )

  const rewardAmountInFiat =
    useDollarsToLocalAmount(new BigNumber(rewardAmountInUsd)) ?? new BigNumber(0)

  const poolBalanceString = useMemo(
    () =>
      `${localCurrencySymbol}${poolBalanceInFiat ? formatValueToDisplay(poolBalanceInFiat.plus(rewardAmountInFiat)) : '--'}`,
    [localCurrencySymbol, poolBalanceInFiat, rewardAmountInFiat]
  )

  const onPress = () => {
    navigate(Screens.EarnPoolInfoScreen, { pool })
  }

  return (
    <Shadow
      style={styles.shadow}
      offset={[0, 0]}
      distance={12.8}
      startColor="rgba(190, 201, 255, 0.28)"
    >
      <Touchable borderRadius={12} style={styles.card} testID={testID} onPress={onPress}>
        <View style={styles.cardView}>
          <View style={styles.titleRow}>
            {/* {tokensInfo.map((token, index) => (
              <TokenIcon
                key={index}
                token={token}
                viewStyle={index > 0 ? { marginLeft: -8, zIndex: -index } : {}}
              />
            ))} */}
            <View style={styles.titleTextContainer}>
              <Text style={styles.titleTokens}>
                {/* {tokensInfo.map((token) => token.symbol).join(' / ')} */}
                TU MARRANITO
              </Text>
              <Text style={styles.titleNetwork}>
                {t('earnFlow.poolCard.onNetwork', { networkName: 'CELO' })}
              </Text>
            </View>
          </View>
          <View style={styles.keyValueContainer}>
            <View style={styles.keyValueRow}>
              <Text style={styles.keyText}>{t('earnFlow.poolCard.yieldRate')}</Text>
              <Text style={styles.valueTextBold}>
                {t('earnFlow.poolCard.percentage', {
                  percentage: '123.45',
                })}
              </Text>
            </View>
            <View style={styles.keyValueRow}>
              <Text style={styles.keyText}>{t('earnFlow.poolCard.tvl')}</Text>
              <Text style={styles.valueText}>123 example</Text>
            </View>
          </View>

          <View style={styles.withBalanceContainer}>
            <Text style={styles.keyText}>{t('earnFlow.poolCard.depositAndEarnings')}</Text>
            <Text>
              <Text style={styles.valueTextBold}>{poolBalanceString}</Text>
            </Text>
          </View>

          <Text style={styles.poweredByText}>
            {t('earnFlow.poolCard.poweredBy', { providerName: 'tucop.org' })}
          </Text>
        </View>
      </Touchable>
    </Shadow>
  )
}
const styles = StyleSheet.create({
  shadow: {
    width: '100%',
    borderRadius: 12,
    marginBottom: Spacing.Smallest8,
  },
  card: {
    backgroundColor: Colors.white,
    padding: Spacing.Regular16,
    borderColor: Colors.gray2,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardView: { gap: Spacing.Regular16 },
  titleRow: {
    flexDirection: 'row',
  },
  titleTextContainer: {
    marginLeft: Spacing.Smallest8,
  },
  titleTokens: {
    color: Colors.black,
    ...typeScale.labelSemiBoldSmall,
  },
  titleNetwork: {
    color: Colors.black,
    ...typeScale.bodyXSmall,
  },
  keyValueContainer: {
    gap: Spacing.Smallest8,
  },
  keyValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  keyText: {
    color: Colors.gray3,
    ...typeScale.bodySmall,
  },
  valueText: {
    color: Colors.black,
    ...typeScale.bodySmall,
  },
  valueTextBold: {
    color: Colors.black,
    ...typeScale.labelSemiBoldSmall,
  },
  poweredByText: {
    color: Colors.gray3,
    ...typeScale.bodyXSmall,
    alignSelf: 'center',
  },
  withBalanceContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray2,
    paddingTop: Spacing.Regular16,
    gap: Spacing.Smallest8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})
