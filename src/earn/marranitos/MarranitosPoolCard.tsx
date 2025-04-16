import BigNumber from 'bignumber.js'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { Shadow } from 'react-native-shadow-2'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import Touchable from 'src/components/Touchable'
import MarranitosContract, { STAKING_ADDRESS } from 'src/earn/marranitos/MarranitosContract'
import { useDollarsToLocalAmount } from 'src/localCurrency/hooks'
import { getLocalCurrencySymbol } from 'src/localCurrency/selectors'
import { useSelector } from 'src/redux/hooks'
import { TAG } from 'src/send/saga'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import Logger from 'src/utils/Logger'
import MarranitoAvatar from './marranito.svg'

export default function MarranitosPoolCard({
  pool,
  testID = 'PoolCard',
  onPress,
  walletConnected = false,
}: {
  pool: any
  testID?: string
  onPress: () => void
  walletConnected?: boolean
}) {
  const { network, apy, days, positionId } = pool
  const { t } = useTranslation()
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const poolBalanceInFiat = useDollarsToLocalAmount(0) ?? null
  const rewardAmountInUsd = 0
  const rewardAmountInFiat =
    useDollarsToLocalAmount(new BigNumber(rewardAmountInUsd)) ?? new BigNumber(0)

  const [poolBalance, setPoolBalance] = React.useState<any>(undefined)

  React.useEffect(() => {
    const loadBalance = async () => {
      Logger.debug(TAG, `POOL Token balance for: ${STAKING_ADDRESS}`)
      const balance = await MarranitosContract.getTokenBalance(STAKING_ADDRESS)
      setPoolBalance(balance)

      Logger.debug(TAG, `POOL BALANCE: ${balance}`)
    }

    void loadBalance()
  }, [positionId])

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
            <MarranitoAvatar width={36} height={36} />
            <View style={styles.titleTextContainer}>
              <Text style={styles.titleTokens}>TU MARRANITO</Text>
              <Text style={styles.titleNetwork}>
                {t('earnFlow.poolCard.onNetwork', { networkName: network })}
              </Text>
            </View>
          </View>
          <View style={styles.keyValueContainer}>
            <View style={styles.keyValueRow}>
              <Text style={styles.keyText}>{t('earnFlow.poolCard.yieldRate')}</Text>
              <Text style={styles.valueTextBold}>
                {t('earnFlow.poolCard.percentage', {
                  percentage: apy,
                })}
              </Text>
            </View>
            <View style={styles.keyValueRow}>
              <Text style={styles.keyText}>{t('earnFlow.poolCard.lockPeriod')}</Text>
              <Text style={styles.valueText}>{t('earnFlow.poolCard.days', { days })}</Text>
            </View>
          </View>

          <View style={styles.withBalanceContainer}>
            <Text style={styles.keyText}>{t('earnFlow.poolCard.depositAndEarnings')}</Text>
            <Text>
              <Text style={styles.valueTextBold}>{poolBalance}</Text>
            </Text>
          </View>

          <Button
            onPress={onPress}
            text={
              walletConnected ? t('earnFlow.poolCard.stake') : t('earnFlow.poolCard.connectWallet')
            }
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
          />

          {/* <Text style={styles.poweredByText}>
            {t('earnFlow.poolCard.poweredBy', { providerName: 'tucop.org' })}
          </Text> */}
        </View>
      </Touchable>
    </Shadow>
  )
}

// Styles remain the same
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
  // poweredByText: {
  //   color: Colors.gray3,
  //   ...typeScale.bodyXSmall,
  //   alignSelf: 'center',
  // },
  withBalanceContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray2,
    paddingTop: Spacing.Regular16,
    gap: Spacing.Smallest8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})
