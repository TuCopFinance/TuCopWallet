import { createAction, PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { Address, Hex, decodeFunctionData, erc20Abi } from 'viem'
import {
  COPM_DECIMALS,
  MENTO_ROUTER_ABI,
  MENTO_ROUTER_ADDRESS_CELO,
  MentoDirection,
  MentoOracleUnavailableError,
  USDC_DECIMALS,
  inputTokenFor,
  quoteMentoSwap,
} from 'src/bridgeramp/mentoRouter'
import { Actions as AccountActions } from 'src/account/actions'
import { prepareBridgeRampCalls } from 'src/bridgeramp/prepare'
import {
  CreatePartyRequest,
  createDepositAccount,
  Destination,
  Withdrawal,
  createFirstPartyDestination,
  createParty,
  createWithdrawQuote,
  createWithdrawal,
  getDestination,
  getParty,
  getWithdrawal,
  listDestinations,
} from 'src/bridgeramp/api'
import { openWalletPartySession } from 'src/bridgeramp/platformClient'
import { revokeBridgeRampSessionSaga } from 'src/bridgeramp/revokeSession'
import {
  bridgeRampDepositSelector,
  bridgeRampSessionSelector,
  bridgeRampSwapSelector,
  bridgeRampWithdrawSelector,
} from 'src/bridgeramp/selectors'
import {
  BridgeRampSwapErrorCode,
  destinationRegisterFailed,
  destinationRegistering,
  destinationUpdated,
  destinationsFailed,
  destinationsLoaded,
  depositBaselineUpdated,
  depositCreating,
  depositDetected,
  depositFailed,
  depositReady,
  depositSettled,
  destinationsLoading,
  onboardingFailed,
  onboardingSubmitting,
  partyFailed,
  partyLoaded,
  partyLoading,
  partyNeedsOnboarding,
  sessionCleared,
  sessionOpened,
  swapBroadcast,
  swapConfirmed,
  swapFailed,
  swapSubmitting,
  withdrawAwaitingPayout,
  withdrawCreating,
  withdrawFailed,
  withdrawPollTimedOut,
  withdrawReady,
  withdrawPayoutUpdated,
  payoutOutcome,
} from 'src/bridgeramp/slice'
import {
  BRIDGE_RAMP_QUOTE_TTL_SECONDS,
  buildBridgeDepositConversionCalls,
} from 'src/bridgeramp/swapCalls'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { BaseStandbyTransaction } from 'src/transactions/slice'
import { NetworkId, TokenTransactionTypeV2, newTransactionContext } from 'src/transactions/types'
import { TucopRampError } from 'src/tucopramp/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import {
  SerializableTransactionRequest,
  getSerializablePreparedTransactions,
} from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import { clearFlow, findRecordByIndexSelector } from 'src/viem/sentTransactionLog'
import { getKeychainAccounts } from 'src/web3/contracts'
import { KeychainAccounts } from 'src/web3/KeychainAccounts'
import networkConfig, { networkIdToNetwork } from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { call, delay, put, select, takeEvery, takeLatest, takeLeading } from 'typed-redux-saga'

const TAG = 'bridgeramp/saga'

export interface ExecuteBridgeRampSwapPayload {
  flowId: string
  direction: MentoDirection
  // Base units as decimal strings (see slice).
  amountIn: string
  quotedAmountOut: string
  quotedAt: number
  // Expected output recipient: the user's liquidation address (withdraw) or
  // the user's own wallet (deposit conversion). Checked against the calldata
  // before anything is signed.
  recipient: Address
  // [approve, swap] from prepareBridgeRampCalls, already fee-priced.
  serializablePreparedTransactions: SerializableTransactionRequest[]
}

export const executeBridgeRampSwap =
  createAction<ExecuteBridgeRampSwapPayload>('bridgeramp/executeSwap')

export class RampTransactionGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RampTransactionGuardError'
  }
}

