import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native'
import Touchable from 'src/components/Touchable'
import { SpendStep } from 'src/dollarsSpend/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

// Panel that mirrors SwapTransactionDetails' spend-breakdown row so the
// gold buy confirmation surfaces the per-token allocation in the same
// visual shape as the swap screen. Collapsed by default; tap to reveal
// each underlying source token (USAT / USDm / USDC / USDT) and its USD
// portion of the total spend.
//
// `totalInUsd` / `totalOutToken` / `toTokenSymbol` are accepted but only
// the steps are rendered; the previous "Vas a cambiar X en Y a Z W"
// headline was redundant because both the swap and gold flows already
// show the input on the FROM card and the output on a separate "Recibes"
// card. Keeping the props lets callers stay unchanged.
interface Props {
  steps: SpendStep[]
  totalInUsd?: BigNumber
  totalOutToken?: BigNumber
  toTokenSymbol?: string
}

export default function DolaresMultiStepSummary({ steps }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  if (steps.length === 0) return null

  return (
    <View style={styles.container} testID="DolaresMultiStepSummary">
      <Touchable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
          setExpanded((v) => !v)
        }}
        testID="DolaresMultiStepSummary/Toggle"
      >
        <View style={styles.row}>
          <Text style={styles.label}>{t('swapScreen.transactionDetails.perTokenDetail')}</Text>
          <Text style={styles.value}>
            {expanded
              ? t('swapScreen.transactionDetails.perTokenDetailCollapse')
              : t('swapScreen.transactionDetails.perTokenDetailExpand', { count: steps.length })}
          </Text>
        </View>
      </Touchable>
      {expanded &&
        steps.map((step) => (
          <View key={step.tokenId} style={[styles.row, styles.subRow]}>
            <Text style={styles.subLabel}>{step.symbol}</Text>
            <Text style={styles.value}>{`$${step.amountUsd.toFormat(2)}`}</Text>
          </View>
        ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.Regular16,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 12,
    gap: Spacing.Regular16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.Small12,
  },
  label: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  value: {
    ...typeScale.bodySmall,
    color: Colors.black,
    textAlign: 'right',
  },
  subRow: {
    paddingLeft: Spacing.Regular16,
    marginTop: -Spacing.Smallest8,
  },
  subLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
})
