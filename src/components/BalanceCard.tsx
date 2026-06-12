import BigNumber from 'bignumber.js'
import React, { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LinearGradient from 'react-native-linear-gradient'
import { LayoutAnimation, Platform, StyleSheet, Text, UIManager, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { hideWalletBalancesSelector } from 'src/app/selectors'
import { HideBalanceButton } from 'src/components/TokenBalance'
import Touchable from 'src/components/Touchable'
import { useXaut0Balance } from 'src/gold/useXaut0Balance'
import DownArrowIcon from 'src/icons/navigation/DownArrowIcon'
import { LocalCurrencySymbol } from 'src/localCurrency/consts'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { getPositionBalanceUsd } from 'src/positions/getPositionBalanceUsd'
import { positionsByBalanceUsdSelector } from 'src/positions/selectors'
import { Position, Token } from 'src/positions/types'
import { useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { getDollarTokenLabelKey } from 'src/tokens/dollarGroup'
import { useCOPm, useDollarTokensWithBalance, useDollarUsdBalance } from 'src/tokens/hooks'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

type CardId = 'pesos' | 'dolares' | 'gold' | 'investments'

interface Props {
  testID?: string
}

// Apple Wallet stack geometry.
// CARD_BEHIND_HEIGHT: fixed height of a back card.
// PEEK: visible strip of each back card (label + amount fit here).
// OVERLAP: how much the next card eats into the previous card.
const CARD_BEHIND_HEIGHT = 96
const PEEK = 60
const OVERLAP = CARD_BEHIND_HEIGHT - PEEK // 36px

// Investments card surfaces only positions from apps integrated in the
// wallet (Allbridge, Aave). Random hooks-detected positions are
// excluded so the breakdown matches the user's mental model of "what
// the wallet manages".
const SUPPORTED_INVESTMENT_APP_IDS = new Set(['aave', 'allbridge'])

// Recurse nested AppToken positions to collect every claimable token.
function collectClaimableTokens(tokens: Token[]): Token[] {
  const out: Token[] = []
  for (const token of tokens) {
    if (token.category === 'claimable' && new BigNumber(token.balance).gt(0)) {
      out.push(token)
    }
    if ('tokens' in token && Array.isArray(token.tokens)) {
      out.push(...collectClaimableTokens(token.tokens))
    }
  }
  return out
}

function splitDepositRewards(p: Position): { depositUsd: BigNumber; rewardsUsd: BigNumber } {
  const claimables = collectClaimableTokens(p.tokens)
  const rewardsUsd = claimables.reduce(
    (sum, t) => sum.plus(new BigNumber(t.balance).multipliedBy(t.priceUsd)),
    new BigNumber(0)
  )
  const totalUsd = getPositionBalanceUsd(p)
  const depositUsd = BigNumber.max(totalUsd.minus(rewardsUsd), 0)
  return { depositUsd, rewardsUsd }
}

export default function BalanceCard({ testID }: Props) {
  const { t } = useTranslation()
  const [activeCard, setActiveCard] = useState<CardId>('pesos')
  const [expanded, setExpanded] = useState(false)

  const hideBalances = useSelector(hideWalletBalancesSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const positionsByBalance = useSelector(positionsByBalanceUsdSelector)
  const supportedPositions = positionsByBalance.filter((p) =>
    SUPPORTED_INVESTMENT_APP_IDS.has(p.appId)
  )
  const { decimalSeparator } = getNumberFormatSettings()

  const { balance: goldBalance } = useXaut0Balance()
  const goldPriceUsd = useSelector(
    (state: { gold: { goldPriceUsd: number | null } }) => state.gold.goldPriceUsd
  )

  const copmToken = useCOPm()
  const dollarTokensWithBalance = useDollarTokensWithBalance()
  const dolaresUsdBalance = useDollarUsdBalance()

  const pesosBalance =
    copmToken && copmToken.priceUsd && usdToLocalRate
      ? copmToken.balance.multipliedBy(copmToken.priceUsd).multipliedBy(usdToLocalRate)
      : new BigNumber(0)

  const goldLocalValue =
    goldPriceUsd && usdToLocalRate && !goldBalance.isZero()
      ? new BigNumber(goldPriceUsd).multipliedBy(usdToLocalRate).multipliedBy(goldBalance)
      : new BigNumber(0)

  const supportedPositionsUsd = supportedPositions.reduce(
    (sum, p) => sum.plus(getPositionBalanceUsd(p)),
    new BigNumber(0)
  )
  const positionsLocalValue = usdToLocalRate
    ? supportedPositionsUsd.multipliedBy(usdToLocalRate)
    : new BigNumber(0)

  const format = (value: BigNumber) =>
    hideBalances ? `XX${decimalSeparator}XX` : value.toFormat(2)

  const renderAmount = (value: BigNumber, symbol: string | null = localCurrencySymbol) => (
    <>
      {!hideBalances && symbol}
      {format(value)}
    </>
  )

  // Card metadata: expandable controls whether the toggle arrow is shown
  // and whether renderBreakdownRows is called for that card.
  const cards: Record<
    CardId,
    {
      visible: boolean
      label: string
      amount: BigNumber
      symbol?: string
      textColor: string
      expandable: boolean
      gradient?: { colors: string[]; locations?: number[] }
      solidBg?: string
    }
  > = {
    investments: {
      visible: positionsLocalValue.gt(0),
      label: t('tabHome.investmentsBalance'),
      amount: positionsLocalValue,
      textColor: Colors.white,
      expandable: true,
      gradient: {
        colors: ['#1B3DB2', '#0A1840', '#000D2E'],
      },
    },
    gold: {
      visible: goldLocalValue.gt(0),
      label: t('tabHome.goldBalance'),
      amount: goldLocalValue,
      textColor: '#3A2A05',
      expandable: true,
      gradient: {
        colors: ['#FFE17A', '#D4A017', '#8B6914'],
        locations: [0, 0.55, 1],
      },
    },
    dolares: {
      visible: dolaresUsdBalance.gt(0),
      label: t('tabHome.dolaresBalance'),
      amount: dolaresUsdBalance,
      symbol: LocalCurrencySymbol.USD,
      textColor: Colors.white,
      expandable: true,
      gradient: {
        colors: ['#26A17B', '#1A6F55', '#0F4733'],
      },
    },
    pesos: {
      visible: true,
      label: t('tabHome.pesosBalance'),
      amount: pesosBalance,
      textColor: Colors.primary,
      expandable: false,
      solidBg: Colors.white,
    },
  }

  // Fixed render order; active card moves to the end so it paints last
  // (on top) and its position in the stack is "front".
  const baseOrder: CardId[] = ['investments', 'gold', 'dolares', 'pesos']
  const behindOrder = baseOrder.filter((id) => id !== activeCard && cards[id].visible)
  const activeMeta = cards[activeCard]

  const onTapBehind = (id: CardId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setActiveCard(id)
    setExpanded(false)
  }

  const onToggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((prev) => !prev)
  }

  const renderBehindCard = (id: CardId, index: number): ReactNode => {
    const meta = cards[id]
    const content = (
      <View style={styles.behindRow}>
        <Text style={[styles.behindLabel, { color: meta.textColor }]} numberOfLines={1}>
          {meta.label}
        </Text>
        <Text style={[styles.behindAmount, { color: meta.textColor }]} numberOfLines={1}>
          {renderAmount(meta.amount, meta.symbol ?? localCurrencySymbol)}
        </Text>
      </View>
    )

    const inner = meta.gradient ? (
      <LinearGradient
        colors={meta.gradient.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        locations={meta.gradient.locations}
        style={styles.cardBehind}
      >
        {content}
      </LinearGradient>
    ) : (
      <View style={[styles.cardBehind, { backgroundColor: meta.solidBg ?? Colors.white }]}>
        {content}
      </View>
    )

    return (
      <View
        key={id}
        style={[
          styles.behindWrapper,
          index === 0 ? null : { marginTop: -OVERLAP },
          { zIndex: index, elevation: index },
        ]}
      >
        <Touchable
          onPress={() => onTapBehind(id)}
          borderRadius={Spacing.Regular16}
          testID={`BalanceCard/${id}/Behind`}
        >
          {inner}
        </Touchable>
      </View>
    )
  }

  const renderBreakdownRows = (textColor: string): ReactNode => {
    const rowLabelStyle = [styles.breakdownLabel, { color: textColor, opacity: 0.7 }]
    const rowAmountStyle = [styles.breakdownAmount, { color: textColor }]

    if (activeCard === 'dolares') {
      return (
        <>
          {dollarTokensWithBalance.map(({ tokenInfo, usdValue }) => {
            const labelKey = getDollarTokenLabelKey(tokenInfo.tokenId)
            const label = labelKey ? t(labelKey) : tokenInfo.symbol
            return (
              <View key={tokenInfo.tokenId} style={styles.breakdownRow}>
                <Text style={rowLabelStyle} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={rowAmountStyle}>
                  {renderAmount(usdValue, LocalCurrencySymbol.USD)}
                </Text>
              </View>
            )
          })}
        </>
      )
    }

    if (activeCard === 'gold') {
      const pricePerOunceLocal =
        goldPriceUsd && usdToLocalRate
          ? new BigNumber(goldPriceUsd).multipliedBy(usdToLocalRate)
          : new BigNumber(0)
      return (
        <>
          <View style={styles.breakdownRow}>
            <Text style={rowLabelStyle}>{t('tabHome.goldOunces')}</Text>
            <Text style={rowAmountStyle} numberOfLines={1}>
              {hideBalances ? `XX${decimalSeparator}XX` : goldBalance.toFormat(6)}
            </Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={rowLabelStyle}>{t('tabHome.goldPricePerOunce')}</Text>
            <Text style={rowAmountStyle}>{renderAmount(pricePerOunceLocal)}</Text>
          </View>
        </>
      )
    }

    // investments: per app, two rows (deposit + rewards). Random
    // hooks-detected positions never appear because we filter by
    // SUPPORTED_INVESTMENT_APP_IDS upstream.
    const grouped: Record<string, { appName: string; deposit: BigNumber; rewards: BigNumber }> = {}
    for (const p of supportedPositions) {
      const { depositUsd, rewardsUsd } = splitDepositRewards(p)
      if (!grouped[p.appId]) {
        grouped[p.appId] = {
          appName: p.appName,
          deposit: new BigNumber(0),
          rewards: new BigNumber(0),
        }
      }
      grouped[p.appId].deposit = grouped[p.appId].deposit.plus(depositUsd)
      grouped[p.appId].rewards = grouped[p.appId].rewards.plus(rewardsUsd)
    }
    const rate = usdToLocalRate ? new BigNumber(usdToLocalRate) : new BigNumber(0)

    return (
      <>
        {Object.entries(grouped).flatMap(([appId, g]) => {
          const rows: ReactNode[] = []
          if (g.deposit.gt(0)) {
            rows.push(
              <View key={`${appId}-deposit`} style={styles.breakdownRow}>
                <Text style={rowLabelStyle} numberOfLines={1}>
                  {t('tabHome.investmentDeposit', { appName: g.appName })}
                </Text>
                <Text style={rowAmountStyle}>{renderAmount(g.deposit.multipliedBy(rate))}</Text>
              </View>
            )
          }
          if (g.rewards.gt(0)) {
            rows.push(
              <View key={`${appId}-rewards`} style={styles.breakdownRow}>
                <Text style={rowLabelStyle} numberOfLines={1}>
                  {t('tabHome.investmentRewards', { appName: g.appName })}
                </Text>
                <Text style={rowAmountStyle}>{renderAmount(g.rewards.multipliedBy(rate))}</Text>
              </View>
            )
          }
          return rows
        })}
      </>
    )
  }

  const renderFrontCard = (): ReactNode => {
    const meta = activeMeta
    const isPesos = activeCard === 'pesos'
    const dividerColor = isPesos ? Colors.gray2 : `${meta.textColor}33` // ~20% alpha
    const toggleBg = isPesos ? Colors.gray1 : `${meta.textColor}1F`
    const toggleArrowColor = isPesos ? Colors.gray4 : meta.textColor

    const body = (
      <>
        <View style={styles.frontHeader}>
          <Text style={[styles.frontLabel, { color: meta.textColor }]}>{meta.label}</Text>
          <HideBalanceButton hideBalance={hideBalances} />
        </View>
        <Text
          style={[styles.frontAmount, { color: meta.textColor }]}
          testID={`BalanceCard/${activeCard}/Front`}
        >
          {renderAmount(meta.amount, meta.symbol ?? localCurrencySymbol)}
        </Text>

        {expanded && meta.expandable && (
          <View style={styles.breakdown} testID="BalanceCard/Breakdown">
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
            {renderBreakdownRows(meta.textColor)}
          </View>
        )}

        {meta.expandable && (
          <Touchable
            onPress={onToggleExpand}
            style={styles.toggle}
            testID="BalanceCard/Toggle"
            borderRadius={Spacing.Large32}
          >
            <View
              style={[
                styles.toggleInner,
                { backgroundColor: toggleBg },
                expanded && styles.toggleInnerExpanded,
              ]}
            >
              <DownArrowIcon color={toggleArrowColor} />
            </View>
          </Touchable>
        )}
      </>
    )

    const frontWrapperStyle = [
      styles.frontWrapper,
      behindOrder.length > 0 ? { marginTop: -OVERLAP } : null,
      { zIndex: behindOrder.length, elevation: behindOrder.length + 2 },
    ]

    if (meta.gradient) {
      return (
        <View style={frontWrapperStyle}>
          <LinearGradient
            colors={meta.gradient.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            locations={meta.gradient.locations}
            style={styles.cardFront}
            testID={`BalanceCard/${activeCard}`}
          >
            {body}
          </LinearGradient>
        </View>
      )
    }

    return (
      <View style={frontWrapperStyle}>
        <View
          style={[styles.cardFront, { backgroundColor: meta.solidBg ?? Colors.white }]}
          testID={`BalanceCard/${activeCard}`}
        >
          {body}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.stack} testID={testID}>
      {behindOrder.map((id, index) => renderBehindCard(id, index))}
      {renderFrontCard()}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    marginTop: Spacing.Regular16,
  },
  behindWrapper: {
    // Wrapper owns the layout (margin, zIndex). Touchable inside is
    // sized by its child (the gradient/view at CARD_BEHIND_HEIGHT).
    borderRadius: Spacing.Regular16,
    // shadow on the wrapper so it casts under the inner LinearGradient
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  cardBehind: {
    height: CARD_BEHIND_HEIGHT,
    borderRadius: Spacing.Regular16,
    paddingHorizontal: Spacing.Thick24,
    paddingTop: Spacing.Regular16 + 2,
  },
  behindRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  behindLabel: {
    ...typeScale.labelSemiBoldSmall,
    flexShrink: 1,
  },
  behindAmount: {
    ...typeScale.labelSemiBoldSmall,
    marginLeft: Spacing.Smallest8,
  },
  frontWrapper: {
    borderRadius: Spacing.Regular16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
  },
  cardFront: {
    borderRadius: Spacing.Regular16,
    paddingHorizontal: Spacing.Thick24,
    paddingTop: Spacing.Thick24,
    paddingBottom: Spacing.Regular16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.gray2,
  },
  frontHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.Smallest8,
  },
  frontLabel: {
    ...typeScale.bodySmall,
  },
  frontAmount: {
    ...typeScale.titleLarge,
  },
  breakdown: {
    marginTop: Spacing.Regular16,
  },
  divider: {
    height: 1,
    marginBottom: Spacing.Regular16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.Smallest8,
  },
  breakdownLabel: {
    ...typeScale.bodySmall,
    color: Colors.secondary,
  },
  breakdownAmount: {
    ...typeScale.labelSemiBoldSmall,
    color: Colors.black,
  },
  toggle: {
    alignSelf: 'center',
    marginTop: Spacing.Smallest8,
  },
  toggleInner: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.gray1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleInnerExpanded: {
    transform: [{ rotate: '180deg' }],
  },
})
