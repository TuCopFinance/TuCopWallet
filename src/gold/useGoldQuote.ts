import BigNumber from 'bignumber.js'
import { useAsyncCallback } from 'react-async-hook'
import { goldPriceUsdSelector } from 'src/gold/selectors'
import { GoldSwapQuote } from 'src/gold/types'
import { useSelector } from 'src/redux/hooks'
import { FetchQuoteResponse, SwapTransaction } from 'src/swap/types'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import {
  PreparedTransactionsResult,
  TransactionRequest,
  getEstimatedGasFee,
  prepareTransactions,
} from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import networkConfig, { networkIdToNetwork } from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address, Hex, encodeFunctionData, erc20Abi, zeroAddress } from 'viem'
import { TransactionOrigin } from 'src/analytics/types'

const TAG = 'gold/useGoldQuote'

// Default slippage for gold swaps (1%)
const DEFAULT_SLIPPAGE_PERCENTAGE = '1'

// Squid Router V2 API configuration
const SQUID_API_URL = 'https://v2.api.squidrouter.com/v2/route'
const SQUID_INTEGRATOR_ID = 'tucop-wallet-api' // TODO: Register for production integrator ID

// Celo chain ID for Squid API
const CELO_CHAIN_ID = '42220'

export interface GoldQuoteParams {
  fromToken: TokenBalance
  toToken: TokenBalance
  amount: BigNumber
  direction: 'buy' | 'sell' // buy = fromToken -> XAUt0, sell = XAUt0 -> toToken
}

export interface GoldQuoteResult {
  quote: GoldSwapQuote
  preparedTransactions: PreparedTransactionsResult
}

/**
 * Fetch swap quote from Squid Router V2 API directly
 * Used as fallback or for comparing quotes
 */
