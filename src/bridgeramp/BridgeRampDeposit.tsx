import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native'
import { partyCanTransact } from 'src/bridgeramp/api'
import { PartySection } from 'src/bridgeramp/BridgeRampWithdraw'
import { COPM_DECIMALS, MentoQuote, USDC_DECIMALS } from 'src/bridgeramp/mentoRouter'
import {
  checkBridgeRampDeposit,
  fetchBridgeRampParty,
  retryBridgeRampDepositConversion,
  startBridgeRampDeposit,
} from 'src/bridgeramp/saga'
import {
  bridgeRampDepositSelector,
  bridgeRampPartySelector,
  bridgeRampSwapSelector,
} from 'src/bridgeramp/selectors'
import { depositReset } from 'src/bridgeramp/slice'
import { useMentoQuote } from 'src/bridgeramp/useMentoQuote'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import DataFieldWithCopy from 'src/components/DataFieldWithCopy'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import { refreshAllBalances } from 'src/home/actions'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

// Bridge pays nothing below this (COP). Enforced here until TuCOPRamp returns
// limits for the wallet consumer.
const BRIDGE_MIN_COP = 4_000
// Rough rate used only to size a USDC input from a COP amount for the
// estimate; the number shown comes from the Mento quote itself.
const FALLBACK_COP_PER_USD = 3_200
// How often the screen refreshes balances while waiting for Bridge's payout.
// Bridge settles a Bre-B deposit in a few minutes; 15 s keeps the wait short
// without hammering the balance endpoint.
const ARRIVAL_POLL_MS = 15_000

interface Props {
  oracleStale: boolean
}

// COP -> COPm through Bridge. The user pays Bre-B to the virtual account
// TuCOPRamp returns for this wallet; Bridge sends USDC to the wallet; the
// screen notices the balance increase and converts it to COPm on Mento.
//
//   1. account: party must be onboarded and verified (PartySection).
//   2. instructions: the Bre-B key to pay, an optional amount estimate.
//   3. arrival: balance polling until USDC lands, then the swap's progress.
function BridgeRampDeposit({ oracleStale }: Props) {
  const dispatch = useDispatch()
  const party = useSelector(bridgeRampPartySelector)
  const deposit = useSelector(bridgeRampDepositSelector)
  const canTransact = party.status === 'loaded' && !!party.value && partyCanTransact(party.value)

  useEffect(() => {
    dispatch(fetchBridgeRampParty())
  }, [])

  // Once the party can transact, ask for (or refresh) the deposit account.
  useEffect(() => {
    if (canTransact && deposit.status === 'idle') {
      dispatch(startBridgeRampDeposit())
    }
  }, [canTransact, deposit.status])

  // While the instructions are shown, refresh balances and look for USDC
  // above the baseline. Also runs once on mount so a payout that landed while
  // the app was closed is converted as soon as the user comes back.
  useEffect(() => {
    if (deposit.status !== 'ready') return
    dispatch(checkBridgeRampDeposit())
    const timer = setInterval(() => {
      dispatch(refreshAllBalances())
      dispatch(checkBridgeRampDeposit())
    }, ARRIVAL_POLL_MS)
    return () => clearInterval(timer)
  }, [deposit.status])

  return (
    <View>
      <PartySection />
      {canTransact && <DepositSection oracleStale={oracleStale} />}
    </View>
  )
}

