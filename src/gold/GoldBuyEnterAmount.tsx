import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, StyleSheet, Text, TextInput as RNTextInput, View } from 'react-native'
import { getNumberFormatSettings } from 'react-native-localize'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { GoldEvents } from 'src/analytics/Events'
import BackButton from 'src/components/BackButton'
import { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import KeyboardAwareScrollView from 'src/components/KeyboardAwareScrollView'
import TokenBottomSheet, { TokenPickerOrigin } from 'src/components/TokenBottomSheet'
import TokenIcon, { IconSize } from 'src/components/TokenIcon'
import Touchable from 'src/components/Touchable'
import CustomHeader from 'src/components/header/CustomHeader'
import {
  goldPriceFetchStatusSelector,
  goldPriceIsStaleSelector,
  goldPriceStaleAgeSecondsSelector,
  goldPriceUsdSelector,
  xaut0TokenSelector,
} from 'src/gold/selectors'
import { fetchGoldPrice } from 'src/gold/slice'
import { XAUT0_DECIMALS } from 'src/gold/types'
import { calculateGoldAmount, useGoldQuote } from 'src/gold/useGoldQuote'
import { useDispatch } from 'react-redux'
import DownArrowIcon from 'src/icons/navigation/DownArrowIcon'
import GoldIconSelector from 'src/gold/GoldIconSelector'
import { LocalCurrencySymbol } from 'src/localCurrency/consts'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useSelector } from 'src/redux/hooks'
import { AmountInput } from 'src/send/EnterAmount'
import EnterAmountOptions from 'src/send/EnterAmountOptions'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import {
  buildDolaresVirtualToken,
  DOLARES_VIRTUAL_TOKEN_ID,
  useDollarBalanceSnapshots,
} from 'src/dollarsSpend'
import { DOLLAR_TOKEN_IDS, getDollarTokenTicker } from 'src/tokens/dollarGroup'
import { swappableFromTokensByNetworkIdSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import { getDisplayDecimalsForToken, getInputDecimalsForToken } from 'src/utils/formatting'
import Logger from 'src/utils/Logger'
import { parseInputAmount } from 'src/utils/parsing'
import networkConfig from 'src/web3/networkConfig'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldBuyEnterAmount>

const TOKEN_SELECTOR_BORDER_RADIUS = 100

// Fallback gold price in USD when API is unavailable (updated periodically)
const FALLBACK_GOLD_PRICE_USD = 3050

// Minimum amount in USD to avoid "no liquidity" errors from swap providers
// Set slightly below 0.01 to account for price fluctuations
const MIN_AMOUNT_USD = 0.009

// Minimum amount for COPm swaps (50 COPm as per Squid Router requirements)
const MIN_COPM_AMOUNT = 50

export default function GoldBuyEnterAmount({ route }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const insets = useSafeAreaInsets()
  const { decimalSeparator } = getNumberFormatSettings()

  const goldPriceUsdFromStore = useSelector(goldPriceUsdSelector)
  const goldPriceFetchStatus = useSelector(goldPriceFetchStatusSelector)
  const goldPriceIsStale = useSelector(goldPriceIsStaleSelector)
  const goldPriceStaleAgeSeconds = useSelector(goldPriceStaleAgeSecondsSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const xaut0Token = useSelector(xaut0TokenSelector)

  // Use store price or fallback
  const goldPriceUsd = goldPriceUsdFromStore ?? FALLBACK_GOLD_PRICE_USD

  // Fetch gold price on mount if not already available
  useEffect(() => {
    if (!goldPriceUsdFromStore && goldPriceFetchStatus !== 'loading') {
      dispatch(fetchGoldPrice())
    }
  }, [dispatch, goldPriceUsdFromStore, goldPriceFetchStatus])

  const { getQuote, loading: isGettingQuote, error: quoteError } = useGoldQuote()

  // Get user-friendly display name for tokens. For the four concrete dollar
  // tokens the brand-specific label (USDT / USDC / USDm / USAT short symbols)
  // wins so the chip stays consistent with the picker rows and the success
  // screen. Falls back to "Dolares" for the synthetic virtual aggregator.
  const getTokenName = (token: TokenBalance) => {
    // Check by tokenId first (most reliable)
    if (token.tokenId === networkConfig.copmTokenId) {
      return t('assets.pesos')
    }
    const ticker = getDollarTokenTicker(token.tokenId)
    if (ticker) {
      return ticker
    }
    if (token.tokenId === networkConfig.xaut0TokenId) {
      return t('goldFlow.gold')
    }
    // Fallback: check by symbol for different token variants
    const symbol = token.symbol?.toLowerCase() || ''
    if (symbol === 'ccop' || symbol === 'copm') {
      return t('assets.pesos')
    }
    if (symbol === 'dolares') {
      return t('assets.dollars')
    }
    if (symbol === 'xaut0' || symbol === 'xaut') {
      return t('goldFlow.gold')
    }
    return token.name
  }

  // Get swappable tokens on Celo mainnet
  const swappableTokens = useSelector((state) =>
    swappableFromTokensByNetworkIdSelector(state, [NetworkId['celo-mainnet']])
  )

  // Filter to USDT and COPm (supported by Squid Router for XAUt0 swaps)
  // Note: USDT on Celo uses symbol "USD₮" (with special ₮ character)
  const originalAvailableTokens = useMemo(() => {
    const filtered = swappableTokens.filter((token) => {
      if (token.balance.lte(0)) return false

      const symbol = token.symbol?.toLowerCase() || ''
      const isUsdt =
        token.symbol === 'USDT' ||
        token.symbol === 'USDt' ||
        token.symbol === 'USD₮' ||
        symbol === 'usdt' ||
        symbol.includes('usdt')
      const isCopm =
        token.tokenId === networkConfig.copmTokenId ||
        token.symbol === 'COPm' ||
        token.symbol === 'cCOP' ||
        symbol === 'copm' ||
        symbol === 'ccop'

      return isUsdt || isCopm
    })
    Logger.debug(
      'GoldBuyEnterAmount',
      `Filtered tokens: ${filtered.length} (USDT/COPm) from ${swappableTokens.length} swappable`,
      {
        swappableSymbols: swappableTokens
          .filter((t) => t.balance.gt(0))
          .map((t) => t.symbol)
          .join(', '),
        filteredSymbols: filtered.map((t) => t.symbol).join(', '),
      }
    )
    return filtered
  }, [swappableTokens])

  const dollarSnapshots = useDollarBalanceSnapshots()
  const dolaresVirtualToken = useMemo(
    () =>
      buildDolaresVirtualToken({
        snapshots: dollarSnapshots,
        networkId: networkConfig.defaultNetworkId,
      }),
    [dollarSnapshots]
  )

  const availableTokens = useMemo(() => {
    const filtered = originalAvailableTokens.filter((t) => !DOLLAR_TOKEN_IDS.has(t.tokenId))
    return dolaresVirtualToken ? [dolaresVirtualToken, ...filtered] : filtered
  }, [originalAvailableTokens, dolaresVirtualToken])

  // Default to first available token or from route params
  const defaultToken = route.params?.fromTokenId
    ? availableTokens.find((t) => t.tokenId === route.params?.fromTokenId)
    : undefined
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(
    defaultToken ?? availableTokens[0] ?? null
  )

  const tokenBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const tokenAmountInputRef = useRef<RNTextInput>(null)

  const [tokenAmountInput, setTokenAmountInput] = useState<string>('')
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null)

  // Parse input amount
  const parsedTokenAmount = useMemo(
    () => parseInputAmount(tokenAmountInput, decimalSeparator),
    [tokenAmountInput, decimalSeparator]
  )

  // Calculate gold amount from input
  const goldAmount = useMemo(() => {
    if (!parsedTokenAmount || parsedTokenAmount.lte(0) || !selectedToken?.priceUsd) {
      return null
    }
    const tokenPriceUsd = selectedToken.priceUsd.toNumber()
    return calculateGoldAmount(parsedTokenAmount, tokenPriceUsd, goldPriceUsd)
  }, [parsedTokenAmount, selectedToken?.priceUsd, goldPriceUsd])

  // Calculate local currency value
  const localValue = useMemo(() => {
    if (!goldAmount || !goldPriceUsd || !usdToLocalRate) return null
    return goldAmount.multipliedBy(goldPriceUsd).multipliedBy(usdToLocalRate)
  }, [goldAmount, goldPriceUsd, usdToLocalRate])

  // Local gold price
  const localGoldPrice = useMemo(() => {
    if (!goldPriceUsd || !usdToLocalRate) return null
    return new BigNumber(goldPriceUsd).multipliedBy(usdToLocalRate)
  }, [goldPriceUsd, usdToLocalRate])

  const tokenAmountRegex = new RegExp(
    `^(?:\\d+[${decimalSeparator}]?\\d*|[${decimalSeparator}]\\d*|[${decimalSeparator}])$`
  )

  const onTokenAmountInputChange = (value: string) => {
    setSelectedPercentage(null)
    if (!value) {
      setTokenAmountInput('')
    } else {
      if (value.startsWith(decimalSeparator)) {
        value = `0${value}`
      }
      if (value.match(tokenAmountRegex)) {
        setTokenAmountInput(value)
      }
    }
  }

  const onSelectPercentageAmount = (percentage: number) => {
    if (!selectedToken) return
    const amount = selectedToken.balance.multipliedBy(percentage)
    setTokenAmountInput(
      amount
        .decimalPlaces(getInputDecimalsForToken(selectedToken.tokenId), BigNumber.ROUND_DOWN)
        .toFormat({ decimalSeparator })
    )
    setSelectedPercentage(percentage)
  }

  const onTokenPickerSelect = () => {
    tokenBottomSheetRef.current?.snapToIndex(0)
    AppAnalytics.track(GoldEvents.gold_buy_start)
  }

  const onSelectToken = (token: TokenBalance) => {
    setSelectedToken(token)
    setTokenAmountInput('')
    setSelectedPercentage(null)
    tokenBottomSheetRef.current?.close()
    AppAnalytics.track(GoldEvents.gold_buy_enter_amount, {
      amount: '0',
    })
  }

  // Check if selected token is COPm
  const isCopmToken = useMemo(() => {
    if (!selectedToken) return false
    const symbol = selectedToken.symbol?.toLowerCase() || ''
    return (
      selectedToken.tokenId === networkConfig.copmTokenId ||
      selectedToken.symbol === 'COPm' ||
      selectedToken.symbol === 'cCOP' ||
      symbol === 'copm' ||
      symbol === 'ccop'
    )
  }, [selectedToken])

  // Get minimum amount based on token type
  const minimumAmount = useMemo(() => {
    if (isCopmToken) {
      return { value: MIN_COPM_AMOUNT, display: `${MIN_COPM_AMOUNT} Pesos` }
    }
    // For USD-based tokens, use MIN_AMOUNT_USD
    return { value: MIN_AMOUNT_USD, display: '$0.01' }
  }, [isCopmToken])

  // Check if amount is below minimum (based on token type)
  const amountBelowMinimum = useMemo(() => {
    if (!parsedTokenAmount || parsedTokenAmount.lte(0) || !selectedToken) {
      return false
    }

    if (isCopmToken) {
      // For COPm, check raw amount (50 COPm minimum)
      return parsedTokenAmount.lt(MIN_COPM_AMOUNT)
    }

    // For other tokens, check USD value
    if (!selectedToken.priceUsd) return false
    const valueInUsd = parsedTokenAmount.multipliedBy(selectedToken.priceUsd)
    return valueInUsd.lt(MIN_AMOUNT_USD)
  }, [parsedTokenAmount, selectedToken, isCopmToken])

  const isAmountValid =
    parsedTokenAmount &&
    parsedTokenAmount.gt(0) &&
    selectedToken &&
    parsedTokenAmount.lte(selectedToken.balance) &&
    !amountBelowMinimum

  const insufficientBalance =
    parsedTokenAmount && selectedToken && parsedTokenAmount.gt(selectedToken.balance)

  const isVirtualDolares = selectedToken?.tokenId === DOLARES_VIRTUAL_TOKEN_ID

  const onPressContinue = async () => {
    Logger.debug('GoldBuyEnterAmount', 'onPressContinue called', {
      isAmountValid,
      selectedToken: selectedToken?.tokenId,
      goldAmount: goldAmount?.toString(),
      xaut0Token: xaut0Token.tokenId,
    })

    if (!isAmountValid || !selectedToken || !goldAmount) {
      Logger.warn('GoldBuyEnterAmount', 'Invalid state for continue', {
        isAmountValid,
        hasSelectedToken: !!selectedToken,
        hasGoldAmount: !!goldAmount,
      })
      return
    }

    AppAnalytics.track(GoldEvents.gold_buy_quote_received, {
      fromAmount: parsedTokenAmount.toString(),
      toAmount: goldAmount.toString(),
    })

    // Virtual Dolares: skip single-quote fetch, navigate directly to confirmation
    // The confirmation screen handles multi-step planning and execution
    if (isVirtualDolares) {
      navigate(Screens.GoldBuyConfirmation, {
        fromTokenId: DOLARES_VIRTUAL_TOKEN_ID,
        fromAmount: parsedTokenAmount.toString(),
        xautAmount: goldAmount.toString(),
        pricePerOz: goldPriceUsd.toString(),
        toTokenId: xaut0Token.tokenId,
      })
      return
    }

    // Get swap quote from Squid Router
    const quoteResult = await getQuote({
      fromToken: selectedToken,
      toToken: xaut0Token,
      amount: parsedTokenAmount,
      direction: 'buy',
    })

    if (quoteResult) {
      navigate(Screens.GoldBuyConfirmation, {
        fromTokenId: selectedToken.tokenId,
        fromAmount: parsedTokenAmount.toString(),
        xautAmount: goldAmount.toString(),
        pricePerOz: goldPriceUsd.toString(),
        estimatedGasFee: quoteResult.quote.estimatedGasFee,
        gasFeeTokenId:
          quoteResult.preparedTransactions.type === 'possible'
            ? quoteResult.preparedTransactions.feeCurrency.tokenId
            : undefined,
        preparedTransactions: quoteResult.quote.preparedTransactions,
        toTokenId: xaut0Token.tokenId,
        swapProvider: quoteResult.quote.swapProvider,
        appFeePercentageIncludedInPrice: quoteResult.quote.appFeePercentageIncludedInPrice,
      })
    } else {
      // Navigate without quote - confirmation screen will retry
      Logger.warn('GoldBuyEnterAmount', 'No quote result, navigating to confirmation')
      navigate(Screens.GoldBuyConfirmation, {
        fromTokenId: selectedToken.tokenId,
        fromAmount: parsedTokenAmount.toString(),
        xautAmount: goldAmount.toString(),
        pricePerOz: goldPriceUsd.toString(),
        toTokenId: xaut0Token.tokenId,
      })
    }
  }

  const insetsStyle = {
    paddingBottom: Math.max(insets.bottom, Spacing.Regular16),
  }

  if (!availableTokens.length) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <CustomHeader style={{ paddingHorizontal: Spacing.Thick24 }} left={<BackButton />} />
        <View style={styles.emptyState}>
          <GoldIconSelector size={48} />
          <Text style={styles.emptyStateText}>{t('goldFlow.buy.noTokensForGold')}</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CustomHeader style={{ paddingHorizontal: Spacing.Thick24 }} left={<BackButton />} />
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scrollContent, insetsStyle]}
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >
        <View style={styles.inputContainer}>
          <Text style={styles.title}>{t('goldFlow.buy.title')}</Text>

          {/* Price Display */}
          {localGoldPrice && (
            <View style={styles.priceRow}>
              <GoldIconSelector size={24} />
              <Text style={styles.priceText}>
                {localCurrencySymbol}
                {localGoldPrice.toFormat(2)} / oz
              </Text>
            </View>
          )}

          {/* Stale-price badge. Only shows when the backend served the price
              from its 24h stale cache AND the value is more than 5 minutes
              old. Sub-5min stale is common at fresh-cache eviction boundaries
              and would flap the badge for essentially fresh data; the 5min
              threshold matches the fresh TTL headroom. */}
          {goldPriceIsStale && goldPriceStaleAgeSeconds > 300 && (
            <View style={styles.stalePriceBadgeContainer}>
              <Text style={styles.stalePriceBadge}>{t('goldFlow.stalePriceBadge')}</Text>
            </View>
          )}

          {/* Input Box */}
          <View style={styles.inputBox}>
            <View style={styles.inputRow}>
              <AmountInput
                inputRef={tokenAmountInputRef}
                inputValue={tokenAmountInput}
                onInputChange={onTokenAmountInputChange}
                inputStyle={styles.inputText}
                autoFocus
                placeholder={new BigNumber(0).toFormat(2)}
                testID="GoldBuyEnterAmount/TokenAmountInput"
                hasError={!!insufficientBalance}
              />
              {selectedToken && (
                <Touchable
                  borderRadius={TOKEN_SELECTOR_BORDER_RADIUS}
                  onPress={onTokenPickerSelect}
                  style={styles.tokenSelectButton}
                  disabled={availableTokens.length <= 1}
                  testID="GoldBuyEnterAmount/TokenSelect"
                >
                  <>
                    <TokenIcon token={selectedToken} size={IconSize.SMALL} />
                    <Text style={styles.tokenName}>{getTokenName(selectedToken)}</Text>
                    {availableTokens.length > 1 && <DownArrowIcon color={Colors.gray5} />}
                  </>
                </Touchable>
              )}
            </View>

            {/* Gold Amount Output */}
            <View style={styles.outputRow}>
              <GoldIconSelector size={20} />
              <Text style={styles.goldAmountText}>
                {goldAmount ? goldAmount.toFormat(XAUT0_DECIMALS) : '0'} {t('goldFlow.gold')}
              </Text>
              {localValue && (
                <Text style={styles.localValueText}>
                  ≈ {localCurrencySymbol}
                  {localValue.toFormat(2)}
                </Text>
              )}
            </View>
          </View>

          {/* Balance Display */}
          {selectedToken && (
            <Text style={styles.balanceText}>
              {t('goldFlow.buy.available')}:{' '}
              {selectedToken.balance.toFormat(getDisplayDecimalsForToken(selectedToken))}{' '}
              {getTokenName(selectedToken)}
            </Text>
          )}
        </View>

        {/* Warnings */}
        {insufficientBalance && (
          <InLineNotification
            variant={NotificationVariant.Warning}
            title={t('sendEnterAmountScreen.insufficientBalanceWarning.title', {
              tokenSymbol: selectedToken ? getTokenName(selectedToken) : '',
            })}
            description={t('sendEnterAmountScreen.insufficientBalanceWarning.description', {
              tokenSymbol: selectedToken ? getTokenName(selectedToken) : '',
            })}
            style={styles.warning}
            testID="GoldBuyEnterAmount/InsufficientBalance"
          />
        )}

        {/* Minimum amount warning */}
        {amountBelowMinimum && !insufficientBalance && (
          <InLineNotification
            variant={NotificationVariant.Warning}
            title={t('goldFlow.buy.minimumAmountTitle')}
            description={t('goldFlow.buy.minimumAmountDescription', {
              minAmount: minimumAmount.display,
            })}
            style={styles.warning}
            testID="GoldBuyEnterAmount/MinimumAmount"
          />
        )}

        {/* Quote Error */}
        {quoteError && (
          <InLineNotification
            variant={NotificationVariant.Error}
            title={t('goldFlow.buy.quoteErrorTitle')}
            description={
              quoteError instanceof Error && quoteError.message
                ? quoteError.message
                : t('goldFlow.buy.quoteErrorDescription')
            }
            style={styles.warning}
            testID="GoldBuyEnterAmount/QuoteError"
          />
        )}

        {/* Continue Button */}
        <Button
          onPress={onPressContinue}
          text={t('goldFlow.buy.continue')}
          size={BtnSizes.FULL}
          type={BtnTypes.PRIMARY}
          disabled={!isAmountValid || isGettingQuote}
          showLoading={isGettingQuote}
          style={styles.continueButton}
          testID="GoldBuyEnterAmount/Continue"
        />
      </KeyboardAwareScrollView>

      {/* Percentage Options rendered OUTSIDE the ScrollView so its
          position:absolute + bottom:0 anchor to the screen, not to
          the scrolled content. Inside the ScrollView the chip container
          would move with the content when the keyboard opens and end
          up off-screen (regression exposed by the RN 0.77 upgrade). */}
      <EnterAmountOptions
        onPressAmount={onSelectPercentageAmount}
        selectedAmount={selectedPercentage}
        flow="gold_buy"
        testID="GoldBuyEnterAmount/AmountOptions"
      />

      {/* Token Picker */}
      <TokenBottomSheet
        forwardedRef={tokenBottomSheetRef}
        origin={TokenPickerOrigin.Send}
        onTokenSelected={onSelectToken}
        tokens={availableTokens}
        title={t('goldFlow.buy.selectToken')}
        titleStyle={styles.title}
      />
    </SafeAreaView>
  )
}

