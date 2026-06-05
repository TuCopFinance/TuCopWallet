import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Touchable from 'src/components/Touchable'
import { SpendStep } from 'src/dollarsSpend/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  steps: SpendStep[]
  totalInUsd: BigNumber
  totalOutToken: BigNumber
  toTokenSymbol: string
}

export default function DolaresMultiStepSummary({
  steps,
  totalInUsd,
  totalOutToken,
  toTokenSymbol,
}: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <View style={styles.container} testID="DolaresMultiStepSummary">
      <Text style={styles.headline}>
        {t('dollarsSpend.confirmAggregate', {
          usdAmount: `$${totalInUsd.toFormat(2)}`,
          toLabel: `${totalOutToken.toFormat(2)} ${toTokenSymbol}`,
        })}
      </Text>
      <Touchable onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.toggle}>
          {expanded
            ? t('dollarsSpend.expandedDetailHeader')
            : t('dollarsSpend.stepCount', { steps: steps.length })}
        </Text>
      </Touchable>
      {expanded && (
        <View style={styles.breakdown}>
          {steps.map((step) => (
            <View key={step.tokenId} style={styles.row}>
              <Text style={styles.symbol}>{step.symbol}</Text>
              <Text style={styles.amount}>${step.amountUsd.toFormat(2)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: Spacing.Regular16, gap: Spacing.Smallest8 },
  headline: { ...typeScale.titleSmall, color: Colors.black },
  toggle: { ...typeScale.labelSemiBoldSmall, color: Colors.primary },
  breakdown: { gap: Spacing.Smallest8, marginTop: Spacing.Smallest8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  symbol: { ...typeScale.bodyMedium, color: Colors.black },
  amount: { ...typeScale.bodyMedium, color: Colors.gray4 },
})
