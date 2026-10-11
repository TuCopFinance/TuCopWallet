import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useState } from 'react'
import { useAsyncCallback } from 'react-async-hook'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { v4 as uuidv4 } from 'uuid'
import { Address } from 'viem'
import { Destination, Withdrawal, partyCanTransact } from 'src/bridgeramp/api'
import {
  COPM_DECIMALS,
  MentoQuote,
  USDC_ADDRESS_CELO,
  USDC_DECIMALS,
  minAmountOut,
} from 'src/bridgeramp/mentoRouter'
import { prepareBridgeRampCalls } from 'src/bridgeramp/prepare'
import {
  createBridgeRampParty,
  executeBridgeRampSwap,
  fetchBridgeRampDestinations,
  fetchBridgeRampParty,
  pollBridgeRampWithdrawal,
  registerBridgeRampDestination,
  startBridgeRampWithdraw,
} from 'src/bridgeramp/saga'
import {
  bridgeRampDestinationsSelector,
  bridgeRampPartySelector,
  bridgeRampSwapSelector,
  bridgeRampWithdrawSelector,
} from 'src/bridgeramp/selectors'
import { withdrawReset } from 'src/bridgeramp/slice'
import {
  BRIDGE_RAMP_SLIPPAGE_BPS,
  InvalidRecipientError,
  StaleQuoteError,
  buildBridgeWithdrawCalls,
} from 'src/bridgeramp/swapCalls'
import { useMentoQuote } from 'src/bridgeramp/useMentoQuote'
import { openUrl } from 'src/app/actions'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import { useDispatch, useSelector } from 'src/redux/hooks'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { useTokenInfo } from 'src/tokens/hooks'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { getFeeCurrencyAndAmounts } from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import {
  DOCUMENT_TYPES,
  DocumentType,
  isValidDocument,
  sanitizeDocument,
} from 'src/tucopramp/limits'
import { PickerModal } from 'src/tucopramp/PickerModal'
import { userProfileSelector } from 'src/tucopramp/selectors'
import { BRIDGE_RAMP_KYC_REDIRECT_URL, COPM_TOKEN_ID_MAINNET } from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'bridgeramp/BridgeRampWithdraw'

// Bridge pays nothing below this (COP). Enforced here until TuCOPRamp returns
// limits for the wallet consumer.
const BRIDGE_MIN_COP = 4_000
// A Bre-B key is a phone, a document, an email or an alphanumeric key; the
// server validates for real, this only stops obvious typos.
const BRE_B_KEY_MIN_LENGTH = 6
// Version of the consent text the user accepts in the onboarding form. Bump
// when `bridgeramp.onboarding.consent` changes; TuCOPRamp records it per app.
const BRIDGE_RAMP_CONSENT_VERSION = '2026-10-10'
const TUCOP_TERMS_URL = 'https://tucop.xyz/terminos-y-condiciones/'

interface Props {
  oracleStale: boolean
}

// COPm -> COP to the user's own Bre-B key through Bridge. Three steps:
//   1. amount: pick (or register) the destination, type the amount, see the
//      live Mento quote. Continue asks TuCOPRamp for the COP quote and opens
//      the operation, which is what gives us the deposit address.
//   2. review: Mento calls are built with the Router delivering USDC straight
//      to that deposit address, fee-priced, and shown next to TuCOPRamp's
//      numbers. Confirm signs approve + swap.
//   3. progress: swap status on-chain, then the payout from TuCOPRamp.
function BridgeRampWithdraw({ oracleStale }: Props) {
  const dispatch = useDispatch()
  const withdraw = useSelector(bridgeRampWithdrawSelector)
  const party = useSelector(bridgeRampPartySelector)
  const verificationPending =
    party.status === 'loaded' && !!party.value && !partyCanTransact(party.value)

  useEffect(() => {
    dispatch(fetchBridgeRampParty())
    dispatch(fetchBridgeRampDestinations())
  }, [])

  // Identity verification happens in the browser; when the user comes back
  // to the app with it pending, ask TuCOPRamp again instead of making them
  // tap retry.
  useEffect(() => {
    if (!verificationPending) return
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') dispatch(fetchBridgeRampParty())
    })
    return () => sub.remove()
  }, [verificationPending])

  if (withdraw.status === 'review' && withdraw.withdrawal && withdraw.quote) {
    return <ReviewStep withdrawal={withdraw.withdrawal} oracleStale={oracleStale} />
  }
  if (
    withdraw.status === 'awaiting_payout' ||
    withdraw.status === 'completed' ||
    withdraw.status === 'failed'
  ) {
    return <ProgressStep />
  }
  return <AmountStep oracleStale={oracleStale} />
}

