import BigNumber from 'bignumber.js'
import { LocalCurrencyCode, LocalCurrencySymbol } from 'src/localCurrency/consts'
import { CURRENCIES, Currency } from 'src/utils/currencies'

/**
 * How many decimal places to allow WHEN THE USER IS TYPING into an amount
 * input field. 6 across the board so small Oro amounts (1.000 Pesos ≈
 * 0.000061 Oro) can still be entered without rounding to zero.
 *
 * NOT for display. Use `getDisplayDecimalsForToken` for rendering finalised
 * amounts on review / confirmation / receipt screens.
 */
export function getInputDecimalsForToken(_tokenId?: string): number {
  return 6
}

/**
 * How many decimal places to show when RENDERING a token amount to the user
 * (review screens, receipts, transaction details). Stablecoins follow local
 * fiat conventions (2 decimals) so peso amounts read as "8,992.13 Pesos"
 * instead of "8,992.134348 Pesos". Non-stable tokens keep 6 decimals so
 * small Oro balances stay readable.
 *
 * Pass the TokenBalance if available (uses the `isStableCoin` flag from
 * the tokens catalog), or a tokenId string for known constants.
 */
export function getDisplayDecimalsForToken(token?: {
  tokenId?: string
  isStableCoin?: boolean
}): number {
  if (token?.isStableCoin) return 2
  // Explicit stablecoin fallback when only the id is available (e.g. before
  // the tokens catalog has resolved). Matches the same tokens the backend
  // flags as isStableCoin in networkConfig.
  const stableIds = new Set<string>([
    // Mento family
    'celo-mainnet:0x8a567e2ae79ca692bd748ab832081c45de4041ea', // COPm
    'celo-mainnet:0x765de816845861e75a25fca122bb6898b8b1282a', // USDm
    'celo-mainnet:0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73', // EURm
    'celo-mainnet:0xe8537a3d056da446677b9e9d6c5db704eaab4787', // BRLm
    // Non-Mento
    'celo-mainnet:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e', // USDT
    'celo-mainnet:0xceba9300f2b948710d2653dd7b07f33a8b32118c', // USDC
  ])
  if (token?.tokenId && stableIds.has(token.tokenId.toLowerCase())) return 2
  return 6
}

// Returns a localized string that represents the number with the right decimal points.
export const getMoneyDisplayValue = (
  value: BigNumber.Value,
  currency: Currency = Currency.Dollar,
  includeSymbol: boolean = false,
  roundingTolerance: number = 1
): string => {
  const moneyValue = new BigNumber(value)
  const decimals = CURRENCIES[currency].displayDecimals
  const symbol = CURRENCIES[currency].symbol
  // For stable currencies, if the value is lower than 0.01 we show an extra decimal point.
  // If the value is lower than 0.001, we just show <$0.001.
  const minValueToShow = Math.pow(10, -decimals - (currency === Currency.Celo ? 0 : 1))
  if (moneyValue.isGreaterThan(0) && moneyValue.isLessThan(minValueToShow)) {
    return `<${includeSymbol ? symbol : ''}${minValueToShow}`
  }
  const decimalsToUse =
    currency === Currency.Celo ||
    moneyValue.isLessThanOrEqualTo(0) ||
    moneyValue.isGreaterThanOrEqualTo(Math.pow(10, -decimals))
      ? decimals
      : decimals + 1
  const formattedValue = roundDown(value, decimalsToUse, roundingTolerance).toFormat(decimalsToUse)
  return includeSymbol ? symbol + formattedValue : formattedValue
}

export const getLocalCurrencyDisplayValue = (
  value: BigNumber.Value,
  currency: LocalCurrencyCode,
  includeSymbol: boolean = false,
  roundingTolerance: number = 1
): string => {
  const symbol = LocalCurrencySymbol[currency]
  const formattedValue = roundDown(value, 2, roundingTolerance).toFormat(2)
  return includeSymbol ? symbol + formattedValue : formattedValue
}

// like getMoneyDisplayValue but only returns cents if they are significant
export const getCentAwareMoneyDisplay = (value: BigNumber.Value): string => {
  const bigValue = new BigNumber(value)
  return bigValue.isInteger() ? bigValue.toFixed(0) : roundDown(value).toFormat(2)
}

export const getExchangeRateDisplayValue = (value: BigNumber.Value): string => {
  return new BigNumber(value).decimalPlaces(4).toFormat()
}

export const getFeeDisplayValue = (value: BigNumber.Value | null | undefined): string => {
  return value
    ? // Show 0.001 if fee > 0 and <= 0.001
      BigNumber.max(value, new BigNumber(value).isZero() ? 0 : 0.001)
        .decimalPlaces(4)
        .toFormat()
    : ''
}

/**
 * More precise getFeeDisplayValue with built in rounding
 * Used for small Network Fees
 * @param value fee amount
 * @param precise true if additional precision to 6 digits for <0.001 needed
 */
export const getNetworkFeeDisplayValue = (
  value: BigNumber.Value,
  precise: boolean = false
): string => {
  const roundedNumber = new BigNumber(value)
  if (precise && roundedNumber.isLessThan(0.000001)) {
    return `<${new BigNumber(0.000001).toFormat()}`
  } else if (roundedNumber.isLessThan(0.001)) {
    return precise ? roundUp(value, 6).toFormat() : `<${new BigNumber(0.001).toFormat()}`
  } else {
    return roundUp(value, 3).toFormat()
  }
}

export function roundDown(
  value: BigNumber.Value,
  decimals: number = 2,
  roundingTolerance: number = 0
): BigNumber {
  if (roundingTolerance) {
    value = new BigNumber(value).decimalPlaces(
      decimals + roundingTolerance,
      BigNumber.ROUND_HALF_DOWN
    )
  }
  return new BigNumber(value).decimalPlaces(decimals, BigNumber.ROUND_DOWN)
}

export function roundUp(
  value: BigNumber.Value,
  decimals: number = 2,
  roundingTolerance: number = 0
): BigNumber {
  if (roundingTolerance) {
    value = new BigNumber(value).decimalPlaces(
      decimals + roundingTolerance,
      BigNumber.ROUND_HALF_DOWN
    )
  }
  return new BigNumber(value).decimalPlaces(decimals, BigNumber.ROUND_UP)
}
