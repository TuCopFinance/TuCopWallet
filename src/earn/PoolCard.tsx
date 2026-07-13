import BigNumber from 'bignumber.js'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Shadow } from 'react-native-shadow-2'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { EarnEvents } from 'src/analytics/Events'
import { formatValueToDisplay } from 'src/components/TokenDisplay'
import TokenIcon from 'src/components/TokenIcon'
import Touchable from 'src/components/Touchable'
import { getEarnPositionBalanceValues, getTotalYieldRate } from 'src/earn/utils'
import { useDollarsToLocalAmount } from 'src/localCurrency/hooks'
import { getLocalCurrencySymbol } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { EarnPosition } from 'src/positions/types'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { tokensByIdSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { getTokenDisplayName } from 'src/tokens/utils'
import { NeeruCategoryId, categoryIdFromPositionId } from 'src/earn/neeru/constants'
import { effectiveAnnualPercentFromMonthly } from 'src/earn/neeru/rateConversion'

const NEERU_EXPLAINER_KEY_BY_CATEGORY: Record<NeeruCategoryId, { title: string; body: string }> = {
  0: { title: 'neeruVaults.explainer.flexible.title', body: 'neeruVaults.explainer.flexible.body' },
  1: {
    title: 'neeruVaults.explainer.thirtyDays.title',
    body: 'neeruVaults.explainer.thirtyDays.body',
  },
  2: {
    title: 'neeruVaults.explainer.sixtyDays.title',
    body: 'neeruVaults.explainer.sixtyDays.body',
  },
  3: {
    title: 'neeruVaults.explainer.ninetyDays.title',
    body: 'neeruVaults.explainer.ninetyDays.body',
  },
}

const NEERU_CARD_SUBTITLE_KEY_BY_CATEGORY: Record<NeeruCategoryId, string> = {
  0: 'neeruVaults.cardSubtitle.flexible',
  1: 'neeruVaults.cardSubtitle.thirtyDays',
  2: 'neeruVaults.cardSubtitle.sixtyDays',
  3: 'neeruVaults.cardSubtitle.ninetyDays',
}

export default function PoolCard({
  pool,
  testID = 'PoolCard',
}: {
  pool: EarnPosition
  testID?: string
}) {
  const {
    positionId,
    appId,
    appName,
    tokens,
    networkId,
    balance,
    dataProps: { earningItems, tvl, depositTokenId },
  } = pool

  const { t } = useTranslation()
  const allTokens = useSelector((state) => tokensByIdSelector(state, [networkId]))
  const tokensInfo = useMemo(() => {
    return tokens
      .map((token) => allTokens[token.tokenId])
      .filter((token): token is TokenBalance => !!token)
  }, [tokens, allTokens])
  const depositTokenInfo = allTokens[depositTokenId]

  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const { poolBalanceInUsd } = useMemo(() => getEarnPositionBalanceValues({ pool }), [pool])
  const poolBalanceInFiat = useDollarsToLocalAmount(poolBalanceInUsd) ?? null

  const rewardAmountInUsd = useMemo(
    () =>
      earningItems
        .reduce(
          (acc, earnItem) =>
            acc.plus(
              new BigNumber(earnItem.amount).times(
                allTokens[earnItem.tokenId]?.priceUsd ?? new BigNumber(0)
              )
            ),
          new BigNumber(0)
        )
        .toFixed(2),
    [earningItems]
  )

  const rewardAmountInFiat =
    useDollarsToLocalAmount(new BigNumber(rewardAmountInUsd)) ?? new BigNumber(0)

  const poolBalanceString = useMemo(
    () =>
      `${localCurrencySymbol}${poolBalanceInFiat ? formatValueToDisplay(poolBalanceInFiat.plus(rewardAmountInFiat)) : '--'}`,
    [localCurrencySymbol, poolBalanceInFiat, rewardAmountInFiat]
  )

  const tvlInFiat = useDollarsToLocalAmount(tvl ?? null)
  const tvlString = useMemo(() => {
    return `${localCurrencySymbol}${tvlInFiat ? formatValueToDisplay(tvlInFiat) : '--'}`
  }, [localCurrencySymbol, tvlInFiat])

  const rawYieldRate = getTotalYieldRate(pool).toNumber()
  const totalYieldRate = rawYieldRate.toFixed(2)
  // Neeru quotes a monthly effective rate (M.V.). The headline on the card
  // needs to be the annual effective rate (E.A.) so the number is directly
  // comparable to bank promos and other DeFi surfaces the user browses. Keep
  // the monthly rate visible as a smaller subtitle so no context is lost.
  const isNeeruPool = pool.appId === 'neeru-vaults'
  const neeruRates = useMemo(() => {
    if (!isNeeruPool) return null
    const mv = rawYieldRate
    const ea = effectiveAnnualPercentFromMonthly(mv)
    return { mv: mv.toFixed(2), ea: ea.toFixed(2) }
  }, [isNeeruPool, rawYieldRate])

  // Card title is always the user-friendly token display name per the wallet manual
  // (cCOP -> Pesos, USDT/USDC/USDm -> Dolares, etc).
  const cardTitle = useMemo(
    () => tokensInfo.map((token) => getTokenDisplayName(token.symbol)).join(' / '),
    [tokensInfo]
  )

  // For Neeru pools, append a per-category subtitle so the 4 cards are distinguishable.
  const cardSubtitle = useMemo(() => {
    if (pool.appId !== 'neeru-vaults') return null
    const categoryId = categoryIdFromPositionId(pool.positionId)
    if (categoryId === null) return null
    const key = NEERU_CARD_SUBTITLE_KEY_BY_CATEGORY[categoryId]
    return t(key)
  }, [pool, t])

  // Per-category explainer sheet. The `?` next to the subtitle fires this so
  // the user can read how the specific option (Flexible / 30 / 60 / 90 days)
  // behaves without leaving the Earn tab. Uses native Alert for zero-infra
  // cost; a designed BottomSheet is a follow-up if we want richer content.
  const neeruExplainer = useMemo(() => {
    if (pool.appId !== 'neeru-vaults') return null
    const categoryId = categoryIdFromPositionId(pool.positionId)
    if (categoryId === null) return null
    const keys = NEERU_EXPLAINER_KEY_BY_CATEGORY[categoryId]
    return { title: t(keys.title), body: t(keys.body) }
  }, [pool, t])

  const [isExplainerOpen, setExplainerOpen] = useState(false)
  const onPressExplainer = (event: any) => {
    event.stopPropagation?.()
    if (!neeruExplainer) return
    AppAnalytics.track(EarnEvents.earn_pool_card_press, {
      poolId: positionId,
      depositTokenId,
      networkId,
      poolAmount: balance,
      providerId: appId,
    })
    setExplainerOpen(true)
  }

  const onPress = () => {
    AppAnalytics.track(EarnEvents.earn_pool_card_press, {
      poolId: positionId,
      depositTokenId,
      networkId,
      poolAmount: balance,
      providerId: appId,
    })
    if (pool.appId === 'neeru-vaults') {
      navigate(Screens.NeeruVaultDetail, { pool })
      return
    }
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
            {tokensInfo.map((token, index) => (
              <TokenIcon
                key={index}
                token={token}
                viewStyle={index > 0 ? { marginLeft: -8, zIndex: -index } : {}}
              />
            ))}
            <View style={styles.titleTextContainer}>
              <Text style={styles.titleTokens}>{cardTitle}</Text>
              {cardSubtitle ? (
                <View style={styles.subtitleRow}>
                  <Text style={styles.cardSubtitle}>{cardSubtitle}</Text>
                  {neeruExplainer && (
                    <Touchable
                      onPress={onPressExplainer}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={styles.explainerBadge}
                      testID={`PoolCard/${positionId}/ExplainerButton`}
                    >
                      <Text style={styles.explainerBadgeText}>?</Text>
                    </Touchable>
                  )}
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.keyValueContainer}>
            <View style={styles.keyValueRow}>
              <Text style={styles.keyText}>{t('earnFlow.poolCard.yieldRate')}</Text>
              {neeruRates ? (
                <View style={styles.rateStackContainer} testID="PoolCard/NeeruRateStack">
                  <Text style={styles.valueTextBold}>
                    {t('earnFlow.poolCard.percentageEa', { percentage: neeruRates.ea })}
                  </Text>
                  <Text style={styles.rateEquivalent}>
                    {t('earnFlow.poolCard.mvEquivalent', { percentage: neeruRates.mv })}
                  </Text>
                </View>
              ) : (
                <Text style={styles.valueTextBold}>
                  {t('earnFlow.poolCard.percentage', {
                    percentage: totalYieldRate,
                  })}
                </Text>
              )}
            </View>
            <View style={styles.keyValueRow}>
              <Text style={styles.keyText}>{t('earnFlow.poolCard.tvl')}</Text>
              <Text style={styles.valueText}>{tvlString}</Text>
            </View>
          </View>
          {new BigNumber(balance).gt(0) && !!depositTokenInfo && (
            <View style={styles.withBalanceContainer}>
              <Text style={styles.keyText}>{t('earnFlow.poolCard.depositAndEarnings')}</Text>
              <Text>
                <Text style={styles.valueTextBold}>{poolBalanceString}</Text>
              </Text>
            </View>
          )}
          <Text style={styles.poweredByText}>
            {pool.appId === 'neeru-vaults'
              ? 'By: Neeru Finance'
              : t('earnFlow.poolCard.poweredBy', { providerName: appName })}
          </Text>
        </View>
      </Touchable>
      {neeruExplainer && (
        <Modal
          visible={isExplainerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setExplainerOpen(false)}
        >
          <Pressable style={styles.explainerBackdrop} onPress={() => setExplainerOpen(false)}>
            <Pressable
              style={styles.explainerCard}
              onPress={(e) => e.stopPropagation()}
              testID={`PoolCard/${positionId}/ExplainerSheet`}
            >
              <Text style={styles.explainerTitle}>{neeruExplainer.title}</Text>
              <ScrollView
                style={styles.explainerScroll}
                contentContainerStyle={styles.explainerScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.explainerBody}>{neeruExplainer.body}</Text>
              </ScrollView>
              <Touchable
                onPress={() => setExplainerOpen(false)}
                style={styles.explainerClose}
                testID={`PoolCard/${positionId}/ExplainerClose`}
              >
                <Text style={styles.explainerCloseText}>{t('neeruVaults.explainer.close')}</Text>
              </Touchable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
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
  cardSubtitle: {
    color: Colors.gray3,
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
  rateStackContainer: {
    alignItems: 'flex-end',
  },
  rateEquivalent: {
    ...typeScale.bodyXSmall,
    color: Colors.gray3,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Tiny4,
  },
  explainerBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.gray2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explainerBadgeText: {
    ...typeScale.bodyXXSmall,
    color: Colors.gray4,
    fontWeight: '600',
    lineHeight: 14,
  },
  explainerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.Regular16,
  },
  explainerCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.Regular16,
    gap: Spacing.Small12,
    maxHeight: '80%',
  },
  explainerScroll: {
    flexGrow: 0,
  },
  explainerScrollContent: {
    paddingVertical: Spacing.Smallest8,
  },
  explainerTitle: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  explainerBody: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
  },
  explainerClose: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.Small12,
    paddingVertical: Spacing.Smallest8,
    marginTop: Spacing.Smallest8,
  },
  explainerCloseText: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.primary,
  },
})
