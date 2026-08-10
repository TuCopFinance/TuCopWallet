import BigNumber from 'bignumber.js'
import { TokenBalance } from 'src/tokens/slice'
import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'

export type SwapType = 'same-chain' | 'cross-chain'

export enum Field {
  FROM = 'FROM',
  TO = 'TO',
}

export interface SwapAmount {
  [Field.FROM]: string
  [Field.TO]: string
}

export interface ParsedSwapAmount {
  [Field.FROM]: BigNumber
  [Field.TO]: BigNumber
}

interface SwapUserInput {
  fromTokenId: string
  swapAmount: SwapAmount
  toTokenId: string
  updatedField: Field
}

interface BaseSwapTransaction {
  swapType: SwapType
  chainId: number
  buyAmount: string
  sellAmount: string
  buyTokenAddress: string
  sellTokenAddress: string
  // be careful -- price means different things when using sellAmount vs buyAmount
  price: string
  guaranteedPrice: string
  appFeePercentageIncludedInPrice: string | undefined
  /**
   * In percentage, between 0 and 100
   */
  estimatedPriceImpact: string | null
  gas: string
  estimatedGasUse: string | null | undefined
  to: string
  value: string
  data: string
  from: string
  allowanceTarget: string
}

interface SameChainSwapTransaction extends BaseSwapTransaction {
  swapType: 'same-chain'
}

interface CrossChainSwapTransaction extends BaseSwapTransaction {
  swapType: 'cross-chain'
  // Swap duration estimation in seconds
  estimatedDuration: number
  maxCrossChainFee: string
  estimatedCrossChainFee: string
}

export type SwapTransaction = SameChainSwapTransaction | CrossChainSwapTransaction

export interface SwapInfo {
  swapId: string
  userInput: SwapUserInput
  quote: {
    preparedTransactions: SerializableTransactionRequest[]
    receivedAt: number
    price: string
    appFeePercentageIncludedInPrice: string | undefined
    provider: SwapProvider
    estimatedPriceImpact: string | null
    allowanceTarget: string
    swapType: SwapType
    /**
     * Present ONLY when `provider === "uniswap-v4"` AND the user is NOT
     * EIP-7702 delegated. Wallet must sign `typedData` + POST to
     * `buildTxUrl` with `buildTxRequest` to receive the real
     * {to, data, value} calldata. See UniswapV4Permit2Metadata for the
     * full flow. Mutually exclusive with `batchCalls`.
     */
    permit2?: UniswapV4Permit2Metadata
    /**
     * Present ONLY when `provider === "uniswap-v4"` AND the user IS
     * EIP-7702 delegated. Wallet wraps these prebuilt calls in a
     * BatchExecutor.execute() and submits one atomic tx. No signature
     * or POST /build-tx roundtrip involved. Mutually exclusive with
     * `permit2`.
     */
    batchCalls?: UniswapV4BatchCall[]
  }
  areSwapTokensShuffled: boolean
  // Set to true when this swap is a single step inside a larger multi-swap
  // flow (Dolares -> Pesos with N tokens). The regular swap saga skips its
  // per-step success-screen navigation so the user does not see the success
  // sheet flash N times. The multi-swap orchestrator navigates once at the
  // end with the aggregated leg breakdown.
  suppressSuccessNavigation?: boolean
}

/**
 * Direction discriminator for the Uniswap V4 fallback pool. Backend
 * currently only implements the USDT<->COPm pair.
 */
export type UniswapV4Direction = 'USDT_TO_COPM' | 'COPM_TO_USDT'

/**
 * Body backend needs echoed back on the build-tx call, plus the
 * wallet-computed `permit2Signature`. Every field is opaque to the
 * wallet's business logic (wallet MUST NOT recompute permitAmount /
 * deadline / nonce, just forward the values backend returned in the
 * quote response).
 */
export interface UniswapV4BuildTxRequest {
  direction: UniswapV4Direction
  userAddress: string
  sellAmount: string
  minBuyAmount: string
  deadline: string
  permitToken: string
  permitAmount: string
  permitExpiration: number | string
  permitNonce: number | string
  permitSigDeadline: string
}

/**
 * Metadata backend attaches when it decides the winning route is the
 * Uniswap V4 fallback pool for USDT<->COPm (Mento suspends the pair over
 * weekends). Present ONLY when `details.swapProvider === "uniswap-v4"`.
 *
 * The response's `unvalidatedSwapTransaction.data` is the sentinel "0x"
 * in this branch — submitting it as-is reverts on-chain. Wallet must
 * instead: (a) approve ERC20 -> Permit2 canonical if needed, (b) sign the
 * `typedData` EIP-712 Permit2 payload, (c) POST the signature back to
 * `buildTxUrl` with `buildTxRequest` to receive the real {to, data,
 * value} calldata built by backend, (d) send that.
 *
 * `existingAllowance` reflects the user's current Permit2 allowance on
 * chain for the sellToken -> Universal Router path. If `amount >=
 * sellAmount && expiration > now + 60s` the client can skip the sign
 * step (backend still builds the tx with the stale-but-valid nonce).
 */