function DepositSection({ oracleStale }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const deposit = useSelector(bridgeRampDepositSelector)
  const swap = useSelector(bridgeRampSwapSelector)

  if (deposit.status === 'idle' || deposit.status === 'creating') {
    return <ActivityIndicator style={styles.spinner} testID="bridgeramp-deposit-loading" />
  }
  if (deposit.status === 'failed' || !deposit.account) {
    return (
      <InLineNotification
        variant={NotificationVariant.Error}
        description={t('bridgeramp.deposit.accountError', {
          code: deposit.errorCode ?? 'unknown',
        })}
        ctaLabel={t('bridgeramp.retry')}
        onPressCta={() => dispatch(startBridgeRampDeposit())}
        style={styles.notice}
        testID="bridgeramp-deposit-error"
      />
    )
  }

  // USDC arrived: the conversion is what the user is looking at now.
  if (deposit.pending) {
    return <ConversionProgress usdcAmount={deposit.pending.usdcAmount} />
  }

  const { instructions } = deposit.account
  return (
    <View testID="bridgeramp-deposit-instructions">
      <Text style={styles.stepTitle}>{t('bridgeramp.deposit.payTitle')}</Text>
      <Text style={styles.body}>{t('bridgeramp.deposit.payBody')}</Text>
      <DataFieldWithCopy
        label={t('bridgeramp.deposit.breBKey')}
        value={instructions.bre_b_key}
        copySuccessMessage={t('bridgeramp.deposit.keyCopied')}
        testID="bridgeramp-deposit-key"
        style={styles.copyField}
      />
      <Row label={t('bridgeramp.deposit.holder')} value={instructions.holder_name} />
      {!!instructions.bank && (
        <Row label={t('bridgeramp.deposit.bank')} value={instructions.bank} />
      )}
      <Row
        label={t('bridgeramp.deposit.minimum')}
        value={`${new BigNumber(deposit.account.minimum?.amount ?? BRIDGE_MIN_COP).toFormat(0)} COP`}
      />
      <InLineNotification
        variant={NotificationVariant.Warning}
        description={t('bridgeramp.deposit.onlyCop')}
        style={styles.noticeTop}
      />

      <EstimateBox oracleStale={oracleStale} />

      <View style={styles.waiting} testID="bridgeramp-deposit-waiting">
        <ActivityIndicator />
        <Text style={styles.waitingText}>{t('bridgeramp.deposit.waiting')}</Text>
      </View>
      {swap.status === 'confirmed' && swap.direction === 'usdcToCopm' && (
        <InLineNotification
          variant={NotificationVariant.Info}
          description={t('bridgeramp.deposit.lastConverted', {
            amount: new BigNumber(swap.quotedAmountOut ?? 0).shiftedBy(-COPM_DECIMALS).toFormat(0),
          })}
          style={styles.noticeTop}
          testID="bridgeramp-deposit-last"
        />
      )}
    </View>
  )
}

// Live Mento estimate for an amount the user is about to pay. Informational:
// the real conversion uses the quote taken when the USDC lands.
function EstimateBox({ oracleStale }: Props) {
  const { t } = useTranslation()
  const [amountCop, setAmountCop] = useState('')
  const amountNum = Number(amountCop.replace(/[^0-9]/g, ''))
  const amountValid = Number.isFinite(amountNum) && amountNum >= BRIDGE_MIN_COP
  const amountIn = useMemo(
    () =>
      amountValid && !oracleStale
        ? BigInt(
            new BigNumber(amountNum)
              .dividedBy(FALLBACK_COP_PER_USD)
              .shiftedBy(USDC_DECIMALS)
              .toFixed(0)
          )
        : null,
    [amountNum, amountValid, oracleStale]
  )
  const quoteState = useMentoQuote('usdcToCopm', amountIn)

  return (
    <View style={styles.section}>
      <Text style={styles.label}>{t('bridgeramp.deposit.estimateLabel')}</Text>
      <TextInput
        style={styles.input}
        value={amountCop}
        onChangeText={setAmountCop}
        keyboardType="number-pad"
        placeholder={t('bridgeramp.amountPlaceholder') ?? ''}
        placeholderTextColor={Colors.gray4}
        testID="bridgeramp-amount"
      />
      {amountCop.length > 0 && !amountValid && (
        <Text style={styles.helperError}>
          {t('bridgeramp.amountBelowMin', { min: BRIDGE_MIN_COP.toLocaleString('es-CO') })}
        </Text>
      )}
      {quoteState.state === 'loading' && <ActivityIndicator style={styles.spinner} />}
      {quoteState.state === 'ready' && (
        <View style={styles.quoteBox} testID="bridgeramp-quote">
          <Row
            label={t('bridgeramp.onramp.quoteIn')}
            value={formatAmount(quoteState.quote, 'in')}
          />
          <Row
            label={t('bridgeramp.onramp.quoteOut')}
            value={formatAmount(quoteState.quote, 'out')}
          />
          <Row
            label={t('bridgeramp.rateLabel')}
            value={`${quoteState.quote.copPerUsd.toFormat(2)} COP / USD`}
          />
          <Text style={styles.quoteNote}>{t('bridgeramp.deposit.estimateNote')}</Text>
        </View>
      )}
      {quoteState.state === 'oracle-unavailable' && (
        <InLineNotification
          variant={NotificationVariant.Warning}
          description={t('rampProviders.bridgeramp.outsideHours')}
          style={styles.noticeTop}
          testID="bridgeramp-oracle-stale"
        />
      )}
      {quoteState.state === 'error' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.quoteError')}
          style={styles.noticeTop}
        />
      )}
    </View>
  )
}