// ---------------------------------------------------------------------------
// Step 1: account + destination + amount
// ---------------------------------------------------------------------------

function AmountStep({ oracleStale }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const party = useSelector(bridgeRampPartySelector)
  const destinations = useSelector(bridgeRampDestinationsSelector)
  const withdraw = useSelector(bridgeRampWithdrawSelector)
  const copmTokenInfo = useTokenInfo(COPM_TOKEN_ID_MAINNET)

  const [amountCop, setAmountCop] = useState('')
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null)

  const amountNum = Number(amountCop.replace(/[^0-9]/g, ''))
  const amountValid = Number.isFinite(amountNum) && amountNum >= BRIDGE_MIN_COP
  const amountIn = useMemo(
    () =>
      amountValid ? BigInt(new BigNumber(amountNum).shiftedBy(COPM_DECIMALS).toFixed(0)) : null,
    [amountNum, amountValid]
  )
  const quoteState = useMentoQuote('copmToUsdc', amountIn)
  const exceedsBalance =
    amountValid && !!copmTokenInfo && copmTokenInfo.balance.isLessThan(amountNum)

  const verifiedDestinations = destinations.items.filter(
    (d) => d.ownership === 'first_party' && d.status === 'verified'
  )
  const selectedDestination =
    verifiedDestinations.find((d) => d.id === selectedDestinationId) ??
    (verifiedDestinations.length === 1 ? verifiedDestinations[0] : undefined)

  const partyReady = party.status === 'loaded' && !!party.value && partyCanTransact(party.value)
  const canContinue =
    partyReady &&
    !!selectedDestination &&
    quoteState.state === 'ready' &&
    !exceedsBalance &&
    !oracleStale &&
    withdraw.status !== 'creating'

  const onContinue = () => {
    if (!canContinue || quoteState.state !== 'ready' || !selectedDestination) return
    const minOut = minAmountOut(quoteState.quote, BRIDGE_RAMP_SLIPPAGE_BPS)
    dispatch(
      startBridgeRampWithdraw({
        destinationId: selectedDestination.id,
        copmAmountIn: quoteState.quote.amountIn.toString(),
        usdcMinOut: new BigNumber(minOut.toString()).shiftedBy(-USDC_DECIMALS).toFixed(),
        idempotencyKey: uuidv4(),
      })
    )
  }

  return (
    <View>
      <PartySection />
      {partyReady && (
        <DestinationSection
          destinations={verifiedDestinations}
          selectedId={selectedDestination?.id ?? null}
          onSelect={setSelectedDestinationId}
        />
      )}

      <Text style={styles.label}>{t('bridgeramp.amountLabel')}</Text>
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
      {exceedsBalance && (
        <Text style={styles.helperError} testID="bridgeramp-insufficient">
          {t('bridgeramp.insufficientBalance', {
            balance: copmTokenInfo?.balance.toFormat(0) ?? '0',
          })}
        </Text>
      )}

      {quoteState.state === 'loading' && <ActivityIndicator style={styles.spinner} />}
      {quoteState.state === 'ready' && (
        <View style={styles.quoteBox} testID="bridgeramp-quote">
          <Row
            label={t('bridgeramp.offramp.quoteIn')}
            value={formatCopm(quoteState.quote.amountInWhole)}
          />
          <Row
            label={t('bridgeramp.offramp.quoteOut')}
            value={formatUsdc(quoteState.quote.amountOutWhole)}
          />
          <Row
            label={t('bridgeramp.rateLabel')}
            value={`${quoteState.quote.copPerUsd.toFormat(2)} COP / USD`}
          />
          <Text style={styles.quoteNote}>{t('bridgeramp.quoteNote')}</Text>
        </View>
      )}
      {quoteState.state === 'error' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.quoteError')}
          style={styles.notice}
        />
      )}
      {withdraw.status === 'failed' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.withdraw.startFailed', { code: withdraw.errorCode })}
          style={styles.noticeTop}
          testID="bridgeramp-start-failed"
        />
      )}

      <Button
        text={t('bridgeramp.continueCta')}
        onPress={onContinue}
        disabled={!canContinue}
        showLoading={withdraw.status === 'creating'}
        type={BtnTypes.PRIMARY}
        size={BtnSizes.FULL}
        style={styles.cta}
        testID="bridgeramp-continue"
      />
    </View>
  )
}