async function fetchSquidQuote(
  fromToken: TokenBalance,
  toToken: TokenBalance,
  amount: BigNumber,
  walletAddress: string
): Promise<SwapTransaction> {
  const amountInWei = amount.shiftedBy(fromToken.decimals)

  const requestBody = {
    fromAddress: walletAddress,
    fromChain: CELO_CHAIN_ID,
    toChain: CELO_CHAIN_ID,
    fromToken: fromToken.address || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native token
    toToken: toToken.address || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    fromAmount: amountInWei.toFixed(0, BigNumber.ROUND_DOWN),
    toAddress: walletAddress,
    slippage: parseFloat(DEFAULT_SLIPPAGE_PERCENTAGE),
    slippageConfig: {
      autoMode: 1, // Conservative mode
    },
    enableBoost: true,
  }

  Logger.debug(TAG, `Fetching Squid quote: ${JSON.stringify(requestBody)}`)

  const response = await fetch(SQUID_API_URL, {
    method: 'POST',
    headers: {
      'x-integrator-id': SQUID_INTEGRATOR_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    Logger.error(TAG, `Squid API error: ${response.status} - ${errorText}`)
    throw new Error(`Squid API error: ${errorText}`)
  }

  const squidResponse = await response.json()

  if (!squidResponse.route || !squidResponse.route.transactionRequest) {
    throw new Error('No route available from Squid')
  }

  const { transactionRequest, estimate } = squidResponse.route

  Logger.debug(TAG, `Got Squid quote: ${estimate.fromAmount} -> ${estimate.toAmount}`)

  // Convert Squid response to SwapTransaction format
  return {
    swapType: 'same-chain',
    chainId: parseInt(CELO_CHAIN_ID),
    buyAmount: estimate.toAmount,
    sellAmount: estimate.fromAmount,
    buyTokenAddress: toToken.address || '',
    sellTokenAddress: fromToken.address || '',
    price: new BigNumber(estimate.toAmount).dividedBy(estimate.fromAmount).toString(),
    guaranteedPrice: new BigNumber(estimate.toAmountMin).dividedBy(estimate.fromAmount).toString(),
    appFeePercentageIncludedInPrice: undefined,
    estimatedPriceImpact: estimate.aggregatePriceImpact || null,
    gas: transactionRequest.gasLimit || '500000',
    estimatedGasUse: transactionRequest.gasLimit || null,
    to: transactionRequest.target,
    value: transactionRequest.value || '0',
    data: transactionRequest.data,
    from: walletAddress,
    allowanceTarget: transactionRequest.target,
  }
}

/**
 * Fetch swap quote from the backend API (same as regular swaps)
 * The backend handles routing through Uniswap V4, Squid, or other providers
 */
async function fetchBackendQuote(
  fromToken: TokenBalance,
  toToken: TokenBalance,
  amount: BigNumber,
  walletAddress: string
): Promise<SwapTransaction> {
  const amountInWei = amount.shiftedBy(fromToken.decimals)

  const params = {
    ...(fromToken.address && { sellToken: fromToken.address }),
    sellIsNative: (fromToken.isNative ?? false).toString(),
    sellNetworkId: fromToken.networkId,
    ...(toToken.address && { buyToken: toToken.address }),
    buyIsNative: (toToken.isNative ?? false).toString(),
    buyNetworkId: toToken.networkId,
    sellAmount: amountInWei.toFixed(0, BigNumber.ROUND_DOWN),
    userAddress: walletAddress,
    slippagePercentage: DEFAULT_SLIPPAGE_PERCENTAGE,
  }

  const queryParams = new URLSearchParams({ ...params }).toString()
  const requestUrl = `${networkConfig.getSwapQuoteUrl}?${queryParams}`

  Logger.debug(TAG, `Fetching backend swap quote: ${requestUrl}`)

  const response = await fetch(requestUrl)

  if (!response.ok) {
    const errorText = await response.text()
    Logger.error(TAG, `Backend swap quote API error: ${response.status} - ${errorText}`)
    throw new Error(`Failed to get swap quote: ${errorText}`)
  }

  const quote: FetchQuoteResponse = await response.json()

  if (!quote.unvalidatedSwapTransaction) {
    throw new Error('No swap quote available from backend')
  }

  Logger.debug(
    TAG,
    `Got backend quote from ${quote.details.swapProvider}: ${quote.unvalidatedSwapTransaction.sellAmount} -> ${quote.unvalidatedSwapTransaction.buyAmount}`
  )

  return quote.unvalidatedSwapTransaction
}

/**
 * Fetch the best swap quote from available sources
 * Tries backend API first, falls back to Squid API, or compares both
 */
async function fetchSwapQuote(
  fromToken: TokenBalance,
  toToken: TokenBalance,
  amount: BigNumber,
  walletAddress: string
): Promise<SwapTransaction> {
  // Try backend API first (it may have better routing through multiple sources)
  try {
    const backendQuote = await fetchBackendQuote(fromToken, toToken, amount, walletAddress)
    return backendQuote
  } catch (backendError: any) {
    Logger.warn(TAG, `Backend quote failed, trying Squid: ${backendError.message}`)
  }

  // Fallback to Squid API directly
  try {
    const squidQuote = await fetchSquidQuote(fromToken, toToken, amount, walletAddress)
    return squidQuote
  } catch (squidError: any) {
    Logger.error(TAG, `Squid quote also failed: ${squidError.message}`)
    throw new Error(`No swap route available. Backend: ${squidError.message}`)
  }
}

/**
 * Create swap transactions from API response
 * Adds approval transaction if needed
 */
async function createSwapTransactionsFromQuote(
  fromToken: TokenBalance,
  swapTransaction: SwapTransaction,
  walletAddress: string
): Promise<{ baseTransactions: TransactionRequest[]; amountToApprove: bigint }> {
  const baseTransactions: TransactionRequest[] = []

  const { allowanceTarget, from, to, value, data, gas, estimatedGasUse, sellAmount } =
    swapTransaction

  const amountToApprove = BigInt(sellAmount)

  // Check if approval is needed for ERC-20 tokens
  if (allowanceTarget !== zeroAddress && fromToken.address) {
    const network = networkIdToNetwork[fromToken.networkId]
    const approvedAllowance = await publicClient[network].readContract({
      address: fromToken.address as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [walletAddress as Address, allowanceTarget as Address],
    })

    if (approvedAllowance < amountToApprove) {
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [allowanceTarget as Address, amountToApprove],
      })

      baseTransactions.push({
        from: from as Address,
        to: fromToken.address as Address,
        data: approveData,
      })
    }
  }

  // Add the swap transaction from API
  const swapTx: TransactionRequest & { gas: bigint } = {
    from: from as Address,
    to: to as Address,
    value: BigInt(value ?? 0),
    data: data as Hex,
    gas: BigInt(gas),
    _estimatedGasUse: estimatedGasUse != null ? BigInt(estimatedGasUse) : undefined,
  }
  baseTransactions.push(swapTx)

  return {
    baseTransactions,
    amountToApprove,
  }
}

/**
 * Hook to get gold buy/sell quotes
 * Uses the existing swap infrastructure (backend routes to Uniswap V4/Squid/etc)
 */
