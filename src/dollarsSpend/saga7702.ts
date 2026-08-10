import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { call, delay, put, select } from 'typed-redux-saga'
import { Address, encodeFunctionData, erc20Abi, Hex, TypedDataDefinition } from 'viem'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FeeEvents } from 'src/analytics/Events'
import { BATCH_EXECUTOR_ABI } from 'src/dollarsSpend/batchExecutorAbi'
import { ExecuteMultiSwapPayload } from 'src/dollarsSpend/saga'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
  multiSwapTransitionComplete,
} from 'src/dollarsSpend/slice'
import { DOLARES_VIRTUAL_TOKEN_ID } from 'src/dollarsSpend/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { postBuildTx } from 'src/swap/uniswapV4Saga'
import { UNISWAP_V4_PROVIDER } from 'src/swap/types'
import { fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { addStandbyTransaction } from 'src/transactions/slice'
import { newTransactionContext, TokenTransactionTypeV2 } from 'src/transactions/types'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
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

interface InnerCall {
  target: Address
  value: bigint
  data: Hex
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
 */
export function* executeDollarsSpend7702Saga(action: PayloadAction<ExecuteMultiSwapPayload>) {
  const { steps, toTokenId } = action.payload

  if (steps.length === 0) {
    return
  }

  yield* put(multiSwapStarted({ steps, isAtomic: true }))

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

  // Build inner Call[] from fresh quotes for each step. Each step's prepared
  // transactions are (optional approve) + swap; we forward both, preserving
  // order so the BatchExecutor runs the allowance bump before the swap call.
  const innerCalls: InnerCall[] = []

  // Track the actual (capped) outflow per step + estimated inflow per step.
  // We use these after sendTransaction to build an optimistic standby tx so
  // the user sees the swap in the feed before the indexer catches up. The
  // "primary" outflow is the largest USD step (matches the backend classifier
  // rule 1, which picks the same).
  type StepOutcome = {
    tokenId: string
    outAmountTokenWhole: BigNumber
    inAmountTokenWhole: BigNumber
    usd: BigNumber
  }
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
      return
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
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Logger.warn(TAG, `Quote refetch failed for step ${index} (${step.symbol}): ${message}`)
      yield* put(multiSwapStepFailed({ index: 0, errorMessage: message }))
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
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
      return
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
        return
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
        return
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
        return
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
    })
  }

  if (innerCalls.length === 0) {
    yield* put(multiSwapStepFailed({ index: 0, errorMessage: 'No inner calls to execute' }))
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
    const calldata = encodeFunctionData({
      abi: BATCH_EXECUTOR_ABI,
      functionName: 'execute',
      args: [innerCalls],
    })

    // Pick a fee currency via the Bug-E-aware central picker.
    //
    // Stables-first: paying gas in CELO silently shrinks a balance the user
    // can't see in the app (CELO is excluded from ALLOWED_TOKEN_IDS). We
    // route through `pickFeeCurrency` which deprioritizes CELO so any visible
    // stable wins. CELO remains as the last-resort fallback when no stable
    // qualifies.
    //
    // Two kinds of CIP-64 fee currency:
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

    // CELO is excluded from ALLOWED_TOKEN_IDS so the Redux fee-currency list
    // never contains it. Read native balance from chain and synthesize a
    // minimal TokenBalance so the picker can rank CELO as a last-resort
    // fallback alongside the stables.
    const celoNativeBalance = yield* call(() =>
      publicClient[Network.Celo].getBalance({ address: walletAddress as Address })
    )
    const syntheticCelo: TokenBalance | null =
      celoNativeBalance > BigInt(0)
        ? ({
            tokenId: 'celo-mainnet:native',
            address: null,
            networkId: NetworkId['celo-mainnet'],
            symbol: 'CELO',
            name: 'Celo',
            decimals: 18,
            balance: new BigNumber(celoNativeBalance.toString()).shiftedBy(-18),
            priceUsd: null,
            lastKnownPriceUsd: null,
            priceFetchedAt: Date.now(),
            isNative: true,
          } as unknown as TokenBalance)
        : null

    const spendingTokenAddresses = steps.map((s) => s.tokenId.split(':')[1])

    const choice = pickFeeCurrency({
      available: syntheticCelo ? [...feeCurrencyCandidates, syntheticCelo] : feeCurrencyCandidates,
      excludeTokenIds: spendingTokenAddresses,
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
    const finalReason: 'preferred-stable' | 'celo-fallback' =
      finalCandidate.symbol === 'CELO' ? 'celo-fallback' : 'preferred-stable'
    Logger.info(
      TAG,
      `picked fee currency: ${finalCandidate.symbol} (reason=${finalReason}, declined=${choice.declined.length}, alternatives=${choice.alternatives.length}, cascadeAttempts=${cascadeAttempts})`
    )
    AppAnalytics.track(FeeEvents.fee_currency_picked, {
      context: 'dollarsSpend_7702',
      chosenSymbol: finalCandidate.symbol,
      reason: finalReason,
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
    const successLegs = isMultiLeg
      ? stepOutcomes.map((o) => ({
          fromTokenId: o.tokenId,
          fromAmount: o.outAmountTokenWhole.toFixed(),
          toAmount: o.inAmountTokenWhole.toFixed(),
          transactionHash: hash,
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
      ...(successLegs && { legs: successLegs }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    Logger.warn(TAG, `7702 batch failed: ${message}`)
    yield* put(multiSwapStepFailed({ index: 0, errorMessage: message }))
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
  }
}
