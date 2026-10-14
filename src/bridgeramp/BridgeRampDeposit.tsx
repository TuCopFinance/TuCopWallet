import BigNumber from 'bignumber.js'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native'
import { partyCanTransact } from 'src/bridgeramp/api'
import { PartySection, Row, withSupportCode } from 'src/bridgeramp/BridgeRampWithdraw'
import {
  BRIDGE_MIN_COP,
  digitalPesosLabel,
  dollarsLabel,
  formatCop,
  pesosLabel,
} from 'src/bridgeramp/display'
import { COPM_DECIMALS, USDC_DECIMALS } from 'src/bridgeramp/mentoRouter'
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
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import DataFieldWithCopy from 'src/components/DataFieldWithCopy'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import { refreshAllBalances } from 'src/home/actions'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { walletAddressSelector } from 'src/web3/selectors'

// How often the screen refreshes balances while waiting for Bridge's payout.
// Bridge settles a Bre-B deposit in a few minutes; 15 s keeps the wait short
// without hammering the balance endpoint.
const ARRIVAL_POLL_MS = 15_000

// COP -> COPm through Bridge. The user pays Bre-B to the virtual account
// TuCOPRamp returns for this wallet; Bridge sends USDC to the wallet; the
// screen notices the balance increase and converts it to COPm on Mento.
//
//   1. account: party must be onboarded and verified (PartySection).
//   2. instructions: the Bre-B key to pay, an optional amount estimate.
//   3. arrival: balance polling until USDC lands, then the swap's progress.
function BridgeRampDeposit() {
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
      {canTransact && <DepositSection />}
    </View>
  )
}

function DepositSection() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const deposit = useSelector(bridgeRampDepositSelector)
  const swap = useSelector(bridgeRampSwapSelector)
  const walletAddress = useSelector(walletAddressSelector)

  if (deposit.status === 'idle' || deposit.status === 'creating') {
    return <ActivityIndicator style={styles.spinner} testID="bridgeramp-deposit-loading" />
  }
  if (deposit.status === 'failed' || !deposit.account) {
    return (
      <InLineNotification
        variant={NotificationVariant.Error}
        description={withSupportCode(
          t,
          t(`bridgeramp.deposit.accountErrors.${deposit.errorCode}`, {
            defaultValue: t('bridgeramp.deposit.accountError', {
              code: deposit.errorCode ?? 'unknown',
            }),
          }),
          deposit.errorRequestId
        )}
        ctaLabel={t('bridgeramp.retry')}
        onPressCta={() => dispatch(startBridgeRampDeposit())}
        style={styles.notice}
        testID="bridgeramp-deposit-error"
      />
    )
  }

  // USDC arrived: the conversion is what the user is looking at now.
  if (deposit.pending) {
    return (
      <ConversionProgress
        usdcAmount={deposit.pending.convertAmount ?? deposit.pending.usdcAmount}
        converting={deposit.converting}
      />
    )
  }

  const { deposit_instructions: instructions, destination, fee_bps: feeBps } = deposit.account
  // The account pays a fixed wallet. Never show a key that would send the
  // USDC somewhere other than this wallet.
  if (!walletAddress || destination.address.toLowerCase() !== walletAddress.toLowerCase()) {
    return (
      <InLineNotification
        variant={NotificationVariant.Error}
        description={t('bridgeramp.deposit.wrongWallet')}
        style={styles.notice}
        testID="bridgeramp-deposit-wrong-wallet"
      />
    )
  }
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
      {!!instructions.account_holder_name && (
        <Row label={t('bridgeramp.deposit.holder')} value={instructions.account_holder_name} />
      )}
      {!!instructions.bank_name && (
        <Row label={t('bridgeramp.deposit.bank')} value={instructions.bank_name} />
      )}
      <Row
        label={t('bridgeramp.deposit.fee')}
        value={`${new BigNumber(feeBps).dividedBy(100).toFormat()} %`}
      />
      <InLineNotification
        variant={NotificationVariant.Warning}
        description={t('bridgeramp.deposit.onlyCop')}
        style={styles.noticeTop}
      />

      <EstimateBox feeBps={feeBps} />

      <View style={styles.waiting} testID="bridgeramp-deposit-waiting">
        <ActivityIndicator />
        <Text style={styles.waitingText}>{t('bridgeramp.deposit.waiting')}</Text>
      </View>
      {swap.status === 'confirmed' && swap.direction === 'usdcToCopm' && (
        <InLineNotification
          variant={NotificationVariant.Info}
          description={t('bridgeramp.deposit.lastConverted', {
            amount: formatCop(new BigNumber(swap.quotedAmountOut ?? 0).shiftedBy(-COPM_DECIMALS)),
          })}
          style={styles.noticeTop}
          testID="bridgeramp-deposit-last"
        />
      )}
    </View>
  )
}

