import BigNumber from 'bignumber.js'
import type { TFunction } from 'i18next'
import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  BRIDGE_MIN_COP,
  PartyBlocker,
  digitalPesosLabel,
  dollarsLabel,
  feeUnitLabel,
  formatCop,
  partyBlocker,
  pesosLabel,
} from 'src/bridgeramp/display'
import {
  COPM_DECIMALS,
  MentoQuote,
  USDC_ADDRESS_CELO,
  USDC_DECIMALS,
  minAmountOut,
} from 'src/bridgeramp/mentoRouter'
import { prepareBridgeRampCalls } from 'src/bridgeramp/prepare'
import {
  checkBridgeRampWithdrawSwap,
  createBridgeRampParty,
  estimateWithdrawCop,
  executeBridgeRampSwap,
  fetchBridgeRampDestinations,
  fetchBridgeRampParty,
  pollBridgeRampWithdrawal,
  registerBridgeRampDestination,
  startBridgeRampWithdraw,
  withdrawSwapFlowId,
} from 'src/bridgeramp/saga'
import {
  bridgeRampDestinationsSelector,
  bridgeRampPartySelector,
  bridgeRampSwapSelector,
  bridgeRampWithdrawSelector,
} from 'src/bridgeramp/selectors'
import { BridgeRampWithdrawStatus, withdrawReset } from 'src/bridgeramp/slice'
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

// A Bre-B key is a phone, a document, an email or an alphanumeric key; the
// server validates for real, this only stops obvious typos.
const BRE_B_KEY_MIN_LENGTH = 6
// Version of the consent text the user accepts in the onboarding form. Bump
// when `bridgeramp.onboarding.consent` changes; TuCOPRamp records it per app.
const BRIDGE_RAMP_CONSENT_VERSION = '2026-10-10'
const TUCOP_TERMS_URL = 'https://tucop.xyz/terminos-y-condiciones/'
// TuCOPRamp verifies people (individuals) here; NIT is a company document and
// POST /v1/parties refuses it for an individual.
type IndividualDocumentType = Exclude<DocumentType, 'NIT' | 'TI'>
// TuCOPRamp parties take CC, CE, NUIP and PAS for a person: NIT is a business
// document and TI a minor's (identity verification is for adults only).
const INDIVIDUAL_DOCUMENT_TYPES = DOCUMENT_TYPES.filter(
  (d): d is IndividualDocumentType => d !== 'NIT' && d !== 'TI'
)
// Results the user has seen; leaving the screen on one of these starts the
// next withdrawal from scratch.
const FINISHED_STATUSES: ReadonlySet<BridgeRampWithdrawStatus> = new Set([
  'completed',
  'failed',
  'start_failed',
])

interface Props {
  oracleStale: boolean
}