// Using inline CustomHeader with BackButton, so no navigationOptions needed
GoldBuyEnterAmount.navigationOptions = {
  headerShown: false,
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.Thick24,
    paddingTop: Spacing.Regular16,
  },
  inputContainer: {
    flex: 1,
  },
  title: {
    ...typeScale.titleSmall,
    color: Colors.black,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.Regular16,
    gap: Spacing.Smallest8,
  },
  priceText: {
    ...typeScale.bodyMedium,
    color: Colors.gray4,
  },
  stalePriceBadgeContainer: {
    marginTop: Spacing.Smallest8,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.Regular16,
    paddingVertical: Spacing.Tiny4,
    borderRadius: 100,
    backgroundColor: Colors.warningLight,
  },
  stalePriceBadge: {
    ...typeScale.labelSmall,
    color: Colors.warningDark,
  },
  inputBox: {
    marginTop: Spacing.Large32,
    backgroundColor: Colors.gray1,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: Colors.gray2,
  },
  inputRow: {
    paddingHorizontal: Spacing.Regular16,
    paddingTop: Spacing.Smallest8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputText: {
    ...typeScale.titleMedium,
    color: Colors.black,
  },
  tokenSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray2,
    borderRadius: TOKEN_SELECTOR_BORDER_RADIUS,
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: Spacing.Tiny4,
  },
  tokenName: {
    ...typeScale.labelSmall,
    paddingLeft: Spacing.Tiny4,
    paddingRight: Spacing.Smallest8,
    color: Colors.black,
  },
  outputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.Thick24,
    marginLeft: Spacing.Regular16,
    paddingRight: Spacing.Regular16,
    paddingBottom: Spacing.Regular16,
    paddingTop: Spacing.Thick24,
    borderTopColor: Colors.gray2,
    borderTopWidth: 1,
    gap: Spacing.Smallest8,
  },
  goldAmountText: {
    ...typeScale.labelMedium,
    color: Colors.black,
    flex: 1,
  },
  localValueText: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
  },
  balanceText: {
    ...typeScale.bodySmall,
    color: Colors.gray4,
    marginTop: Spacing.Smallest8,
    textAlign: 'right',
  },
  warning: {
    marginTop: Spacing.Regular16,
    paddingHorizontal: Spacing.Regular16,
    borderRadius: 16,
  },
  continueButton: {
    paddingTop: Spacing.Thick24,
    marginTop: 'auto',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.Thick24,
  },
  emptyStateText: {
    ...typeScale.bodyLarge,
    color: Colors.gray4,
    textAlign: 'center',
  },
})