// Last line of defence before signing: the two transactions must be exactly
// "approve the Router for amountIn of the input token" and "swap amountIn on
// the Router with the output going to `recipient`". The screen builds these
// itself, but a stale closure or a bug upstream must never turn into a swap
// whose USDC lands somewhere else.
export function assertRampTransactions(
  txs: Pick<SerializableTransactionRequest, 'to' | 'data'>[],
  expected: { direction: MentoDirection; amountIn: bigint; recipient: Address }
) {
  if (txs.length !== 2) {
    throw new RampTransactionGuardError(`expected 2 transactions, got ${txs.length}`)
  }
  const [approveTx, swapTx] = txs
  const inputToken = inputTokenFor(expected.direction).toLowerCase()

  if ((approveTx.to ?? '').toLowerCase() !== inputToken) {
    throw new RampTransactionGuardError('approve is not on the input token')
  }
  const approve = decodeFunctionData({ abi: erc20Abi, data: (approveTx.data ?? '0x') as Hex })
  if (approve.functionName !== 'approve') {
    throw new RampTransactionGuardError(`first tx is ${approve.functionName}, not approve`)
  }
  const [spender, allowance] = approve.args as readonly [Address, bigint]
  if (spender.toLowerCase() !== MENTO_ROUTER_ADDRESS_CELO.toLowerCase()) {
    throw new RampTransactionGuardError('approve spender is not the Mento Router')
  }
  if (allowance !== expected.amountIn) {
    throw new RampTransactionGuardError('approve amount does not match amountIn')
  }

  if ((swapTx.to ?? '').toLowerCase() !== MENTO_ROUTER_ADDRESS_CELO.toLowerCase()) {
    throw new RampTransactionGuardError('swap is not on the Mento Router')
  }
  const swap = decodeFunctionData({ abi: MENTO_ROUTER_ABI, data: (swapTx.data ?? '0x') as Hex })
  if (swap.functionName !== 'swapExactTokensForTokens') {
    throw new RampTransactionGuardError(`second tx is ${swap.functionName}, not a swap`)
  }
  const [amountIn, , routes, to] = swap.args as unknown as readonly [
    bigint,
    bigint,
    readonly { from: Address; to: Address }[],
    Address,
    bigint,
  ]
  if (amountIn !== expected.amountIn) {
    throw new RampTransactionGuardError('swap amountIn does not match')
  }
  if (routes.length === 0 || routes[0].from.toLowerCase() !== inputToken) {
    throw new RampTransactionGuardError('swap route does not start at the input token')
  }
  if (to.toLowerCase() !== expected.recipient.toLowerCase()) {
    throw new RampTransactionGuardError('swap recipient does not match')
  }
}

function tokenIdsFor(direction: MentoDirection): { inTokenId: string; outTokenId: string } {
  return direction === 'copmToUsdc'
    ? { inTokenId: networkConfig.copmTokenId, outTokenId: networkConfig.usdcTokenId }
    : { inTokenId: networkConfig.usdcTokenId, outTokenId: networkConfig.copmTokenId }
}

function wholeAmount(baseUnits: string, direction: MentoDirection, side: 'in' | 'out'): string {
  const decimals = (direction === 'copmToUsdc') === (side === 'in') ? COPM_DECIMALS : USDC_DECIMALS
  return new BigNumber(baseUnits).shiftedBy(-decimals).toString()
}

// Index of the swap in the [approve, swap] pair sent by sendPreparedTransactions.
const SWAP_TX_INDEX = 1

// The sendPreparedTransactions idempotency key for a ramp swap.
function sentLogFlowId(flowId: string): string {
  return `bridgeramp-${flowId}`
}

