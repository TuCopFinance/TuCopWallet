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
import { calculateFromGoldAmount } from 'src/gold/useGoldQuote'
import { useXaut0Balance } from 'src/gold/useXaut0Balance'
import DownArrowIcon from 'src/icons/DownArrowIcon'
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
import { swappableFromTokensByNetworkIdSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import { parseInputAmount } from 'src/utils/parsing'
import networkConfig from 'src/web3/networkConfig'

type Props = NativeStackScreenProps<StackParamList, Screens.GoldSellEnterAmount>

const TOKEN_SELECTOR_BORDER_RADIUS = 100

export default function GoldSellEnterAmount(_props: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { decimalSeparator } = getNumberFormatSettings()

  // Get user-friendly display name for tokens
  const getTokenName = (token: TokenBalance | null) => {
    if (!token) return ''
    if (token.tokenId === networkConfig.copmTokenId) {
      return t('assets.pesos')
    }
    if (token.tokenId === networkConfig.usdtTokenId) {
      return t('assets.dollars')
    }
    const symbol = token.symbol?.toLowerCase() || ''
    if (symbol === 'ccop' || symbol === 'copm') {
      return t('assets.pesos')
    }
    if (symbol === 'usdt' || symbol === 'usdt0' || symbol === 'usd₮') {
      return t('assets.dollars')
    }
    return token.name
  }

  const goldPriceUsd = useSelector(goldPriceUsdSelector)
  const localCurrencySymbol = useSelector(getLocalCurrencySymbol) ?? LocalCurrencySymbol.USD
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)

  // Get XAUt0 token balance directly from blockchain (more reliable)
  const { balance: xaut0Balance, loading: balanceLoading } = useXaut0Balance()

  // Get swappable tokens for output (what user receives)
  const swappableTokens = useSelector((state) =>
    swappableFromTokensByNetworkIdSelector(state, [NetworkId['celo-mainnet']])
  )

  // Filter out XAUt0 from output options
  const availableOutputTokens = useMemo(
    () => swappableTokens.filter((token) => token.tokenId !== networkConfig.xaut0TokenId),
    [swappableTokens]
  )

  // Prefer USDT as default output token, fall back to first available
  const [selectedOutputToken, setSelectedOutputToken] = useState<TokenBalance | null>(() => {
    const usdtToken = availableOutputTokens.find(
      (token) => token.tokenId === networkConfig.usdtTokenId
    )
    return usdtToken ?? availableOutputTokens[0] ?? null
  })

  const tokenBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const goldAmountInputRef = useRef<RNTextInput>(null)

  const [goldAmountInput, setGoldAmountInput] = useState<string>('')
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null)

  // Parse input amount
  const parsedGoldAmount = useMemo(
    () => parseInputAmount(goldAmountInput, decimalSeparator),
    [goldAmountInput, decimalSeparator]
  )

  // Calculate output token amount from gold amount
  const outputAmount = useMemo(() => {
    if (!parsedGoldAmount || parsedGoldAmount.lte(0) || !selectedOutputToken?.priceUsd) {
      return null
    }
    const outputPriceUsd = selectedOutputToken.priceUsd.toNumber()
    return calculateFromGoldAmount(parsedGoldAmount, outputPriceUsd, goldPriceUsd ?? null)
  }, [parsedGoldAmount, selectedOutputToken?.priceUsd, goldPriceUsd])

  // Calculate local currency value
  const localValue = useMemo(() => {
    if (!parsedGoldAmount || !goldPriceUsd || !usdToLocalRate) return null
    return parsedGoldAmount.multipliedBy(goldPriceUsd).multipliedBy(usdToLocalRate)
  }, [parsedGoldAmount, goldPriceUsd, usdToLocalRate])

  // Local gold price
  const localGoldPrice = useMemo(() => {
    if (!goldPriceUsd || !usdToLocalRate) return null
    return new BigNumber(goldPriceUsd).multipliedBy(usdToLocalRate)
  }, [goldPriceUsd, usdToLocalRate])

  const goldAmountRegex = new RegExp(
    `^(?:\\d+[${decimalSeparator}]?\\d*|[${decimalSeparator}]\\d*|[${decimalSeparator}])$`
  )

  const onGoldAmountInputChange = (value: string) => {
    setSelectedPercentage(null)
    if (!value) {
      setGoldAmountInput('')
    } else {
      if (value.startsWith(decimalSeparator)) {
        value = `0${value}`
      }
      if (value.match(goldAmountRegex)) {
        setGoldAmountInput(value)
      }
    }
  }

  const onSelectPercentageAmount = (percentage: number) => {
    const amount = xaut0Balance.multipliedBy(percentage)
    setGoldAmountInput(amount.toFormat({ decimalSeparator }))
    setSelectedPercentage(percentage)
  }

  const onTokenPickerSelect = () => {
    tokenBottomSheetRef.current?.snapToIndex(0)
    AppAnalytics.track(GoldEvents.gold_sell_start)
  }

  const onSelectToken = (token: TokenBalance) => {
    setSelectedOutputToken(token)
    tokenBottomSheetRef.current?.close()
    AppAnalytics.track(GoldEvents.gold_sell_enter_amount, {
      amount: '0',
    })
  }

  // No minimum validation for SELL - if user has balance, they should be able to sell it
  // The swap API may reject very small amounts, but that error is handled gracefully
  const isAmountValid =
    parsedGoldAmount && parsedGoldAmount.gt(0) && parsedGoldAmount.lte(xaut0Balance)

  const insufficientBalance = parsedGoldAmount && parsedGoldAmount.gt(xaut0Balance)

  const onPressContinue = () => {
    if (!isAmountValid || !selectedOutputToken || !outputAmount) return

    AppAnalytics.track(GoldEvents.gold_sell_quote_received, {
      fromAmount: parsedGoldAmount.toString(),
      toAmount: outputAmount.toString(),
    })

    navigate(Screens.GoldSellConfirmation, {
      toTokenId: selectedOutputToken.tokenId,
      xautAmount: parsedGoldAmount.toString(),
      toAmount: outputAmount.toString(),
      pricePerOz: goldPriceUsd?.toString() ?? '0',
    })
  }

  const insetsStyle = {
    paddingBottom: Math.max(insets.bottom, Spacing.Regular16),
  }

  // Only show empty state after balance has loaded and is actually zero
  if (!balanceLoading && xaut0Balance.isZero()) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <CustomHeader style={{ paddingHorizontal: Spacing.Thick24 }} left={<BackButton />} />
        <View style={styles.emptyState}>
          <GoldIconSelector size={64} />
          <Text style={styles.emptyStateText}>{t('goldFlow.sell.noGoldBalance')}</Text>
          <Button
            onPress={() => navigate(Screens.GoldBuyEnterAmount)}
            text={t('goldFlow.sell.buyGold')}
            size={BtnSizes.MEDIUM}
            type={BtnTypes.PRIMARY}
            style={styles.buyButton}
            testID="GoldSellEnterAmount/BuyGold"
          />
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
          <Text style={styles.title}>{t('goldFlow.sell.title')}</Text>

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

          {/* Input Box */}
          <View style={styles.inputBox}>
            <View style={styles.inputRow}>
              <AmountInput
                inputRef={goldAmountInputRef}
                inputValue={goldAmountInput}
                onInputChange={onGoldAmountInputChange}
                inputStyle={styles.inputText}
                autoFocus
                placeholder={new BigNumber(0).toFormat(XAUT0_DECIMALS)}
                testID="GoldSellEnterAmount/GoldAmountInput"
              />
              <View style={styles.goldBadge}>
                <GoldIconSelector size={20} />
                <Text style={styles.tokenName}>{t('goldFlow.gold')}</Text>
              </View>
            </View>

            {/* Output Token Amount */}
            <View style={styles.outputRow}>
              {selectedOutputToken && (
                <>
                  <Touchable
                    borderRadius={TOKEN_SELECTOR_BORDER_RADIUS}
                    onPress={onTokenPickerSelect}
                    style={styles.tokenSelectButton}
                    disabled={availableOutputTokens.length <= 1}
                    testID="GoldSellEnterAmount/TokenSelect"
                  >
                    <>
                      <TokenIcon token={selectedOutputToken} size={IconSize.SMALL} />
                      <Text style={styles.tokenName}>{getTokenName(selectedOutputToken)}</Text>
                      {availableOutputTokens.length > 1 && <DownArrowIcon color={Colors.gray5} />}
                    </>
                  </Touchable>
                  <Text style={styles.outputAmountText}>
                    {outputAmount ? outputAmount.toFormat(selectedOutputToken.decimals) : '0'}
                  </Text>
                </>
              )}
              {localValue && (
                <Text style={styles.localValueText}>
                  ≈ {localCurrencySymbol}
                  {localValue.toFormat(2)}
                </Text>
              )}
            </View>
          </View>

          {/* Balance Display */}
          <Text style={styles.balanceText}>
            {t('goldFlow.sell.available')}: {xaut0Balance.toFormat(XAUT0_DECIMALS)}{' '}
            {t('goldFlow.gold')}
          </Text>
        </View>

        {/* Warnings */}
        {insufficientBalance && (
          <InLineNotification
            variant={NotificationVariant.Warning}
            title={t('sendEnterAmountScreen.insufficientBalanceWarning.title', {
              tokenSymbol: t('goldFlow.gold'),
            })}
            description={t('sendEnterAmountScreen.insufficientBalanceWarning.description', {
              tokenSymbol: t('goldFlow.gold'),
            })}
            style={styles.warning}
            testID="GoldSellEnterAmount/InsufficientBalance"
          />
        )}

        {/* Percentage Options */}
        <EnterAmountOptions
          onPressAmount={onSelectPercentageAmount}
          selectedAmount={selectedPercentage}
          testID="GoldSellEnterAmount/AmountOptions"
        />

        {/* Continue Button */}
        <Button
          onPress={onPressContinue}
          text={t('goldFlow.sell.continue')}
          size={BtnSizes.FULL}
          type={BtnTypes.PRIMARY}
          disabled={!isAmountValid}
          style={styles.continueButton}
          testID="GoldSellEnterAmount/Continue"
        />
      </KeyboardAwareScrollView>

      {/* Token Picker */}
      <TokenBottomSheet
        forwardedRef={tokenBottomSheetRef}
        origin={TokenPickerOrigin.Send}
        onTokenSelected={onSelectToken}
        tokens={availableOutputTokens}
        title={t('goldFlow.sell.selectToken')}
        titleStyle={styles.title}
      />
    </SafeAreaView>
  )
}

// Using inline CustomHeader with BackButton, so no navigationOptions needed
GoldSellEnterAmount.navigationOptions = {
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
  goldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1', // Light gold background
    borderWidth: 1,
    borderColor: Colors.goldBrand,
    borderRadius: 100,
    paddingHorizontal: Spacing.Smallest8,
    paddingVertical: Spacing.Tiny4,
    gap: Spacing.Tiny4,
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
  outputAmountText: {
    ...typeScale.labelMedium,
    color: Colors.black,
    flex: 1,
    textAlign: 'right',
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
    gap: Spacing.Regular16,
  },
  emptyStateText: {
    ...typeScale.bodyLarge,
    color: Colors.gray4,
    textAlign: 'center',
  },
  buyButton: {
    marginTop: Spacing.Regular16,
  },
})
