import Clipboard from '@react-native-clipboard/clipboard'
import BigNumber from 'bignumber.js'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LegStatus } from 'src/dollarsSpend/slice'
import { SpendStep } from 'src/dollarsSpend/types'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

interface Props {
  plannedSteps: SpendStep[]
  // Optional: legacy persisted state (pre-2026-08-28) has no legStatuses field.
  // In that case the component renders nothing rather than crashing. Fresh
  // sagas always populate it via multiSwapStarted.
  legStatuses: LegStatus[] | undefined
  // Optional: overrides destination label per leg (e.g. "Pesos" for Dolares
  // multi-swaps, "Oro" for gold buys). Rendered in the leg row as
  // "USDm -> Pesos". Defaults to no label.
  destinationLabel?: string
}

// Per-leg status list rendered inside MultiSwapProgressSheet and
// PartialSuccessSheet. Shows one row per planned leg with:
//   - Status icon (pending / spinner / check / cross)
//   - Symbol + USD amount
//   - Retry attempt badge (only if attempt > 1)
//   - Tap-to-expand technical details (error text with copy button) when the
//     leg failed. Reuses the same visual language as TechDetailsAccordion so
//     users trained on ErrorSheet already know how to open + copy.
export default function MultiSwapLegList({ plannedSteps, legStatuses, destinationLabel }: Props) {
  // Defensive: legacy persisted inFlight state (pre-2026-08-28) lacks
  // legStatuses. Render nothing rather than crash the sheet.
  if (!legStatuses || legStatuses.length === 0) {
    return null
  }
  return (
    <View style={styles.root} testID="MultiSwapLegList">
      {plannedSteps.map((step, index) => {
        const legState = legStatuses[index]
        if (!legState) return null
        return (
          <LegRow
            key={`${step.tokenId}-${index}`}
            step={step}
            legState={legState}
            destinationLabel={destinationLabel}
            index={index}
          />
        )
      })}
    </View>
  )
}