// Signs and broadcasts the [approve, swap] pair, then waits for the swap
// receipt. The swap is one transaction with the output delivered straight
// to `recipient`, so for the off-ramp a revert means the user still has
// every COPm (minus gas) and nothing reached Bridge; there is no partial
// state to clean up.
//
// The per-flowId sent-tx record is cleared once the outcome is known
// (mined, success or revert), so the next attempt signs fresh transactions.
// When the receipt cannot be read the record is kept: a retry with the same
// flowId only waits for that transaction and never signs a second one.
export function* executeBridgeRampSwapSaga(action: PayloadAction<ExecuteBridgeRampSwapPayload>) {
  const {
    flowId,
    direction,
    amountIn,
    quotedAmountOut,
    quotedAt,
    recipient,
    serializablePreparedTransactions,
  } = action.payload
  const logFlowId = sentLogFlowId(flowId)
  yield* put(swapSubmitting({ flowId, direction, amountIn, quotedAmountOut, recipient }))

  const fail = function* (code: BridgeRampSwapErrorCode, error: Error, actionName: string) {
    Logger.warn(TAG, `swap ${flowId} failed: ${actionName}`, error)
    yield* put(swapFailed({ code }))
    captureBusinessError(error, {
      feature: 'bridgeramp',
      provider: 'mento',
      action: actionName,
      errorCode: code,
      extra: { direction },
    })
  }

  let swapHash: Hex
  let approveHash: Hex | null = null
  // A swap already broadcast for this flow (receipt unknown last time, or the
  // app closed while waiting): only wait for it. Nothing is signed, so the
  // quote age and the new calldata do not matter.
  const alreadySent = yield* select(findRecordByIndexSelector, logFlowId, SWAP_TX_INDEX)
  if (alreadySent && alreadySent.status !== 'failed') {
    const approveRecord = yield* select(findRecordByIndexSelector, logFlowId, 0)
    swapHash = alreadySent.hash as Hex
    approveHash = (approveRecord?.hash as Hex | undefined) ?? null
    Logger.info(TAG, `swap ${flowId} already broadcast, waiting for its receipt`, swapHash)
    yield* put(swapBroadcast({ approveTxHash: approveHash, swapTxHash: swapHash }))
  } else {
    const now = Math.floor(Date.now() / 1000)
    if (now - quotedAt > BRIDGE_RAMP_QUOTE_TTL_SECONDS) {
      yield* fail('stale_quote', new Error('quote expired before signing'), 'swap_stale_quote')
      return
    }
    try {
      assertRampTransactions(serializablePreparedTransactions, {
        direction,
        amountIn: BigInt(amountIn),
        recipient,
      })
    } catch (err) {
      yield* fail(
        'invalid_recipient',
        err instanceof Error ? err : new Error(String(err)),
        'swap_guard_rejected'
      )
      return
    }

    const networkId = NetworkId['celo-mainnet']
    const { inTokenId, outTokenId } = tokenIdsFor(direction)
    const approveContext = newTransactionContext(TAG, `Bridge Ramp approve ${flowId}`)
    const swapContext = newTransactionContext(TAG, `Bridge Ramp swap ${flowId}`)

    const createApproveStandbyTx = (
      transactionHash: string,
      feeCurrencyId?: string
    ): BaseStandbyTransaction => ({
      context: approveContext,
      networkId,
      type: TokenTransactionTypeV2.Approval,
      transactionHash,
      tokenId: inTokenId,
      approvedAmount: wholeAmount(amountIn, direction, 'in'),
      feeCurrencyId,
    })
    // Off-ramp: from the user's ledger this is COPm leaving towards Bridge, so
    // it shows as a send to the liquidation address. On-ramp conversion: a
    // plain USDC -> COPm swap back into the same wallet.
    const createSwapStandbyTx = (
      transactionHash: string,
      feeCurrencyId?: string
    ): BaseStandbyTransaction =>
      direction === 'copmToUsdc'
        ? {
            context: swapContext,
            networkId,
            type: TokenTransactionTypeV2.Sent,
            amount: { value: `-${wholeAmount(amountIn, direction, 'in')}`, tokenId: inTokenId },
            address: recipient,
            metadata: {},
            transactionHash,
            feeCurrencyId,
          }
        : {
            context: swapContext,
            networkId,
            type: TokenTransactionTypeV2.SwapTransaction,
            inAmount: {
              value: wholeAmount(quotedAmountOut, direction, 'out'),
              tokenId: outTokenId,
            },
            outAmount: { value: wholeAmount(amountIn, direction, 'in'), tokenId: inTokenId },
            transactionHash,
            feeCurrencyId,
          }

    try {
      const hashes = yield* call(
        sendPreparedTransactions,
        serializablePreparedTransactions,
        networkId,
        [createApproveStandbyTx, createSwapStandbyTx],
        false,
        logFlowId
      )
      ;[approveHash, swapHash] = hashes
      yield* put(swapBroadcast({ approveTxHash: approveHash, swapTxHash: swapHash }))
    } catch (err) {
      // If the swap itself made it out before the error, it may still land:
      // keep its record and report it as unconfirmed, never as "not sent".
      const sentSwap = yield* select(findRecordByIndexSelector, logFlowId, SWAP_TX_INDEX)
      const broadcast = !!sentSwap && sentSwap.status !== 'failed'
      yield* fail(
        broadcast ? 'receipt_unknown' : 'broadcast_failed',
        err instanceof Error ? err : new Error(String(err)),
        broadcast ? 'swap_receipt_failed' : 'swap_broadcast_failed'
      )
      return
    }
  }

  try {
    const receipt = yield* call(
      [publicClient[networkIdToNetwork[NetworkId['celo-mainnet']]], 'waitForTransactionReceipt'],
      { hash: swapHash }
    )
    // Mined: the outcome is final either way, so the next attempt for this
    // flowId must sign new transactions instead of replaying these hashes.
    yield* put(clearFlow({ flowId: logFlowId }))
    if (receipt.status !== 'success') {
      yield* fail('reverted', new Error(`Bridge Ramp swap reverted: ${swapHash}`), 'swap_reverted')
      return
    }
    yield* put(swapConfirmed({ confirmedAt: Math.floor(Date.now() / 1000) }))
    Logger.info(TAG, `swap ${flowId} confirmed`, swapHash)
  } catch (err) {
    // The tx was broadcast; we just could not confirm it from here. Keep the
    // sent-tx record so a retry waits for this same transaction.
    yield* fail(
      'receipt_unknown',
      err instanceof Error ? err : new Error(String(err)),
      'swap_receipt_failed'
    )
  }
}

// ---------------------------------------------------------------------------
// TuCOPRamp side: session, party, destinations, withdraw operation
// ---------------------------------------------------------------------------

