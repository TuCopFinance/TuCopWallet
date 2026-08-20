import { SendOrigin } from 'src/analytics/types'
import { LocalCurrencyCode } from 'src/localCurrency/consts'
import {
  convertDollarsToLocalAmount,
  convertLocalAmountToDollars,
  convertToMaxSupportedPrecision,
} from 'src/localCurrency/convert'
import { fetchExchangeRate } from 'src/localCurrency/saga'
import { getLocalCurrencyCode, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { UriData, uriDataFromUrl } from 'src/qrcode/schema'
import { AddressRecipient, Recipient, RecipientType } from 'src/recipients/recipient'
import { updateAppRecipientCache } from 'src/recipients/reducer'
import { TransactionDataInput } from 'src/send/types'
import { tokensListSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { convertLocalToTokenAmount, getSupportedNetworkIdsForSend } from 'src/tokens/utils'
import { Currency, CURRENCY_TO_CHAIN_SYMBOL, resolveCurrency } from 'src/utils/currencies'
import Logger from 'src/utils/Logger'
import { call, put, select } from 'typed-redux-saga'

const TAG = 'send/utils'

export function* handleSendPaymentData({
  data,
  isFromScan,
  cachedRecipient,
  defaultTokenIdOverride,
}: {
  data: UriData
  isFromScan: boolean
  cachedRecipient?: Recipient
  defaultTokenIdOverride?: string
}) {
  const recipient: AddressRecipient = {
    address: data.address.toLowerCase(),
    name: data.displayName || cachedRecipient?.name,
    e164PhoneNumber: data.e164PhoneNumber,
    displayNumber: cachedRecipient?.displayNumber,
    thumbnailPath: cachedRecipient?.thumbnailPath,
    contactId: cachedRecipient?.contactId,
    recipientType: RecipientType.Address,
  }
  yield* put(
    updateAppRecipientCache({
      [data.address.toLowerCase()]: recipient,
    })
  )

  const supportedNetworkIds = yield* select(getSupportedNetworkIdsForSend)
  const tokens: TokenBalance[] = yield* select((state) =>
    tokensListSelector(state, supportedNetworkIds)
  )
  // Match against the on-chain token symbol. The Mento rebrand deploy on
  // 2026-08-20 propagated the new symbol() return to Celo mainnet (e.g.
  // 0x765de816...1282a returns 'USDm', was 'cUSD'; same contract). Historical
  // deeplinks in the wild still carry the legacy symbol 'cUSD'/'cEUR', so we
  // route `data.token` through resolveCurrency (accepts both legacy and new
  // codes) and then look up the current on-chain symbol via
  // CURRENCY_TO_CHAIN_SYMBOL before the pattern-match. When `data.token`
  // is absent the default is Currency.Dollar (-> 'USDm').
  const requestedCurrency = data.token ? resolveCurrency(data.token) : Currency.Dollar
  const requestedSymbol = requestedCurrency
    ? CURRENCY_TO_CHAIN_SYMBOL[requestedCurrency]
    : data.token
  const tokenInfo = tokens.find((token) => token?.symbol === requestedSymbol)

  if (!tokenInfo?.priceUsd) {
    navigate(Screens.SendEnterAmount, {
      recipient,
      isFromScan,
      origin: SendOrigin.AppSendFlow,
      defaultTokenIdOverride: data.token ? tokenInfo?.tokenId : undefined,
      forceTokenId: !!(data.token && tokenInfo?.tokenId),
    })
    return
  }

  if (data.amount && tokenInfo?.address) {
    const currency: LocalCurrencyCode = data.currencyCode
      ? (data.currencyCode as LocalCurrencyCode)
      : yield* select(getLocalCurrencyCode)
    const exchangeRate = yield* call(fetchExchangeRate, currency)
    const dollarAmount = convertLocalAmountToDollars(data.amount, exchangeRate)
    const usdToLocalRate = yield* select(usdToLocalCurrencyRateSelector)
    const localAmount = convertDollarsToLocalAmount(dollarAmount, usdToLocalRate)
    const inputAmount = localAmount && convertToMaxSupportedPrecision(localAmount)
    const tokenAmount = convertLocalToTokenAmount({
      localAmount: inputAmount,
      tokenInfo,
      usdToLocalRate,
    })
    if (!inputAmount || !tokenAmount) {
      Logger.warn(TAG, '@handleSendPaymentData null amount')
      return
    }
    const transactionData: TransactionDataInput = {
      recipient,
      inputAmount,
      amountIsInLocalCurrency: true,
      tokenAddress: tokenInfo.address,
      tokenAmount,
      tokenId: tokenInfo.tokenId,
    }

    navigate(Screens.SendConfirmation, {
      transactionData,
      isFromScan,
      origin: SendOrigin.AppSendFlow,
    })
  } else {
    navigate(Screens.SendEnterAmount, {
      recipient,
      isFromScan,
      origin: SendOrigin.AppSendFlow,
      defaultTokenIdOverride:
        defaultTokenIdOverride ?? (data.token ? tokenInfo?.tokenId : undefined),
      forceTokenId: !!(data.token && tokenInfo?.tokenId),
    })
  }
}

export function* handlePaymentDeeplink(deeplink: string) {
  try {
    const paymentData = uriDataFromUrl(deeplink)
    yield* call(handleSendPaymentData, { data: paymentData, isFromScan: true })
  } catch (e) {
    Logger.warn('handlePaymentDeepLink', `deeplink ${deeplink} failed with ${e}`)
  }
}
