import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { call, delay, put, select } from 'typed-redux-saga'
import { Address, encodeFunctionData, erc20Abi, Hex, TypedDataDefinition } from 'viem'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FeeEvents } from 'src/analytics/Events'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { classifyHttpError } from 'src/sentry/classifyHttpError'
import { BATCH_EXECUTOR_ABI } from 'src/dollarsSpend/batchExecutorAbi'
import { preflightBatchSimulate } from 'src/dollarsSpend/preflightBatchSimulate'
import { ExecuteMultiSwapPayload, MULTI_SWAP_SLIPPAGE_PERCENTAGE } from 'src/dollarsSpend/saga'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
  multiSwapTransitionComplete,
} from 'src/dollarsSpend/slice'
import { DOLARES_VIRTUAL_TOKEN_ID, SpendStep } from 'src/dollarsSpend/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { recordSwapFeeMetadata } from 'src/swap/slice'
import { postBuildTx } from 'src/swap/uniswapV4Saga'
import { UNISWAP_V4_PROVIDER } from 'src/swap/types'
import { extractSquidEnvelope, fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { addStandbyTransaction } from 'src/transactions/slice'
import { newTransactionContext, TokenTransactionTypeV2 } from 'src/transactions/types'
import {
  feeCurrenciesSelector,
  nativeFeeCurrencySelector,
  tokensByIdSelector,
} from 'src/tokens/selectors'
import { computeReceiptNetworkFee } from 'src/swap/computeReceiptNetworkFee'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
import { pickFeeCurrency } from 'src/tokens/feeCurrencyPicker'
import type { TokenBalance } from 'src/tokens/slice'
import { Network, NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { walletAddressSelector } from 'src/web3/selectors'

const TAG = 'dollarsSpend/saga7702'

// Escalating slippage tolerance for the preflight retry loop. Each Squid leg
// freezes its `guaranteedPrice` at quote-fetch time; if the pool moves more
// than the slippage cushion between fetch and simulate, the atomic batch's
// inner call reverts and the whole batch aborts. The atomic 7702 path is
// especially sensitive because N legs stacked in one tx compound the risk -
// any single leg exceeding its cushion aborts them all.
//
// Attempts start at the legacy multi-swap base (1.5%) and progressively widen
// so the fetcher pulls tighter quotes first (better price to the user) and
// only relaxes if the market has genuinely moved. A batch that still reverts
// at 3.5% signals a real problem (Squid degraded, deep liquidity issue,
// pathological pool state) and the atomic-failure sheet surfaces to the
// user. Guards against baseFee-independent pool volatility - even with an
// idle chain, Squid pools can drift enough between two block heights to bust
// a 0.5% cushion.
const PREFLIGHT_SLIPPAGE_ESCALATION = [
  MULTI_SWAP_SLIPPAGE_PERCENTAGE, // 1.5% - matches legacy per-leg saga baseline
  '2.5',
  '3.5',
] as const
const PREFLIGHT_INTER_ATTEMPT_DELAY_MS = 300

interface InnerCall {
  target: Address
  value: bigint
  data: Hex
}

// Per-leg outcome from a successful build, aggregated into the standby tx +
// success screen. Exported shape kept in sync with the outer saga's usage.
type StepOutcome = {
  tokenId: string
  outAmountTokenWhole: BigNumber
  inAmountTokenWhole: BigNumber
  usd: BigNumber
  appFeePercentageIncludedInPrice?: string
}

/**
 * Build inner Call[] for the atomic 7702 batch at a given slippage tolerance.
 *
 * Extracted from `executeDollarsSpend7702Saga` so the outer saga can invoke
 * this multiple times with escalating slippage inside its preflight retry
 * loop, without re-running the once-per-flow setup (walletAddress + tokens
 * selection). Each attempt pulls fresh Squid / Uniswap-V4 quotes so retries
 * are not just re-submitting stale data.
 *
 * Contract:
 *   - `kind: 'hard-error'` means the helper already dispatched the correct
 *     multiSwapStepFailed + multiSwapTransitionComplete actions AND the
 *     outer saga MUST return immediately without retry. Used for terminal
 *     conditions (token missing from Redux state, malformed prepared tx,
 *     V4 permit2 build-tx failure) where widening slippage would not help.
 *   - `kind: 'ok'` carries the assembled `innerCalls` + per-leg
 *     `stepOutcomes`. The outer saga runs preflight simulation on the
 *     encoded batch calldata and, on revert, retries this helper with the
 *     next wider slippage.
 *
 * Quote-fetch errors (Squid 429/502, network) surface as 'hard-error' with
 * the enriched envelope threaded through, so PartialSuccessSheet can render
 * the correct copy (rate-limited, USDT fallback hint, generic).
 */
function* buildBatchInnerCalls(
  walletAddress: string,
  steps: SpendStep[],
  toTokenId: string,
  slippagePercentage: string,
  tokensById: Record<string, TokenBalance | undefined>
) {
  const innerCalls: InnerCall[] = []
  const stepOutcomes: StepOutcome[] = []

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const fromToken = tokensById[step.tokenId]
    if (!fromToken) {
      yield* put(
        multiSwapStepFailed({
          index: 0,
          errorMessage: `Token not found in wallet state: ${step.symbol}`,
        })
      )
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return { kind: 'hard-error' as const }
    }

    const feeCurrencies = yield* select(feeCurrenciesSelector, fromToken.networkId as NetworkId)

    let freshQuote: Awaited<ReturnType<typeof fetchSwapQuoteForExecution>>
    try {
      // Cap the planned step amount at the actual on-chain balance. planSpend
      // operates on Redux state which can lag behind real chain state when the
      // user has been transacting recently. Without this cap, the saga can
      // build inner calls that exceed the user's actual balance, and the entire
      // atomic 7702 batch reverts in estimateGas (one inner transferFrom fails
      // because the planned amount is larger than the current balance).
      const tokenAddress = step.tokenId.split(':')[1] as Address
      const onchainBalance = yield* call(() =>
        publicClient[Network.Celo].readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as Address],
        })
      )
      const plannedAmountWei = step.amountTokenWhole
        .shiftedBy(step.decimals)
        .integerValue(BigNumber.ROUND_DOWN)
      const cappedAmountWei = BigNumber.min(
        plannedAmountWei,
        new BigNumber(onchainBalance.toString())
      )
      if (cappedAmountWei.lte(0)) {
        Logger.warn(TAG, `Step ${index} (${step.symbol}) has zero on-chain balance; skipping`)
        continue
      }
      const amountInWei = cappedAmountWei.toFixed(0)
      freshQuote = yield* call(fetchSwapQuoteForExecution, {
        fromTokenId: step.tokenId,
        toTokenId,
        amount: amountInWei,
        walletAddress,
        fromToken,
        feeCurrencies,
        // Explicit slippage per attempt. Previously omitted, which fell
        // through to `fetchSwapQuoteForExecution`'s 0.5% default and made
        // the atomic path 3x tighter than the legacy per-leg saga (1.5%).
        // The preflight retry loop now passes an escalating value here.
        slippagePercentage,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Logger.warn(TAG, `Quote refetch failed for step ${index} (${step.symbol}): ${message}`)
      const envelope = extractSquidEnvelope(err)
      yield* put(multiSwapStepFailed({ index: 0, errorMessage: message, errorEnvelope: envelope }))
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return { kind: 'hard-error' as const }
    }

    if (freshQuote.preparedTransactions.type !== 'possible') {
      yield* put(
        multiSwapStepFailed({
          index: 0,
          errorMessage: `Prepared transactions not possible for step ${index} (${step.symbol})`,
        })
      )
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return { kind: 'hard-error' as const }
    }

    for (const tx of freshQuote.preparedTransactions.transactions) {
      if (!tx.to || tx.data === undefined) {
        yield* put(
          multiSwapStepFailed({
            index: 0,
            errorMessage: `Malformed prepared transaction for step ${index} (${step.symbol})`,
          })
        )
        yield* delay(50)
        yield* put(multiSwapTransitionComplete())
        return { kind: 'hard-error' as const }
      }
      innerCalls.push({
        target: tx.to as Address,
        value: tx.value ?? BigInt(0),
        data: tx.data as Hex,
      })
    }

    // Uniswap V4 leg: the quote came back with the sentinel `data: "0x"` on
    // the swap side (createBaseSwapTransactions skips it for us, so only the
    // ERC20 approve — if any — is in preparedTransactions above). Two
    // possible metadata shapes to reach the real UR call:
    //
    //  1. batchCalls (delegated user branch, common for our EIP-7702
    //     spike/production wallets): backend hands us the Permit2.approve
    //     + UniversalRouter.execute calls fully encoded. Wallet just
    //     appends both to innerCalls of the outer 7702 batch — the whole
    //     thing runs atomically and needs no Permit2 signature. Cheapest
    //     path, one on-chain tx for the entire multi-leg Dolares batch.
    //
    //  2. permit2 (undelegated EOA branch, dead code today because our
    //     users are all 7702 delegated by the time they reach 7702 saga —
    //     saga.ts routes non-delegated users through the legacy loop
    //     instead). Kept for defense: unlock, sign typedData, POST
    //     /build-tx, append the returned {to, data, value}.
    //
    // Non-V4 legs (Squid) skip this whole block.
    if (freshQuote.provider === UNISWAP_V4_PROVIDER && freshQuote.batchCalls) {
      for (const call of freshQuote.batchCalls) {
        innerCalls.push({
          target: call.to as Address,
          value: BigInt(call.value || '0'),
          data: call.data as Hex,
        })
      }
    } else if (freshQuote.provider === UNISWAP_V4_PROVIDER && freshQuote.permit2) {
      yield* call(getConnectedUnlockedAccount)
      const wallet = yield* call(getViemWallet, networkConfig.viemChain[Network.Celo])
      if (!wallet.account) {
        yield* put(
          multiSwapStepFailed({
            index: 0,
            errorMessage: `No account available for uniswap-v4 sign step ${index}`,
          })
        )
        yield* delay(50)
        yield* put(multiSwapTransitionComplete())
        return { kind: 'hard-error' as const }
      }
      const account = wallet.account
      const permit2Signature: Hex = yield* call(() =>
        account.signTypedData!(freshQuote.permit2!.typedData as unknown as TypedDataDefinition)
      )
      let buildResult: Awaited<ReturnType<typeof postBuildTx>>
      try {
        buildResult = yield* call(postBuildTx, freshQuote.permit2.buildTxUrl, {
          ...freshQuote.permit2.buildTxRequest,
          permit2Signature,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        Logger.warn(TAG, `uniswap-v4 build-tx failed for step ${index}: ${message}`)
        yield* put(multiSwapStepFailed({ index: 0, errorMessage: message }))
        yield* delay(50)
        yield* put(multiSwapTransitionComplete())
        return { kind: 'hard-error' as const }
      }
      innerCalls.push({
        target: buildResult.to as Address,
        value: BigInt(buildResult.value || '0'),
        data: buildResult.data as Hex,
      })
    }

    // Record what this step actually contributes (capped to on-chain balance).
    // step.amountUsd is the planned USD; we recompute proportional USD from the
    // capped fraction so the "primary" step pick stays correct even when the
    // user's on-chain balance is less than the plan.
    //
    // Squid returns sellAmount / buyAmount in BASE UNITS (wei). Convert both
    // to whole tokens here so the standby TokenAmount.value matches Valora's
    // convention (whole tokens with decimal, e.g. "1.005987267070000000").
    // Without this shift, the feed displays raw wei (e.g. "10,312,541,975,..."
    // Pesos), which is what regressed in the previous build.
    const toToken = tokensById[toTokenId]
    const toTokenDecimals = toToken?.decimals ?? 18
    const sellAmountWei = new BigNumber(freshQuote.swapAmount.FROM?.toString() ?? '0')
    const buyAmountWei = new BigNumber(freshQuote.swapAmount.TO?.toString() ?? '0')
    const outAmountWhole = sellAmountWei.shiftedBy(-step.decimals)
    const inAmountWhole = buyAmountWei.shiftedBy(-toTokenDecimals)
    const cappedFraction = step.amountTokenWhole.gt(0)
      ? outAmountWhole.dividedBy(step.amountTokenWhole)
      : new BigNumber(1)
    const usdContribution = step.amountUsd.multipliedBy(
      BigNumber.min(cappedFraction, new BigNumber(1))
    )
    stepOutcomes.push({
      tokenId: step.tokenId,
      outAmountTokenWhole: outAmountWhole,
      inAmountTokenWhole: inAmountWhole,
      usd: usdContribution,
      appFeePercentageIncludedInPrice: freshQuote.appFeePercentageIncludedInPrice,
    })
  }

  return { kind: 'ok' as const, innerCalls, stepOutcomes }
}

/**
 * EIP-7702 + CIP-64 saga path for dollarsSpend.
 *
 * Behind StatsigFeatureGates.WRI_DOLLARS_SPEND_7702_V1. When enabled, the
 * full multi-step plan is collapsed into ONE transaction:
 *   1. Sign an EIP-7702 authorization delegating the EOA to the BatchExecutor.
 *   2. Build inner Call[] for each step (approve + swap) using fresh quotes.
 *   3. Submit a single tx type 0x7b (CIP-64) carrying the auth list + the
 *      `to = walletAddress, data = BatchExecutor.execute(calls)` payload, with
 *      feeCurrency set to the first ERC-20 the user is spending so gas is
 *      paid in USDm/USDC/USAT/USDT rather than CELO.
 *
 * Confirmed live on Celo mainnet in the S1 spike. See
 * contracts-research/scripts/s1-submit-7702-with-feecurrency.mjs.
 *
 * On any failure (auth, quote, submit) we dispatch multiSwapStepFailed at
 * index 0 because the entire batch is atomic — there is no partial success
 * for the user to recover from in this path.
 *
 * Preflight retry loop (baseFee-independent robustness):
 *   Between build and submit, the batch calldata is simulated via `eth_call`.
 *   If simulation reverts (Squid pool moved past the slippage cushion between
 *   quote fetch and simulate), the helper rebuilds with a wider slippage and
 *   retries. Escalation is 1.5% -> 2.5% -> 3.5%. Only after all three attempts
 *   revert does the user see the atomic-failure sheet - at which point the
 *   pool state has genuinely moved more than 3.5% since fetch (Squid degraded,
 *   deep liquidity issue) and no wallet-side widening would rescue the batch.
 */
export function* executeDollarsSpend7702Saga(action: PayloadAction<ExecuteMultiSwapPayload>) {
  const { steps, toTokenId } = action.payload

  if (steps.length === 0) {
    return
  }

  yield* put(
    multiSwapStarted({
      steps,
      isAtomic: true,
      destinationLabel: toTokenId === networkConfig.xaut0TokenId ? 'Oro' : 'Pesos',
    })
  )

  const walletAddress = yield* select(walletAddressSelector)
  if (!walletAddress) {
    yield* put(
      multiSwapStepFailed({ index: 0, errorMessage: 'Wallet address unavailable for 7702 batch' })
    )
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
    return
  }

  const tokensById = yield* select(tokensByIdSelector, getSupportedNetworkIdsForSwap())

  // Preflight retry loop: build the batch, encode calldata, simulate via
  // eth_call. Every attempt refetches quotes at a wider slippage - critical
  // because Squid's guaranteedPrice is frozen at quote-fetch time and Squid
  // pools can drift more than 0.5%-1.5% between fetch and submit regardless
  // of baseFee. Retrying with fresh quotes gets us fresh guaranteedPrice
  // targets that reflect current pool state.
  //
  // Only `revert` from preflight triggers a retry. `other` (network / RPC
  // failure hitting Forno) is passed through - retrying with wider slippage
  // would not fix an RPC outage, and we let the outer sendTransaction path
  // surface whatever the RPC eventually returns. Hard errors from the build
  // helper (token missing, malformed prepared tx) also terminate the flow
  // immediately without retry, since re-fetching quotes cannot resolve them.
  let innerCalls: InnerCall[] | null = null
  let stepOutcomes: StepOutcome[] | null = null
  let calldata: Hex | null = null
  let lastPreflightRevertMessage: string | null = null

  for (let attemptIdx = 0; attemptIdx < PREFLIGHT_SLIPPAGE_ESCALATION.length; attemptIdx++) {
    const slippage = PREFLIGHT_SLIPPAGE_ESCALATION[attemptIdx]

    const built = yield* call(
      buildBatchInnerCalls,
      walletAddress,
      steps,
      toTokenId,
      slippage,
      tokensById
    )
    if (built.kind === 'hard-error') {
      // Helper already dispatched multiSwapStepFailed + transitionComplete.
      // The failure is intrinsic (missing token, malformed quote response,
      // V4 build-tx down) so retrying with wider slippage would just re-run
      // the same broken path. Terminate.
      return
    }

    if (built.innerCalls.length === 0) {
      yield* put(multiSwapStepFailed({ index: 0, errorMessage: 'No inner calls to execute' }))
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }

    const attemptCalldata = encodeFunctionData({
      abi: BATCH_EXECUTOR_ABI,
      functionName: 'execute',
      args: [built.innerCalls],
    })

    const sim = yield* call(preflightBatchSimulate, {
      walletAddress: walletAddress as Address,
      batchExecutorCalldata: attemptCalldata,
    })

    if (sim.ok) {
      Logger.info(
        TAG,
        `preflight OK at slippage=${slippage}% (attempt ${attemptIdx + 1}/${PREFLIGHT_SLIPPAGE_ESCALATION.length})`
      )
      innerCalls = built.innerCalls
      stepOutcomes = built.stepOutcomes
      calldata = attemptCalldata
      break
    }

    if (sim.kind === 'other') {
      // Preflight itself failed on a non-revert (RPC timeout, transport error).
      // Retrying with wider slippage will not fix an RPC problem. Fall through
      // to the sendTransaction path with THIS attempt's calldata - Forno's
      // real eth_estimateGas at submit time might succeed if the RPC recovers,
      // and if it also fails the outer catch handles it consistently with the
      // legacy failure UX.
      Logger.warn(
        TAG,
        `preflight non-revert error at slippage=${slippage}% (attempt ${attemptIdx + 1}); proceeding to submit without further retries: ${sim.errorMessage.slice(0, 200)}`
      )
      innerCalls = built.innerCalls
      stepOutcomes = built.stepOutcomes
      calldata = attemptCalldata
      break
    }

    // sim.kind === 'revert' - Squid pool moved past the slippage cushion.
    // Log and retry at the next wider slippage.
    lastPreflightRevertMessage = sim.errorMessage
    Logger.warn(
      TAG,
      `preflight reverted at slippage=${slippage}% (attempt ${attemptIdx + 1}/${PREFLIGHT_SLIPPAGE_ESCALATION.length}): ${sim.errorMessage.slice(0, 200)}`
    )
    if (attemptIdx < PREFLIGHT_SLIPPAGE_ESCALATION.length - 1) {
      // Brief pause before the next fetch+preflight cycle. Not for the wallet's
      // sake (we do not depend on time) but so we do not hammer the backend's
      // per-wallet Squid rate-limit bucket (10 RPS).
      yield* delay(PREFLIGHT_INTER_ATTEMPT_DELAY_MS)
    }
  }

  if (calldata === null || innerCalls === null || stepOutcomes === null) {
    // All preflight attempts reverted. The message shape includes "reverted"
    // + "eth_call" + "viem" so PartialSuccessSheet.tsx's looksLikeOnchainRevert
    // heuristic matches and the user sees `bodyPriceMoved` - which is accurate:
    // Squid pool prices moved past even our widest slippage cushion (3.5%)
    // between quote fetch and simulate.
    const maxSlippage = PREFLIGHT_SLIPPAGE_ESCALATION[PREFLIGHT_SLIPPAGE_ESCALATION.length - 1]
    const detail = lastPreflightRevertMessage ? lastPreflightRevertMessage.slice(0, 200) : 'unknown'
    const summary = `Batch preflight reverted after ${PREFLIGHT_SLIPPAGE_ESCALATION.length} eth_call attempts with escalating slippage up to ${maxSlippage}%. Last revert: ${detail}. Request Arguments: viem preflight simulate.`
    captureBusinessError(new Error(summary), {
      feature: 'dollars_spend',
      provider: 'internal',
      action: 'preflight_exhausted_7702',
      errorCode: 'preflight_revert',
    })
    yield* put(multiSwapStepFailed({ index: 0, errorMessage: summary }))
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
    return
  }

  try {
    const wallet = yield* call(getViemWallet, networkConfig.viemChain[Network.Celo])
    const account = wallet.account
    if (!account) {
      throw new Error('Wallet has no account loaded')
    }

    // Unlock the keychain account before signing the tx. The legacy path goes
    // through sendPreparedTransactions which calls this internally; here we
    // call sendTransaction directly so we must unlock ourselves.
    yield* call(getConnectedUnlockedAccount)

    // The caller (src/dollarsSpend/saga.ts) has already verified that the
    // user's EOA is delegated to our hardened BatchExecutor. So we don't sign
    // or include an EIP-7702 authorizationList here — the delegation persists
    // on-chain. Calling execute() directly against the EOA invokes the
    // BatchExecutor code in the EOA's context.
    //
    // A single CIP-64 tx (type 0x7b) pays gas in the user-facing stable.
    // EIP-7702 (type 0x04) and CIP-64 are mutually-exclusive tx envelopes in
    // Celo, so combining authorizationList + feeCurrency in one tx makes the
    // node reject estimateGas. The relay endpoint handles the one-time
    // delegation tx separately (paid in CELO from a TuCop hot wallet).
    //
    // `calldata` was assembled by the outer preflight retry loop above from
    // the innerCalls of whichever slippage attempt cleared eth_call simulate
    // (or the last attempt that failed with a non-revert error). We reference
    // it directly here instead of re-encoding.

    // Pick a fee currency via the central picker.
    //
    // Post Bug-E-reversal (2026-08-20): CELO is preferred first. CELO is
    // invisible in the app (excluded from ALLOWED_TOKEN_IDS) so silently
    // draining it beats draining a visible stable (Dolares/Pesos) that the
    // user is counting on. `pickFeeCurrency` is order-preserving and
    // `feeCurrenciesSelector` returns CELO at index 0 whenever the wallet
    // has any on chain, so we just iterate the supplied list.
    //
    // Two kinds of CIP-64 fee currency (both still handled by the picker):
    //   - Native (isFeeCurrency=true): Mento stables registered with the
    //     protocol. Gas debited natively, no allowance required.
    //   - Adapter-based (feeCurrencyAdapterAddress set): protocol pulls the
    //     underlying token via transferFrom on the adapter, requiring a prior
    //     approve(adapter, allowance). The pre-tx gas debit happens BEFORE
    //     the batch executes, so we can't bootstrap allowance inside this
    //     same tx; we pre-flight allowance here and pass under-approved
    //     adapters into `adapterAllowanceMissing` so the picker skips them.
    //
    // We never pay gas in a token that's in the spending set: gas would race
    // the capped-to-balance swap input and the outer tx would revert.
    // feeCurrenciesSelector synthesizes CELO for celo-mainnet from
    // state.tokens.nativeCeloBalance (populated by fetchTokenBalancesSaga).
    const feeCurrencyCandidates = yield* select(feeCurrenciesSelector, NetworkId['celo-mainnet'])

    // 1e30 wei: ~1T units of an 18-decimal token, far above any single tx's
    // gas cost. Built via repeated multiplication because the current
    // tsconfig target rejects BigInt exponentiation.
    let ALLOWANCE_THRESHOLD = BigInt(1)
    for (let _i = 0; _i < 30; _i++) ALLOWANCE_THRESHOLD = ALLOWANCE_THRESHOLD * BigInt(10)

    const adapterAllowanceMissing: string[] = []
    for (const candidate of feeCurrencyCandidates) {
      if (!candidate.address) continue
      if (!candidate.feeCurrencyAdapterAddress) continue
      if (candidate.isFeeCurrency) continue // native Mento, no allowance needed
      if (!candidate.balance.gt(0)) continue // balance check handled by picker
      const allowance = yield* call(() =>
        publicClient[Network.Celo].readContract({
          address: candidate.address as Address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [walletAddress as Address, candidate.feeCurrencyAdapterAddress as Address],
        })
      )
      if (allowance < ALLOWANCE_THRESHOLD) {
        adapterAllowanceMissing.push(candidate.address)
        Logger.info(
          TAG,
          `skipping ${candidate.symbol} as fee currency: adapter allowance insufficient (${allowance.toString()})`
        )
      }
    }

    // Multi-swap fee-currency policy (2026-08-28): exclude a token from the
    // fee-currency pool when its RESIDUAL (balance - planned spend) cannot
    // cover the outer batch's gas. The atomic 7702 path packs all N legs
    // into ONE tx, so gas is paid once for the whole batch (~2-3M gas at
    // 3 legs). $0.30 USD covers stress baseFee (~200 gwei) with margin.
    // See legacy saga.ts for detailed rationale on why partial-drain tokens
    // still need a minimum residual to be safe fee currencies.
    const MIN_FEE_RESIDUAL_USD = new BigNumber('0.30')
    const excludedFromFee = steps
      .filter((s) => {
        const tok = tokensById[s.tokenId]
        if (!tok) return true
        const residual = tok.balance.minus(s.amountTokenWhole)
        if (residual.lte(0)) return true
        const priceUsd = tok.priceUsd
        if (!priceUsd) return true
        return residual.multipliedBy(priceUsd).lt(MIN_FEE_RESIDUAL_USD)
      })
      .map((s) => s.tokenId.split(':')[1])

    const choice = pickFeeCurrency({
      available: feeCurrencyCandidates,
      excludeTokenIds: excludedFromFee,
      adapterAllowanceMissing,
    })

    if (!choice) {
      throw new Error(
        'No usable fee currency: need CELO native, a native Mento fee currency, or a pre-approved adapter outside the spending set'
      )
    }

    // Map a TokenBalance candidate to the actual on-chain fee-currency arg:
    //   - CELO native -> undefined (type 0x02 eip1559, no feeCurrency field)
    //   - adapter-based -> adapter address (protocol pulls via transferFrom)
    //   - native Mento -> token address
    const toFeeCurrencyArg = (candidate: TokenBalance): Hex | undefined => {
      if (candidate.symbol === 'CELO') return undefined
      if (candidate.feeCurrencyAdapterAddress) {
        return candidate.feeCurrencyAdapterAddress as Hex
      }
      return candidate.address as Hex
    }

    // Cascade-on-revert: try the picker's chosen currency first; if
    // sendTransaction reverts with a fee-currency-related error (insufficient
    // funds, fee currency not supported, gas issues), fall through to
    // alternatives[0], [1], ... until one succeeds or the list is exhausted.
    // Non-fee-currency errors (user rejected, slippage, RPC timeout) bubble
    // immediately so the cascade doesn't mask unrelated failures.
    const cascadeCandidates: TokenBalance[] = [choice.chosen, ...choice.alternatives]
    let hash: Hex | undefined
    let finalCandidate: TokenBalance = choice.chosen
    let cascadeAttempts = 0
    let lastError: unknown
    for (let attempt = 0; attempt < cascadeCandidates.length; attempt++) {
      const candidate = cascadeCandidates[attempt]
      const feeCurrencyArg = toFeeCurrencyArg(candidate)
      Logger.info(
        TAG,
        `sendTransaction attempt ${attempt + 1}/${cascadeCandidates.length} with feeCurrency=${candidate.symbol} (${feeCurrencyArg ?? 'native CELO'})`
      )
      const sendArgs = {
        account,
        to: walletAddress as Address,
        data: calldata,
        ...(feeCurrencyArg && { feeCurrency: feeCurrencyArg }),
      } as unknown as Parameters<typeof wallet.sendTransaction>[0]
      try {
        hash = yield* call(() => wallet.sendTransaction(sendArgs))
        finalCandidate = candidate
        cascadeAttempts = attempt
        break
      } catch (err) {
        lastError = err
        const message = err instanceof Error ? err.message : String(err)
        // Only cascade on errors that suggest a different currency might help.
        // Treat everything else (user-rejected, slippage, RPC) as terminal.
        const looksLikeFeeCurrencyIssue =
          /insufficient funds|fee currency|gas.{0,30}(too low|insufficient)|cip.?64/i.test(message)
        const hasMoreAlternatives = attempt < cascadeCandidates.length - 1
        if (!looksLikeFeeCurrencyIssue || !hasMoreAlternatives) {
          throw err
        }
        Logger.warn(
          TAG,
          `feeCurrency=${candidate.symbol} attempt failed (${message}); cascading to next alternative`
        )
      }
    }
    if (hash === undefined) {
      // Defensive: the loop above either breaks with a hash or throws. This
      // branch is only reachable if the candidate list was empty, which
      // pickFeeCurrency already guards against (returns null instead).
      throw lastError ?? new Error('No fee currency succeeded')
    }

    // Reason reflects the FINAL choice after any cascade fallback: a cascade
    // that landed on a stable still counts as preferred-stable; one that
    // landed on CELO is celo-fallback. cascadeAttempts tells the team whether
    // the first try worked (0) or how many alternatives were burned through.
    Logger.info(
      TAG,
      `picked fee currency: ${finalCandidate.symbol} (declined=${choice.declined.length}, alternatives=${choice.alternatives.length}, cascadeAttempts=${cascadeAttempts})`
    )
    AppAnalytics.track(FeeEvents.fee_currency_picked, {
      context: 'dollarsSpend_7702',
      chosenSymbol: finalCandidate.symbol,
      reason: 'first-viable',
      declinedCount: choice.declined.length,
      alternativesCount: choice.alternatives.length,
      cascadeAttempts,
      networkId: NetworkId['celo-mainnet'],
    })

    Logger.info(TAG, `Submitted 7702 dollarsSpend batch: ${hash}`)

    // Aggregate the planned outcomes across all legs:
    //   - totalInAmount: COPm received (sum of per-leg quote.swapAmount.TO)
    //   - totalOutUsd:   USD value spent (sum of per-leg usd contributions)
    //
    // Atomic batches consume multiple from-tokens (USDm + USDC + USDT) but the
    // SwapTransaction shape only has ONE outAmount. We aggregate by USD value
    // (1:1 across stables) and pin the display tokenId to USDm, which the feed
    // renders as "Dolares" via SwapFeedItem.getTokenName(). That matches what
    // the user spent ("$3") instead of showing only the largest leg ("$1.02").
    const totalInAmount = stepOutcomes.reduce(
      (acc, o) => acc.plus(o.inAmountTokenWhole),
      new BigNumber(0)
    )
    const totalOutUsd = stepOutcomes.reduce((acc, o) => acc.plus(o.usd), new BigNumber(0))

    // Optimistic standby tx so the feed shows the swap immediately, before the
    // indexer (Valora or TuCop backend WRI Track C) classifies the type 0x02
    // self-to-self execute() call. The standby is auto-deduped from
    // transactions/slice when the real feed brings the same hash.
    if (stepOutcomes.length > 0) {
      // feeCurrencyId is omitted when paying gas in CELO native — the wallet's
      // tokens registry excludes CELO (ALLOWED_TOKEN_IDS), so setting it would
      // make handleTransactionReceiptReceived log a noisy "No information found
      // for fee currency" error when the receipt enriches the standby. For
      // adapter / non-CELO fee currencies, pass the tokenId so the UI can show
      // the fee in the correct token. Uses the cascade winner (finalCandidate)
      // so the standby reflects whichever currency actually paid for gas, not
      // the initially-chosen one if a cascade fallback fired.
      const finalFeeCurrencyArg = toFeeCurrencyArg(finalCandidate)
      const feeCurrencyId = finalFeeCurrencyArg
        ? `celo-mainnet:${finalFeeCurrencyArg.toLowerCase()}`
        : undefined
      // Value convention: whole tokens with decimal (Valora-compatible). The
      // wallet's UI assumes whole-token strings; emitting wei here would
      // display amounts 10^decimals too large.
      //
      // fromTokenAmounts mirrors the TuCop indexer shape for atomic 7702
      // batches: one entry per leg with its concrete tokenId + whole-token
      // amount. SwapFeedItem uses .length > 1 to switch the subtitle to the
      // aggregate multi-token copy ("3 monedas a Pesos") instead of naming a
      // single dollar-family stablecoin. Without this, the standby shows
      // "Dolares (USDm) > Pesos" for a batch that actually pulled USDm +
      // USDC + USDT, misrepresenting the swap until the indexer catches up.
      //
      // outAmount tokenId: for single-leg, use the actual leg's tokenId so the
      // feed label reflects what the user really spent (e.g. "Dolares (USDT)"
      // when the picker selected USDT because USDm balance was 0). Prior
      // implementation hardcoded usdmTokenId, misrepresenting USDC/USAT/USDT
      // single-leg spends. For multi-leg the pin does not manifest visually
      // because SwapFeedItem collapses to a generic "Dolares" via
      // isMultiDollarSwap regardless of outAmount.tokenId; usdmTokenId is
      // kept there as the historical indexer convention.
      const fromTokenAmounts = stepOutcomes.map((o) => ({
        tokenId: o.tokenId,
        value: o.outAmountTokenWhole.toFixed(),
      }))
      const outAmountTokenId =
        stepOutcomes.length === 1 ? stepOutcomes[0].tokenId : networkConfig.usdmTokenId
      yield* put(
        addStandbyTransaction({
          context: newTransactionContext(TAG, 'Dolares -> Pesos atomic batch'),
          networkId: NetworkId['celo-mainnet'],
          type: TokenTransactionTypeV2.SwapTransaction,
          transactionHash: hash,
          inAmount: {
            tokenId: toTokenId,
            value: totalInAmount.toFixed(),
          },
          outAmount: {
            tokenId: outAmountTokenId,
            value: totalOutUsd.toFixed(),
          },
          fromTokenAmounts,
          ...(feeCurrencyId && { feeCurrencyId }),
        })
      )
    }

    // Mark each step as succeeded optimistically — the batch is atomic, so
    // once submitted the user-facing progress reaches 100%. A production
    // follow-up polls the receipt and dispatches multiSwapStepFailed if the
    // tx reverts. For this scaffold we stay simple.
    for (let i = 0; i < steps.length; i++) {
      yield* put(multiSwapStepSucceeded({ index: i }))
    }
    yield* put(multiSwapCompleted())

    // Navigate to TransactionSuccessScreen, mirroring the legacy swap saga
    // (src/swap/saga.ts), the gold saga, the send saga, and the earn saga.
    // The success screen renders a StateCard with title + amounts + explorer
    // link, and its "Continuar" button takes the user to TabActivity (the
    // activity / history tab). Previously the saga called navigateHome()
    // directly, skipping the success screen entirely and breaking parity
    // with every other transaction flow in the wallet.
    //
    // When the batch had more than one leg, use the synthetic virtual
    // "Dolares" tokenId so the header row renders as "3.00 Dolares" (via
    // the DOLARES_VIRTUAL_TOKEN_ID branch of TokenAmountWithBrand) instead
    // of naming one specific stablecoin. The per-leg breakdown is passed
    // through `legs` so the screen shows the concrete USDT / USDC / USDm
    // amounts under the aggregate. Single-leg batches keep the concrete
    // tokenId so the header just shows "1.04 USDm" with no breakdown.
    const isMultiLeg = stepOutcomes.length > 1
    // Squid integrator fee per leg + aggregate. Same pattern as
    // dollarsSpend/saga.ts (non-7702 path) so both flows surface the ~1%
    // Squid cut on the success screen the same way.
    const legAppFees = stepOutcomes.map((o) => {
      const pct = new BigNumber(o.appFeePercentageIncludedInPrice ?? 0).dividedBy(100)
      return o.outAmountTokenWhole.multipliedBy(pct)
    })
    const appFeeUsdTotal = legAppFees.reduce((sum, u) => sum.plus(u), new BigNumber(0)).toString()
    // Persist the aggregate under the batch txHash. Atomic 7702 batches
    // land as a single tx on-chain, so one metadata entry suffices — the
    // per-leg amounts already sum into it and the tx-details screen only
    // has one hash to look up.
    // Wait for the receipt so we can compute the on-chain network fee
    // (gasUsed * effectiveGasPrice) and persist it alongside the Squid
    // integrator fee. Otherwise the success + tx-details screen would show
    // no 'Tarifa de red' row for this batch since the standby record has
    // no fees array populated yet at navigation time. Try/catch so a slow
    // Forno does not delay the success screen — the row simply hides if
    // the receipt is not ready.
    let batchNetworkFee: { value: string; tokenId: string } | null = null
    try {
      const batchReceipt = yield* call([publicClient[Network.Celo], 'waitForTransactionReceipt'], {
        hash,
      })
      const nativeFeeCurrencyForSaga = yield* select((s) =>
        nativeFeeCurrencySelector(s, NetworkId['celo-mainnet'])
      )
      const tokensByIdForSaga = yield* select((s) =>
        tokensByIdSelector(s, [NetworkId['celo-mainnet']])
      )
      batchNetworkFee = yield* call(computeReceiptNetworkFee, {
        publicClient: publicClient[Network.Celo],
        receipt: batchReceipt,
        networkId: NetworkId['celo-mainnet'],
        nativeFeeCurrency: nativeFeeCurrencyForSaga,
        tokensById: tokensByIdForSaga,
      })
    } catch (err) {
      Logger.warn(TAG, 'Failed to fetch batch receipt for fee compute', {
        err: err instanceof Error ? err.message : String(err),
      })
    }

    // Always dispatch (even when the aggregate integrator fee is 0) so the
    // success + tx-details Proveedor row renders for every atomic 7702
    // batch. Amount kept as '0' when no fee so the renderer skips the
    // 'Tarifa del proveedor' row while still surfacing the venue.
    // provider='squid-7702' only when we actually batched >1 leg into one
    // tx. Single-leg via 7702 stays 'squid' because there is no bundling
    // to advertise (formatSwapProvider maps 'squid-7702' -> 'Squid (7702)').
    // Per-leg breakdown for the tx-details 'Desglose por cambio' section.
    // Only populated for atomic 7702 batches (>1 leg), because those land
    // as ONE on-chain tx with ONE feeMetadata entry, so the SwapContent
    // renderer cannot recover per-leg data any other way. Legacy multi-leg
    // (non-7702) skips this since each leg already has its own hash + entry.
    const legFeesForPersist = isMultiLeg
      ? stepOutcomes.map((o, i) => ({
          tokenId: o.tokenId,
          amount: legAppFees[i].toString(),
        }))
      : undefined
    yield* put(
      recordSwapFeeMetadata({
        txHash: hash,
        appFeeUsd: new BigNumber(appFeeUsdTotal).gt(0) ? appFeeUsdTotal : '0',
        provider: isMultiLeg ? 'squid-7702' : 'squid',
        networkFeeValue: batchNetworkFee?.value,
        networkFeeTokenId: batchNetworkFee?.tokenId,
        legFees: legFeesForPersist,
      })
    )
    const successLegs = isMultiLeg
      ? stepOutcomes.map((o, i) => ({
          fromTokenId: o.tokenId,
          fromAmount: o.outAmountTokenWhole.toFixed(),
          toAmount: o.inAmountTokenWhole.toFixed(),
          transactionHash: hash,
          appFeeUsd: legAppFees[i].toString(),
        }))
      : undefined
    navigate(Screens.TransactionSuccessScreen, {
      fromTokenId: isMultiLeg ? DOLARES_VIRTUAL_TOKEN_ID : stepOutcomes[0].tokenId,
      toTokenId,
      fromAmount: isMultiLeg
        ? totalOutUsd.toFixed()
        : stepOutcomes[0].outAmountTokenWhole.toFixed(),
      toAmount: totalInAmount.toFixed(),
      transactionHash: hash,
      networkId: NetworkId['celo-mainnet'],
      type: 'swap' as const,
      appFeeUsd: new BigNumber(appFeeUsdTotal).gt(0) ? appFeeUsdTotal : undefined,
      ...(successLegs && { legs: successLegs }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    Logger.warn(TAG, `7702 batch failed: ${message}`)
    // Terminal failure of the atomic EIP-7702 batch. Distinct action tag
    // from the non-7702 step-by-step failure so the Sentry dashboard can
    // separate atomic-batch regressions from legacy-cascade regressions.
    captureBusinessError(err, {
      feature: 'dollars_spend',
      provider: 'internal',
      action: 'atomic_batch_7702',
      errorCode: classifyHttpError(err),
    })
    // Outer catch surfaces everything downstream of the quote step: sign
    // failures, RPC estimateGas reverts, submit failures. Even though these
    // are rarely a Squid-quote 429/502 (those are caught inside the per-step
    // block above), some wrapped errors CAN carry a SquidDegradationErr
    // (e.g. a delayed refetch), so keep the extraction here as belt+
    // suspenders. When the extraction returns null (typical for on-chain
    // reverts), the sheet's env-based branching falls through to the
    // generic body — same behaviour as before this line existed.
    const envelope = extractSquidEnvelope(err)
    yield* put(multiSwapStepFailed({ index: 0, errorMessage: message, errorEnvelope: envelope }))
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
  }
}