export const fetchBridgeRampParty = createAction('bridgeramp/fetchParty')
export const fetchBridgeRampDestinations = createAction('bridgeramp/fetchDestinations')
export const createBridgeRampParty = createAction<{
  request: CreatePartyRequest
  idempotencyKey: string
}>('bridgeramp/createParty')
export const registerBridgeRampDestination = createAction<{
  breBKey: string
  idempotencyKey: string
}>('bridgeramp/registerDestination')
export interface StartBridgeRampWithdrawPayload {
  destinationId: string
  // COPm the user is sending, base units as a decimal string.
  copmAmountIn: string
  // Whole USDC (decimal string) the swap is guaranteed to deliver, i.e. the
  // Mento quote's amountOutMin. The COP estimate is computed for this.
  usdcMinOut: string
  idempotencyKey: string
}
export const startBridgeRampWithdraw = createAction<StartBridgeRampWithdrawPayload>(
  'bridgeramp/startWithdraw'
)
export const pollBridgeRampWithdrawal = createAction<{ withdrawalId: string }>(
  'bridgeramp/pollWithdrawal'
)

// Reopen when less than this is left, so a request never races the expiry.
const SESSION_MIN_REMAINING_SECONDS = 60
const DESTINATION_POLL_DELAY_MS = 5_000
// The Bre-B directory answers in about a minute; TuCOPRamp gives up at 5.
const DESTINATION_POLL_MAX_ATTEMPTS = 66
const WITHDRAWAL_POLL_DELAY_MS = 10_000
// Bridge payouts take minutes; stop asking after 20.
const WITHDRAWAL_POLL_MAX_ATTEMPTS = 120

function errorCodeOf(err: unknown, fallback: string): string {
  return err instanceof TucopRampError ? err.code : fallback
}

function requestIdOf(err: unknown): string | undefined {
  return err instanceof TucopRampError ? err.request_id : undefined
}

function isSessionError(err: unknown): boolean {
  return (
    err instanceof TucopRampError &&
    (err.code === 'party_session_invalid' || err.code === 'party_session_required')
  )
}

// Returns a usable party session token, opening a new one with a wallet
// signature when there is none or it is about to expire. Throws when the
// wallet is missing or TuCOPRamp refuses.
export function* ensurePartySession(force = false) {
  const now = Math.floor(Date.now() / 1000)
  const existing = yield* select(bridgeRampSessionSelector)
  if (!force && existing && existing.expiresAt - now > SESSION_MIN_REMAINING_SECONDS) {
    return existing.token
  }
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    throw new Error('no_wallet')
  }
  const keychainAccounts: KeychainAccounts = yield* call(getKeychainAccounts)
  const session = yield* call(openWalletPartySession, walletAddress as Address, keychainAccounts)
  yield* put(
    sessionOpened({
      token: session.token,
      expiresAt: Math.floor(new Date(session.expires_at).getTime() / 1000),
      partyId: session.party_id,
    })
  )
  return session.token
}

// Runs a session-bound API call; on a session error it opens a fresh session
// once and retries, so a token that expired in the background is invisible
// to the caller.
function* withSession<T>(request: (token: string) => Promise<T>) {
  let token = yield* call(ensurePartySession)
  try {
    return yield* call(request, token)
  } catch (err) {
    if (!isSessionError(err)) throw err
    yield* put(sessionCleared())
    token = yield* call(ensurePartySession, true)
    return yield* call(request, token)
  }
}

export function* fetchPartySaga() {
  yield* put(partyLoading())
  try {
    const party = yield* withSession((token) => getParty(token))
    yield* put(partyLoaded(party))
  } catch (err) {
    if (err instanceof TucopRampError && err.code === 'party_required') {
      yield* put(partyNeedsOnboarding())
      return
    }
    Logger.warn(TAG, 'fetchParty failed', err)
    yield* put(partyFailed({ code: errorCodeOf(err, 'party_fetch_failed') }))
  }
}

// Creates (or links) the party for this wallet. TuCOPRamp answers with the
// party and its hosted KYC / TOS links; the screen shows them as pending.
export function* createPartySaga(
  action: PayloadAction<{ request: CreatePartyRequest; idempotencyKey: string }>
) {
  const { request, idempotencyKey } = action.payload
  yield* put(onboardingSubmitting())
  try {
    const { party } = yield* withSession((token) => createParty(token, request, idempotencyKey))
    yield* put(partyLoaded(party))
  } catch (err) {
    Logger.warn(TAG, 'createParty failed', err)
    yield* put(
      onboardingFailed({
        code: errorCodeOf(err, 'party_create_failed'),
        requestId: requestIdOf(err),
      })
    )
  }
}

