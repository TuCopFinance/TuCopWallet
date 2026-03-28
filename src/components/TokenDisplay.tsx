import BigNumber from 'bignumber.js'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleProp, Text, TextStyle } from 'react-native'
import { APPROX_SYMBOL } from 'src/components/TokenEnterAmount'
import { LocalCurrencyCode, LocalCurrencySymbol } from 'src/localCurrency/consts'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { useSelector } from 'src/redux/hooks'
import { useTokenInfo } from 'src/tokens/hooks'
import { LocalAmount } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'

const DEFAULT_DISPLAY_DECIMALS = 2
const GOLD_DISPLAY_DECIMALS = 6

function calculateDecimalsToShow(value: BigNumber, isGold: boolean = false) {
  // Gold always shows 6 decimals due to small amounts
  if (isGold) {
    return GOLD_DISPLAY_DECIMALS
  }

  const exponent = value?.e ?? 0
  if (exponent >= 0) {
    return DEFAULT_DISPLAY_DECIMALS
  }

  return Math.abs(exponent) + 1
}

// Formats |value| so that it shows at least 2 significant figures and at least 2 decimal places without trailing zeros.
export function formatValueToDisplay(value: BigNumber, isGold: boolean = false) {
  let decimals = calculateDecimalsToShow(value, isGold)
  let text = value.toFormat(decimals)
  // For gold, keep trailing zeros to always show 6 decimals
  const minDecimals = isGold ? GOLD_DISPLAY_DECIMALS : 2
  while (text[text.length - 1] === '0' && decimals-- > minDecimals) {
    text = text.substring(0, text.length - 1)
  }
  return text
}

export const getTokenSymbol = (t: any, symbol: string | undefined, tokenId?: string) => {
  const symbols: Record<string, string> = {
    COPm: t('assets.pesos'),
    cCOP: t('assets.pesos'),
    'USD₮': t('assets.dollars'),
    USDT: t('assets.dollars'),
    USDt: t('assets.dollars'),
    XAUt0: t('assets.gold'),
  }

  if (symbol && symbol in symbols) {
    return symbols[symbol]
  }

  // Fallback: check by tokenId for known tokens
  if (tokenId) {
    if (
      tokenId === networkConfig.xaut0TokenId ||
      tokenId.toLowerCase().includes('0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff')
    ) {
      return t('assets.gold')
    }
    if (tokenId === networkConfig.copmTokenId) {
      return t('assets.pesos')
    }
    if (tokenId === networkConfig.usdtTokenId) {
      return t('assets.dollars')
    }
  }

  return symbol
}

interface Props {
  amount: BigNumber.Value
  tokenId?: string
  showSymbol?: boolean
  showLocalAmount?: boolean
  hideSign?: boolean
  showApprox?: boolean
  showExplicitPositiveSign?: boolean
  localAmount?: LocalAmount
  style?: StyleProp<TextStyle>
  testID?: string
  errorFallback?: string
}

function TokenDisplay({
  amount,
  tokenId,
  showLocalAmount = true,
  showSymbol = true,
  showExplicitPositiveSign = false,
  hideSign = false,
  showApprox = false,
  localAmount,
  style,
  testID,
  errorFallback = '-',
}: Props) {
  const { t } = useTranslation()
  const tokenInfo = useTokenInfo(tokenId)
  const localCurrencyExchangeRate = useSelector(usdToLocalCurrencyRateSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol)

  // Check if this is a gold token (XAUt0) by tokenId or address
  const isGoldToken =
    tokenId === networkConfig.xaut0TokenId ||
    tokenId?.toLowerCase().includes('0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff') ||
    tokenInfo?.symbol === 'XAUt0'

  // For gold tokens, we can show the amount even without full token info
  const hasSymbolOrIsKnownToken =
    tokenInfo?.symbol ||
    isGoldToken ||
    tokenId === networkConfig.copmTokenId ||
    tokenId === networkConfig.usdtTokenId

  const showError = showLocalAmount
    ? !localAmount && (!tokenInfo?.priceUsd || !localCurrencyExchangeRate)
    : !hasSymbolOrIsKnownToken

  const amountInUsd = tokenInfo?.priceUsd?.multipliedBy(amount)
  const amountInLocalCurrency = localAmount
    ? new BigNumber(localAmount.value)
    : new BigNumber(localCurrencyExchangeRate ?? 0).multipliedBy(amountInUsd ?? 0)
  const fiatSymbol = localAmount
    ? LocalCurrencySymbol[localAmount.currencyCode as LocalCurrencyCode]
    : localCurrencySymbol

  const amountToShow = showLocalAmount ? amountInLocalCurrency : new BigNumber(amount)

  const sign = hideSign ? '' : amountToShow.isNegative() ? '-' : showExplicitPositiveSign ? '+' : ''
  const amountFallback = '--'

  return (
    <Text style={style} testID={testID}>
      {showError ? (
        errorFallback
      ) : (
        <>
          {showApprox && `${APPROX_SYMBOL} `}
          {sign}
          {showLocalAmount && fiatSymbol}
          {amountToShow.isNaN()
            ? amountFallback
            : formatValueToDisplay(amountToShow.absoluteValue(), isGoldToken)}
          {!showLocalAmount &&
            showSymbol &&
            ` ${getTokenSymbol(t, tokenInfo?.symbol, tokenId) ?? ''}`}
        </>
      )}
    </Text>
  )
}

export default TokenDisplay
