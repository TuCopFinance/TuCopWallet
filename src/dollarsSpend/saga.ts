import { createAction, PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { call, delay, put, race, select, take, takeEvery } from 'typed-redux-saga'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FeeEvents } from 'src/analytics/Events'
import { executeDollarsSpend7702Saga } from 'src/dollarsSpend/saga7702'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
  multiSwapTransitionComplete,
} from 'src/dollarsSpend/slice'
import { SpendStep } from 'src/dollarsSpend/types'
import { classifyError } from 'src/lib/errors'
import {
  inFlightAdvance,
  inFlightFail,
  inFlightStart,
} from 'src/lib/useTransactionInFlight/actions'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { swapStart, swapSuccess, swapError } from 'src/swap/slice'
import { Field, SwapInfo } from 'src/swap/types'
import { fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { pickFeeCurrency } from 'src/tokens/feeCurrencyPicker'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
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

  yield* put(multiSwapStarted({ steps }))

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

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const swapId = newSwapId(index)

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

    // Bug E: the shared selector returns CELO at index 0, so
    // prepareTransactions silently uses it whenever the user has any CELO.
    // Reorder via the picker so stables win; CELO drops to last alternative
    // and only gets used if every stable fails its gas check.
    const choice = pickFeeCurrency({
      available: rawFeeCurrencies,
      excludeTokenIds: [step.tokenId],
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
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Logger.warn(TAG, `Quote refetch failed for step ${index} (${step.symbol}): ${message}`)
      yield* put(multiSwapStepFailed({ index, errorMessage: message }))
      yield* put(inFlightFail({ flowId, errorClass: classifyError(err) }))
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
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
      },
      areSwapTokensShuffled: false,
    }

    yield* put(swapStart(swapInfo))

    // swapSuccess payload is SwapResult { swapId, ... }
    // swapError payload is a raw swapId string
    const { success, error } = yield* race({
      success: take((a: any) => a.type === swapSuccess.type && a.payload?.swapId === swapId),
      error: take((a: any) => a.type === swapError.type && a.payload === swapId),
    })

    if (success) {
      yield* put(multiSwapStepSucceeded({ index }))
      yield* put(
        inFlightAdvance({ flowId, toStatus: 'progress', patch: { currentStep: index + 1 } })
      )
    } else if (error) {
      Logger.warn(TAG, `Swap failed at step ${index} (${step.symbol})`)
      yield* put(
        multiSwapStepFailed({
          index,
          errorMessage: `Swap failed at step ${index} (${step.symbol})`,
        })
      )
      yield* put(
        inFlightFail({
          flowId,
          errorClass: classifyError(new Error(`Swap failed at step ${index} (${step.symbol})`)),
        })
      )
      yield* delay(50)
      yield* put(multiSwapTransitionComplete())
      return
    }
  }

  yield* put(multiSwapCompleted())
  yield* put(inFlightAdvance({ flowId, toStatus: 'succeeded' }))
}

export function* dollarsSpendSaga() {
  yield* takeEvery(executeMultiSwap.type, executeMultiSwapSaga)
}