function LegRow({
  step,
  legState,
  destinationLabel,
  index,
}: {
  step: SpendStep
  legState: LegStatus
  destinationLabel?: string
  index: number
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const isExpandable = legState.status === 'failed' && !!legState.errorMessage
  const amountUsdText = `$${new BigNumber(step.amountUsd).toFormat(2)}`

  const handleCopy = () => {
    if (!legState.errorMessage) return
    // Copy the full technical context, not just the message. Matches the
    // shape TechDetailsAccordion uses so ops has consistent fingerprints.
    const copyText = formatLegErrorForCopy(step, legState, index)
    Clipboard.setString(copyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <View style={styles.row} testID={`MultiSwapLegList/leg-${index}`}>
      <View style={styles.headerRow}>
        <StatusIcon status={legState.status} />
        <View style={styles.headerText}>
          <Text style={styles.symbolLine}>
            <Text style={styles.symbol}>{step.symbol}</Text>
            {destinationLabel ? (
              <Text style={styles.arrow}>{` -> ${destinationLabel}`}</Text>
            ) : null}
          </Text>
          <Text style={styles.amount}>{amountUsdText}</Text>
        </View>
        <View style={styles.headerRight}>
          {legState.attempt > 1 && legState.status !== 'failed' && (
            <Text
              style={styles.attemptBadge}
              testID={`MultiSwapLegList/leg-${index}/attempt-badge`}
            >
              {t('dollarsSpend.legList.retryBadge', { attempt: legState.attempt })}
            </Text>
          )}
          {isExpandable && (
            <Pressable
              onPress={() => setExpanded((e) => !e)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('dollarsSpend.legList.toggleDetail')}
              testID={`MultiSwapLegList/leg-${index}/toggle`}
            >
              <Text style={styles.toggle}>{expanded ? 'v' : '>'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {isExpandable && expanded && !!legState.errorMessage && (
        <View style={styles.detailBody} testID={`MultiSwapLegList/leg-${index}/detail`}>
          <ScrollView
            style={styles.detailScroll}
            contentContainerStyle={styles.detailScrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            <Text style={styles.detailText} selectable>
              {legState.errorMessage}
            </Text>
          </ScrollView>
          <View style={styles.detailActions}>
            <Pressable
              style={styles.copyButton}
              onPress={handleCopy}
              accessibilityRole="button"
              accessibilityLabel={t('errors.sheet.copyButton') || 'Copiar'}
              testID={`MultiSwapLegList/leg-${index}/copy`}
            >
              <Text style={styles.copyButtonText}>
                {copied ? t('errors.sheet.copyConfirmation') : t('errors.sheet.copyButton')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

function StatusIcon({ status }: { status: LegStatus['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <View style={[styles.iconBase, styles.iconPending]} testID="MultiSwapLegList/icon-pending">
          <Text style={styles.iconGlyph}>o</Text>
        </View>
      )
    case 'executing':
      return (
        <View
          style={[styles.iconBase, styles.iconExecuting]}
          testID="MultiSwapLegList/icon-executing"
        >
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )
    case 'succeeded':
      return (
        <View
          style={[styles.iconBase, styles.iconSucceeded]}
          testID="MultiSwapLegList/icon-succeeded"
        >
          <Text style={[styles.iconGlyph, { color: Colors.successDark }]}>{'✓'}</Text>
        </View>
      )
    case 'failed':
      return (
        <View style={[styles.iconBase, styles.iconFailed]} testID="MultiSwapLegList/icon-failed">
          <Text style={[styles.iconGlyph, { color: Colors.error }]}>{'✕'}</Text>
        </View>
      )
  }
}

function formatLegErrorForCopy(step: SpendStep, legState: LegStatus, index: number): string {
  const lines: string[] = []
  lines.push(`leg: ${index} (${step.symbol})`)
  lines.push(`amountUsd: ${step.amountUsd.toString()}`)
  lines.push(`status: ${legState.status}`)
  lines.push(`attempt: ${legState.attempt}`)
  if (legState.txHash) lines.push(`txHash: ${legState.txHash}`)
  if (legState.errorEnvelope) {
    lines.push(`envelope: ${JSON.stringify(legState.errorEnvelope)}`)
  }
  if (legState.errorMessage) {
    lines.push('')
    lines.push('errorMessage:')
    lines.push(legState.errorMessage)
  }
  return lines.join('\n')
}

const ICON_SIZE = 24

const styles = StyleSheet.create({
  root: {
    gap: Spacing.Smallest8,
    marginTop: Spacing.Regular16,
  },
  row: {
    padding: Spacing.Smallest8,
    borderRadius: 8,
    backgroundColor: Colors.gray1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
  },
  headerText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
  },
  symbolLine: {
    flexShrink: 1,
  },
  symbol: {
    ...typeScale.labelMedium,
    color: Colors.black,
  },
  arrow: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  amount: {
    ...typeScale.bodySmall,
    color: Colors.gray6,
  },
  attemptBadge: {
    ...typeScale.labelXSmall,
    color: Colors.warningDark,
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: 2,
    backgroundColor: Colors.warningLight,
    borderRadius: 4,
  },
  toggle: {
    ...typeScale.bodySmall,
    color: Colors.primary,
    minWidth: 16,
    textAlign: 'center',
  },
  iconBase: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPending: {
    backgroundColor: Colors.gray2,
  },
  iconExecuting: {
    backgroundColor: Colors.gray1,
  },
  iconSucceeded: {
    backgroundColor: Colors.successLight,
  },
  iconFailed: {
    backgroundColor: Colors.warningLight,
  },
  iconGlyph: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
  },
  detailBody: {
    marginTop: Spacing.Smallest8,
    padding: Spacing.Smallest8,
    borderRadius: 6,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray2,
  },
  detailScroll: {
    maxHeight: 180,
  },
  detailScrollContent: {
    paddingRight: Spacing.Smallest8,
  },
  detailText: {
    ...typeScale.bodyXSmall,
    fontFamily: 'monospace',
    color: Colors.gray6,
  },
  detailActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.Smallest8,
  },
  copyButton: {
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Smallest8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  copyButtonText: {
    ...typeScale.labelSmall,
    color: Colors.primary,
  },
})