function* fetchDestinationsSaga() {
  yield* put(destinationsLoading())
  try {
    const destinations = yield* withSession((token) => listDestinations(token))
    yield* put(destinationsLoaded(destinations))
  } catch (err) {
    Logger.warn(TAG, 'fetchDestinations failed', err)
    yield* put(destinationsFailed({ code: errorCodeOf(err, 'destinations_fetch_failed') }))
  }
}

// Registers the user's own Bre-B key and follows it until the Bre-B
// directory has answered (verified or rejected).
export function* registerDestinationSaga(
  action: PayloadAction<{ breBKey: string; idempotencyKey: string }>
) {
  const { breBKey, idempotencyKey } = action.payload
  yield* put(destinationRegistering())
  let destination: Destination
  try {
    destination = yield* withSession((token) =>
      createFirstPartyDestination(token, breBKey, idempotencyKey)
    )
    yield* put(destinationUpdated(destination))
  } catch (err) {
    Logger.warn(TAG, 'registerDestination failed', err)
    yield* put(destinationRegisterFailed({ code: errorCodeOf(err, 'destination_create_failed') }))
    return
  }
  let attempts = 0
  while (destination.status === 'pending' && attempts < DESTINATION_POLL_MAX_ATTEMPTS) {
    yield* delay(DESTINATION_POLL_DELAY_MS)
    attempts++
    try {
      destination = yield* withSession((token) => getDestination(token, destination.id))
      yield* put(destinationUpdated(destination))
    } catch (err) {
      Logger.warn(TAG, 'getDestination failed, will retry', err)
    }
  }
  if (destination.status === 'pending') {
    Logger.warn(TAG, `destination ${destination.id} still pending after polling`)
    yield* put(destinationRegisterFailed({ code: 'verification_timeout' }))
  }
}

// Bridge does not pay out below this (withdrawals.mdx); the address reports
// its own floor and that wins when present.
const WITHDRAW_MIN_COP = 4_000

// COP Bridge should pay for `usdc` at the quote's rate, after TuCOP's fee.
// Whole pesos, rounded down: the user sees the least they will get.
export function estimateWithdrawCop(usdc: string, rate: string, feeBps: number): BigNumber {
  return new BigNumber(usdc)
    .times(rate)
    .times(new BigNumber(10_000 - feeBps).dividedBy(10_000))
    .integerValue(BigNumber.ROUND_FLOOR)
}

// Get (or create) the party's withdrawal address for the chosen key, note the
// payouts it already has, and price the swap's guaranteed USDC in COP. Nothing
// here moves money: the review step builds the swap to that address.
export function* startWithdrawSaga(action: PayloadAction<StartBridgeRampWithdrawPayload>) {
  const { destinationId, copmAmountIn, usdcMinOut, idempotencyKey } = action.payload
  yield* put(withdrawCreating({ copmAmountIn }))
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    yield* put(withdrawFailed({ code: 'no_wallet' }))
    return
  }
  let withdrawal: Withdrawal
  try {
    const created = yield* withSession((token) =>
      createWithdrawal(token, { destination_id: destinationId }, `${idempotencyKey}-address`)
    )
    // A read lists the payouts already made from the address.
    withdrawal = yield* withSession((token) => getWithdrawal(token, created.id))
  } catch (err) {
    Logger.warn(TAG, 'withdrawal address failed', err)
    yield* put(
      withdrawFailed({ code: errorCodeOf(err, 'create_failed'), requestId: requestIdOf(err) })
    )
    captureBusinessError(err instanceof Error ? err : new Error(String(err)), {
      feature: 'bridgeramp',
      provider: 'bridge',
      action: 'withdrawal_create_failed',
      errorCode: errorCodeOf(err, 'create_failed'),
    })
    return
  }
  if (withdrawal.status !== 'active') {
    yield* put(withdrawFailed({ code: 'withdrawal_disabled' }))
    return
  }
  const minCop = new BigNumber(
    withdrawal.deposit.minimum_destination_amount?.amount ?? WITHDRAW_MIN_COP
  )
  let quote
  try {
    // Priced at the floor: only the rate is used, and a quote below the
    // floor would be refused.
    quote = yield* withSession((token) =>
      createWithdrawQuote(
        token,
        { destination_id: destinationId, amount_cop: { amount: minCop.toFixed(2), asset: 'COP' } },
        `${idempotencyKey}-quote`
      )
    )
  } catch (err) {
    Logger.warn(TAG, 'withdraw quote failed', err)
    yield* put(
      withdrawFailed({ code: errorCodeOf(err, 'quote_failed'), requestId: requestIdOf(err) })
    )
    return
  }
  const estimatedCop = estimateWithdrawCop(usdcMinOut, quote.rate.value, withdrawal.fee_bps ?? 0)
  if (estimatedCop.isLessThan(minCop)) {
    yield* put(withdrawFailed({ code: 'amount_below_minimum' }))
    return
  }
  yield* put(
    withdrawReady({
      quote,
      withdrawal,
      estimatedCop: estimatedCop.toFixed(0),
      knownPayoutIds: (withdrawal.payouts ?? []).map((p) => p.id),
      // One per Continue press: the swap's flowId is `${withdrawal.id}:${attemptId}`.
      attemptId: idempotencyKey,
    })
  )
}