export function PartySection() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const party = useSelector(bridgeRampPartySelector)

  if (party.status === 'idle' || party.status === 'loading') {
    return <ActivityIndicator style={styles.spinner} testID="bridgeramp-party-loading" />
  }
  if (party.status === 'error') {
    return (
      <InLineNotification
        variant={NotificationVariant.Error}
        description={t('bridgeramp.party.loadError')}
        ctaLabel={t('bridgeramp.retry')}
        onPressCta={() => dispatch(fetchBridgeRampParty())}
        style={styles.notice}
        testID="bridgeramp-party-error"
      />
    )
  }
  if (party.needsOnboarding || !party.value) {
    return <PartyOnboardingForm />
  }
  if (!partyCanTransact(party.value)) {
    const kycUrl = party.value.links?.kyc
    return (
      <InLineNotification
        variant={NotificationVariant.Warning}
        title={t('bridgeramp.party.pendingTitle')}
        description={t('bridgeramp.party.pendingBody', {
          kyc: party.value.status.kyc,
          tos: party.value.status.tos,
        })}
        ctaLabel={kycUrl ? t('bridgeramp.party.openKyc') : undefined}
        onPressCta={kycUrl ? () => dispatch(openUrl(kycUrl, true)) : undefined}
        ctaLabel2={t('bridgeramp.retry')}
        onPressCta2={() => dispatch(fetchBridgeRampParty())}
        style={styles.notice}
        testID="bridgeramp-party-pending"
      />
    )
  }
  return null
}