export interface UniswapV4Permit2Metadata {
  typedData: {
    domain: Record<string, unknown>
    types: Record<string, unknown>
    primaryType: string
    message: Record<string, unknown>
  }
  existingAllowance: {
    /** wei-scale amount already permitted to the Universal Router */
    amount: string
    /** unix seconds; 0 = no active permit */
    expiration: number
    /** Permit2 nonce for this (owner, token, spender) tuple */
    nonce: number
  }
  /** Absolute or relative URL to POST the signed permit + buildTxRequest to */
  buildTxUrl: string
  buildTxRequest: UniswapV4BuildTxRequest
}

/**
 * Known swap provider discriminators. Backend may emit other slugs
 * (Squid returns "squid", "squid-router", historically also protocol-
 * specific tags). Type keeps the string fallback so wallet does not
 * fail hard on unknown providers — the discriminator is only used to
 * pick the execution branch (uniswap-v4 -> Permit2 flow, everything
 * else -> current Squid flow).
 */
export type SwapProvider = 'squid' | 'uniswap-v4' | (string & {})

/**
 * Prebuilt inner call for the Uniswap V4 batchCalls branch — used when the
 * wallet is EIP-7702 delegated and Permit2's ERC1271 verification path
 * would revert (the BatchExecutor delegate does not implement
 * isValidSignature). Backend returns the calls already encoded so the
 * wallet just wraps them in a BatchExecutor.execute() and submits one
 * atomic tx. No Permit2 typedData signature is involved.
 *
 * Layout returned by backend (order is significant):
 *   [0] Permit2.approve(sellToken, UniversalRouter, amount, expiration)
 *   [1] UniversalRouter.execute(commands, inputs, deadline)
 *
 * See wallet-consumer-spec.md section 12 for the wire contract.
 */
export interface UniswapV4BatchCall {
  to: string
  data: string
  value: string
}

export interface FetchQuoteResponse {
  unvalidatedSwapTransaction: SwapTransaction
  details: {
    /**
     * Discriminator for the route. Historical values are provider slugs
     * from Squid ("squid", "squid-router", ...). "uniswap-v4" indicates
     * the wallet-side Permit2 -> build-tx -> execute path documented in
     * UniswapV4Permit2Metadata above.
     */
    swapProvider: SwapProvider
    /**
     * Backend flag introduced with the Uniswap V4 fallback initiative. When
     * present, its value ('squid' | 'uniswap_v4' | ...) reflects the actual
     * source that produced the winning quote for THIS request. Wallet uses
     * it to tag Sentry events (swap_source) so the backend dashboard can
     * split metrics by provider. Optional for backward compat with older
     * backend responses that only carry swapProvider.
     */
    source?: string
    /**
     * Present only when swapProvider === "uniswap-v4" AND the user is NOT
     * EIP-7702 delegated. See UniswapV4Permit2Metadata for the full shape
     * + wallet-side flow. Mutually exclusive with `batchCalls`.
     */
    permit2?: UniswapV4Permit2Metadata
    /**
     * Present only when swapProvider === "uniswap-v4" AND the user IS
     * EIP-7702 delegated. Backend detects delegation via eth_getCode
     * starting with 0xef01 and switches from the Permit2 typed data
     * flow (which reverts on 7702 EOAs via ERC1271 path) to prebuilt
     * calls the wallet executes atomically through BatchExecutor.execute.
     * Mutually exclusive with `permit2`.
     */
    batchCalls?: UniswapV4BatchCall[]
  }
}

/**
 * Wallet-side literal for the Uniswap V4 branch. Compare against this
 * instead of hardcoding the string in each callsite — the backend has
 * been inconsistent about hyphens (uniswap-v4 vs uniswap_v4) in past
 * responses and normalizing at one point keeps flexibility if it flips.
 */
export const UNISWAP_V4_PROVIDER = 'uniswap-v4'

/**
 * True iff the response is any variant of the Uniswap V4 route. Wallet
 * MUST NOT submit `unvalidatedSwapTransaction` directly in this case —
 * either the Permit2 flow or the batchCalls flow needs to run instead.
 * A `swapProvider === "uniswap-v4"` with NEITHER `permit2` NOR
 * `batchCalls` is a backend contract violation and callers should route
 * to Sentry + fail loud instead of submitting the sentinel data.
 */
export function isUniswapV4Quote(response: FetchQuoteResponse): boolean {
  return (
    response.details.swapProvider === UNISWAP_V4_PROVIDER &&
    (!!response.details.permit2 || !!response.details.batchCalls)
  )
}

/** True iff the response is Uniswap V4 delegated-user variant (batchCalls). */
export function isBatchCallsQuote(response: FetchQuoteResponse): boolean {
  return (
    response.details.swapProvider === UNISWAP_V4_PROVIDER &&
    !!response.details.batchCalls &&
    !response.details.permit2
  )
}

/** True iff the response is Uniswap V4 EOA variant (Permit2 typedData). */
export function isPermit2Quote(response: FetchQuoteResponse): boolean {
  return (
    response.details.swapProvider === UNISWAP_V4_PROVIDER &&
    !!response.details.permit2 &&
    !response.details.batchCalls
  )
}

/**
 * The backend build-tx endpoint returns a plain {to, data, value} that
 * the wallet feeds into prepareTransactions like any other EVM call.
 */
export interface UniswapV4BuildTxResponse {
  to: string
  data: string
  value: string
}

export interface SwapFeeAmount {
  amount: BigNumber
  maxAmount?: BigNumber
  token?: TokenBalance
}

export interface AppFeeAmount extends SwapFeeAmount {
  percentage: BigNumber
}