// Rough estimate for an amount the user is about to pay. Bridge converts
// the pesos at its own rate when they arrive and the app swaps the dollars
// on Mento right after, so the only number known now is the fee: show the
// amount less TuCOP's fee as an approximation and say the rate decides.
function estimateDepositPesos(amountCop: number, feeBps: number): BigNumber {
  return new BigNumber(amountCop)
    .times(new BigNumber(10_000 - feeBps).dividedBy(10_000))
    .integerValue(BigNumber.ROUND_FLOOR)
}

function EstimateBox({ feeBps }: { feeBps: number }) {
  const { t } = useTranslation()
  const [amountCop, setAmountCop] = useState('')
  const amountNum = Number(amountCop.replace(/[^0-9]/g, ''))
  const amountValid = Number.isFinite(amountNum) && amountNum >= BRIDGE_MIN_COP

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
          {t('bridgeramp.amountBelowMin', { min: formatCop(BRIDGE_MIN_COP) })}
        </Text>
      )}
      {amountValid && (
        <View style={styles.quoteBox} testID="bridgeramp-quote">
          <Row label={t('bridgeramp.onramp.quoteIn')} value={pesosLabel(t, amountNum)} />
          <Row
            label={t('bridgeramp.onramp.quoteOut')}
            value={t('bridgeramp.deposit.estimateApprox', {
              amount: digitalPesosLabel(t, estimateDepositPesos(amountNum, feeBps)),
            })}
          />
          <Text style={styles.quoteNote}>{t('bridgeramp.deposit.estimateNote')}</Text>
        </View>
      )}
    </View>
  )
}

function ConversionProgress({
  usdcAmount,
  converting,
}: {
  usdcAmount: string
  converting: boolean
}) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const swap = useSelector(bridgeRampSwapSelector)
  const usdc = dollarsLabel(t, new BigNumber(usdcAmount).shiftedBy(-USDC_DECIMALS))
  const failed = swap.status === 'failed'
  // Mento cannot price COPm right now; the conversion runs on its own once
  // it can (checkDepositSaga keeps trying while this screen is open).
  const marketClosed = failed && swap.errorCode === 'market_closed'
  // A conversion is being quoted, signed or awaited right now: a second one
  // must not start, so retry and keep are hidden until it ends.
  const busy = converting || swap.status === 'submitting' || swap.status === 'broadcast'
  // The swap was broadcast and may still land: keeping the dollars now
  // would forget a conversion that can still spend them.
  const mayStillLand = failed && swap.errorCode === 'receipt_unknown'

  return (
    <View testID="bridgeramp-deposit-converting">
      <Text style={styles.stepTitle}>
        {marketClosed
          ? t('bridgeramp.deposit.marketClosedTitle')
          : failed
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
      {(!failed || marketClosed || busy) && <ActivityIndicator style={styles.spinner} />}
      {!!swap.swapTxHash && (
        <View style={styles.hashBlock}>
          <Text style={styles.rowLabel}>{t('bridgeramp.progress.swapTx')}</Text>
          <Text style={styles.hash} selectable testID="bridgeramp-swap-hash">
            {swap.swapTxHash}
          </Text>
        </View>
      )}
      {failed && !busy && (
        <>
          <Button
            text={t('bridgeramp.deposit.retryConvert')}
            onPress={() => dispatch(retryBridgeRampDepositConversion())}
            type={BtnTypes.PRIMARY}
            size={BtnSizes.FULL}
            style={styles.cta}
            testID="bridgeramp-deposit-retry"
          />
          {!mayStillLand && (
            <>
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
        </>
      )}
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
  rowLabel: { ...typeScale.bodySmall, color: Colors.gray4 },
  quoteNote: { ...typeScale.bodySmall, color: Colors.gray4, marginTop: Spacing.Smallest8 },
  waiting: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.Thick24 },
  waitingText: { ...typeScale.bodySmall, color: Colors.gray4, marginLeft: Spacing.Small12 },
  hashBlock: { marginTop: Spacing.Regular16 },
  hash: { ...typeScale.bodyXSmall, color: Colors.black },
  cta: { marginTop: Spacing.Thick24, marginBottom: Spacing.Regular16 },
})

export default BridgeRampDeposit