// Creates the party on TuCOPRamp for this wallet: legal name, identity
// document, contact email and consent. The answer carries the hosted KYC and
// TOS links, which PartySection then shows as "verification pending".
function PartyOnboardingForm() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const party = useSelector(bridgeRampPartySelector)
  // Prefill from the TuCOP Ramp profile when the user already has one; the
  // document number is never echoed by the server, so it is always typed.
  const tucopRampProfile = useSelector(userProfileSelector)

  const [legalName, setLegalName] = useState(tucopRampProfile?.full_name ?? '')
  const [documentType, setDocumentType] = useState<DocumentType>(
    tucopRampProfile?.document_type ?? 'CC'
  )
  const [documentNumber, setDocumentNumber] = useState('')
  const [email, setEmail] = useState(tucopRampProfile?.primary_email ?? '')
  const [consent, setConsent] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const nameValid = legalName.trim().split(/\s+/).length >= 2
  const documentValid = isValidDocument(documentType, documentNumber)
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const submitting = party.onboarding.status === 'submitting'
  const canSubmit = nameValid && documentValid && emailValid && consent && !submitting

  const onSubmit = () => {
    if (!canSubmit) return
    dispatch(
      createBridgeRampParty({
        request: {
          type: 'individual',
          legal_name: legalName.trim(),
          document_type: documentType,
          document_number: documentNumber,
          email: email.trim(),
          consent: {
            version: BRIDGE_RAMP_CONSENT_VERSION,
            accepted_at: new Date().toISOString(),
          },
          redirect_url: BRIDGE_RAMP_KYC_REDIRECT_URL,
        },
        idempotencyKey: uuidv4(),
      })
    )
  }

  return (
    <View style={styles.section} testID="bridgeramp-party-onboarding">
      <Text style={styles.stepTitle}>{t('bridgeramp.onboarding.title')}</Text>
      <Text style={styles.body}>{t('bridgeramp.onboarding.body')}</Text>

      <Text style={styles.label}>{t('bridgeramp.onboarding.legalName')}</Text>
      <TextInput
        style={styles.input}
        value={legalName}
        onChangeText={setLegalName}
        autoCapitalize="words"
        placeholder={t('bridgeramp.onboarding.legalNamePlaceholder') ?? ''}
        placeholderTextColor={Colors.gray4}
        editable={!submitting}
        testID="bridgeramp-onboarding-name"
      />

      <Text style={[styles.label, styles.fieldGap]}>{t('tucopramp.documentTypeLabel')}</Text>
      <TouchableOpacity
        style={styles.input}
        onPress={() => setPickerOpen(true)}
        disabled={submitting}
        testID="bridgeramp-onboarding-doctype"
      >
        <Text style={styles.pickerValue}>{t(`tucopramp.documentType.${documentType}`)}</Text>
      </TouchableOpacity>
      <PickerModal<DocumentType>
        visible={pickerOpen}
        title={t('tucopramp.documentType.pickerTitle')}
        options={DOCUMENT_TYPES.map((value) => ({
          value,
          label: t(`tucopramp.documentType.${value}`),
        }))}
        selectedValue={documentType}
        testIdPrefix="bridgeramp-onboarding-doctype-option"
        onClose={() => setPickerOpen(false)}
        onSelect={(value) => {
          setDocumentType(value)
          setDocumentNumber(sanitizeDocument(value, documentNumber))
          setPickerOpen(false)
        }}
      />

      <Text style={[styles.label, styles.fieldGap]}>{t('tucopramp.documentValueLabel')}</Text>
      <TextInput
        style={styles.input}
        value={documentNumber}
        onChangeText={(raw) => setDocumentNumber(sanitizeDocument(documentType, raw))}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!submitting}
        testID="bridgeramp-onboarding-document"
      />
      {documentNumber.length > 0 && !documentValid && (
        <Text style={styles.helperError}>{t(`tucopramp.documentInvalid.${documentType}`)}</Text>
      )}

      <Text style={[styles.label, styles.fieldGap]}>{t('bridgeramp.onboarding.email')}</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
        testID="bridgeramp-onboarding-email"
      />
      <Text style={styles.helper}>{t('bridgeramp.onboarding.emailHelper')}</Text>

      <TouchableOpacity
        style={styles.consentRow}
        onPress={() => setConsent((v) => !v)}
        disabled={submitting}
        testID="bridgeramp-onboarding-consent"
      >
        <View style={[styles.consentCheckbox, consent && styles.consentCheckboxChecked]}>
          {consent && <Text style={styles.consentCheckmark}>✓</Text>}
        </View>
        <View style={styles.consentTextBlock}>
          <Text style={styles.consentLabel}>{t('bridgeramp.onboarding.consent')}</Text>
          <Text
            style={styles.consentLink}
            onPress={() => Linking.openURL(TUCOP_TERMS_URL)}
            testID="bridgeramp-onboarding-terms"
          >
            {t('tucopramp.consent.linkText')}
          </Text>
        </View>
      </TouchableOpacity>

      {party.onboarding.status === 'error' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t(`bridgeramp.onboarding.error.${party.onboarding.errorCode}`, {
            defaultValue: t('bridgeramp.onboarding.error.generic', {
              code: party.onboarding.errorCode,
            }),
          })}
          style={styles.noticeTop}
          testID="bridgeramp-onboarding-error"
        />
      )}

      <Button
        text={t('bridgeramp.onboarding.submitCta')}
        onPress={onSubmit}
        disabled={!canSubmit}
        showLoading={submitting}
        type={BtnTypes.PRIMARY}
        size={BtnSizes.FULL}
        style={styles.cta}
        testID="bridgeramp-onboarding-submit"
      />
    </View>
  )
}