// Appends TuCOPRamp's request id, when there is one, so support can find the
// call.
export function withSupportCode(
  t: TFunction,
  message: string,
  requestId: string | null | undefined
): string {
  return requestId ? `${message}\n${t('bridgeramp.supportCode', { requestId })}` : message
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
  const partyReady = party.status === 'loaded' && !!party.value && partyCanTransact(party.value)

  useEffect(() => {
    dispatch(fetchBridgeRampParty())
    // A payout that was still owed when the app closed: follow it again.
    if (withdraw.status === 'awaiting_payout' && withdraw.withdrawal) {
      dispatch(pollBridgeRampWithdrawal({ withdrawalId: withdraw.withdrawal.id }))
    }
    // The swap was broadcast but its outcome was never seen (the app closed
    // while waiting): check that same transaction again.
    if (withdraw.status === 'review' && withdraw.withdrawal && withdraw.swapTxHash) {
      dispatch(checkBridgeRampWithdrawSwap())
    }
  }, [])

  // Destinations belong to a party: before onboarding TuCOPRamp answers
  // party_required. Ask once the party can transact (also after onboarding
  // or KYC finishes while the screen is open).
  useEffect(() => {
    if (partyReady) dispatch(fetchBridgeRampDestinations())
  }, [partyReady])

  // Leaving the screen after a result (or a failed start) resets the
  // withdrawal, so coming back starts a new one.
  const statusRef = useRef(withdraw.status)
  statusRef.current = withdraw.status
  useEffect(
    () => () => {
      if (FINISHED_STATUSES.has(statusRef.current)) dispatch(withdrawReset())
    },
    []
  )

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
          {t('bridgeramp.amountBelowMin', { min: formatCop(BRIDGE_MIN_COP) })}
        </Text>
      )}
      {exceedsBalance && (
        <Text style={styles.helperError} testID="bridgeramp-insufficient">
          {t('bridgeramp.insufficientBalance', {
            balance: formatCop(copmTokenInfo?.balance ?? 0),
          })}
        </Text>
      )}

      {quoteState.state === 'loading' && <ActivityIndicator style={styles.spinner} />}
      {quoteState.state === 'ready' && (
        <View style={styles.quoteBox} testID="bridgeramp-quote">
          <Row
            label={t('bridgeramp.offramp.quoteIn')}
            value={digitalPesosLabel(t, quoteState.quote.amountInWhole)}
          />
          <Row
            label={t('bridgeramp.offramp.quoteOut')}
            value={dollarsLabel(t, quoteState.quote.amountOutWhole)}
          />
          <Row
            label={t('bridgeramp.rateLabel')}
            value={t('bridgeramp.units.rate', { rate: quoteState.quote.copPerUsd.toFormat(2) })}
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
      {withdraw.status === 'start_failed' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={withSupportCode(
            t,
            t(`bridgeramp.withdraw.startError.${withdraw.errorCode}`, {
              defaultValue: t('bridgeramp.withdraw.startFailed', { code: withdraw.errorCode }),
              min: formatCop(
                withdraw.withdrawal?.deposit.minimum_destination_amount?.amount ?? BRIDGE_MIN_COP
              ),
            }),
            withdraw.errorRequestId
          )}
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

// Party state shared by the deposit and the withdraw screens: loading,
// onboarding form, or what is still missing before the party can transact.
export function PartySection() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const party = useSelector(bridgeRampPartySelector)
  const blocker = party.status === 'loaded' && party.value ? partyBlocker(party.value) : null

  // Verification and the terms happen in the browser; when the user comes
  // back to the app with something pending, ask TuCOPRamp again instead of
  // making them tap retry.
  useEffect(() => {
    if (!blocker) return
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') dispatch(fetchBridgeRampParty())
    })
    return () => sub.remove()
  }, [blocker])

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
  if (blocker) {
    const link = blockerLink(blocker, party.value.links)
    return (
      <InLineNotification
        variant={
          BLOCKER_IS_FINAL[blocker] ? NotificationVariant.Error : NotificationVariant.Warning
        }
        title={t(`bridgeramp.party.state.${blocker}.title`)}
        description={t(`bridgeramp.party.state.${blocker}.body`)}
        ctaLabel={link ? t(link.label) : undefined}
        onPressCta={link ? () => dispatch(openUrl(link.url, true)) : undefined}
        ctaLabel2={t('bridgeramp.party.refresh')}
        onPressCta2={() => dispatch(fetchBridgeRampParty())}
        style={styles.notice}
        testID="bridgeramp-party-pending"
      />
    )
  }
  return null
}

// Blockers only support can lift.
const BLOCKER_IS_FINAL: Record<PartyBlocker, boolean> = {
  restricted: true,
  rejected: true,
  suspended: true,
  under_review: false,
  kyc_incomplete: false,
  tos_pending: false,
  endorsement_pending: false,
}

// The hosted page that moves the party forward, when there is one.
function blockerLink(
  blocker: PartyBlocker,
  links: { kyc?: string; tos?: string } | undefined
): { url: string; label: string } | null {
  if (blocker === 'kyc_incomplete' && links?.kyc) {
    return { url: links.kyc, label: 'bridgeramp.party.openKyc' }
  }
  if (blocker === 'tos_pending') {
    if (links?.tos) return { url: links.tos, label: 'bridgeramp.party.openTos' }
    // Bridge's KYC page also collects the terms when there is no separate link.
    if (links?.kyc) return { url: links.kyc, label: 'bridgeramp.party.openTos' }
  }
  return null
}