export function* pollWithdrawalSaga(action: PayloadAction<{ withdrawalId: string }>) {
  const { withdrawalId } = action.payload
  let attempts = 0
  while (attempts < WITHDRAWAL_POLL_MAX_ATTEMPTS) {
    try {
      const withdrawal = yield* withSession((token) => getWithdrawal(token, withdrawalId))
      const { knownPayoutIds } = yield* select(bridgeRampWithdrawSelector)
      // The newest payout that was not on the address before this swap.
      const payout = (withdrawal.payouts ?? []).find((p) => !knownPayoutIds.includes(p.id))
      if (payout) {
        yield* put(withdrawPayoutUpdated(payout))
        const outcome = payoutOutcome(payout)
        if (outcome !== 'processing') {
          if (outcome === 'failed') {
            captureBusinessError(new Error(`Bridge Ramp payout ${payout.status}`), {
              feature: 'bridgeramp',
              provider: 'bridge',
              action: 'withdrawal_not_completed',
              errorCode: payout.status,
            })
          }
          return
        }
      }
    } catch (err) {
      Logger.warn(TAG, 'getWithdrawal failed, will retry', err)
    }
    yield* delay(WITHDRAWAL_POLL_DELAY_MS)
    attempts++
  }
  Logger.warn(TAG, `pollWithdrawal gave up after ${WITHDRAWAL_POLL_MAX_ATTEMPTS} attempts`)
  yield* put(withdrawPollTimedOut())
}

// The swap landed: if it went to the withdrawal address under review, the
// USDC is there and Bridge will pay it out.
export function* onSwapConfirmedSaga() {
  const withdraw = yield* select(bridgeRampWithdrawSelector)
  const swap = yield* select(bridgeRampSwapSelector)
  const deposit = withdraw.withdrawal?.deposit.address
  if (
    withdraw.status !== 'review' ||
    !withdraw.withdrawal ||
    !deposit ||
    swap.recipient?.toLowerCase() !== deposit.toLowerCase()
  ) {
    return
  }
  yield* put(withdrawAwaitingPayout())
  // Through the action so takeLatest keeps a single poll running, also when
  // the screen restarts polling on mount.
  yield* put(pollBridgeRampWithdrawal({ withdrawalId: withdraw.withdrawal.id }))
}

// The swap flowId for a withdrawal attempt: the address is reusable, so the
// attempt id keeps two withdrawals to the same key apart.
export function withdrawSwapFlowId(withdrawalId: string, attemptId: string | null): string {
  return attemptId ? `${withdrawalId}:${attemptId}` : withdrawalId
}

// ---------------------------------------------------------------------------
// On-ramp: convert the USDC Bridge delivered into COPm
// ---------------------------------------------------------------------------

export const convertBridgeDeposit = createAction<{
  // USDC in the user's wallet to convert, base units as a decimal string.
  usdcAmount: string
  // Stable per deposit so a retry after a crash reuses the same
  // sendPreparedTransactions idempotency record.
  flowId: string
}>('bridgeramp/convertDeposit')