export function useGoldQuote() {
  const walletAddress = useSelector(walletAddressSelector)
  const goldPriceUsd = useSelector(goldPriceUsdSelector)
  const feeCurrencies = useSelector((state) =>
    feeCurrenciesSelector(state, NetworkId['celo-mainnet'])
  )

  const getQuote = useAsyncCallback(
    async (params: GoldQuoteParams): Promise<GoldQuoteResult | null> => {
      const { fromToken, toToken, amount, direction } = params

      if (!walletAddress) {
        Logger.error(TAG, 'No wallet address found')
        return null
      }

      // Note: goldPriceUsd is used for display but not required for the swap
      // The swap quote API provides its own pricing
      if (!goldPriceUsd) {
        Logger.warn(TAG, 'Gold price not available, using swap API pricing')
      }

      if (amount.lte(0)) {
        return null
      }

      try {
        Logger.debug(TAG, `Getting ${direction} quote for ${amount.toString()} ${fromToken.symbol}`)

        // Fetch quote from backend API (handles Uniswap V4 routing)
        const swapTransaction = await fetchSwapQuote(fromToken, toToken, amount, walletAddress)

        // Create transactions from the quote
        const { baseTransactions, amountToApprove } = await createSwapTransactionsFromQuote(
          fromToken,
          swapTransaction,
          walletAddress
        )

        // Determine transaction origin based on direction
        const origin: TransactionOrigin = direction === 'buy' ? 'gold-buy' : 'gold-sell'

        // Prepare transactions with fee estimation
        const preparedTransactions = await prepareTransactions({
          feeCurrencies,
          spendToken: fromToken,
          spendTokenAmount: new BigNumber(amountToApprove.toString()).shiftedBy(
            -fromToken.decimals
          ),
          decreasedAmountGasFeeMultiplier: 1.2,
          baseTransactions,
          throwOnSpendTokenAmountExceedsBalance: false,
          origin,
        })

        // Calculate estimated gas fee from transactions
        let estimatedGasFeeValue = '0'
        if (
          preparedTransactions.type === 'possible' &&
          preparedTransactions.transactions.length > 0
        ) {
          try {
            const gasFee = getEstimatedGasFee(preparedTransactions.transactions)
            estimatedGasFeeValue = gasFee.toFixed(0)
          } catch (e) {
            Logger.warn(TAG, 'Could not calculate gas fee', e)
          }
        }

        const quote: GoldSwapQuote = {
          fromTokenId: fromToken.tokenId,
          toTokenId: toToken.tokenId,
          fromAmount: swapTransaction.sellAmount,
          toAmount: swapTransaction.buyAmount,
          pricePerOz: goldPriceUsd?.toString() ?? '0',
          estimatedGasFee: estimatedGasFeeValue,
          estimatedGasFeeUsd: '0',
          allowanceTarget: swapTransaction.allowanceTarget,
          preparedTransactions: getSerializablePreparedTransactions(
            preparedTransactions.type === 'possible' ? preparedTransactions.transactions : []
          ),
        }

        return {
          quote,
          preparedTransactions,
        }
      } catch (error: any) {
        Logger.error(TAG, 'Failed to get gold quote', error)
        throw error
      }
    }
  )

  return {
    getQuote: getQuote.execute,
    loading: getQuote.loading,
    error: getQuote.error,
    result: getQuote.result,
    reset: getQuote.reset,
  }
}

/**
 * Calculate gold amount from fiat/crypto amount
 */
export function calculateGoldAmount(
  inputAmount: BigNumber,
  inputPriceUsd: number | null,
  goldPriceUsd: number | null
): BigNumber | null {
  if (!inputPriceUsd || !goldPriceUsd || goldPriceUsd === 0) {
    return null
  }

  const inputValueUsd = inputAmount.multipliedBy(inputPriceUsd)
  return inputValueUsd.dividedBy(goldPriceUsd)
}

/**
 * Calculate crypto/fiat amount from gold amount
 */
export function calculateFromGoldAmount(
  goldAmount: BigNumber,
  outputPriceUsd: number | null,
  goldPriceUsd: number | null
): BigNumber | null {
  if (!outputPriceUsd || !goldPriceUsd || outputPriceUsd === 0) {
    return null
  }

  const goldValueUsd = goldAmount.multipliedBy(goldPriceUsd)
  return goldValueUsd.dividedBy(outputPriceUsd)
}

/**
 * Estimate gas for a gold swap transaction using the swap API
 */
export async function estimateGoldSwapGas(
  fromToken: TokenBalance,
  toToken: TokenBalance,
  amount: BigNumber,
  walletAddress: string,
  feeCurrencies: TokenBalance[]
): Promise<{ estimatedGasFee: string; gasFeeTokenId: string } | null> {
  try {
    // Fetch quote from backend API to get accurate gas estimation
    const swapTransaction = await fetchSwapQuote(fromToken, toToken, amount, walletAddress)

    // Create transactions from the quote
    const { baseTransactions, amountToApprove } = await createSwapTransactionsFromQuote(
      fromToken,
      swapTransaction,
      walletAddress
    )

    // Prepare transactions with fee estimation
    const preparedTransactions = await prepareTransactions({
      feeCurrencies,
      spendToken: fromToken,
      spendTokenAmount: new BigNumber(amountToApprove.toString()).shiftedBy(-fromToken.decimals),
      decreasedAmountGasFeeMultiplier: 1.2,
      baseTransactions,
      throwOnSpendTokenAmountExceedsBalance: false,
      origin: 'gold-buy' as TransactionOrigin,
    })

    if (preparedTransactions.type === 'possible' && preparedTransactions.transactions.length > 0) {
      const gasFee = getEstimatedGasFee(preparedTransactions.transactions)
      return {
        estimatedGasFee: gasFee.toFixed(0),
        gasFeeTokenId: preparedTransactions.feeCurrency.tokenId,
      }
    }

    return null
  } catch (error: any) {
    Logger.warn(TAG, 'Failed to estimate gold swap gas', error)
    return null
  }
}
