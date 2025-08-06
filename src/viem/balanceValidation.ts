import BigNumber from 'bignumber.js'
import { TokenBalance } from 'src/tokens/slice'
import Logger from 'src/utils/Logger'

const TAG = 'viem/balanceValidation'

export interface BalanceValidationResult {
  isValid: boolean
  reason?: string
  suggestedAmount?: BigNumber
}

/**
 * Validates if a fee currency has sufficient balance to cover gas fees
 * with improved error handling and suggestions
 */
export function validateGasBalance(
  feeCurrency: TokenBalance,
  requiredGasFee: BigNumber,
  isGasSubsidized: boolean = false
): BalanceValidationResult {
  if (isGasSubsidized) {
    return { isValid: true }
  }

  const balance = feeCurrency.balance

  // Check for zero balance
  if (balance.isLessThanOrEqualTo(0)) {
    Logger.debug(TAG, `Zero balance for ${feeCurrency.symbol}`)
    return {
      isValid: false,
      reason: `No ${feeCurrency.symbol} balance available for gas fees`,
    }
  }

  // Add safety margin to required gas fee (10%)
  const safetyMargin = requiredGasFee.multipliedBy(0.1)
  const totalRequired = requiredGasFee.plus(safetyMargin)

  // Check if balance covers gas fee with safety margin
  if (balance.isLessThan(totalRequired)) {
    Logger.debug(TAG, `Insufficient balance for gas fees`, {
      currency: feeCurrency.symbol,
      balance: balance.toString(),
      required: requiredGasFee.toString(),
      requiredWithMargin: totalRequired.toString(),
    })

    return {
      isValid: false,
      reason: `Insufficient ${feeCurrency.symbol} balance. Need ${totalRequired.toFixed(4)} but have ${balance.toFixed(4)}`,
      suggestedAmount: totalRequired.minus(balance),
    }
  }

  return { isValid: true }
}

/**
 * Validates if the spend amount plus gas fees doesn't exceed balance
 * for same-currency transactions
 */
export function validateSameCurrencyTransaction(
  currency: TokenBalance,
  spendAmount: BigNumber,
  gasFee: BigNumber,
  isGasSubsidized: boolean = false
): BalanceValidationResult {
  const balance = currency.balance
  const totalRequired = isGasSubsidized ? spendAmount : spendAmount.plus(gasFee)

  // Add small buffer for rounding errors (0.01%)
  const buffer = totalRequired.multipliedBy(0.0001)
  const totalWithBuffer = totalRequired.plus(buffer)

  if (balance.isLessThan(totalWithBuffer)) {
    const maxSpendable = isGasSubsidized ? balance : balance.minus(gasFee).minus(buffer)

    return {
      isValid: false,
      reason: `Total amount (${totalWithBuffer.toFixed(4)} ${currency.symbol}) exceeds balance (${balance.toFixed(4)} ${currency.symbol})`,
      suggestedAmount: maxSpendable.isGreaterThan(0) ? maxSpendable : new BigNumber(0),
    }
  }

  return { isValid: true }
}

/**
 * Finds the best fee currency from available options
 * considering balance and gas requirements
 */
export function selectBestFeeCurrency(
  feeCurrencies: TokenBalance[],
  requiredGasFees: Map<string, BigNumber>,
  preferredCurrencyId?: string
): TokenBalance | null {
  // First try preferred currency if specified
  if (preferredCurrencyId) {
    const preferred = feeCurrencies.find((fc) => fc.tokenId === preferredCurrencyId)
    if (preferred) {
      const gasFee = requiredGasFees.get(preferred.tokenId)
      if (gasFee && validateGasBalance(preferred, gasFee).isValid) {
        return preferred
      }
    }
  }

  // Sort by balance/gasFee ratio (higher is better)
  const validCurrencies = feeCurrencies
    .map((fc) => {
      const gasFee = requiredGasFees.get(fc.tokenId)
      if (!gasFee || fc.balance.isLessThanOrEqualTo(0)) {
        return null
      }

      const validation = validateGasBalance(fc, gasFee)
      if (!validation.isValid) {
        return null
      }

      return {
        currency: fc,
        ratio: fc.balance.dividedBy(gasFee).toNumber(),
      }
    })
    .filter((item) => item !== null)
    .sort((a, b) => b!.ratio - a!.ratio)

  return validCurrencies.length > 0 ? validCurrencies[0]!.currency : null
}