function DestinationSection({
  destinations,
  selectedId,
  onSelect,
}: {
  destinations: Destination[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const state = useSelector(bridgeRampDestinationsSelector)
  const [newKey, setNewKey] = useState('')
  const registering = state.registering.status === 'pending'
  const registeringDestination = state.items.find((d) => d.id === state.registering.destinationId)
  const rejected =
    registeringDestination?.status === 'rejected' ? registeringDestination.rejection_reason : null

  const onRegister = () => {
    const key = newKey.trim()
    if (key.length < BRE_B_KEY_MIN_LENGTH) return
    dispatch(registerBridgeRampDestination({ breBKey: key, idempotencyKey: uuidv4() }))
    setNewKey('')
  }

  return (
    <View style={styles.section}>
      <Text style={styles.label}>{t('bridgeramp.destination.label')}</Text>
      {state.status === 'loading' && destinations.length === 0 && (
        <ActivityIndicator style={styles.spinner} />
      )}
      {destinations.map((d) => (
        <TouchableOpacity
          key={d.id}
          style={[styles.destination, d.id === selectedId && styles.destinationSelected]}
          onPress={() => onSelect(d.id)}
          testID={`bridgeramp-destination-${d.id}`}
        >
          <Text style={styles.destinationKey}>{d.key_masked}</Text>
          <Text style={styles.destinationMeta}>
            {d.holder
              ? `${d.holder.bank} · ${d.holder.name}`
              : t('bridgeramp.destination.verified')}
          </Text>
        </TouchableOpacity>
      ))}
      {destinations.length === 0 && state.status === 'loaded' && !registering && (
        <Text style={styles.helper}>{t('bridgeramp.destination.none')}</Text>
      )}

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, styles.addInput]}
          value={newKey}
          onChangeText={setNewKey}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('bridgeramp.destination.placeholder') ?? ''}
          placeholderTextColor={Colors.gray4}
          editable={!registering}
          testID="bridgeramp-destination-input"
        />
        <Button
          text={t('bridgeramp.destination.add')}
          onPress={onRegister}
          disabled={registering || newKey.trim().length < BRE_B_KEY_MIN_LENGTH}
          showLoading={registering}
          type={BtnTypes.SECONDARY}
          size={BtnSizes.SMALL}
          testID="bridgeramp-destination-add"
        />
      </View>
      {registering && (
        <Text style={styles.helper} testID="bridgeramp-destination-pending">
          {t('bridgeramp.destination.pending')}
        </Text>
      )}
      {!!rejected && (
        <Text style={styles.helperError} testID="bridgeramp-destination-rejected">
          {t(`bridgeramp.destination.rejected.${rejected}`, {
            defaultValue: t('bridgeramp.destination.rejected.other'),
          })}
        </Text>
      )}
      {state.registering.status === 'error' && (
        <Text style={styles.helperError} testID="bridgeramp-destination-failed">
          {t('bridgeramp.destination.registerFailed', { code: state.errorCode })}
        </Text>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Step 2: review and sign
// ---------------------------------------------------------------------------

function ReviewStep({ withdrawal, oracleStale }: { withdrawal: Withdrawal; oracleStale: boolean }) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const withdraw = useSelector(bridgeRampWithdrawSelector)
  const swap = useSelector(bridgeRampSwapSelector)
  const walletAddress = useSelector(walletAddressSelector)
  const copmTokenInfo = useTokenInfo(COPM_TOKEN_ID_MAINNET)
  const feeCurrencies = useSelector((state) =>
    feeCurrenciesSelector(state, NetworkId['celo-mainnet'])
  )
  const quote = withdraw.quote

  // Re-quote Mento for the review so the calls are built on a fresh price,
  // for exactly the COPm the user typed in step 1.
  const requiredUsdc = useMemo(
    () =>
      BigInt(new BigNumber(withdrawal.deposit.amount.amount).shiftedBy(USDC_DECIMALS).toFixed(0)),
    [withdrawal.deposit.amount.amount]
  )
  const copmAmountIn = useMemo(
    () => (withdraw.copmAmountIn ? BigInt(withdraw.copmAmountIn) : null),
    [withdraw.copmAmountIn]
  )
  const quoteState = useMentoQuote('copmToUsdc', copmAmountIn)

  const depositOk =
    withdrawal.deposit.chain === 'eip155:42220' &&
    withdrawal.deposit.token_contract.toLowerCase() === USDC_ADDRESS_CELO.toLowerCase()

  // The swap must guarantee at least what TuCOPRamp needs for the payout.
  const minOut =
    quoteState.state === 'ready' ? minAmountOut(quoteState.quote, BRIDGE_RAMP_SLIPPAGE_BPS) : null
  const rateMoved = minOut !== null && minOut < requiredUsdc

  const calls = useMemo(() => {
    if (quoteState.state !== 'ready' || !walletAddress || rateMoved || !depositOk) return null
    try {
      return buildBridgeWithdrawCalls({
        quote: quoteState.quote,
        user: walletAddress as Address,
        liquidationAddress: withdrawal.deposit.address,
      })
    } catch (error) {
      if (!(error instanceof StaleQuoteError) && !(error instanceof InvalidRecipientError)) {
        Logger.warn(TAG, 'could not build withdraw calls', error)
      }
      return null
    }
  }, [quoteState, walletAddress, withdrawal.deposit.address, rateMoved, depositOk])

  const prepare = useAsyncCallback(prepareBridgeRampCalls, {
    onError: (error) => Logger.warn(TAG, 'prepare failed', error),
  })
  useEffect(() => {
    if (!calls || !walletAddress || !copmTokenInfo || quoteState.state !== 'ready') {
      prepare.reset()
      return
    }
    prepare
      .execute({
        calls,
        from: walletAddress as Address,
        spendToken: copmTokenInfo,
        spendTokenAmount: quoteState.quote.amountIn,
        feeCurrencies,
      })
      .catch((error) => Logger.warn(TAG, 'prepare rejected', error))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, walletAddress, copmTokenInfo?.tokenId, feeCurrencies.length])

  const prepared = prepare.result
  const { feeCurrency, estimatedFeeAmount } = getFeeCurrencyAndAmounts(prepared)
  const submitting = swap.status === 'submitting' || swap.status === 'broadcast'
  const canConfirm =
    !!calls &&
    prepared?.type === 'possible' &&
    quoteState.state === 'ready' &&
    !submitting &&
    !oracleStale

  const onConfirm = () => {
    if (!canConfirm || !calls || prepared?.type !== 'possible' || quoteState.state !== 'ready')
      return
    const q: MentoQuote = quoteState.quote
    dispatch(
      executeBridgeRampSwap({
        flowId: withdrawal.id,
        direction: 'copmToUsdc',
        amountIn: q.amountIn.toString(),
        quotedAmountOut: q.amountOut.toString(),
        quotedAt: q.quotedAt,
        recipient: withdrawal.deposit.address,
        serializablePreparedTransactions: getSerializablePreparedTransactions(
          prepared.transactions
        ),
      })
    )
  }

  return (
    <View testID="bridgeramp-review">
      <Text style={styles.stepTitle}>{t('bridgeramp.review.title')}</Text>
      {quoteState.state === 'loading' && <ActivityIndicator style={styles.spinner} />}
      {quoteState.state === 'ready' && quote && (
        <View style={styles.quoteBox}>
          <Row
            label={t('bridgeramp.offramp.quoteIn')}
            value={formatCopm(quoteState.quote.amountInWhole)}
          />
          <Row
            label={t('bridgeramp.review.receive')}
            value={`${new BigNumber(quote.destination_amount.amount).toFormat(0)} pesos`}
          />
          <Row
            label={t('bridgeramp.review.tucopFee')}
            value={formatUsdc(new BigNumber(quote.fees.tucop.amount))}
          />
          <Row
            label={t('bridgeramp.review.bridgeRate')}
            value={`${new BigNumber(quote.rate.value).toFormat(2)} COP / USD`}
          />
          {feeCurrency && estimatedFeeAmount && (
            <Row
              label={t('bridgeramp.review.networkFee')}
              value={`${estimatedFeeAmount.toFormat(4)} ${feeCurrency.symbol}`}
            />
          )}
          <Text style={styles.quoteNote}>{t('bridgeramp.review.note')}</Text>
        </View>
      )}

      {!depositOk && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.review.badDeposit')}
          style={styles.noticeTop}
          testID="bridgeramp-bad-deposit"
        />
      )}
      {rateMoved && (
        <InLineNotification
          variant={NotificationVariant.Warning}
          description={t('bridgeramp.review.rateMoved')}
          ctaLabel={t('bridgeramp.review.startOver')}
          onPressCta={() => dispatch(withdrawReset())}
          style={styles.noticeTop}
          testID="bridgeramp-rate-moved"
        />
      )}
      {prepared && prepared.type !== 'possible' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.review.notEnoughForGas')}
          style={styles.noticeTop}
          testID="bridgeramp-no-gas"
        />
      )}
      {swap.status === 'failed' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t(`bridgeramp.swapError.${swap.errorCode}`, {
            defaultValue: t('bridgeramp.swapError.generic'),
          })}
          style={styles.noticeTop}
          testID="bridgeramp-swap-failed"
        />
      )}

      <Button
        text={t('bridgeramp.review.confirmCta')}
        onPress={onConfirm}
        disabled={!canConfirm}
        showLoading={submitting || prepare.loading}
        type={BtnTypes.PRIMARY}
        size={BtnSizes.FULL}
        style={styles.cta}
        testID="bridgeramp-confirm"
      />
      <Button
        text={t('bridgeramp.review.cancelCta')}
        onPress={() => dispatch(withdrawReset())}
        disabled={submitting}
        type={BtnTypes.SECONDARY}
        size={BtnSizes.FULL}
        style={styles.secondaryCta}
        testID="bridgeramp-cancel"
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Step 3: progress
// ---------------------------------------------------------------------------

