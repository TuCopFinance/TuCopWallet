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

/**
 * Extract token address from token object or tokenId
 * tokenId format: "celo-mainnet:0x..." or "celo-mainnet:native"
 */
function getTokenAddress(token: TokenBalance): string | null {
  // If token has address property, use it
  if (token.address) {
    return token.address
  }

  // Try to extract from tokenId (format: "network:address")
  const parts = token.tokenId.split(':')
  if (parts.length === 2 && parts[1].startsWith('0x')) {
    return parts[1]
  }

  // Native token or invalid format
  return null
}

// Timeout for API requests (15 seconds)
const API_TIMEOUT_MS = 15000

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`)
    }
    throw error
  }
}

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

interface BackendQuoteResult {
  transaction: SwapTransaction
  swapProvider: string
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
): Promise<BackendQuoteResult> {
  // Get addresses from tokens (try address property first, then extract from tokenId)
  const sellTokenAddress = getTokenAddress(fromToken)
  const buyTokenAddress = getTokenAddress(toToken)

  // Validate tokens have addresses
  if (!sellTokenAddress) {
    throw new Error(
      `fromToken (${fromToken.symbol}) is missing address. tokenId: ${fromToken.tokenId}`
    )
  }
  if (!buyTokenAddress) {
    throw new Error(`toToken (${toToken.symbol}) is missing address. tokenId: ${toToken.tokenId}`)
  }

  const amountInWei = amount.shiftedBy(fromToken.decimals)

  const params = {
    sellToken: sellTokenAddress,
    sellIsNative: (fromToken.isNative ?? false).toString(),
    sellNetworkId: fromToken.networkId,
    buyToken: buyTokenAddress,
    buyIsNative: (toToken.isNative ?? false).toString(),
    buyNetworkId: toToken.networkId,
    sellAmount: amountInWei.toFixed(0, BigNumber.ROUND_DOWN),
    userAddress: walletAddress,
    slippagePercentage: DEFAULT_SLIPPAGE_PERCENTAGE,
  }

  const queryParams = new URLSearchParams({ ...params }).toString()
  const requestUrl = `${networkConfig.getSwapQuoteUrl}?${queryParams}`

  // eslint-disable-next-line no-console
  console.log('🟡 GOLD QUOTE URL:', requestUrl)

  const response = await fetchWithTimeout(requestUrl, { method: 'GET' })

  if (!response.ok) {
    const errorText = await response.text()
    Logger.error(TAG, `Backend swap quote API error: ${response.status} - ${errorText}`)
    throw new Error(`Failed to get swap quote: ${errorText}`)
  }

  const responseText = await response.text()
  // eslint-disable-next-line no-console
  console.log('🟡 GOLD QUOTE RESPONSE:', responseText.substring(0, 500))

  let quote: FetchQuoteResponse
  try {
    quote = JSON.parse(responseText)
  } catch (e) {
    throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`)
  }

  if (!quote.unvalidatedSwapTransaction) {
    const errors = (quote as any).errors || []
    // eslint-disable-next-line no-console
    console.error('🔴 GOLD QUOTE ERRORS:', JSON.stringify(errors))
    throw new Error(`No quote: ${errors[0]?.message || 'Unknown'}`)
  }

  Logger.debug(
    TAG,
    `Got backend quote from ${quote.details.swapProvider}: ${quote.unvalidatedSwapTransaction.sellAmount} -> ${quote.unvalidatedSwapTransaction.buyAmount}`
  )

  return {
    transaction: quote.unvalidatedSwapTransaction,
    swapProvider: quote.details.swapProvider,
  }
}

/**
 * Fetch the best swap quote from available sources
 * Uses backend API only (backend handles routing through Squid/Uniswap internally)
 */
async function fetchSwapQuote(
  fromToken: TokenBalance,
  toToken: TokenBalance,
  amount: BigNumber,
  walletAddress: string
): Promise<BackendQuoteResult> {
  // Use backend API only - it handles routing through multiple sources internally
  // Direct Squid calls disabled to avoid rate limiting issues
  try {
    const backendQuote = await fetchBackendQuote(fromToken, toToken, amount, walletAddress)
    return backendQuote
  } catch (backendError: any) {
    Logger.error(TAG, `Backend quote failed: ${backendError.message}`)
    throw new Error(`No swap route available: ${backendError.message}`)
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
        Logger.debug(
          TAG,
          `Getting ${direction} quote for ${amount.toString()} ${fromToken.symbol}`,
          {
            fromTokenId: fromToken.tokenId,
            fromAddress: fromToken.address,
            toTokenId: toToken.tokenId,
            toAddress: toToken.address,
            walletAddress,
          }
        )

        // Fetch quote from backend API (handles Uniswap V4 routing)
        const { transaction: swapTransaction, swapProvider } = await fetchSwapQuote(
          fromToken,
          toToken,
          amount,
          walletAddress
        )

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
          swapProvider,
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
    const { transaction: swapTransaction } = await fetchSwapQuote(
      fromToken,
      toToken,
      amount,
      walletAddress
    )

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
