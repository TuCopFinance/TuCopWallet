import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { formatEther } from 'viem'
import MarranitosContract, { Stake } from './MarranitosContract'
// Importar las funciones de autenticación
import { MarranitoStaking } from 'src/navigator/Screens'

import { t } from 'i18next'
import MarranitoAvatar from './marranito.svg'

import { Shadow } from 'react-native-shadow-2'

export const RenderStakeItem = ({
  item,
  index,
  withdrawing,
  handleWithdraw,
}: {
  item: Stake
  index: number
  withdrawing: number | null
  handleWithdraw: (stakeIndex: number) => any
}) => {
  const isWithdrawing = withdrawing === index
  const isClaimed = item.claimed
  const amount = formatEther(item.amount)
  const startDate = new Date(Number(item.startTime) * 1000).toLocaleDateString()
  const endDate = new Date(Number(item.endTime) * 1000).toLocaleDateString()
  const daysRemaining = MarranitosContract.calculateRemainingDays(item)

  return (
    <Shadow
      style={styles.shadow}
      offset={[0, 0]}
      distance={8}
      startColor="rgba(190, 201, 255, 0.2)"
    >
      <View style={styles.card}>
        <View style={styles.stakeHeader}>
          <MarranitoAvatar width={36} height={36} />
          <View>
            <Text style={styles.titleTokens}>TU MARRANITO</Text>
            <Text style={styles.titleNetwork}>
              {t('earnFlow.poolCard.onNetwork', { networkName: 'CELO' })}
            </Text>
          </View>
        </View>

        <View style={styles.stakeDetails}>
          <View style={styles.stakeRow}>
            <Text style={styles.stakeLabel}>{t('earnFlow.myStakes.amount')}</Text>
            <Text style={styles.stakeValue}>{amount} CCOP</Text>
          </View>

          <View style={styles.stakeRow}>
            <Text style={styles.stakeLabel}>{t('earnFlow.myStakes.startDate')}</Text>
            <Text style={styles.stakeValue}>{startDate}</Text>
          </View>

          <View style={styles.stakeRow}>
            <Text style={styles.stakeLabel}>{t('earnFlow.myStakes.endDate')}</Text>
            <Text style={styles.stakeValue}>{endDate}</Text>
          </View>

          {daysRemaining > 0 && (
            <View style={styles.stakeRow}>
              <Text style={styles.stakeLabel}>{t('earnFlow.myStakes.daysRemaining')}</Text>
              <Text style={styles.stakeValue}>
                {daysRemaining} {t('earnFlow.myStakes.days')}
              </Text>
            </View>
          )}

          {isClaimed && (
            <View style={styles.claimedBadge}>
              <Text style={styles.claimedText}>{t('earnFlow.myStakes.claimed')}</Text>
            </View>
          )}
        </View>

        {!isClaimed && daysRemaining <= 0 && (
          <Button
            onPress={() => handleWithdraw(item.index!)}
            text={
              daysRemaining > 0
                ? t('earnFlow.myStakes.earlyWithdraw')
                : t('earnFlow.myStakes.withdraw')
            }
            type={daysRemaining > 0 ? BtnTypes.SECONDARY : BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            showLoading={isWithdrawing}
            disabled={isWithdrawing}
          />
        )}
      </View>
    </Shadow>
  )
}

const styles = StyleSheet.create({
  shadow: {
    width: '100%',
    borderRadius: 12,
  },
  card: {
    backgroundColor: Colors.white,
    padding: Spacing.Regular16,
    borderColor: Colors.gray2,
    borderRadius: 12,
    borderWidth: 1,
  },
  stakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
  },
  titleTokens: {
    color: Colors.black,
    ...typeScale.labelSemiBoldSmall,
  },
  titleNetwork: {
    color: Colors.black,
    ...typeScale.bodyXSmall,
  },
  stakeDetails: {
    gap: Spacing.Smallest8,
    marginTop: Spacing.Regular16,
  },
  stakeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stakeLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray3,
  },
  stakeValue: {
    ...typeScale.bodySmall,
    color: Colors.black,
  },
  claimedBadge: {
    backgroundColor: Colors.successLight,
    borderRadius: 4,
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: Spacing.Tiny4,
    alignSelf: 'flex-start',
    marginTop: Spacing.Smallest8,
  },
  claimedText: {
    ...typeScale.bodyXSmall,
    color: Colors.white,
  },
})

export default MarranitoStaking
