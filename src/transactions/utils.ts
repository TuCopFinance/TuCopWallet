import BigNumber from 'bignumber.js'
import { format } from 'date-fns/format'
import { isToday } from 'date-fns/isToday'
import { isYesterday } from 'date-fns/isYesterday'
import locales from 'locales'
import { PrefixedTxReceiptProperties, TxReceiptProperties } from 'src/analytics/Properties'
import i18n from 'src/i18n'
import { TokenBalances } from 'src/tokens/slice'
import { NetworkId, TrackedTx } from 'src/transactions/types'
import { formatFeedSectionTitle, timeDeltaInDays } from 'src/utils/time'
import {
  getEstimatedGasFee,
  getFeeCurrency,
  getFeeCurrencyToken,
  getFeeDecimals,
  getMaxGasFee,
} from 'src/viem/prepareTransactions'

// Helper to get day name for recent transactions
function getDayTitle(timestamp: number): string {
  // Handle timestamps that might be in seconds vs milliseconds
  const timestampMs = timestamp < 1e12 ? timestamp * 1000 : timestamp
  const date = new Date(timestampMs)
  const locale = locales[i18n?.language]?.dateFns ?? locales['en-US']?.dateFns

  if (isToday(date)) {
    return i18n.t('feedSectionHeaderToday')
  }
  if (isYesterday(date)) {
    return i18n.t('feedSectionHeaderYesterday')
  }

  // Return day name (e.g., "Lunes", "Martes")
  return format(date, 'EEEE', { locale })
}

// Groupings:
// Today -> Transactions from today
// Yesterday -> Transactions from yesterday
// [Day name] -> Last 7 days (e.g., "Lunes", "Martes")
// [Current month] - "July" -> Captures transactions from the current month that aren't in last 7 days
// [Previous months] - "June" -> Captures transactions by month
// [Months over a year ago] — "July 2019" -> Same as above, but with year appended
// Sections are hidden if they have no items
export function groupFeedItemsInSections<T extends { timestamp: number }>(
  pendingTransactions: T[],
  confirmedTransactions: T[]
) {
  const sectionsMap: {
    [key: string]: {
      data: T[]
      daysSinceTransaction: number
    }
  } = {}

  // add pending transactions to "Pending" section
  if (pendingTransactions.length > 0) {
    const pendingSectionTitle = i18n.t('feedSectionHeaderPending')
    sectionsMap[pendingSectionTitle] = {
      daysSinceTransaction: -1, // Put pending at the very top
      data: pendingTransactions,
    }
  }

  confirmedTransactions.forEach((transaction) => {
    const daysSinceTransaction = timeDeltaInDays(Date.now(), transaction.timestamp)

    // For last 7 days: show daily groupings (Hoy, Ayer, Lunes, etc.)
    // For older: show monthly groupings
    const sectionTitle =
      daysSinceTransaction <= 7
        ? getDayTitle(transaction.timestamp)
        : formatFeedSectionTitle(transaction.timestamp, i18n)

    sectionsMap[sectionTitle] = {
      daysSinceTransaction: sectionsMap[sectionTitle]?.daysSinceTransaction ?? daysSinceTransaction,
      data: [...(sectionsMap[sectionTitle]?.data ?? []), transaction],
    }
  })

  return Object.entries(sectionsMap)
    .sort((a, b) => a[1].daysSinceTransaction - b[1].daysSinceTransaction)
    .map(([key, value]) => ({
      title: key,
      data: value.data,
    }))
}

export function getTxReceiptAnalyticsProperties(
  { tx, txHash, txReceipt }: TrackedTx,
  networkId: NetworkId,
  tokensById: TokenBalances
): Partial<TxReceiptProperties> {
  const feeCurrencyToken = tx && getFeeCurrencyToken([tx], networkId, tokensById)
  const feeDecimals = tx && feeCurrencyToken ? getFeeDecimals([tx], feeCurrencyToken) : undefined

  const txMaxGasFee = tx && feeDecimals ? getMaxGasFee([tx]).shiftedBy(-feeDecimals) : undefined
  const txMaxGasFeeUsd =
    feeCurrencyToken && txMaxGasFee && feeCurrencyToken.priceUsd
      ? txMaxGasFee.times(feeCurrencyToken.priceUsd)
      : undefined
  const txEstimatedGasFee =
    tx && feeDecimals ? getEstimatedGasFee([tx]).shiftedBy(-feeDecimals) : undefined
  const txEstimatedGasFeeUsd =
    feeCurrencyToken && txEstimatedGasFee && feeCurrencyToken.priceUsd
      ? txEstimatedGasFee.times(feeCurrencyToken.priceUsd)
      : undefined

  const txGasFee =
    txReceipt?.gasUsed && txReceipt?.effectiveGasPrice && feeDecimals
      ? new BigNumber((txReceipt.gasUsed * txReceipt.effectiveGasPrice).toString()).shiftedBy(
          -feeDecimals
        )
      : undefined
  const txGasFeeUsd =
    feeCurrencyToken && txGasFee && feeCurrencyToken.priceUsd
      ? txGasFee.times(feeCurrencyToken.priceUsd)
      : undefined

  return {
    txCumulativeGasUsed: txReceipt?.cumulativeGasUsed
      ? Number(txReceipt.cumulativeGasUsed)
      : undefined,
    txEffectiveGasPrice: txReceipt?.effectiveGasPrice
      ? Number(txReceipt.effectiveGasPrice)
      : undefined,
    txGas: tx?.gas ? Number(tx.gas) : undefined,
    txMaxGasFee: txMaxGasFee?.toNumber(),
    txMaxGasFeeUsd: txMaxGasFeeUsd?.toNumber(),
    txEstimatedGasFee: txEstimatedGasFee?.toNumber(),
    txEstimatedGasFeeUsd: txEstimatedGasFeeUsd?.toNumber(),
    txGasUsed: txReceipt?.gasUsed ? Number(txReceipt.gasUsed) : undefined,
    txGasFee: txGasFee?.toNumber(),
    txGasFeeUsd: txGasFeeUsd?.toNumber(),
    txHash,
    txFeeCurrency: tx && getFeeCurrency(tx),
    txFeeCurrencySymbol: feeCurrencyToken?.symbol,
  }
}

export function getPrefixedTxAnalyticsProperties<Prefix extends string>(
  receiptProperties: Partial<TxReceiptProperties>,
  prefix: Prefix
): Partial<PrefixedTxReceiptProperties<Prefix>> {
  const prefixedProperties: Record<string, any> = {}
  for (const [key, value] of Object.entries(receiptProperties)) {
    prefixedProperties[`${prefix}${key[0].toUpperCase()}${key.slice(1)}`] = value
  }
  return prefixedProperties as Partial<PrefixedTxReceiptProperties<Prefix>>
}
