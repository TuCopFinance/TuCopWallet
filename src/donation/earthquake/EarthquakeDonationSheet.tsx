import BigNumber from 'bignumber.js'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import {
  EarthquakeDonationConfig,
  getEarthquakeDonationConfig,
} from 'src/donation/earthquake/config'
import { executeEarthquakeDonation } from 'src/donation/earthquake/saga'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useCOPm } from 'src/tokens/hooks'
import { getLocalCurrencySymbol } from 'src/localCurrency/selectors'
import Logger from 'src/utils/Logger'

const TAG = 'donation/earthquake/EarthquakeDonationSheet'

interface Props {
  forwardedRef: React.RefObject<BottomSheetModalRefType>
  // 'popup' when auto-opened at app start; 'card' when user tapped the
  // permanent TabHome entrypoint. Threaded into the tx analytics tag so
  // we can split conversion by surface later.
  source: 'popup' | 'card'
}

function formatPesos(amount: BigNumber | number, symbol: string): string {
  const bn = amount instanceof BigNumber ? amount : new BigNumber(amount)
  // es-419 formatting: `.` for thousands, `,` for decimals. BigNumber's
  // toFormat defaults to `,` for thousands; override the group separator
  // here so the sheet reads natively for Colombian users.
  return `${symbol}${bn.toFormat(0, { groupSeparator: '.', decimalSeparator: ',' })}`
}

