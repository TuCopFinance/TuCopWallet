import BigNumber from 'bignumber.js'
import { useAsyncCallback } from 'react-async-hook'
import { goldPriceUsdSelector } from 'src/gold/selectors'
import { GoldSwapQuote, XAUT0_DECIMALS } from 'src/gold/types'
import { useSelector } from 'src/redux/hooks'
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
import { networkIdToNetwork } from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'
import { Address, encodeFunctionData, erc20Abi, zeroAddress } from 'viem'
import { TransactionOrigin } from 'src/analytics/types'

const TAG = 'gold/useGoldQuote'

// Squid Router on Celo
const SQUID_ROUTER_ADDRESS = '0xce16F69375520ab01377ce7B88f5BA8C48F8D666'

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
 * Create swap transactions for gold buy/sell
 * Uses Squid Router for cross-chain/same-chain swaps
 */
async function createGoldSwapTransactions(
  fromToken: TokenBalance,
  toToken: TokenBalance,
  amount: BigNumber,
  walletAddress: string,
  goldPriceUsd: number
): Promise<{ baseTransactions: TransactionRequest[]; estimatedToAmount: BigNumber }> {
  const baseTransactions: TransactionRequest[] = []

  // Calculate estimated output amount based on gold price
  // This is simplified - in production would come from the swap API
  const fromAmountInWei = amount.shiftedBy(fromToken.decimals)
  const fromValueUsd = fromToken.priceUsd
    ? amount.multipliedBy(fromToken.priceUsd)
    : new BigNumber(0)

  // Estimate XAUt0 amount (1 XAUt0 = 1 troy oz gold)
  const estimatedToAmount = fromValueUsd.dividedBy(goldPriceUsd)
  // Note: toAmountInWei will be used when Squid Router API integration is complete
  const _toAmountInWei = estimatedToAmount.shiftedBy(toToken.decimals || XAUT0_DECIMALS)
  void _toAmountInWei // Suppress unused variable warning

  // Check if approval is needed for ERC-20 tokens
  if (fromToken.address && fromToken.address !== zeroAddress) {
    const network = networkIdToNetwork[fromToken.networkId]
    const approvedAllowance = await publicClient[network].readContract({
      address: fromToken.address as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [walletAddress as Address, SQUID_ROUTER_ADDRESS as Address],
    })

    if (approvedAllowance < BigInt(fromAmountInWei.toFixed(0))) {
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [SQUID_ROUTER_ADDRESS as Address, BigInt(fromAmountInWei.toFixed(0))],
      })

      baseTransactions.push({
        from: walletAddress as Address,
        to: fromToken.address as Address,
        data: approveData,
      })
    }
  }

  // TODO: In production, this would call the Squid Router API to get actual swap transaction
  // For now, we create a placeholder swap transaction structure
  // The actual implementation would:
  // 1. Call Squid API: POST https://api.squidrouter.com/v1/route
  // 2. Get the transaction data from the response
  // 3. Create the swap transaction

  // Placeholder swap transaction (would be replaced with actual Squid Router call)
  const swapTx: TransactionRequest = {
    from: walletAddress as Address,
    to: SQUID_ROUTER_ADDRESS as Address,
    value: BigInt(0),
    data: '0x' as `0x${string}`, // Would be actual swap calldata from Squid
    gas: BigInt(300000), // Estimated gas
  }
  baseTransactions.push(swapTx)

  return {
    baseTransactions,
    estimatedToAmount,
  }
}

/**
 * Hook to get gold buy/sell quotes
 * Uses the existing swap infrastructure with Squid Router
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

      if (!goldPriceUsd) {
        Logger.error(TAG, 'Gold price not available')
        return null
      }

      if (amount.lte(0)) {
        return null
      }

      try {
        Logger.debug(TAG, `Getting ${direction} quote for ${amount.toString()} ${fromToken.symbol}`)

        const { baseTransactions, estimatedToAmount } = await createGoldSwapTransactions(
          fromToken,
          toToken,
          amount,
          walletAddress,
          goldPriceUsd
        )

        // Determine transaction origin based on direction
        const origin: TransactionOrigin = direction === 'buy' ? 'gold-buy' : 'gold-sell'

        // Prepare transactions with fee estimation
        const preparedTransactions = await prepareTransactions({
          feeCurrencies,
          spendToken: fromToken,
          spendTokenAmount: amount,
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
          fromAmount: amount.shiftedBy(fromToken.decimals).toFixed(0),
          toAmount: estimatedToAmount.shiftedBy(toToken.decimals || XAUT0_DECIMALS).toFixed(0),
          pricePerOz: goldPriceUsd.toString(),
          estimatedGasFee: estimatedGasFeeValue,
          estimatedGasFeeUsd: '0', // Would be calculated from gas fee token price
          allowanceTarget: SQUID_ROUTER_ADDRESS,
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
 * Estimate gas for a gold swap transaction
 * Simplified version that doesn't need XAUt0 token info
 */
export async function estimateGoldSwapGas(
  fromToken: TokenBalance,
  amount: BigNumber,
  walletAddress: string,
  feeCurrencies: TokenBalance[]
): Promise<{ estimatedGasFee: string; gasFeeTokenId: string } | null> {
  try {
    const baseTransactions: TransactionRequest[] = []
    const fromAmountInWei = amount.shiftedBy(fromToken.decimals)

    // Check if approval is needed for ERC-20 tokens
    if (fromToken.address && fromToken.address !== zeroAddress) {
      const network = networkIdToNetwork[fromToken.networkId]
      const approvedAllowance = await publicClient[network].readContract({
        address: fromToken.address as Address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [walletAddress as Address, SQUID_ROUTER_ADDRESS as Address],
      })

      if (approvedAllowance < BigInt(fromAmountInWei.toFixed(0))) {
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [SQUID_ROUTER_ADDRESS as Address, BigInt(fromAmountInWei.toFixed(0))],
        })

        baseTransactions.push({
          from: walletAddress as Address,
          to: fromToken.address as Address,
          data: approveData,
        })
      }
    }

    // Placeholder swap transaction with estimated gas
    const swapTx: TransactionRequest = {
      from: walletAddress as Address,
      to: SQUID_ROUTER_ADDRESS as Address,
      value: BigInt(0),
      data: '0x' as `0x${string}`,
      gas: BigInt(300000),
    }
    baseTransactions.push(swapTx)

    // Prepare transactions with fee estimation
    const preparedTransactions = await prepareTransactions({
      feeCurrencies,
      spendToken: fromToken,
      spendTokenAmount: amount,
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