function ProgressStep() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const withdraw = useSelector(bridgeRampWithdrawSelector)
  const swap = useSelector(bridgeRampSwapSelector)
  const withdrawal = withdraw.withdrawal

  const title =
    withdraw.status === 'completed'
      ? t('bridgeramp.progress.completedTitle')
      : withdraw.status === 'failed'
        ? t('bridgeramp.progress.failedTitle')
        : t('bridgeramp.progress.payingTitle')
  const body =
    withdraw.status === 'completed'
      ? t('bridgeramp.progress.completedBody', {
          amount: new BigNumber(withdrawal?.destination_amount.amount ?? 0).toFormat(0),
        })
      : withdraw.status === 'failed'
        ? t(`bridgeramp.payoutError.${withdraw.errorCode}`, {
            defaultValue: t('bridgeramp.payoutError.generic', { code: withdraw.errorCode }),
          })
        : t('bridgeramp.progress.payingBody')

  return (
    <View testID="bridgeramp-progress">
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {withdraw.status === 'awaiting_payout' && <ActivityIndicator style={styles.spinner} />}
      {!!swap.swapTxHash && (
        <View style={styles.hashBlock}>
          <Text style={styles.rowLabel}>{t('bridgeramp.progress.swapTx')}</Text>
          <Text style={styles.hash} selectable testID="bridgeramp-swap-hash">
            {swap.swapTxHash}
          </Text>
        </View>
      )}
      {withdrawal && <Row label={t('bridgeramp.progress.operationId')} value={withdrawal.id} />}
      {withdraw.errorCode === 'poll_timeout' && withdrawal && (
        <InLineNotification
          variant={NotificationVariant.Info}
          description={t('bridgeramp.progress.pollTimeout')}
          ctaLabel={t('bridgeramp.progress.refresh')}
          onPressCta={() => dispatch(pollBridgeRampWithdrawal({ withdrawalId: withdrawal.id }))}
          style={styles.noticeTop}
          testID="bridgeramp-poll-timeout"
        />
      )}
      {(withdraw.status === 'completed' || withdraw.status === 'failed') && (
        <Button
          text={t('bridgeramp.progress.doneCta')}
          onPress={() => dispatch(withdrawReset())}
          type={BtnTypes.PRIMARY}
          size={BtnSizes.FULL}
          style={styles.cta}
          testID="bridgeramp-done"
        />
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------

function formatCopm(whole: BigNumber): string {
  return `${whole.toFormat(0)} pesos digitales`
}

function formatUsdc(whole: BigNumber): string {
  return `${whole.toFormat(2)} USDC`
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
  section: { marginBottom: Spacing.Regular16 },
  stepTitle: { ...typeScale.titleSmall, color: Colors.black, marginBottom: Spacing.Small12 },
  body: { ...typeScale.bodyMedium, color: Colors.gray4, marginBottom: Spacing.Regular16 },
  notice: { marginBottom: Spacing.Regular16 },
  noticeTop: { marginTop: Spacing.Regular16 },
  label: { ...typeScale.labelSmall, color: Colors.gray4, marginBottom: Spacing.Smallest8 },
  input: {
    ...typeScale.bodyMedium,
    color: Colors.black,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: Spacing.Smallest8,
    padding: Spacing.Small12,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.Smallest8,
    marginTop: Spacing.Smallest8,
  },
  addInput: { flex: 1 },
  helper: { ...typeScale.bodySmall, color: Colors.gray4, marginTop: Spacing.Smallest8 },
  helperError: { ...typeScale.bodySmall, color: Colors.error, marginTop: Spacing.Smallest8 },
  spinner: { marginVertical: Spacing.Regular16 },
  destination: {
    padding: Spacing.Small12,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: Spacing.Smallest8,
    marginBottom: Spacing.Smallest8,
  },
  destinationSelected: { borderColor: Colors.black },
  destinationKey: { ...typeScale.labelSemiBoldMedium, color: Colors.black },
  destinationMeta: { ...typeScale.bodySmall, color: Colors.gray4 },
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
  fieldGap: { marginTop: Spacing.Regular16 },
  pickerValue: { ...typeScale.bodyMedium, color: Colors.black },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing.Regular16 },
  consentCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.gray3,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.Small12,
  },
  consentCheckboxChecked: { backgroundColor: Colors.black, borderColor: Colors.black },
  consentCheckmark: { ...typeScale.labelSmall, color: Colors.white },
  consentTextBlock: { flex: 1 },
  consentLabel: { ...typeScale.bodySmall, color: Colors.black },
  consentLink: { ...typeScale.labelSmall, color: Colors.accent, marginTop: Spacing.Tiny4 },
  hashBlock: { marginBottom: Spacing.Smallest8 },
  hash: { ...typeScale.bodyXSmall, color: Colors.black },
  cta: { marginTop: Spacing.Thick24 },
  secondaryCta: { marginTop: Spacing.Small12 },
})

export default BridgeRampWithdraw