function ConversionProgress({ usdcAmount }: { usdcAmount: string }) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const swap = useSelector(bridgeRampSwapSelector)
  const usdc = new BigNumber(usdcAmount).shiftedBy(-USDC_DECIMALS).toFormat(2)
  const failed = swap.status === 'failed'

  return (
    <View testID="bridgeramp-deposit-converting">
      <Text style={styles.stepTitle}>
        {failed
          ? t('bridgeramp.deposit.convertFailedTitle')
          : t('bridgeramp.deposit.convertingTitle')}
      </Text>
      <Text style={styles.body}>
        {failed
          ? t(`bridgeramp.swapError.${swap.errorCode}`, {
              defaultValue: t('bridgeramp.swapError.generic'),
            })
          : t('bridgeramp.deposit.convertingBody', { usdc })}
      </Text>
      {!failed && <ActivityIndicator style={styles.spinner} />}
      {!!swap.swapTxHash && (
        <View style={styles.hashBlock}>
          <Text style={styles.rowLabel}>{t('bridgeramp.progress.swapTx')}</Text>
          <Text style={styles.hash} selectable testID="bridgeramp-swap-hash">
            {swap.swapTxHash}
          </Text>
        </View>
      )}
      {failed && (
        <>
          <Button
            text={t('bridgeramp.deposit.retryConvert')}
            onPress={() => dispatch(retryBridgeRampDepositConversion())}
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            style={styles.cta}
            testID="bridgeramp-deposit-retry"
          />
          <Text style={styles.body}>{t('bridgeramp.deposit.keepUsdcHint', { usdc })}</Text>
          <Button
            text={t('bridgeramp.deposit.keepUsdc')}
            onPress={() => dispatch(depositReset())}
            type={BtnTypes.SECONDARY}
            size={BtnSizes.FULL}
            testID="bridgeramp-deposit-keep"
          />
        </>
      )}
    </View>
  )
}

function formatAmount(quote: MentoQuote, side: 'in' | 'out'): string {
  const whole = side === 'in' ? quote.amountInWhole : quote.amountOutWhole
  const isCopm = (quote.direction === 'copmToUsdc') === (side === 'in')
  return isCopm ? `${whole.toFormat(0)} pesos digitales` : `${whole.toFormat(2)} USDC`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.Thick24 },
  stepTitle: { ...typeScale.titleSmall, color: Colors.black, marginBottom: Spacing.Small12 },
  body: { ...typeScale.bodyMedium, color: Colors.gray4, marginBottom: Spacing.Regular16 },
  notice: { marginBottom: Spacing.Regular16 },
  noticeTop: { marginTop: Spacing.Regular16 },
  copyField: { marginBottom: Spacing.Regular16, marginTop: 0 },
  label: { ...typeScale.labelSmall, color: Colors.gray4, marginBottom: Spacing.Smallest8 },
  input: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: Spacing.Smallest8,
    padding: Spacing.Small12,
  },
  helperError: { ...typeScale.bodySmall, color: Colors.error, marginTop: Spacing.Smallest8 },
  spinner: { marginTop: Spacing.Regular16 },
  quoteBox: {
    marginTop: Spacing.Regular16,
    padding: Spacing.Regular16,
    borderRadius: Spacing.Small12,
    backgroundColor: Colors.gray1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.Smallest8 },
  rowLabel: { ...typeScale.bodySmall, color: Colors.gray4 },
  rowValue: { ...typeScale.labelSemiBoldMedium, color: Colors.black },
  quoteNote: { ...typeScale.bodySmall, color: Colors.gray4, marginTop: Spacing.Smallest8 },
  waiting: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.Thick24 },
  waitingText: { ...typeScale.bodySmall, color: Colors.gray4, marginLeft: Spacing.Small12 },
  hashBlock: { marginTop: Spacing.Regular16 },
  hash: { ...typeScale.bodyXSmall, color: Colors.black },
  cta: { marginTop: Spacing.Thick24, marginBottom: Spacing.Regular16 },
})

export default BridgeRampDeposit
