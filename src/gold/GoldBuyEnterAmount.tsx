import { NativeStackScreenProps } from '@react-navigation/native-stack'
import BigNumber from 'bignumber.js'
import React, { useMemo, useRef, useState } from 'react'
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
import { goldPriceUsdSelector } from 'src/gold/selectors'
import { XAUT0_DECIMALS } from 'src/gold/types'
import { calculateGoldAmount, useGoldQuote } from 'src/gold/useGoldQuote'
import DownArrowIcon from 'src/icons/DownArrowIcon'
import GoldIcon from 'src/icons/GoldIcon'
import { LocalCurrencySymbol } from 'src/localCurrency/consts'
import { getLocalCurrencySymbol, usdToLocalCurrencyRateSelector } from 'src/localCurrency/selectors'
import { headerWithBackButton } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useSelector } from 'src/redux/hooks'
import { AmountInput } from 'src/send/EnterAmount'
import EnterAmountOptions from 'src/send/EnterAmountOptions'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import { swappableFromTokensByNetworkIdSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { getSupportedNetworkIdsForTokenBalances } from 'src/tokens/utils'
import { NetworkId } from 'src/transactions/types'
import { XAUT0_TOKEN_ID_MAINNET, XAUT0_TOKEN_ID_STAGING } from 'src/web3/networkConfig'
import { parseInputAmount } from 'src/utils/parsing'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldBuyEnterAmount>

const TOKEN_SELECTOR_BORDER_RADIUS = 100

export default function GoldBuyEnterAmount({ route }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { decimalSeparator } = getNumberFormatSettings()

  const goldPriceUsd = useSelector(goldPriceUsdSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const tokensById = useSelector((state) =>
    tokensByIdSelector(state, getSupportedNetworkIdsForTokenBalances())
  )

  // Get XAUt0 token for quote
  const xaut0Token =
    tokensById[XAUT0_TOKEN_ID_MAINNET] || tokensById[XAUT0_TOKEN_ID_STAGING] || null

  // Use gold quote hook for gas estimation
  const { getQuote, loading: quoteLoading } = useGoldQuote()

  // Get swappable tokens on Celo mainnet
  const swappableTokens = useSelector((state) =>
    swappableFromTokensByNetworkIdSelector(state, [NetworkId['celo-mainnet']])
  )

  // Filter to tokens with balance
  const availableTokens = useMemo(
    () => swappableTokens.filter((token) => token.balance.gt(0)),
    [swappableTokens]
  )

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
    return calculateGoldAmount(parsedTokenAmount, tokenPriceUsd, goldPriceUsd ?? null)
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
    setTokenAmountInput(amount.toFormat({ decimalSeparator }))
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

  const isAmountValid =
    parsedTokenAmount &&
    parsedTokenAmount.gt(0) &&
    selectedToken &&
    parsedTokenAmount.lte(selectedToken.balance)

  const insufficientBalance =
    parsedTokenAmount && selectedToken && parsedTokenAmount.gt(selectedToken.balance)

  const onPressContinue = async () => {
    if (!isAmountValid || !selectedToken || !goldAmount) return

    AppAnalytics.track(GoldEvents.gold_buy_quote_received, {
      fromAmount: parsedTokenAmount.toString(),
      toAmount: goldAmount.toString(),
    })

    // Try to get quote with gas estimation
    let estimatedGasFee: string | undefined
    let gasFeeTokenId: string | undefined

    if (xaut0Token) {
      try {
        const result = await getQuote({
          fromToken: selectedToken,
          toToken: xaut0Token,
          amount: parsedTokenAmount,
          direction: 'buy',
        })
        if (result?.preparedTransactions.type === 'possible') {
          const feeCurrency = result.preparedTransactions.feeCurrency
          estimatedGasFee = result.quote.estimatedGasFee
          gasFeeTokenId = feeCurrency.tokenId
        }
      } catch (err) {
        // Continue without gas estimate if quote fails
      }
    }

    navigate(Screens.GoldBuyConfirmation, {
      fromTokenId: selectedToken.tokenId,
      fromAmount: parsedTokenAmount.toString(),
      xautAmount: goldAmount.toString(),
      pricePerOz: goldPriceUsd?.toString() ?? '0',
      estimatedGasFee,
      gasFeeTokenId,
    })
  }

  const insetsStyle = {
    paddingBottom: Math.max(insets.bottom, Spacing.Regular16),
  }

  if (!availableTokens.length) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <CustomHeader style={{ paddingHorizontal: Spacing.Thick24 }} left={<BackButton />} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t('goldFlow.buy.noTokensAvailable')}</Text>
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
              <GoldIcon size={24} />
              <Text style={styles.priceText}>
                {localCurrencySymbol}
                {localGoldPrice.toFormat(2)} / oz
              </Text>
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
                    <Text style={styles.tokenName}>{selectedToken.symbol}</Text>
                    {availableTokens.length > 1 && <DownArrowIcon color={Colors.gray5} />}
                  </>
                </Touchable>
              )}
            </View>

            {/* Gold Amount Output */}
            <View style={styles.outputRow}>
              <GoldIcon size={20} />
              <Text style={styles.goldAmountText}>
                {goldAmount ? goldAmount.toFormat(XAUT0_DECIMALS) : '0'} XAUt0
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
              {t('goldFlow.buy.available')}: {selectedToken.balance.toFormat(4)}{' '}
              {selectedToken.symbol}
            </Text>
          )}
        </View>

        {/* Warnings */}
        {insufficientBalance && (
          <InLineNotification
            variant={NotificationVariant.Warning}
            title={t('sendEnterAmountScreen.insufficientBalanceWarning.title', {
              tokenSymbol: selectedToken?.symbol,
            })}
            description={t('sendEnterAmountScreen.insufficientBalanceWarning.description', {
              tokenSymbol: selectedToken?.symbol,
            })}
            style={styles.warning}
            testID="GoldBuyEnterAmount/InsufficientBalance"
          />
        )}

        {/* Percentage Options */}
        <EnterAmountOptions
          onPressAmount={onSelectPercentageAmount}
          selectedAmount={selectedPercentage}
          testID="GoldBuyEnterAmount/AmountOptions"
        />

        {/* Continue Button */}
        <Button
          onPress={onPressContinue}
          text={t('goldFlow.buy.continue')}
          size={BtnSizes.FULL}
          type={BtnTypes.PRIMARY}
          disabled={!isAmountValid || quoteLoading}
          showLoading={quoteLoading}
          style={styles.continueButton}
          testID="GoldBuyEnterAmount/Continue"
        />
      </KeyboardAwareScrollView>

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

GoldBuyEnterAmount.navigationOptions = () => ({
  ...headerWithBackButton,
})

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