export default function EarthquakeDonationSheet({ forwardedRef, source }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const localSymbol = useSelector(getLocalCurrencySymbol) || '$'
  const copmToken = useCOPm()

  const config: EarthquakeDonationConfig = useMemo(() => {
    try {
      return getEarthquakeDonationConfig()
    } catch (e) {
      Logger.warn(TAG, 'Failed to resolve donation config; using empty', e)
      return {
        destinationAddress: '0x0000000000000000000000000000000000000000',
        matchPercentage: 20,
        presetAmounts: [10000, 50000, 100000, 250000, 500000],
        refiInstagramUrl: '',
        refiTwitterUrl: '',
        safeExplorerUrl: '',
      }
    }
  }, [])

  // amount is the RAW user-typed whole-token string (Pesos digitales).
  // Kept as a string so leading zeros / partial input do not fight BigNumber.
  const [amount, setAmount] = useState<string>(String(config.presetAmounts[1] ?? 50000))

  const parsed = useMemo(() => {
    const bn = new BigNumber((amount || '0').replace(/[^\d.]/g, ''))
    return bn.isFinite() && bn.gt(0) ? bn : new BigNumber(0)
  }, [amount])

  const matchAmount = useMemo(
    () => parsed.multipliedBy(config.matchPercentage).dividedBy(100),
    [parsed, config.matchPercentage]
  )
  const totalAmount = useMemo(() => parsed.plus(matchAmount), [parsed, matchAmount])

  const balance = copmToken?.balance ?? new BigNumber(0)
  const overBalance = parsed.gt(balance)
  const disableDonate = parsed.lte(0) || overBalance

  const onDonate = () => {
    if (disableDonate) return
    dispatch(
      executeEarthquakeDonation({
        amountWhole: parsed.toFixed(),
        source,
      })
    )
    forwardedRef.current?.dismiss()
  }

  const onOpenLink = (url: string) => {
    if (!url) return
    void Linking.openURL(url)
  }

  return (
    <BottomSheet
      title={t('earthquakeDonation.title')}
      forwardedRef={forwardedRef}
      testId="EarthquakeDonationSheet"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <Text style={styles.body}>{t('earthquakeDonation.body')}</Text>
        <Text style={styles.matchHighlight}>
          {t('earthquakeDonation.matchHighlight', { percent: config.matchPercentage })}
        </Text>

        <Text style={styles.inputLabel}>{t('earthquakeDonation.amountLabel')}</Text>
        <TextInput
          testID="EarthquakeDonationSheet/AmountInput"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="10000"
          placeholderTextColor={Colors.gray3}
          style={styles.amountInput}
          maxLength={12}
        />
        <View style={styles.presetsRow}>
          {config.presetAmounts.map((preset) => (
            <Pressable
              key={preset}
              onPress={() => setAmount(String(preset))}
              testID={`EarthquakeDonationSheet/Preset/${preset}`}
              style={[styles.presetChip, Number(amount) === preset && styles.presetChipActive]}
            >
              <Text
                style={[
                  styles.presetChipText,
                  Number(amount) === preset && styles.presetChipTextActive,
                ]}
              >
                {formatPesos(preset, localSymbol)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.breakdown} testID="EarthquakeDonationSheet/Breakdown">
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{t('earthquakeDonation.yourDonation')}</Text>
            <Text style={styles.breakdownValue}>{formatPesos(parsed, localSymbol)}</Text>
          </View>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>
              {t('earthquakeDonation.refiMatch', { percent: config.matchPercentage })}
            </Text>
            <Text style={[styles.breakdownValue, styles.matchValue]}>
              +{formatPesos(matchAmount, localSymbol)}
            </Text>
          </View>
          <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
            <Text style={styles.breakdownTotalLabel}>{t('earthquakeDonation.totalImpact')}</Text>
            <Text style={styles.breakdownTotalValue}>{formatPesos(totalAmount, localSymbol)}</Text>
          </View>
        </View>

        {overBalance && (
          <Text style={styles.errorText} testID="EarthquakeDonationSheet/OverBalance">
            {t('earthquakeDonation.insufficientBalance', {
              balance: formatPesos(balance, localSymbol),
            })}
          </Text>
        )}

        <Text style={styles.disclaimer}>{t('earthquakeDonation.disclaimer')}</Text>

        <View style={styles.linksRow}>
          {config.refiInstagramUrl ? (
            <Pressable
              onPress={() => onOpenLink(config.refiInstagramUrl)}
              testID="EarthquakeDonationSheet/Link/Instagram"
              style={styles.linkChip}
            >
              <Text style={styles.linkChipText}>{t('earthquakeDonation.linkInstagram')}</Text>
            </Pressable>
          ) : null}
          {config.refiTwitterUrl ? (
            <Pressable
              onPress={() => onOpenLink(config.refiTwitterUrl)}
              testID="EarthquakeDonationSheet/Link/X"
              style={styles.linkChip}
            >
              <Text style={styles.linkChipText}>{t('earthquakeDonation.linkX')}</Text>
            </Pressable>
          ) : null}
          {config.safeExplorerUrl ? (
            <Pressable
              onPress={() => onOpenLink(config.safeExplorerUrl)}
              testID="EarthquakeDonationSheet/Link/Safe"
              style={styles.linkChip}
            >
              <Text style={styles.linkChipText}>{t('earthquakeDonation.linkSafe')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          testID="EarthquakeDonationSheet/Donate"
          text={t('earthquakeDonation.donateCta')}
          onPress={onDonate}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          disabled={disableDonate}
        />
        <Button
          testID="EarthquakeDonationSheet/Dismiss"
          text={t('earthquakeDonation.notNow')}
          onPress={() => forwardedRef.current?.dismiss()}
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
          style={styles.dismissButton}
        />
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 500,
  },
  scrollContent: {
    paddingBottom: Spacing.Regular16,
  },
  body: {
    ...typeScale.bodyMedium,
    color: Colors.gray5,
    marginBottom: Spacing.Regular16,
  },
  matchHighlight: {
    ...typeScale.labelMedium,
    color: Colors.successDark,
    backgroundColor: Colors.successLight,
    padding: Spacing.Small12,
    borderRadius: 8,
    marginBottom: Spacing.Regular16,
    textAlign: 'center',
  },
  inputLabel: {
    ...typeScale.labelSmall,
    color: Colors.gray4,
    marginBottom: Spacing.Smallest8,
  },
  amountInput: {
    ...typeScale.displaySmall,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 8,
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Small12,
    color: Colors.black,
    marginBottom: Spacing.Small12,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.Smallest8,
    marginBottom: Spacing.Regular16,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 20,
    paddingHorizontal: Spacing.Small12,
    paddingVertical: Spacing.Tiny4 + 2,
  },
  presetChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  presetChipText: {
    ...typeScale.labelSmall,
    color: Colors.gray5,
  },
  presetChipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  breakdown: {
    backgroundColor: Colors.gray1,
    borderRadius: 8,
    padding: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    ...typeScale.bodySmall,
    color: Colors.gray5,
  },
  breakdownValue: {
    ...typeScale.labelMedium,
    color: Colors.black,
  },
  matchValue: {
    color: Colors.successDark,
  },
  breakdownTotalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray2,
    paddingTop: Spacing.Smallest8,
    marginTop: Spacing.Tiny4,
  },
  breakdownTotalLabel: {
    ...typeScale.labelMedium,
    color: Colors.black,
    fontWeight: '600',
  },
  breakdownTotalValue: {
    ...typeScale.labelMedium,
    color: Colors.black,
    fontWeight: '600',
  },
  errorText: {
    ...typeScale.bodySmall,
    color: Colors.warningDark,
    marginTop: Spacing.Smallest8,
  },
  disclaimer: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
    marginTop: Spacing.Regular16,
    textAlign: 'center',
  },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.Small12,
    marginTop: Spacing.Regular16,
    flexWrap: 'wrap',
  },
  linkChip: {
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 20,
    paddingHorizontal: Spacing.Small12,
    paddingVertical: Spacing.Tiny4 + 2,
  },
  linkChipText: {
    ...typeScale.bodyXSmall,
    color: Colors.primary,
    fontWeight: '600',
  },
  footer: {
    gap: Spacing.Smallest8,
    paddingTop: Spacing.Regular16,
  },
  dismissButton: {
    marginTop: 0,
  },
})