// Bridge pays the on-ramp in USDC to the user's own wallet; the user wanted
// COPm. This quotes USDC -> COPm on Mento, prices approve + swap back into the
// same wallet and hands them to executeBridgeRampSwapSaga. Everything that
// can fail before signing fails closed with the USDC untouched.
export function* convertBridgeDepositSaga(
  action: PayloadAction<{ usdcAmount: string; flowId: string }>
) {
  const { usdcAmount, flowId } = action.payload
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    yield* put(swapFailed({ code: 'broadcast_failed', flowId }))
    return
  }
  // The conversion was already broadcast (receipt unknown, or the app closed
  // while waiting): only wait for it, whatever the market does now.
  const alreadySent = yield* select(findRecordByIndexSelector, sentLogFlowId(flowId), SWAP_TX_INDEX)
  if (alreadySent && alreadySent.status !== 'failed') {
    const swap = yield* select(bridgeRampSwapSelector)
    yield* call(
      executeBridgeRampSwapSaga,
      executeBridgeRampSwap({
        flowId,
        direction: 'usdcToCopm',
        amountIn: usdcAmount,
        quotedAmountOut: (swap.flowId === flowId && swap.quotedAmountOut) || '0',
        quotedAt: 0,
        recipient: walletAddress as Address,
        serializablePreparedTransactions: [],
      })
    )
    return
  }
  const networkId = NetworkId['celo-mainnet']
  const tokensById = yield* select(tokensByIdSelector, [networkId])
  const usdcToken = tokensById[networkConfig.usdcTokenId]
  const feeCurrencies = yield* select(feeCurrenciesSelector, networkId)
  if (!usdcToken) {
    yield* put(swapFailed({ code: 'broadcast_failed', flowId }))
    captureBusinessError(new Error('USDC token info missing for deposit conversion'), {
      feature: 'bridgeramp',
      provider: 'mento',
      action: 'deposit_conversion_no_token',
    })
    return
  }
  try {
    // typed-redux-saga cannot type the optional `now` parameter; wrap it.
    const quote = yield* call(() => quoteMentoSwap('usdcToCopm', BigInt(usdcAmount)))
    const calls = buildBridgeDepositConversionCalls({
      quote,
      user: walletAddress as Address,
    })
    const prepared = yield* call(prepareBridgeRampCalls, {
      calls,
      from: walletAddress as Address,
      spendToken: usdcToken,
      spendTokenAmount: quote.amountIn,
      feeCurrencies,
    })
    if (prepared.type !== 'possible') {
      Logger.warn(TAG, `deposit conversion cannot pay gas: ${prepared.type}`)
      yield* put(swapFailed({ code: 'broadcast_failed', flowId }))
      return
    }
    yield* call(
      executeBridgeRampSwapSaga,
      executeBridgeRampSwap({
        flowId,
        direction: 'usdcToCopm',
        amountIn: quote.amountIn.toString(),
        quotedAmountOut: quote.amountOut.toString(),
        quotedAt: quote.quotedAt,
        recipient: walletAddress as Address,
        serializablePreparedTransactions: getSerializablePreparedTransactions(
          prepared.transactions
        ),
      })
    )
  } catch (err) {
    if (err instanceof MentoOracleUnavailableError) {
      // Outside market hours Mento cannot price COPm. The USDC stays in the
      // wallet and `pending` stays set; checkDepositSaga tries again.
      Logger.info(TAG, 'deposit conversion waiting for the COPm oracle')
      yield* put(swapFailed({ code: 'market_closed', flowId }))
      return
    }
    Logger.warn(TAG, 'deposit conversion failed before signing', err)
    yield* put(swapFailed({ code: 'broadcast_failed', flowId }))
    captureBusinessError(err instanceof Error ? err : new Error(String(err)), {
      feature: 'bridgeramp',
      provider: 'mento',
      action: 'deposit_conversion_prepare_failed',
    })
  }
}

// ---------------------------------------------------------------------------
// On-ramp: deposit account and arrival detection
// ---------------------------------------------------------------------------

export const startBridgeRampDeposit = createAction('bridgeramp/startDeposit')
export const checkBridgeRampDeposit = createAction('bridgeramp/checkDeposit')
export const retryBridgeRampDepositConversion = createAction('bridgeramp/retryDepositConversion')

// Below this (0.01 USDC) an increase is rounding or dust, not a Bridge payout
// worth a swap.
const MIN_DEPOSIT_USDC_BASE_UNITS = BigInt(10_000)

// Current USDC balance in base units, from the token store the home screen
// keeps refreshed. Null when the token is not loaded yet.
function* readUsdcBalance() {
  const tokensById = yield* select(tokensByIdSelector, [NetworkId['celo-mainnet']])
  const usdc = tokensById[networkConfig.usdcTokenId]
  if (!usdc) return null
  return BigInt(usdc.balance.shiftedBy(usdc.decimals).toFixed(0))
}

// Asks TuCOPRamp for the virtual account the user pays (create or return;
// the idempotency key is per wallet because there is one account per wallet)
// and records the USDC balance the arrival check compares against.
export function* startDepositSaga() {
  yield* put(depositCreating())
  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    yield* put(depositFailed({ code: 'no_wallet' }))
    return
  }
  const balance = yield* call(readUsdcBalance)
  try {
    const account = yield* withSession((token) =>
      createDepositAccount(
        token,
        { wallet_address: walletAddress as Address },
        `deposit-${walletAddress.toLowerCase()}`
      )
    )
    // Unknown balance: leave the baseline unset rather than 0, or the whole
    // existing USDC balance would read as a deposit. checkDepositSaga sets it.
    yield* put(
      depositReady({ account, usdcBaseline: balance === null ? null : balance.toString() })
    )
  } catch (err) {
    Logger.warn(TAG, 'deposit account failed', err)
    const code = errorCodeOf(err, 'create_failed')
    yield* put(depositFailed({ code, requestId: requestIdOf(err) }))
    captureBusinessError(err instanceof Error ? err : new Error(String(err)), {
      feature: 'bridgeramp',
      provider: 'bridge',
      action: 'deposit_account_failed',
      errorCode: code,
    })
  }
}