// CC and NUIP are issued only to Colombians, so they also settle the
// nationality; for CE and passports it is left for the verification to read.
const COLOMBIAN_ONLY_DOCUMENTS: ReadonlySet<IndividualDocumentType> = new Set(['CC', 'NUIP'])

// Creates the party on TuCOPRamp for this wallet: names, identity
// document, contact email and consent. The answer carries the hosted KYC and
// TOS links, which PartySection then shows as "verification pending".
function PartyOnboardingForm() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const party = useSelector(bridgeRampPartySelector)
  // Prefill from the TuCOP Ramp profile when the user already has one; the
  // document number is never echoed by the server, so it is always typed.
  const tucopRampProfile = useSelector(userProfileSelector)

  const [firstNames, setFirstNames] = useState('')
  const [lastNames, setLastNames] = useState('')
  const [documentType, setDocumentType] = useState<IndividualDocumentType>(
    INDIVIDUAL_DOCUMENT_TYPES.find((d) => d === tucopRampProfile?.document_type) ?? 'CC'
  )
  const [documentNumber, setDocumentNumber] = useState('')
  const [email, setEmail] = useState(tucopRampProfile?.primary_email ?? '')
  const [consent, setConsent] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const nameValid = firstNames.trim().length > 0 && lastNames.trim().length > 0
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
          country: 'COL',
          first_names: firstNames.trim().replace(/\s+/g, ' '),
          last_names: lastNames.trim().replace(/\s+/g, ' '),
          ...(COLOMBIAN_ONLY_DOCUMENTS.has(documentType) ? { nationality: 'COL' } : {}),
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

      <Text style={styles.label}>{t('bridgeramp.onboarding.firstNames')}</Text>
      <TextInput
        style={styles.input}
        value={firstNames}
        onChangeText={setFirstNames}
        autoCapitalize="words"
        placeholder={t('bridgeramp.onboarding.namesPlaceholder') ?? ''}
        placeholderTextColor={Colors.gray4}
        editable={!submitting}
        testID="bridgeramp-onboarding-first-names"
      />

      <Text style={[styles.label, styles.fieldGap]}>{t('bridgeramp.onboarding.lastNames')}</Text>
      <TextInput
        style={styles.input}
        value={lastNames}
        onChangeText={setLastNames}
        autoCapitalize="words"
        placeholder={t('bridgeramp.onboarding.namesPlaceholder') ?? ''}
        placeholderTextColor={Colors.gray4}
        editable={!submitting}
        testID="bridgeramp-onboarding-last-names"
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
      <PickerModal<IndividualDocumentType>
        visible={pickerOpen}
        title={t('tucopramp.documentType.pickerTitle')}
        options={INDIVIDUAL_DOCUMENT_TYPES.map((value) => ({
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
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent, disabled: submitting }}
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
          description={withSupportCode(
            t,
            t(`bridgeramp.onboarding.error.${party.onboarding.errorCode}`, {
              defaultValue: t('bridgeramp.onboarding.error.generic', {
                code: party.onboarding.errorCode,
              }),
            }),
            party.onboarding.errorRequestId
          )}
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
      {state.status === 'error' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.destination.loadError')}
          ctaLabel={t('bridgeramp.retry')}
          onPressCta={() => dispatch(fetchBridgeRampDestinations())}
          style={styles.notice}
          testID="bridgeramp-destinations-error"
        />
      )}
      {destinations.map((d) => (
        <TouchableOpacity
          key={d.id}
          style={[styles.destination, d.id === selectedId && styles.destinationSelected]}
          onPress={() => onSelect(d.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: d.id === selectedId }}
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
          {destinationErrorMessage(t, state.errorCode)}
        </Text>
      )}
    </View>
  )
}

