import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { call, delay, put, select } from 'typed-redux-saga'
import { Address, encodeFunctionData, erc20Abi, Hex } from 'viem'
import { BATCH_EXECUTOR_ABI } from 'src/dollarsSpend/batchExecutorAbi'
import { ExecuteMultiSwapPayload } from 'src/dollarsSpend/saga'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
  multiSwapTransitionComplete,
} from 'src/dollarsSpend/slice'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
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

    // Map chosen TokenBalance to the actual on-chain fee-currency arg:
    //   - CELO native -> undefined (type 0x02 eip1559, no feeCurrency field)
    //   - adapter-based -> adapter address (protocol pulls via transferFrom)
    //   - native Mento -> token address
    let feeCurrencyArg: Hex | undefined
    if (choice.chosen.symbol === 'CELO') {
      feeCurrencyArg = undefined
    } else if (choice.chosen.feeCurrencyAdapterAddress) {
      feeCurrencyArg = choice.chosen.feeCurrencyAdapterAddress as Hex
    } else {
      feeCurrencyArg = choice.chosen.address as Hex
    }
    Logger.info(
      TAG,
      `picked fee currency: ${choice.chosen.symbol} (reason=${choice.reason}, declined=${choice.declined.length}, alternatives=${choice.alternatives.length})`
    )

    const sendArgs = {
      account,
      to: walletAddress as Address,
      data: calldata,
      ...(feeCurrencyArg && { feeCurrency: feeCurrencyArg }),
    } as unknown as Parameters<typeof wallet.sendTransaction>[0]

    const hash = yield* call(() => wallet.sendTransaction(sendArgs))

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
      // the fee in the correct token.
      const feeCurrencyId = feeCurrencyArg
        ? `celo-mainnet:${feeCurrencyArg.toLowerCase()}`
        : undefined
      // Value convention: whole tokens with decimal (Valora-compatible). The
      // wallet's UI assumes whole-token strings; emitting wei here would
      // display amounts 10^decimals too large.
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
            tokenId: networkConfig.usdmTokenId,
            value: totalOutUsd.toFixed(),
          },
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
    // Aggregate amounts: fromAmount is total USD spent (1:1 USDm), toAmount
    // is total COPm received, fromTokenId is pinned to USDm (renders as
    // "Dolares" via the brand label resolver).
    navigate(Screens.TransactionSuccessScreen, {
      fromTokenId: networkConfig.usdmTokenId,
      toTokenId,
      fromAmount: totalOutUsd.toFixed(),
      toAmount: totalInAmount.toFixed(),
      transactionHash: hash,
      networkId: NetworkId['celo-mainnet'],
      type: 'swap' as const,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    Logger.warn(TAG, `7702 batch failed: ${message}`)
    yield* put(multiSwapStepFailed({ index: 0, errorMessage: message }))
    yield* delay(50)
    yield* put(multiSwapTransitionComplete())
  }
}
