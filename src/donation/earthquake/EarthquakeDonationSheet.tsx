import BigNumber from 'bignumber.js'
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
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

// Inline single-use social + padlock icons. Kept local to this sheet since
// no other screen needs them; if a second consumer appears, promote to
// src/icons/. Padlock stands in for "verificar" without leaking the word
// "on-chain" or "wallet" into the user-facing surface.
const IG_SIZE = 14
function IconInstagram({ color }: { color: string }) {
  return (
    <Svg width={IG_SIZE} height={IG_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="2" width="20" height="20" rx="5" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={2} />
      <Circle cx="17.5" cy="6.5" r="1.2" fill={color} />
    </Svg>
  )
}
function IconX({ color }: { color: string }) {
  return (
    <Svg width={IG_SIZE} height={IG_SIZE} viewBox="0 0 24 24">
      <Path
        d="M18.244 2h3.308l-7.227 8.257L22.828 21.5h-6.657l-5.215-6.817L4.988 21.5H1.678l7.729-8.831L1.254 2h6.825l4.714 6.231L18.244 2Zm-1.161 17.52h1.833L7.076 3.865H5.109l11.974 15.655Z"
        fill={color}
      />
    </Svg>
  )
}
function IconPadlock({ color }: { color: string }) {
  return (
    <Svg width={IG_SIZE} height={IG_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="11" width="16" height="10" rx="2" stroke={color} strokeWidth={2} />
      <Path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={color} strokeWidth={2} />
    </Svg>
  )
}

interface Props {
  forwardedRef: React.RefObject<BottomSheetModalRefType>
  // 'popup' when auto-opened at app start; 'card' when user tapped the
  // permanent TabHome entrypoint. Threaded into the tx analytics tag so
  // we can split conversion by surface later.
  source: 'popup' | 'card'
}

// Colombian peso formatting: `.` thousands, `,` decimals. BigNumber.toFormat
// signature is (dp, roundingMode, format) — passing a format object as the
// SECOND arg silently drops it (rm accepts numbers only), which is how the
// first version of this sheet shipped rendering "COP$500000" instead of
// "COP$500.000". Pass BigNumber.ROUND_HALF_UP explicitly + the full format
// bag with groupSize:3 so the separator actually applies.
const PESOS_FORMAT = { groupSize: 3, groupSeparator: '.', decimalSeparator: ',' } as const

function formatPesos(amount: BigNumber | number, symbol: string): string {
  const bn = amount instanceof BigNumber ? amount : new BigNumber(amount)
  return `${symbol}${bn.toFormat(0, BigNumber.ROUND_HALF_UP, PESOS_FORMAT)}`
}

// Compact chip label: 10.000 -> 10K, 250.000 -> 250K, 1.000.000 -> 1M.
// Presets are always whole thousands, so we do not bother with decimal
// rounding beyond that. Keeps the row narrow enough to fit 5 chips.
function formatPesosCompact(amount: number, symbol: string): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000
    return `${symbol}${Number.isInteger(m) ? m : m.toFixed(1)}M`
  }
  if (amount >= 1_000) {
    return `${symbol}${Math.round(amount / 1_000)}K`
  }
  return `${symbol}${amount}`
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

  // amount holds ONLY digits (no separators, no decimals). The visible
  // TextInput value is derived from these digits with `.` thousand grouping
  // so users see "500.000" as they type, matching Colombian peso notation.
  // On every keystroke we strip anything that is not 0-9 before storing,
  // so paste / autocorrect / stray characters cannot break the parser.
  const [amount, setAmount] = useState<string>(String(config.presetAmounts[1] ?? 50000))

  const displayAmount = useMemo(() => {
    if (!amount) return ''
    const bn = new BigNumber(amount)
    if (!bn.isFinite()) return ''
    return bn.toFormat(0, BigNumber.ROUND_HALF_UP, PESOS_FORMAT)
  }, [amount])

  const parsed = useMemo(() => {
    const bn = new BigNumber(amount || '0')
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
      titleStyle={styles.sheetTitle}
      forwardedRef={forwardedRef}
      testId="EarthquakeDonationSheet"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <View style={styles.logoWrapper}>
          <Image
            source={require('src/home/refi-colombia-logo.webp')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.disclaimer}>{t('earthquakeDonation.disclaimer')}</Text>
        </View>
        <Text style={styles.matchHighlight}>
          {t('earthquakeDonation.matchHighlight', { percent: config.matchPercentage })}
        </Text>
        <View style={styles.linksRowSubtle}>
          {config.refiInstagramUrl ? (
            <Pressable
              onPress={() => onOpenLink(config.refiInstagramUrl)}
              testID="EarthquakeDonationSheet/Link/Instagram"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={styles.linkInline}
            >
              <IconInstagram color={Colors.gray4} />
              <Text style={styles.linkInlineText}>{t('earthquakeDonation.linkInstagram')}</Text>
            </Pressable>
          ) : null}
          {config.refiTwitterUrl ? (
            <Pressable
              onPress={() => onOpenLink(config.refiTwitterUrl)}
              testID="EarthquakeDonationSheet/Link/X"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={styles.linkInline}
            >
              <IconX color={Colors.gray4} />
              <Text style={styles.linkInlineText}>{t('earthquakeDonation.linkX')}</Text>
            </Pressable>
          ) : null}
          {config.safeExplorerUrl ? (
            <Pressable
              onPress={() => onOpenLink(config.safeExplorerUrl)}
              testID="EarthquakeDonationSheet/Link/Safe"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={styles.linkInline}
            >
              <IconPadlock color={Colors.gray4} />
              <Text style={styles.linkInlineText}>{t('earthquakeDonation.linkSafe')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.inputLabel}>{t('earthquakeDonation.amountLabel')}</Text>
        <TextInput
          testID="EarthquakeDonationSheet/AmountInput"
          value={displayAmount}
          onChangeText={(v) => setAmount(v.replace(/\D/g, ''))}
          keyboardType="numeric"
          placeholder="10.000"
          placeholderTextColor={Colors.gray3}
          style={styles.amountInput}
          maxLength={15}
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
                numberOfLines={1}
                style={[
                  styles.presetChipText,
                  Number(amount) === preset && styles.presetChipTextActive,
                ]}
              >
                {formatPesosCompact(preset, '')}
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
  sheetTitle: {
    ...typeScale.titleSmall,
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 500,
  },
  scrollContent: {
    paddingBottom: Spacing.Regular16,
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: Spacing.Regular16,
  },
  logo: {
    width: 120,
    height: 60,
    marginBottom: Spacing.Smallest8,
  },
  matchHighlight: {
    ...typeScale.labelMedium,
    color: Colors.successDark,
    backgroundColor: Colors.successLight,
    padding: Spacing.Small12,
    borderRadius: 8,
    marginBottom: Spacing.Smallest8,
    textAlign: 'center',
  },
  linksRowSubtle: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.Regular16,
    marginBottom: Spacing.Regular16,
    flexWrap: 'wrap',
  },
  linkInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Tiny4 + 2,
    paddingVertical: Spacing.Tiny4,
  },
  linkInlineText: {
    ...typeScale.bodyXSmall,
    color: Colors.gray4,
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
    justifyContent: 'space-between',
    gap: Spacing.Tiny4 + 2,
    marginBottom: Spacing.Regular16,
  },
  presetChip: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: 14,
    paddingHorizontal: Spacing.Tiny4,
    paddingVertical: Spacing.Tiny4 + 2,
  },
  presetChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  presetChipText: {
    ...typeScale.labelXSmall,
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
    textAlign: 'center',
    paddingHorizontal: Spacing.Small12,
  },
  footer: {
    gap: Spacing.Smallest8,
    paddingTop: Spacing.Regular16,
  },
  dismissButton: {
    marginTop: 0,
  },
})