function destinationErrorMessage(t: TFunction, code: string | null): string {
  // A real 409 from TuCOPRamp: the key is on this party already.
  if (code === 'destination_already_registered')
    return t('bridgeramp.destination.alreadyRegistered')
  // The directory did not answer while we polled; same advice as a rejection.
  if (code === 'verification_timeout')
    return t('bridgeramp.destination.rejected.verification_timeout')
  return t(`bridgeramp.destination.error.${code}`, {
    defaultValue: t('bridgeramp.destination.registerFailed', { code }),
  })
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
  // Bumped by the retry on the inline notices: re-quote and re-price now.
  const [retryKey, setRetryKey] = useState(0)

  // Re-quote Mento for the review so the calls are built on a fresh price,
  // for exactly the COPm the user typed in step 1.
  const copmAmountIn = useMemo(
    () => (withdraw.copmAmountIn ? BigInt(withdraw.copmAmountIn) : null),
    [withdraw.copmAmountIn]
  )
  const quoteState = useMentoQuote('copmToUsdc', copmAmountIn, undefined, retryKey)

  const depositOk =
    withdrawal.deposit.chain === 'eip155:42220' &&
    withdrawal.deposit.token_contract.toLowerCase() === USDC_ADDRESS_CELO.toLowerCase()

  // The address pays out anything at or above Bridge's floor; re-check the
  // estimate on the fresh Mento price so a moved rate cannot drop it below.
  const minOut =
    quoteState.state === 'ready' ? minAmountOut(quoteState.quote, BRIDGE_RAMP_SLIPPAGE_BPS) : null
  const estimatedCop =
    minOut !== null && quote
      ? estimateWithdrawCop(
          new BigNumber(minOut.toString()).shiftedBy(-USDC_DECIMALS).toFixed(),
          quote.rate.value,
          withdrawal.fee_bps ?? 0
        )
      : null
  const minCop = new BigNumber(
    withdrawal.deposit.minimum_destination_amount?.amount ?? BRIDGE_MIN_COP
  )
  const rateMoved = estimatedCop !== null && estimatedCop.isLessThan(minCop)

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
  }, [calls, walletAddress, copmTokenInfo?.tokenId, feeCurrencies.length, retryKey])

  const prepared = prepare.result
  const { feeCurrency, estimatedFeeAmount } = getFeeCurrencyAndAmounts(prepared)
  const submitting = swap.status === 'submitting' || swap.status === 'broadcast'
  const flowId = withdrawSwapFlowId(withdrawal.id, withdraw.attemptId)
  // The last attempt for this withdrawal was sent but not confirmed (receipt
  // unknown, or the app restarted while waiting): the button only checks it.
  // The saga waits for the same transaction and never signs, so it needs no
  // fresh quote or pricing, which would fail anyway once the swap landed
  // and the COPm left. Cancelling now would lose track of a swap that may
  // still deliver.
  const receiptUnknown =
    !submitting &&
    ((swap.status === 'failed' && swap.errorCode === 'receipt_unknown' && swap.flowId === flowId) ||
      !!withdraw.swapTxHash)
  const retry = () => setRetryKey((k) => k + 1)
  // Never sign while a refresh is pricing new calldata: the result on screen
  // belongs to the previous quote.
  const canConfirm = receiptUnknown
    ? !submitting
    : !!calls &&
      prepared?.type === 'possible' &&
      !prepare.loading &&
      quoteState.state === 'ready' &&
      !submitting &&
      !oracleStale

  const onConfirm = () => {
    if (receiptUnknown) {
      if (canConfirm) dispatch(checkBridgeRampWithdrawSwap())
      return
    }
    if (!canConfirm || !calls || prepared?.type !== 'possible' || quoteState.state !== 'ready')
      return
    const q: MentoQuote = quoteState.quote
    dispatch(
      executeBridgeRampSwap({
        flowId,
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
            value={digitalPesosLabel(t, quoteState.quote.amountInWhole)}
          />
          <Row label={t('bridgeramp.review.receive')} value={pesosLabel(t, estimatedCop ?? 0)} />
          <Row
            label={t('bridgeramp.review.tucopFee')}
            value={`${new BigNumber(withdrawal.fee_bps ?? 0).dividedBy(100).toFormat()} %`}
          />
          <Row
            label={t('bridgeramp.review.bridgeRate')}
            value={t('bridgeramp.units.rate', {
              rate: new BigNumber(quote.rate.value).toFormat(2),
            })}
          />
          {feeCurrency && estimatedFeeAmount && (
            <Row
              label={t('bridgeramp.review.networkFee')}
              value={`${estimatedFeeAmount.toFormat(4)} ${feeUnitLabel(t, feeCurrency.symbol)}`}
            />
          )}
          <Text style={styles.quoteNote}>{t('bridgeramp.review.note')}</Text>
        </View>
      )}

      {quoteState.state === 'oracle-unavailable' && (
        <InLineNotification
          variant={NotificationVariant.Warning}
          description={t('bridgeramp.review.marketClosed')}
          ctaLabel={t('bridgeramp.retry')}
          onPressCta={retry}
          style={styles.noticeTop}
          testID="bridgeramp-review-market-closed"
        />
      )}
      {quoteState.state === 'error' && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.review.quoteFailed')}
          ctaLabel={t('bridgeramp.retry')}
          onPressCta={retry}
          style={styles.noticeTop}
          testID="bridgeramp-review-quote-error"
        />
      )}
      {!!prepare.error && !prepare.loading && (
        <InLineNotification
          variant={NotificationVariant.Error}
          description={t('bridgeramp.review.prepareFailed')}
          ctaLabel={t('bridgeramp.retry')}
          onPressCta={retry}
          style={styles.noticeTop}
          testID="bridgeramp-review-prepare-error"
        />
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
          description={t('bridgeramp.review.rateMoved', { min: formatCop(minCop) })}
          ctaLabel={receiptUnknown ? undefined : t('bridgeramp.review.startOver')}
          onPressCta={receiptUnknown ? undefined : () => dispatch(withdrawReset())}
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
      {receiptUnknown && swap.status !== 'failed' && (
        <InLineNotification
          variant={NotificationVariant.Warning}
          description={t('bridgeramp.swapError.receipt_unknown')}
          style={styles.noticeTop}
          testID="bridgeramp-swap-unconfirmed"
        />
      )}

      <Button
        text={
          receiptUnknown ? t('bridgeramp.review.checkStatusCta') : t('bridgeramp.review.confirmCta')
        }
        onPress={onConfirm}
        disabled={!canConfirm}
        showLoading={submitting || (!receiptUnknown && prepare.loading)}
        type={BtnTypes.PRIMARY}
        size={BtnSizes.FULL}
        style={styles.cta}
        testID="bridgeramp-confirm"
      />
      <Button
        text={t('bridgeramp.review.cancelCta')}
        onPress={() => dispatch(withdrawReset())}
        disabled={submitting || receiptUnknown}
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
  const swapTxHash = withdraw.swapTxHash ?? swap.swapTxHash
  const title =
    withdraw.status === 'completed'
      ? t('bridgeramp.progress.completedTitle')
      : withdraw.status === 'failed'
        ? t('bridgeramp.progress.failedTitle')
        : t('bridgeramp.progress.payingTitle')
  const body =
    withdraw.status === 'completed'
      ? t('bridgeramp.progress.completedBody', {
          amount: formatCop(
            withdraw.payout?.destination_amount?.amount ?? withdraw.estimatedCop ?? 0
          ),
        })
      : withdraw.status === 'failed'
        ? t(`bridgeramp.payoutError.${withdraw.errorCode}`, {
            defaultValue: t('bridgeramp.payoutError.generic', { code: withdraw.errorCode }),
          })
        : // TuCOPRamp asks us to quote the window it reports rather than hard-code
          // one, since it can move. Fall back to the vaguer line when the address
          // was stored before the field existed.
          withdrawal?.settlement_time
          ? t('bridgeramp.progress.payingBodyWindow', {
              min: withdrawal.settlement_time.min_minutes,
              max: withdrawal.settlement_time.max_minutes,
            })
          : t('bridgeramp.progress.payingBody')

  return (
    <View testID="bridgeramp-progress">
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {withdraw.status === 'awaiting_payout' && <ActivityIndicator style={styles.spinner} />}
      {!!swapTxHash && (
        <View style={styles.hashBlock}>
          <Text style={styles.rowLabel}>{t('bridgeramp.progress.swapTx')}</Text>
          <Text style={styles.hash} selectable testID="bridgeramp-swap-hash">
            {swapTxHash}
          </Text>
        </View>
      )}
      {/* Bridge's payout id is what identifies this withdrawal; the address
          id is shared by every withdrawal to the same key. */}
      {!!withdraw.payout && (
        <Row label={t('bridgeramp.progress.operationId')} value={withdraw.payout.id} />
      )}
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

export function Row({ label, value }: { label: string; value: string }) {
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
