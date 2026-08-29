import { createAction, PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { call, delay, put, race, select, take, takeEvery } from 'typed-redux-saga'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FeeEvents } from 'src/analytics/Events'
import { executeDollarsSpend7702Saga } from 'src/dollarsSpend/saga7702'
import {
  multiSwapCompleted,
  multiSwapLegExecuting,
  multiSwapLegFailed,
  multiSwapLegSucceeded,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
  multiSwapTransitionComplete,
} from 'src/dollarsSpend/slice'
import { DOLARES_VIRTUAL_TOKEN_ID, SpendStep } from 'src/dollarsSpend/types'
import { classifyError } from 'src/lib/errors'
import { navigate } from 'src/navigator/NavigationService'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { Screens } from 'src/navigator/Screens'
import {
  inFlightAdvance,
  inFlightFail,
  inFlightStart,
} from 'src/lib/useTransactionInFlight/actions'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { recordSwapFeeMetadata, swapStart, swapSuccess, swapError } from 'src/swap/slice'
import { Field, SwapInfo } from 'src/swap/types'
import { extractSquidEnvelope, fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { pickFeeCurrency } from 'src/tokens/feeCurrencyPicker'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
import { addStandbyTransaction } from 'src/transactions/slice'
import { newTransactionContext, TokenTransactionTypeV2 } from 'src/transactions/types'
import { Network, NetworkId } from 'src/transactions/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address } from 'viem'

const TAG = 'dollarsSpend/saga'

// Slippage tolerance used for the per-step swap quote inside the multi-swap
// legacy flow. See the call site comment for why this is higher than the
// wallet's regular-swap default (0.5%). 7702 atomic path is separate.
// Exported so SwapScreen can surface this exact value on the transaction
// details panel when the virtual Dolares path is active; the Statsig
// maxSlippagePercentage governs only the regular per-quote path.
export const MULTI_SWAP_SLIPPAGE_PERCENTAGE = '1.5'

export interface ExecuteMultiSwapPayload {
  steps: SpendStep[]
  toTokenId: string
}

export const executeMultiSwap = createAction<ExecuteMultiSwapPayload>(
  'dollarsSpend/executeMultiSwap'
)

function newSwapId(index: number) {
  return `multi-${Date.now()}-${index}-${Math.floor(Math.random() * 1e6)}`
}

export function* executeMultiSwapSaga(action: PayloadAction<ExecuteMultiSwapPayload>) {
  const { steps, toTokenId } = action.payload

  if (steps.length === 0) {
    return
  }

  // Track C: when the EIP-7702 / CIP-64 single-tx path is enabled AND the
  // user's EOA is already delegated to our hardened BatchExecutor, hand off
  // to the new saga. The legacy sequential loop below is the fallback for:
  //   - flag off
  //   - user not delegated yet (until the sponsored-relay endpoint is live,
  //     first-time users without CELO go through legacy; once relayed and
  //     delegated, every subsequent run takes the 7702 path)
  //   - the BatchExecutor address being misconfigured
  //   - the new path throwing (the new saga handles its own error dispatch)
  //
  // Why two conditions instead of trying to combine 7702 + CIP-64 in a single
  // tx: in Celo, type 0x04 (EIP-7702 authorizationList) and type 0x7b (CIP-64
  // feeCurrency) are mutually-exclusive tx envelopes. A user with a persistent
  // delegation can submit a CIP-64 tx that calls execute() on their own EOA
  // (which runs the BatchExecutor code) paying gas in a stable. A user without
  // delegation needs a separate tx 0x04 first, which costs CELO and is the
  // relay's job.
  const sevenSevenZeroTwoOn = yield* call(
    getFeatureGate,
    StatsigFeatureGates.WRI_DOLLARS_SPEND_7702_V1
  )
  if (sevenSevenZeroTwoOn) {
    const walletAddress = yield* select(walletAddressSelector)
    if (walletAddress) {
      const expectedDesignator = `0xef0100${networkConfig.batchExecutorAddressCelo
        .slice(2)
        .toLowerCase()}`
      const code = yield* call(() =>
        publicClient[Network.Celo].getCode({ address: walletAddress as Address })
      )
      let isOurDelegation = (code ?? '').toLowerCase() === expectedDesignator

      // If not delegated yet, ask the backend's sponsored-relay endpoint to
      // submit the type-0x04 setup tx. The relay pays gas in CELO from a
      // TuCop hot wallet so users without CELO can still bootstrap the
      // delegation. On success the relay waits for receipt + verifies code
      // before responding 200, so by then the delegation is on-chain.
      // Any failure (rate limit, hot wallet down, signing issue) silently
      // falls through to the legacy multi-step path so the user always
      // gets a working flow.
      if (!isOurDelegation) {
        try {
          const wallet = yield* call(getViemWallet, networkConfig.viemChain[Network.Celo])
          if (wallet.account) {
            yield* call(getConnectedUnlockedAccount)
            // No `executor` field: the relay (not the user) submits the tx, so
            // the signed authorization must use the EOA's CURRENT nonce, not
            // nonce+1. Setting executor:'self' would lock the auth to a tx
            // submitted by the EOA itself; the relay's tx would then mismatch.
            const auth = yield* call(() =>
              wallet.signAuthorization({
                account: wallet.account!,
                contractAddress: networkConfig.batchExecutorAddressCelo,
              })
            )
            // viem's authorization object uses bigint fields; serialize for JSON.
            const relayBody = {
              userAddress: walletAddress,
              signedAuthorization: {
                chainId: `0x${auth.chainId.toString(16)}`,
                address: networkConfig.batchExecutorAddressCelo,
                nonce: `0x${auth.nonce.toString(16)}`,
                yParity: auth.yParity === 0 ? '0x0' : '0x1',
                r: auth.r,
                s: auth.s,
              },
            }

            // Backend spec: happy path 3-7s; recommend 20s client timeout to
            // cover worst-case mining variance + safety margin.
            const RELAY_TIMEOUT_MS = 20_000
            const RELAY_MAX_ATTEMPTS = 3

            // Try the relay up to RELAY_MAX_ATTEMPTS times. We hand-roll the
            // retry loop here (instead of relying solely on fetchWithTimeout's
            // built-in 5xx retry) because we need:
            //   - 429: respect Retry-After header
            //   - 502 "unverified": re-check on-chain getCode before retrying,
            //     since the delegation tx may have mined despite the relay's
            //     verification step failing
            //   - 503/400: do not retry; fall through to legacy
            let attempt = 0
            while (attempt < RELAY_MAX_ATTEMPTS && !isOurDelegation) {
              const res = yield* call(
                fetchWithTimeout,
                networkConfig.wriDelegateRelayUrl,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(relayBody),
                },
                RELAY_TIMEOUT_MS
              )

              if (res.ok) {
                const body = (yield* call(() => res.json())) as { status?: string }
                if (body.status === 'delegated' || body.status === 'already_delegated') {
                  isOurDelegation = true
                }
                break
              }

              if (res.status === 429) {
                const retryAfterRaw = res.headers.get('retry-after')
                const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN
                const waitMs = Number.isFinite(retryAfterSec)
                  ? Math.min(retryAfterSec * 1000, 5_000)
                  : 1_000
                Logger.warn(TAG, `relay 429; waiting ${waitMs}ms then retrying`)
                yield* delay(waitMs)
                attempt += 1
                continue
              }

              if (res.status === 502) {
                // The relay submitted a tx but couldn't verify the on-chain
                // code update within its own deadline. The tx may still have
                // mined by now. Re-check before retrying so we don't re-sign
                // a duplicate authorization.
                Logger.warn(TAG, `relay 502; rechecking on-chain delegation`)
                const recheckCode = yield* call(() =>
                  publicClient[Network.Celo].getCode({ address: walletAddress as Address })
                )
                if ((recheckCode ?? '').toLowerCase() === expectedDesignator) {
                  Logger.info(TAG, `delegation now present on-chain after 502; proceeding`)
                  isOurDelegation = true
                  break
                }
                // Exponential backoff: 1s, 2s.
                const backoffMs = 1_000 * 2 ** attempt
                yield* delay(backoffMs)
                attempt += 1
                continue
              }

              if (res.status === 503) {
                Logger.warn(TAG, `relay 503 (degraded); falling back to legacy`)
                break
              }

              if (res.status === 400) {
                Logger.warn(
                  TAG,
                  `relay 400 (validation); likely a client bug; falling back to legacy`
                )
                break
              }

              Logger.warn(TAG, `relay returned ${res.status}; falling back to legacy multi-step`)
              break
            }
          }
        } catch (err) {
          Logger.warn(
            TAG,
            `relay flow threw, falling back to legacy: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      }

      if (isOurDelegation) {
        yield* call(executeDollarsSpend7702Saga, action)
        return
      }
    }
    // Fall through to legacy when not delegated and relay didn't deliver.
  }

  yield* put(
    multiSwapStarted({
      steps,
      destinationLabel: toTokenId === networkConfig.xaut0TokenId ? 'Oro' : 'Pesos',
    })
  )

  // Per-step leg record we'll pass to TransactionSuccessScreen at the end
  // so the user sees a single success screen for the whole Dolares -> Pesos
  // intent with a breakdown of each concrete token that got converted.
  const legs: Array<{
    fromTokenId: string
    fromAmount: string
    toAmount: string
    transactionHash: string
    appFeeUsd: string
  }> = []

  const flowId = `dollarsSpend-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  // Derive networkId from the first step's tokenId (format: "celo-mainnet:0x...")
  const networkId = (steps[0]?.tokenId.split(':')[0] ?? 'celo-mainnet') as NetworkId
  yield* put(
    inFlightStart({
      flowId,
      flowKind: 'dollarsSpend',
      steps: steps.length,
      currentStep: 0,
      status: 'progress',
      preparedTransactions: [],
      networkId,
      retryCount: 0,
      startedAt: Date.now(),
    })
  )

  // Retry policy per leg (2026-08-28): op-reth's in-flight cap on 7702-
  // delegated wallets rejects submits when a previous tx is still draining
  // from mempool. Retrying the same leg after a short mempool-drain delay
  // recovers cleanly. Common failure modes this covers:
  //   - "in-flight transaction limit reached for delegated accounts" (7702 cap)
  //   - "Missing or invalid parameters" (op-reth -32602 catch-all: baseFee
  //     race, RLP parsing hiccup, feeCurrency validation race with block)
  //   - transient Forno RPC flakes
  // Non-transient errors (user rejected, out of balance) fail on the retry
  // too, so the retry cost is ~3s per leg in the pathological case.
  const MAX_LEG_ATTEMPTS = 2
  const LEG_RETRY_DELAY_MS = 3000

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]

    const walletAddress = yield* select(walletAddressSelector)
    if (!walletAddress) {
      yield* put(
        multiSwapStepFailed({
          index,
          errorMessage: 'Wallet address unavailable for step execution',
        })
      )
      // Give the UI one frame to render the transitional message before
      // committing to PartialSuccessSheet. Bridges the render gap.
      yield* put(
        inFlightFail({
          flowId,
          errorClass: classifyError(new Error('Wallet address unavailable')),
        })
      )
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }

    const tokensById = yield* select(tokensByIdSelector, getSupportedNetworkIdsForSwap())
    const fromToken = tokensById[step.tokenId]
    if (!fromToken) {
      yield* put(
        multiSwapStepFailed({
          index,
          errorMessage: `Token not found in wallet state: ${step.symbol}`,
        })
      )
      yield* put(
        inFlightFail({
          flowId,
          errorClass: classifyError(new Error(`Token not found: ${step.symbol}`)),
        })
      )
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }

    const rawFeeCurrencies = yield* select(feeCurrenciesSelector, fromToken.networkId as NetworkId)

    // Post Bug-E-reversal (2026-08-20): the selector returns CELO at index 0
    // and pickFeeCurrency preserves that order (first-viable).
    //
    // MULTI-SWAP FIX (2026-08-28): exclude a token from the fee-currency set
    // when its RESIDUAL (balance - planned spend) is too small to cover per-
    // leg gas. Not just "fully drained": a residual of 0.001 USDT is
    // effectively drained for fee purposes because gas per leg costs $0.05
    // to $0.20 depending on baseFee, so 0.001 USDT would not cover even one
    // leg's submit and op-reth would reject.
    //
    // Threshold: gas is PER TX and legacy sequential fires 2 txs per leg
    // (approve + fundAndRunMulticall). If the same token is fee currency
    // for every leg (worst case for this token's residual), it pays gas
    // 2 × numLegs times.
    //
    // Per-tx CIP-64 gas cost, denominated in fee-currency USD (fee-currency
    // directory oracle converts gas × price into fee-currency units at
    // submit):
    //   - typical baseFee (~5 gwei):   ~$0.02/tx
    //   - stress baseFee (~200 gwei):  ~$0.10/tx
    //
    // Formula: base = $0.10 (stress rate) × 2 (txs per leg) × numLegs, with
    // 50% margin for oracle staleness. Max plan = 3 legs (SPEND_ORDER caps),
    // so worst case is $0.10 × 2 × 3 × 1.5 = $0.90 threshold.
    //
    // Example plan of 3 legs (user USDm 0.11 + USDC 1.33 + USDT 5.17, spend $5):
    //   plan = [USDm drained, USDC drained, USDT partial residual $1.61]
    //   threshold = 0.10 × 2 × 3 × 1.5 = $0.90
    //   USDT $1.61 >= $0.90 -> stays eligible as fee currency for all 3 legs.
    //
    // Example plan of 2 legs (user USDm 3 + USDC 3, spend $4):
    //   plan = [USDm drained, USDC partial residual $2]
    //   threshold = 0.10 × 2 × 2 × 1.5 = $0.60
    //   USDC $2 >= $0.60 -> stays eligible.
    const MIN_FEE_RESIDUAL_USD = new BigNumber('0.10')
      .multipliedBy(2) // approve + swap per leg
      .multipliedBy(steps.length)
      .multipliedBy(1.5) // margin for oracle drift + priceUsd staleness
    const excludedFromFee = steps
      .filter((s) => {
        const tok = tokensById[s.tokenId]
        if (!tok) return true // missing from registry - safer to exclude
        const residual = tok.balance.minus(s.amountTokenWhole)
        if (residual.lte(0)) return true // fully drained
        // Convert residual to USD via priceUsd. For stables (USDm/USDC/USDT)
        // this is ~$1 per token. Missing priceUsd is treated as unknown ->
        // exclude conservatively rather than risk picking a low-value token.
        const priceUsd = tok.priceUsd
        if (!priceUsd) return true
        const residualUsd = residual.multipliedBy(priceUsd)
        return residualUsd.lt(MIN_FEE_RESIDUAL_USD)
      })
      .map((s) => s.tokenId)
    const choice = pickFeeCurrency({
      available: rawFeeCurrencies,
      excludeTokenIds: excludedFromFee,
    })
    const feeCurrencies = choice ? [choice.chosen, ...choice.alternatives] : rawFeeCurrencies
    if (choice) {
      Logger.info(
        TAG,
        `step ${index} (${step.symbol}): fee currency ${choice.chosen.symbol} (reason=${choice.reason}, declined=${choice.declined.length})`
      )
      AppAnalytics.track(FeeEvents.fee_currency_picked, {
        context: 'dollarsSpend_legacy',
        chosenSymbol: choice.chosen.symbol,
        reason: choice.reason,
        declinedCount: choice.declined.length,
        alternativesCount: choice.alternatives.length,
        networkId: fromToken.networkId as NetworkId,
      })
    }

    // Per-leg retry loop (2026-08-28). Each attempt refetches a fresh quote
    // and mints a new swapId so the outer swap saga can't confuse retries.
    // Only the submit + race is retried; a fetch failure breaks out and
    // falls through to the exhausted-attempts branch below.
    let legSucceededOnAttempt = -1
    let successTxHash: string | null = null
    let successFreshQuote: Awaited<ReturnType<typeof fetchSwapQuoteForExecution>> | null = null

    for (let attempt = 0; attempt < MAX_LEG_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        Logger.info(
          TAG,
          `step ${index} (${step.symbol}) retry ${attempt + 1}/${MAX_LEG_ATTEMPTS}: waiting ${LEG_RETRY_DELAY_MS}ms for mempool drain`
        )
        yield* delay(LEG_RETRY_DELAY_MS)
      }

      // Per-leg progress: transition to 'executing' so MultiSwapLegList
      // shows the spinner on THIS leg + retry attempt badge if attempt > 1.
      yield* put(multiSwapLegExecuting({ index, attempt: attempt + 1 }))

      const swapId = newSwapId(index)

      let freshQuote: Awaited<ReturnType<typeof fetchSwapQuoteForExecution>>
      try {
        // getSwapQuote expects smallest-unit (wei). Step carries whole units;
        // shift by decimals to match the regular swap path. ROUND_DOWN keeps
        // the requested amount within the user's balance.
        const amountInWei = step.amountTokenWhole
          .shiftedBy(step.decimals)
          .toFixed(0, BigNumber.ROUND_DOWN)
        freshQuote = yield* call(fetchSwapQuoteForExecution, {
          fromTokenId: step.tokenId,
          toTokenId,
          amount: amountInWei,
          walletAddress,
          fromToken,
          feeCurrencies,
          // Multi-swap steps are typically small ($1-$3 per leg) and Mento's
          // fixed swap fee + Squid's routing fee eat proportionally more of
          // the amount. The 0.5% default that the regular swap uses is too
          // tight for these micro-legs and Squid reverts with a slippage
          // check failure. Bump to 1.5% here so the multi-swap flow completes
          // reliably; the user still sees the actual received amount in the
          // success screen breakdown.
          slippagePercentage: MULTI_SWAP_SLIPPAGE_PERCENTAGE,
        })
      } catch (err) {
        // Backend / fetch failure. Retrying within a few seconds rarely
        // recovers this class (backend 500, network drop, rate limit that
        // useSwapQuote already retried inside), so we break the retry loop
        // and fall through to the exhausted-attempts handler below which
        // logs to Sentry and continues to the next leg (does NOT halt the
        // multi-swap).
        const message = err instanceof Error ? err.message : String(err)
        Logger.warn(
          TAG,
          `Quote refetch failed for step ${index} (${step.symbol}) attempt ${attempt + 1}: ${message}`
        )
        // Per-leg fail dispatch so the sheet's expandable detail shows the
        // fetch error text (with copy button) instead of leaving the leg
        // in 'executing' forever.
        const envelope = extractSquidEnvelope(err)
        yield* put(
          multiSwapLegFailed({
            index,
            attempt: attempt + 1,
            errorMessage: message,
            errorEnvelope: envelope,
          })
        )
        break
      }

      const serializablePreparedTransactions =
        freshQuote.preparedTransactions.type === 'possible'
          ? getSerializablePreparedTransactions(freshQuote.preparedTransactions.transactions)
          : []

      // freshQuote.swapAmount.TO is Squid's buyAmount in wei (BigNumber shifted
      // by the destination token's decimals). Shift back to whole units before
      // it enters SwapInfo, so the standby-tx renderer downstream (TokenDisplay
      // consumes .value directly with `new BigNumber(value)` and no shift)
      // doesn't display 3,321,865,235,381,619,257,571 Pesos for a 3,321 tx.
      const toToken = tokensById[toTokenId]
      const toTokenDecimals = toToken?.decimals ?? 18
      const swapInfo: SwapInfo = {
        swapId,
        userInput: {
          fromTokenId: step.tokenId,
          toTokenId,
          swapAmount: {
            [Field.FROM]: step.amountTokenWhole.toString(),
            [Field.TO]: freshQuote.swapAmount.TO.shiftedBy(-toTokenDecimals).toString(),
          },
          updatedField: Field.FROM,
        },
        quote: {
          preparedTransactions: serializablePreparedTransactions,
          receivedAt: freshQuote.receivedAt,
          price: freshQuote.price,
          appFeePercentageIncludedInPrice: freshQuote.appFeePercentageIncludedInPrice,
          provider: freshQuote.provider,
          estimatedPriceImpact: freshQuote.estimatedPriceImpact,
          allowanceTarget: freshQuote.allowanceTarget,
          swapType: freshQuote.swapType,
          permit2: freshQuote.permit2,
          batchCalls: freshQuote.batchCalls,
        },
        areSwapTokensShuffled: false,
        // Multi-swap orchestrates the success screen itself once all legs
        // finish; individual swap sagas must not navigate mid-flight or the
        // user sees the sheet flash for each leg (see PR that introduced
        // consolidated success). See src/swap/saga.ts navigate() guard.
        suppressSuccessNavigation: true,
        // Multi-swap emits ONE aggregate addStandbyTransaction after the
        // loop so the feed shows a single "Dolares > Pesos" row instead
        // of N per-token rows ("USDm > Pesos", "USDC > Pesos", ...). The
        // individual on-chain txs still land and are indexed; only the
        // client-side optimistic standby is skipped for these legs.
        suppressStandbyDispatch: true,
      }

      yield* put(swapStart(swapInfo))

      // swapSuccess payload is SwapResult { swapId, ... }
      // swapError payload is a raw swapId string
      const { success, error } = yield* race({
        success: take((a: any) => a.type === swapSuccess.type && a.payload?.swapId === swapId),
        error: take((a: any) => a.type === swapError.type && a.payload === swapId),
      })

      if (success) {
        const successAction = success as unknown as { payload: { transactionHash: string } }
        successTxHash = successAction.payload.transactionHash
        successFreshQuote = freshQuote
        legSucceededOnAttempt = attempt
        // Per-leg dispatch so the sheet flips this leg's status icon to
        // succeeded + records the tx hash for the expandable detail row.
        yield* put(
          multiSwapLegSucceeded({
            index,
            attempt: attempt + 1,
            txHash: successAction.payload.transactionHash ?? '',
          })
        )
        break
      }
      // error branch: fall through to next retry attempt. Log at info
      // level; the exhausted-attempts handler below captures to Sentry
      // when we give up.
      Logger.info(
        TAG,
        `step ${index} (${step.symbol}) attempt ${attempt + 1}/${MAX_LEG_ATTEMPTS} swapError; will retry if attempts remain`
      )
      // Per-leg fail dispatch: swapError payload is only the swapId string,
      // so we can't include the real error message here. Set a generic
      // placeholder; if all retries exhaust, the exhausted-attempts branch
      // below will already have marked the leg as failed. If the retry
      // succeeds, the succeeded action overwrites and clears errorMessage.
      yield* put(
        multiSwapLegFailed({
          index,
          attempt: attempt + 1,
          errorMessage: `Submit failed on attempt ${attempt + 1} (see Sentry for full stack)`,
        })
      )
      // Ensure `error` (unused after this log line) is not flagged unused.
      void error
    }

    if (legSucceededOnAttempt >= 0 && successFreshQuote) {
      // Rebind quote reference for the reporting block that follows so
      // legs.push + telemetry read the exact quote that landed on-chain.
      const freshQuote = successFreshQuote
      const toToken = tokensById[toTokenId]
      const toTokenDecimals = toToken?.decimals ?? 18
      const success = true as const
      const successAction = { payload: { transactionHash: successTxHash ?? '' } }
      if (success) {
        // Record the leg so the final aggregated success screen can render a
        // per-token breakdown. successAction.payload is the tx hash of the
        // mined swap tx (from the retry attempt that succeeded).
        //
        // Squid integrator fee: deducted internally from the delivered amount,
        // never visible on-chain. `appFeePercentageIncludedInPrice` is a string
        // decimal like "1.0". `step.amountUsd` is the USD-equivalent input to
        // this leg. Product across all legs surfaces on the success screen as
        // "Tarifa de app ≈ COP $X" so the user sees the ~1% cut Squid took.
        const legAppFeeUsd = new BigNumber(step.amountUsd).multipliedBy(
          new BigNumber(freshQuote.appFeePercentageIncludedInPrice ?? 0).dividedBy(100)
        )
        legs.push({
          fromTokenId: step.tokenId,
          fromAmount: step.amountTokenWhole.toString(),
          toAmount: freshQuote.swapAmount.TO.shiftedBy(-toTokenDecimals).toString(),
          transactionHash: successAction.payload.transactionHash,
          appFeeUsd: legAppFeeUsd.toString(),
        })
        yield* put(multiSwapStepSucceeded({ index }))
        yield* put(
          inFlightAdvance({ flowId, toStatus: 'progress', patch: { currentStep: index + 1 } })
        )
        if (legSucceededOnAttempt > 0) {
          Logger.info(
            TAG,
            `step ${index} (${step.symbol}) succeeded on attempt ${legSucceededOnAttempt + 1}/${MAX_LEG_ATTEMPTS} after ${legSucceededOnAttempt} retry(ies)`
          )
        }
      }
    } else {
      // Retry loop exhausted with no successful attempt. Multi-swap fix
      // (2026-08-28): do NOT bail the whole flow on one leg's failure.
      // Continue to the next leg so a persistent issue on one token
      // (backend / op-reth / squid pool exhaustion for that pair) does not
      // skip legs the user expected to execute.
      //
      // Previously: `return` here made a USDm leg failure abort USDC + USDT
      // legs entirely, leaving the user with a "partial swap" that had NOT
      // even attempted the remaining tokens (2026-08-28 03:11 incident).
      //
      // Sentry captures the aggregate leg failure for observability; the
      // outer PartialSuccessSheet renders "N de M pasos" from `legs.length`
      // after the loop.
      Logger.warn(
        TAG,
        `step ${index} (${step.symbol}) exhausted ${MAX_LEG_ATTEMPTS} attempts; continuing to next leg`
      )
      captureBusinessError(new Error(`multi_swap_step_failed`), {
        feature: 'dollars_spend',
        provider: 'internal',
        action: 'multi_swap_step',
        errorCode: 'step_failed',
        extra: { stepIndex: index, stepSymbol: step.symbol, attemptsUsed: MAX_LEG_ATTEMPTS },
      })
      yield* put(
        inFlightAdvance({ flowId, toStatus: 'progress', patch: { currentStep: index + 1 } })
      )
    }
  }

  // If EVERY leg failed there's no success screen to render. Fire the
  // failure sheet so the user gets a clear signal (silent completion would
  // be worse - the app would look frozen). The 'continue-on-error' branch
  // above dispatches its own Sentry per-leg captureBusinessError; here we
  // just surface the aggregate outcome to Redux.
  if (legs.length === 0) {
    yield* put(
      multiSwapStepFailed({
        index: 0,
        errorMessage: 'All multi-swap legs failed (see per-leg Sentry captures for causes).',
      })
    )
    yield* put(
      inFlightFail({
        flowId,
        errorClass: classifyError(new Error('multi_swap_all_legs_failed')),
      })
    )
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
    return
  }

  yield* put(multiSwapCompleted())
  yield* put(inFlightAdvance({ flowId, toStatus: 'succeeded' }))

  // Aggregate the legs into a single success screen. fromAmount is the sum of
  // the whole-unit dollar amounts spent (USD-equivalent since each leg's
  // amountTokenWhole is already in USD-pegged units, subject to <1% peg
  // variance we accept). toAmount is the sum of Pesos received across legs.
  // Last leg's txHash is used for the top-level explorer link; per-leg hashes
  // are attached to each row in the breakdown.
  if (legs.length > 0) {
    const fromAmountTotal = legs
      .reduce((sum, l) => sum.plus(new BigNumber(l.fromAmount)), new BigNumber(0))
      .toString()
    const toAmountTotal = legs
      .reduce((sum, l) => sum.plus(new BigNumber(l.toAmount)), new BigNumber(0))
      .toString()
    // Aggregate Squid integrator fee in USD across all legs. Displayed as
    // "Tarifa de app ≈ COP $X" on the success screen so the ~1% cut is
    // visible instead of hidden inside the delivered amount.
    const appFeeUsdTotal = legs
      .reduce((sum, l) => sum.plus(new BigNumber(l.appFeeUsd)), new BigNumber(0))
      .toString()
    // Persist per-leg fee metadata so the tx-details 'Cambiar' screen can
    // render the same 'Tarifa del proveedor' row later, even after the
    // pending tx is replaced by the indexer's version (which doesn't emit
    // AppFee for these paths).
    // Persist provider + fee per leg unconditionally so the tx-details
    // 'Cambiar' screen renders the Proveedor row for every leg, even when
    // Squid's integrator take on that hop was 0.
    for (const l of legs) {
      yield* put(
        recordSwapFeeMetadata({
          txHash: l.transactionHash,
          appFeeUsd: new BigNumber(l.appFeeUsd).gt(0) ? l.appFeeUsd : '0',
          provider: 'squid',
        })
      )
    }

    // Aggregate standby transaction (2026-08-28). Each leg's per-tx standby
    // was suppressed via suppressStandbyDispatch on its SwapInfo, so this
    // is the ONLY entry the feed sees for the whole multi-swap. Renders
    // as a single "Dolares > Pesos" row via SwapFeedItem's isMultiDollarSwap
    // (triggered by fromTokenAmounts.length > 1) instead of N per-token
    // "Intercambio USDm > Pesos" / "USDC > Pesos" / "USDT > Pesos" rows.
    //
    // txHash: last leg's tx. When the backend indexer eventually surfaces
    // the individual on-chain txs, the last one dedupes against this
    // standby by hash; the earlier legs surface as their own indexed
    // items but with feed grouping applied downstream (backend WRI Track
    // C gated behind WRI_TX_FEED_TUCOP_V1). Until that gate is on, the
    // feed will still show the earlier legs as separate rows AFTER
    // indexer takes over from standby - client-side collapse only covers
    // the optimistic window.
    //
    // fromTokenAmounts: one entry per leg, in the order they executed.
    // outAmountTokenId: for multi-leg, pin to usdmTokenId (SwapFeedItem
    // uses this as an isMultiDollarSwap trigger + convention marker).
    // For single-leg, use the concrete tokenId so the row still says
    // "Dolares (USDT)" rather than a generic label.
    const fromTokenAmounts = legs.map((l) => ({
      tokenId: l.fromTokenId,
      value: l.fromAmount,
    }))
    const aggregateOutTokenId = legs.length === 1 ? legs[0].fromTokenId : networkConfig.usdmTokenId
    yield* put(
      addStandbyTransaction({
        context: newTransactionContext(TAG, 'Dolares -> Pesos aggregate'),
        networkId,
        type: TokenTransactionTypeV2.SwapTransaction,
        transactionHash: legs[legs.length - 1].transactionHash,
        inAmount: {
          tokenId: toTokenId,
          value: toAmountTotal,
        },
        outAmount: {
          tokenId: aggregateOutTokenId,
          value: fromAmountTotal,
        },
        fromTokenAmounts,
      })
    )
    navigate(Screens.TransactionSuccessScreen, {
      // Use the virtual Dolares tokenId so the aggregate row renders as
      // "3.00 Dolares" (the sum across USDm + USDC + USDT legs) instead of
      // labelling with one specific stablecoin brand. The per-leg breakdown
      // still uses the concrete tokenIds below, so the user can see which
      // brand each portion came from.
      fromTokenId: DOLARES_VIRTUAL_TOKEN_ID,
      toTokenId,
      fromAmount: fromAmountTotal,
      toAmount: toAmountTotal,
      transactionHash: legs[legs.length - 1].transactionHash,
      networkId,
      type: 'swap' as const,
      appFeeUsd: appFeeUsdTotal,
      legs,
    })
  }
}

export function* dollarsSpendSaga() {
  yield* takeEvery(executeMultiSwap.type, executeMultiSwapSaga)
}