// Runs convertBridgeDepositSaga for the pending USDC and, once the swap
// confirms, moves the baseline to whatever USDC is left so the next deposit
// starts clean. A failed swap leaves `pending` in place for a retry.
function* convertPendingDeposit() {
  const deposit = yield* select(bridgeRampDepositSelector)
  if (!deposit.pending) return
  yield* call(
    convertBridgeDepositSaga,
    convertBridgeDeposit({ usdcAmount: deposit.pending.usdcAmount, flowId: deposit.pending.flowId })
  )
  const swap = yield* select(bridgeRampSwapSelector)
  if (swap.status === 'confirmed' && swap.flowId === deposit.pending.flowId) {
    const balance = yield* call(readUsdcBalance)
    const before = BigInt(deposit.usdcBaseline ?? '0')
    // The swap spent exactly the pending USDC, so what was there before the
    // deposit is the new baseline. The store may not have caught up with the
    // swap yet (still showing the converted USDC): never let the baseline go
    // above `before`, or the next arrival would be under-counted. Anything
    // that arrived meanwhile stays above it and is detected next time.
    const settled = balance !== null && balance < before ? balance : before
    yield* put(depositSettled({ usdcBaseline: settled.toString() }))
  }
}

// Called while the deposit screen is open (after each balance refresh) and
// when it mounts: USDC above the baseline is Bridge's payout, convert it.
export function* checkDepositSaga() {
  const deposit = yield* select(bridgeRampDepositSelector)
  if (deposit.status !== 'ready') return
  const swap = yield* select(bridgeRampSwapSelector)
  if (swap.status === 'submitting' || swap.status === 'broadcast') return
  if (deposit.pending) {
    // A conversion is already queued (crash, app closed mid-way): finish it
    // only if it has not failed; a failed one waits for the user's retry.
    // Market closed is not a failure of the swap: try again on every check
    // so it converts as soon as the oracle reports.
    if (
      swap.status === 'failed' &&
      swap.flowId === deposit.pending.flowId &&
      swap.errorCode !== 'market_closed'
    ) {
      return
    }
    yield* call(convertPendingDeposit)
    return
  }
  const balance = yield* call(readUsdcBalance)
  // Never compare against a balance we do not know.
  if (balance === null) return
  if (deposit.usdcBaseline === null) {
    yield* put(depositBaselineUpdated({ usdcBaseline: balance.toString() }))
    return
  }
  const baseline = BigInt(deposit.usdcBaseline)
  if (balance < baseline) {
    // USDC left the wallet (spent, sent, gas): follow it down so the next
    // deposit is measured from what is really there.
    yield* put(depositBaselineUpdated({ usdcBaseline: balance.toString() }))
    return
  }
  const delta = balance - baseline
  if (delta < MIN_DEPOSIT_USDC_BASE_UNITS) return
  Logger.info(TAG, `deposit detected: ${delta.toString()} USDC base units above baseline`)
  yield* put(
    depositDetected({
      usdcAmount: delta.toString(),
      flowId: `dep-${deposit.account?.id ?? 'unknown'}-${Date.now()}`,
    })
  )
  yield* call(convertPendingDeposit)
}

export function* retryDepositConversionSaga() {
  const deposit = yield* select(bridgeRampDepositSelector)
  if (!deposit.pending) return
  yield* call(convertPendingDeposit)
}

export function* bridgeRampSaga() {
  yield* takeLeading(startBridgeRampDeposit.type, startDepositSaga)
  yield* takeLeading(checkBridgeRampDeposit.type, checkDepositSaga)
  yield* takeLeading(retryBridgeRampDepositConversion.type, retryDepositConversionSaga)
  yield* takeLeading(convertBridgeDeposit.type, convertBridgeDepositSaga)
  yield* takeLeading(executeBridgeRampSwap.type, executeBridgeRampSwapSaga)
  yield* takeLatest(fetchBridgeRampParty.type, fetchPartySaga)
  yield* takeLatest(fetchBridgeRampDestinations.type, fetchDestinationsSaga)
  yield* takeLeading(createBridgeRampParty.type, createPartySaga)
  yield* takeLeading(registerBridgeRampDestination.type, registerDestinationSaga)
  yield* takeLeading(startBridgeRampWithdraw.type, startWithdrawSaga)
  yield* takeLatest(pollBridgeRampWithdrawal.type, pollWithdrawalSaga)
  yield* takeEvery(swapConfirmed.type, onSwapConfirmedSaga)
  yield* takeLeading(AccountActions.CLEAR_STORED_ACCOUNT, revokeBridgeRampSessionSaga)
}
