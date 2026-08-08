import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { PayloadAction, createSlice } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useReducer, useRef } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { getNumberFormatSettings } from 'react-native-localize'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { SwapEvents } from 'src/analytics/Events'
import { showErrorMessage } from 'src/components/ErrorMessage'
import BackButton from 'src/components/BackButton'
import BottomSheet, { BottomSheetModalRefType } from 'src/components/BottomSheet'
import Button, { BtnSizes, BtnTypes } from 'src/components/Button'
import InLineNotification, { NotificationVariant } from 'src/components/InLineNotification'
import Toast from 'src/components/Toast'
import TokenBottomSheet, { TokenPickerOrigin } from 'src/components/TokenBottomSheet'
import Touchable from 'src/components/Touchable'
import CustomHeader from 'src/components/header/CustomHeader'
import ArrowDown from 'src/icons/navigation/ArrowDown'
import CircledIcon from 'src/icons/ui/CircledIcon'
import CrossChainIndicator from 'src/icons/features/CrossChainIndicator'
import { getLocalCurrencyCode } from 'src/localCurrency/selectors'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { useDispatch, useSelector } from 'src/redux/hooks'
import EnterAmountOptions from 'src/send/EnterAmountOptions'
import { NETWORK_NAMES } from 'src/shared/conts'
import { getDynamicConfigParams, getFeatureGate } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs, StatsigFeatureGates } from 'src/statsig/types'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import FeeInfoBottomSheet from 'src/swap/FeeInfoBottomSheet'
import SwapAmountInput from 'src/swap/SwapAmountInput'
import SwapTransactionDetails from 'src/swap/SwapTransactionDetails'
import getCrossChainFee from 'src/swap/getCrossChainFee'
import { getSwapTxsAnalyticsProperties } from 'src/swap/getSwapTxsAnalyticsProperties'
import {
  buildDolaresVirtualToken,
  DOLARES_VIRTUAL_TOKEN_ID,
  executeMultiSwap,
  MULTI_SWAP_SLIPPAGE_PERCENTAGE,
  multiSwapCleared,
  planSpend,
  useDollarBalanceSnapshots,
  useMultiSwapQuote,
} from 'src/dollarsSpend'
import TransactionFlowShell from 'src/dollarsSpend/TransactionFlowShell'
import { currentSwapSelector, priceImpactWarningThresholdSelector } from 'src/swap/selectors'
import { swapStart } from 'src/swap/slice'
import { AppFeeAmount, Field, SwapAmount, SwapFeeAmount } from 'src/swap/types'
import useFilterChips from 'src/swap/useFilterChips'
import useSwapQuote, {
  NO_QUOTE_ERROR_MESSAGE,
  QuoteResult,
  SWAP_UPSTREAM_TRANSIENT_ERROR,
} from 'src/swap/useSwapQuote'
import { useSwappableTokens, useTokenInfo } from 'src/tokens/hooks'
import {
  feeCurrenciesSelector,
  feeCurrenciesWithPositiveBalancesSelector,
  tokensByIdSelector,
} from 'src/tokens/selectors'
import { DOLLAR_TOKEN_IDS } from 'src/tokens/dollarGroup'
import { TokenBalance } from 'src/tokens/slice'
import { getSupportedNetworkIdsForSwap } from 'src/tokens/utils'
import { NetworkId } from 'src/transactions/types'
import { getDisplayDecimalsForToken, getInputDecimalsForToken } from 'src/utils/formatting'
import Logger from 'src/utils/Logger'
import { parseInputAmount } from 'src/utils/parsing'
import { getFeeCurrencyAndAmounts } from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import networkConfig from 'src/web3/networkConfig'
import { v4 as uuidv4 } from 'uuid'

const TAG = 'SwapScreen'

// Bumped from 200ms to 500ms after measuring 429 amplification in prod:
// Squid enforces a 10 RPS per-wallet limit, and 200ms allows up to 5 hits per
// second on typing. 500ms collapses keystroke bursts into a single quote call
// while still feeling responsive. See useMultiSwapQuote for the matching
// debounce on the multi-step Dolares -> Pesos path.
const FETCH_UPDATED_QUOTE_DEBOUNCE_TIME = 500

// Hard floor for any swap leg. Below this, Squid's routes for stablecoin /
// COPm pairs hit minimum-input or slippage failures and the tx reverts on
// chain (verified with 1000 COPm -> USDC at ~$0.29 USD, tx
// 0xec65f5d042014201173a4e90204ddf4f2f0db89fdf871998172ea7a0885cfece).
// We gate the Confirm button when the requested USD value falls below this
// threshold so the user is never asked to spend gas on a doomed swap.
//
// Threshold = $0.50, not $1.00, because user-facing token amounts come from
// real on-chain priceUsd which deviates from a perfect peg (USDT typically
// ~$0.998, USDC ~$1.001). "1 USDT" looks like a dollar to the user but the
// USD value math is $0.998. A $1 threshold would block "1 of any stable"
// most of the time, which is hostile UX. $0.50 still blocks the actual
// failure cases without surprising the user.
const MIN_SWAP_USD = 0.5

const DEFAULT_INPUT_SWAP_AMOUNT: SwapAmount = {
  [Field.FROM]: '',
  [Field.TO]: '',
}

type SelectingNoUsdPriceToken = TokenBalance & {
  tokenPositionInList: number
}
interface SwapState {
  fromTokenId: string | undefined
  toTokenId: string | undefined
  // Raw input values (can contain region specific decimal separators)
  inputSwapAmount: SwapAmount
  selectingField: Field | null
  selectingNoUsdPriceToken: SelectingNoUsdPriceToken | null
  confirmingSwap: boolean
  // Keep track of which swap is currently being executed from this screen
  // This is because there could be multiple swaps happening at the same time
  startedSwapId: string | null
  switchedToNetworkId: NetworkId | null
  selectedPercentage: number | null
}

function getInitialState(fromTokenId?: string, toTokenId?: string): SwapState {
  return {
    fromTokenId,
    toTokenId,
    inputSwapAmount: DEFAULT_INPUT_SWAP_AMOUNT,
    selectingField: null,
    selectingNoUsdPriceToken: null,
    confirmingSwap: false,
    startedSwapId: null,
    switchedToNetworkId: null,
    selectedPercentage: null,
  }
}

const swapSlice = createSlice({
  name: 'swapSlice',
  initialState: getInitialState,
  reducers: {
    changeAmount: (state, action: PayloadAction<{ value: string }>) => {
      const { value } = action.payload
      state.confirmingSwap = false
      state.startedSwapId = null
      if (!value) {
        state.inputSwapAmount = DEFAULT_INPUT_SWAP_AMOUNT
        return
      }
      // Regex to match only numbers and one decimal separator
      const sanitizedValue = value.match(/^(?:\d+[.,]?\d*|[.,]\d*|[.,])$/)?.join('')
      if (!sanitizedValue) {
        return
      }
      state.inputSwapAmount[Field.FROM] = sanitizedValue
      state.selectedPercentage = null
    },
    chooseFromAmountPercentage: (
      state,
      action: PayloadAction<{
        fromTokenBalance: BigNumber
        percentage: number
        fromTokenId?: string
      }>
    ) => {
      const { fromTokenBalance, percentage, fromTokenId } = action.payload
      state.confirmingSwap = false
      state.startedSwapId = null
      state.selectedPercentage = percentage
      // Round to the token's display decimals so the input doesn't show 18
      // raw decimals of token base units when the user taps Max / 25 / 50 / 75.
      state.inputSwapAmount[Field.FROM] = fromTokenBalance
        .multipliedBy(percentage)
        .decimalPlaces(getInputDecimalsForToken(fromTokenId), BigNumber.ROUND_DOWN)
        .toFormat({
          decimalSeparator: getNumberFormatSettings().decimalSeparator,
        })
    },
    startSelectToken: (state, action: PayloadAction<{ fieldType: Field }>) => {
      state.selectingField = action.payload.fieldType
      state.confirmingSwap = false
    },
    selectNoUsdPriceToken: (
      state,
      action: PayloadAction<{
        token: SelectingNoUsdPriceToken
      }>
    ) => {
      state.selectingNoUsdPriceToken = action.payload.token
    },
    unselectNoUsdPriceToken: (state) => {
      state.selectingNoUsdPriceToken = null
    },
    selectTokens: (
      state,
      action: PayloadAction<{
        fromTokenId: string | undefined
        toTokenId: string | undefined
        switchedToNetworkId: NetworkId | null
      }>
    ) => {
      const { fromTokenId, toTokenId, switchedToNetworkId } = action.payload
      state.confirmingSwap = false
      if (fromTokenId !== state.fromTokenId || toTokenId !== state.toTokenId) {
        state.startedSwapId = null
      }
      state.fromTokenId = fromTokenId
      state.toTokenId = toTokenId
      state.switchedToNetworkId = switchedToNetworkId
      state.selectingNoUsdPriceToken = null
      state.selectedPercentage = null
    },
    quoteUpdated: (state, action: PayloadAction<{ quote: QuoteResult | null }>) => {
      const { quote } = action.payload
      state.confirmingSwap = false
      if (!quote) {
        state.inputSwapAmount[Field.TO] = ''
        return
      }

      const { decimalSeparator } = getNumberFormatSettings()
      const parsedAmount = parseInputAmount(state.inputSwapAmount[Field.FROM], decimalSeparator)

      const newAmount = parsedAmount.multipliedBy(new BigNumber(quote.price))
      // Round to the destination token's display decimals so the auto-filled
      // TO field doesn't render with full BigNumber precision (the bug behind
      // KNOWN_ISSUES BUG-004 — swap input showing ~18 decimals).
      state.inputSwapAmount[Field.TO] = newAmount
        .decimalPlaces(getInputDecimalsForToken(state.toTokenId), BigNumber.ROUND_DOWN)
        .toFormat({ decimalSeparator })
    },
    // When the user presses the confirm swap button
    startConfirmSwap: (state) => {
      state.confirmingSwap = true
    },
    // When the swap is ready to be executed
    startSwap: (state, action: PayloadAction<{ swapId: string }>) => {
      state.startedSwapId = action.payload.swapId
    },
  },
})

const {
  changeAmount,
  chooseFromAmountPercentage,
  startSelectToken,
  selectTokens,
  quoteUpdated,
  startConfirmSwap,
  startSwap,
  selectNoUsdPriceToken,
  unselectNoUsdPriceToken,
} = swapSlice.actions

const swapStateReducer = swapSlice.reducer

function getNetworkFee(quote: QuoteResult | null) {
  const { feeCurrency, maxFeeAmount, estimatedFeeAmount } = getFeeCurrencyAndAmounts(
    quote?.preparedTransactions
  )
  return feeCurrency && estimatedFeeAmount
    ? {
        token: feeCurrency,
        maxAmount: maxFeeAmount,
        amount: estimatedFeeAmount,
      }
    : undefined
}

type Props = NativeStackScreenProps<StackParamList, Screens.SwapScreenWithBack>

export function SwapScreen({ route }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const tokenBottomSheetFromRef = useRef<BottomSheetModalRefType>(null)
  const tokenBottomSheetToRef = useRef<BottomSheetModalRefType>(null)
  const tokenBottomSheetRefs = {
    [Field.FROM]: tokenBottomSheetFromRef,
    [Field.TO]: tokenBottomSheetToRef,
  }
  const exchangeRateInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const feeInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const slippageInfoBottomSheetRef = useRef<BottomSheetModalRefType>(null)
  const estimatedDurationBottomSheetRef = useRef<BottomSheetModalRefType>(null)

  const allowCrossChainSwaps = getFeatureGate(StatsigFeatureGates.ALLOW_CROSS_CHAIN_SWAPS)
  const showUKCompliantVariant = getFeatureGate(StatsigFeatureGates.SHOW_UK_COMPLIANT_VARIANT)

  const { decimalSeparator } = getNumberFormatSettings()

  const { maxSlippagePercentage, enableAppFee } = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.SWAP_CONFIG]
  )
  const { links } = getDynamicConfigParams(DynamicConfigs[StatsigDynamicConfigs.APP_CONFIG])
  // parsedSlippagePercentage is derived below near the isVirtualDolares
  // declaration so it picks the tolerance the actually-active path will send
  // on-chain (regular = Statsig, virtual Dolares = MULTI_SWAP_SLIPPAGE_PERCENTAGE).

  const { swappableFromTokens, swappableToTokens, areSwapTokensShuffled } = useSwappableTokens()

  const dollarSnapshots = useDollarBalanceSnapshots()
  const dolaresVirtualToken = useMemo(
    () =>
      buildDolaresVirtualToken({
        snapshots: dollarSnapshots,
        networkId: networkConfig.defaultNetworkId,
      }),
    [dollarSnapshots]
  )

  // Resolver-only list: keeps the virtual "Dolares" token so navigation
  // that pre-selects FROM=virtual (from home CTAs, etc) can still find it
  // when computing the `fromToken` object. The picker itself uses the raw
  // `swappableFromTokens` and never surfaces the virtual token, because
  // "Dolares" is the closed-state aggregate — inside the picker the user
  // is choosing between concrete tokens (USDT, USDC, USDm, Pesos, ...).
  const fromTokensForResolution = useMemo(() => {
    return dolaresVirtualToken ? [dolaresVirtualToken, ...swappableFromTokens] : swappableFromTokens
  }, [swappableFromTokens, dolaresVirtualToken])

  const priceImpactWarningThreshold = useSelector(priceImpactWarningThresholdSelector)

  const tokensById = useSelector((state) =>
    tokensByIdSelector(state, getSupportedNetworkIdsForSwap())
  )

  const initialFromTokenId = route.params?.fromTokenId
  const initialToTokenId = route.params?.toTokenId
  const initialToTokenNetworkId = route.params?.toTokenNetworkId
  const [state, localDispatch] = useReducer(
    swapStateReducer,
    getInitialState(initialFromTokenId, initialToTokenId)
  )
  const {
    fromTokenId,
    toTokenId,
    inputSwapAmount,
    selectingField,
    selectingNoUsdPriceToken,
    switchedToNetworkId,
    startedSwapId,
    selectedPercentage,
  } = state

  const filterChipsFrom = useFilterChips(Field.FROM)
  const filterChipsTo = useFilterChips(Field.TO, initialToTokenNetworkId)

  const { fromToken, toToken } = useMemo(() => {
    // Also search fromTokensForResolution so the virtual Dolares token resolves correctly.
    const fromToken =
      swappableFromTokens.find((token) => token.tokenId === fromTokenId) ??
      fromTokensForResolution.find((token) => token.tokenId === fromTokenId)
    // Virtual "Dolares" is not a real ERC-20 and never lives in the
    // swappable list; resolve it explicitly from the synthetic builder so
    // the swap card can render the aggregated balance when callers (home
    // CTAs, etc.) route into swap with TO=virtual pre-selected.
    const toToken =
      toTokenId === DOLARES_VIRTUAL_TOKEN_ID
        ? (dolaresVirtualToken ?? undefined)
        : swappableToTokens.find((token) => token.tokenId === toTokenId)
    return { fromToken, toToken }
  }, [
    fromTokenId,
    toTokenId,
    swappableFromTokens,
    swappableToTokens,
    fromTokensForResolution,
    dolaresVirtualToken,
  ])

  // When the user picks the virtual "Dolares" as destination, the swap router
  // still needs a real ERC-20 to settle into. Default to USDT (highest-liquidity
  // dollar in the wallet strategy); fall back to the first available dollar
  // token if USDT isn't swappable on the active network.
  const quoteToToken = useMemo(() => {
    if (toToken?.tokenId !== DOLARES_VIRTUAL_TOKEN_ID) return toToken
    const usdt = swappableToTokens.find((t) => t.tokenId === networkConfig.usdtTokenId)
    if (usdt) return usdt
    return swappableToTokens.find((t) => DOLLAR_TOKEN_IDS.has(t.tokenId)) ?? toToken
  }, [toToken, swappableToTokens])

  // When fromToken is the virtual Dolares aggregate, useTokenInfo returns
  // undefined (virtual tokens are not in the registry) and fromTokenBalance
  // would collapse to 0 — the percentage chips (25/50/75/100) then all land
  // on 0 and the Confirmar button stays disabled. The synthetic token itself
  // carries the aggregate balance (totalUsd across USAT/USDm/USDC/USDT, see
  // buildDolaresVirtualToken), so use that directly for the virtual path.
  const fromTokenInfo = useTokenInfo(fromToken?.tokenId)
  const fromTokenBalance =
    fromToken?.tokenId === DOLARES_VIRTUAL_TOKEN_ID
      ? (fromToken.balance ?? new BigNumber(0))
      : (fromTokenInfo?.balance ?? new BigNumber(0))

  const currentSwap = useSelector(currentSwapSelector)
  const swapStatus = startedSwapId === currentSwap?.id ? currentSwap.status : null

  const feeCurrenciesWithPositiveBalances = useSelector((state) =>
    feeCurrenciesWithPositiveBalancesSelector(
      state,
      fromToken?.networkId || networkConfig.defaultNetworkId
    )
  )
  const localCurrency = useSelector(getLocalCurrencyCode)

  const { quote, refreshQuote, fetchSwapQuoteError, fetchingSwapQuote, clearQuote } = useSwapQuote({
    networkId: fromToken?.networkId || networkConfig.defaultNetworkId,
    slippagePercentage: maxSlippagePercentage,
    enableAppFee: enableAppFee,
  })

  // Parsed swap amounts (BigNumber)
  const parsedSwapAmount = useMemo(
    () => ({
      [Field.FROM]: parseInputAmount(inputSwapAmount[Field.FROM], decimalSeparator),
      [Field.TO]: parseInputAmount(inputSwapAmount[Field.TO], decimalSeparator),
    }),
    [inputSwapAmount]
  )

  const isVirtualDolares = fromTokenId === DOLARES_VIRTUAL_TOKEN_ID

  // Regular quote path uses maxSlippagePercentage from Statsig SWAP_CONFIG.
  // Virtual Dolares multi-swap saga hardcodes MULTI_SWAP_SLIPPAGE_PERCENTAGE
  // (currently 1.5%) because per-leg quotes need more headroom. Surface the
  // right number depending on which path is active so the details panel
  // never claims a tolerance the wallet is not going to send on-chain.
  const parsedSlippagePercentage = useMemo(() => {
    const active = isVirtualDolares ? MULTI_SWAP_SLIPPAGE_PERCENTAGE : maxSlippagePercentage
    return new BigNumber(active).toFormat()
  }, [isVirtualDolares, maxSlippagePercentage])

  const fromAmountUsd = useMemo(() => {
    if (!isVirtualDolares) return new BigNumber(0)
    return parsedSwapAmount[Field.FROM].gt(0) ? parsedSwapAmount[Field.FROM] : new BigNumber(0)
  }, [isVirtualDolares, parsedSwapAmount])

  const multiSwapPlan = useMemo(() => {
    if (!isVirtualDolares || fromAmountUsd.lte(0)) return null
    return planSpend({ requestedUsd: fromAmountUsd, balances: dollarSnapshots })
  }, [isVirtualDolares, fromAmountUsd, dollarSnapshots])

  // Use the concrete settlement tokenId so multi-step quotes still resolve
  // when the user picked "Dolares" on BOTH sides (FROM=virtual, TO=virtual).
  // toTokenDecimals lets the hook shift the wei-denominated buyAmount back
  // into whole units before the UI consumes it (no wei ever reaches display).
  const multiSwapQuote = useMultiSwapQuote(
    multiSwapPlan?.steps ?? [],
    quoteToToken?.tokenId ?? '',
    quoteToToken?.decimals ?? 18
  )

  const shouldShowMaxSwapAmountWarning =
    feeCurrenciesWithPositiveBalances.length === 1 &&
    fromToken?.tokenId === feeCurrenciesWithPositiveBalances[0].tokenId &&
    fromTokenBalance.gt(0) &&
    parsedSwapAmount[Field.FROM].gte(fromTokenBalance)

  // Predictive: red-highlight the amount the moment it exceeds the wallet
  // balance, without waiting for the user to press "Swap". Virtual Dolares
  // rows compare against the aggregate, handled by the SwapScreen validator
  // path elsewhere, so we skip this check for it.
  const fromSwapAmountError = !isVirtualDolares && parsedSwapAmount[Field.FROM].gt(fromTokenBalance)

  // Compare against quoteToToken because for virtual "Dolares" the quote
  // settles into the concrete fallback (USDT) while toToken stays virtual
  // for display. Comparing against toToken.tokenId here would mark the
  // quote as forever pending.
  const quoteUpdatePending =
    (quote &&
      (quote.fromTokenId !== fromToken?.tokenId ||
        quote.toTokenId !== quoteToToken?.tokenId ||
        !quote.swapAmount.eq(parsedSwapAmount[Field.FROM]))) ||
    fetchingSwapQuote

  const confirmSwapIsLoading = swapStatus === 'started'
  const confirmSwapFailed = swapStatus === 'error'

  useEffect(() => {
    AppAnalytics.track(SwapEvents.swap_screen_open)
  }, [])

  const isTransientUpstreamError =
    !!fetchSwapQuoteError?.message?.includes(SWAP_UPSTREAM_TRANSIENT_ERROR) ||
    !!multiSwapQuote.error?.message?.includes(SWAP_UPSTREAM_TRANSIENT_ERROR)

  useEffect(() => {
    if (fetchSwapQuoteError) {
      if (
        !fetchSwapQuoteError.message.includes(NO_QUOTE_ERROR_MESSAGE) &&
        // Transient upstream errors (429 exhausted / 502 squid down) show as
        // an inline notification below the swap inputs so the user can just
        // try again. Surfacing them in the generic "Algo no salio" sheet
        // makes a recoverable backend hiccup look like the app is broken.
        !isTransientUpstreamError
      ) {
        showErrorMessage({
          error: fetchSwapQuoteError,
          context: { screen: 'SwapScreen', action: 'fetchSwapQuote' },
          variant: 'sheet',
        })
      }
    }
  }, [fetchSwapQuoteError, isTransientUpstreamError])

  useEffect(() => {
    // since we use the quote to update the parsedSwapAmount,
    // this hook will be triggered after the quote is first updated. this
    // variable prevents the quote from needlessly being fetched again.
    // quoteToToken is the concrete settlement token (= toToken in normal
    // cases, or USDT when the user picked the virtual "Dolares" as TO).
    const quoteKnown =
      fromToken &&
      quoteToToken &&
      quote &&
      quote.toTokenId === quoteToToken.tokenId &&
      quote.fromTokenId === fromToken.tokenId &&
      quote.swapAmount.eq(parsedSwapAmount[Field.FROM])

    const debouncedRefreshQuote = setTimeout(() => {
      if (
        !isVirtualDolares &&
        fromToken &&
        quoteToToken &&
        parsedSwapAmount[Field.FROM].gt(0) &&
        !quoteKnown
      ) {
        void refreshQuote(fromToken, quoteToToken, parsedSwapAmount, Field.FROM)
      }
    }, FETCH_UPDATED_QUOTE_DEBOUNCE_TIME)

    return () => {
      clearTimeout(debouncedRefreshQuote)
    }
  }, [fromToken, quoteToToken, parsedSwapAmount, quote])

  useEffect(() => {
    localDispatch(quoteUpdated({ quote }))
  }, [quote])

  const handleConfirmSwap = () => {
    if (isVirtualDolares) {
      if (!multiSwapPlan || multiSwapPlan.shortfall.gt(0)) {
        // Shortfall banner is visible; do nothing
        return
      }
      // Use the concrete settlement tokenId so the multi-step saga always
      // gets a real ERC-20 destination, even when TO is the virtual Dolares.
      const settlementTokenId = quoteToToken?.tokenId
      if (!settlementTokenId) return
      dispatch(executeMultiSwap({ steps: multiSwapPlan.steps, toTokenId: settlementTokenId }))
      return
    }

    if (!quote) {
      return // this should never happen, because the button must be disabled in that cases
    }

    const fromToken = tokensById[quote.fromTokenId]
    const toToken = tokensById[quote.toTokenId]

    if (!fromToken || !toToken) {
      // Should never happen
      return
    }

    localDispatch(startConfirmSwap())

    const userInput = {
      toTokenId: toToken.tokenId,
      fromTokenId: fromToken.tokenId,
      swapAmount: {
        [Field.FROM]: parsedSwapAmount[Field.FROM].toString(),
        [Field.TO]: parsedSwapAmount[Field.TO].toString(),
      },
      updatedField: Field.FROM,
    }

    const { estimatedPriceImpact, price, allowanceTarget, appFeePercentageIncludedInPrice } = quote

    const resultType = quote.preparedTransactions.type
    switch (resultType) {
      case 'need-decrease-spend-amount-for-gas': // fallthrough on purpose
      case 'not-enough-balance-for-gas':
        // This should never actually happen, since the user should not be able
        // to confirm the swap in this case.
        break
      case 'possible':
        AppAnalytics.track(SwapEvents.swap_review_submit, {
          toToken: toToken.address,
          toTokenId: toToken.tokenId,
          toTokenNetworkId: toToken.networkId,
          toTokenIsImported: !!toToken.isManuallyImported,
          fromToken: fromToken.address,
          fromTokenId: fromToken.tokenId,
          fromTokenNetworkId: fromToken.networkId,
          fromTokenIsImported: !!fromToken.isManuallyImported,
          amount: inputSwapAmount[Field.FROM],
          amountType: 'sellAmount',
          allowanceTarget,
          estimatedPriceImpact,
          price,
          appFeePercentageIncludedInPrice,
          provider: quote.provider,
          swapType: quote.swapType,
          web3Library: 'viem',
          ...getSwapTxsAnalyticsProperties(
            quote.preparedTransactions.transactions,
            fromToken.networkId,
            tokensById
          ),
        })

        const swapId = uuidv4()
        localDispatch(startSwap({ swapId }))
        dispatch(
          swapStart({
            swapId,
            quote: {
              preparedTransactions: getSerializablePreparedTransactions(
                quote.preparedTransactions.transactions
              ),
              receivedAt: quote.receivedAt,
              price: quote.price,
              appFeePercentageIncludedInPrice,
              provider: quote.provider,
              estimatedPriceImpact,
              allowanceTarget,
              swapType: quote.swapType,
            },
            userInput,
            areSwapTokensShuffled,
          })
        )
        break
      default:
        // To catch any missing cases at compile time
        const assertNever: never = resultType
        return assertNever
    }
  }

  const handleSwitchTokens = () => {
    AppAnalytics.track(SwapEvents.swap_switch_tokens, { fromTokenId, toTokenId })
    localDispatch(
      selectTokens({
        fromTokenId: toTokenId,
        toTokenId: fromTokenId,
        switchedToNetworkId: null,
      })
    )
  }

  const handleShowTokenSelect = (fieldType: Field) => () => {
    AppAnalytics.track(SwapEvents.swap_screen_select_token, { fieldType })
    localDispatch(startSelectToken({ fieldType }))

    // use requestAnimationFrame so that the bottom sheet open animation is done
    // after the selectingField value is updated, so that the title of the
    // bottom sheet (which depends on selectingField) does not change on the
    // screen
    requestAnimationFrame(() => {
      tokenBottomSheetRefs[fieldType].current?.snapToIndex(0)
    })
  }

  const handleConfirmSelectToken = (selectedToken: TokenBalance, tokenPositionInList: number) => {
    if (!selectingField) {
      // Should never happen
      Logger.error(TAG, 'handleSelectToken called without selectingField')
      return
    }

    let newSwitchedToNetworkId: NetworkId | null = null
    let newFromToken = fromToken
    let newToToken = toToken

    if (
      (selectingField === Field.FROM && toToken?.tokenId === selectedToken.tokenId) ||
      (selectingField === Field.TO && fromToken?.tokenId === selectedToken.tokenId)
    ) {
      newFromToken = toToken
      newToToken = fromToken
    } else if (selectingField === Field.FROM) {
      newFromToken = selectedToken
      newSwitchedToNetworkId =
        toToken && toToken.networkId !== newFromToken.networkId && !allowCrossChainSwaps
          ? newFromToken.networkId
          : null
      if (newSwitchedToNetworkId) {
        // reset the toToken if the user is switching networks
        newToToken = undefined
      }
    } else if (selectingField === Field.TO) {
      newToToken = selectedToken
      newSwitchedToNetworkId =
        fromToken && fromToken.networkId !== newToToken.networkId && !allowCrossChainSwaps
          ? newToToken.networkId
          : null
      if (newSwitchedToNetworkId) {
        // reset the fromToken if the user is switching networks
        newFromToken = undefined
      }
    }

    AppAnalytics.track(SwapEvents.swap_screen_confirm_token, {
      fieldType: selectingField,
      tokenSymbol: selectedToken.symbol,
      tokenId: selectedToken.tokenId,
      tokenNetworkId: selectedToken.networkId,
      fromTokenSymbol: newFromToken?.symbol,
      fromTokenId: newFromToken?.tokenId,
      fromTokenNetworkId: newFromToken?.networkId,
      toTokenSymbol: newToToken?.symbol,
      toTokenId: newToToken?.tokenId,
      toTokenNetworkId: newToToken?.networkId,
      switchedNetworkId: !!newSwitchedToNetworkId,
      areSwapTokensShuffled,
      tokenPositionInList,
    })

    localDispatch(
      selectTokens({
        fromTokenId: newFromToken?.tokenId,
        toTokenId: newToToken?.tokenId,
        switchedToNetworkId: allowCrossChainSwaps ? null : newSwitchedToNetworkId,
      })
    )

    if (newSwitchedToNetworkId) {
      clearQuote()
    }

    // use requestAnimationFrame so that the bottom sheet and keyboard dismiss
    // animation can be synchronised and starts after the state changes above.
    // without this, the keyboard animation lags behind the state updates while
    // the bottom sheet does not
    requestAnimationFrame(() => {
      tokenBottomSheetRefs[selectingField].current?.close()
    })
  }

  const handleConfirmSelectTokenNoUsdPrice = () => {
    if (selectingNoUsdPriceToken) {
      handleConfirmSelectToken(
        selectingNoUsdPriceToken,
        selectingNoUsdPriceToken.tokenPositionInList
      )
    }
  }

  const handleDismissSelectTokenNoUsdPrice = () => {
    localDispatch(unselectNoUsdPriceToken())
  }

  const handleSelectToken = (selectedToken: TokenBalance, tokenPositionInList: number) => {
    if (!selectedToken.priceUsd && selectingField === Field.TO) {
      localDispatch(selectNoUsdPriceToken({ token: { ...selectedToken, tokenPositionInList } }))
      return
    }

    handleConfirmSelectToken(selectedToken, tokenPositionInList)
  }

  const handleChangeAmount = (value: string) => {
    localDispatch(changeAmount({ value }))
    if (!value) {
      clearQuote()
    }
  }

  const handleSelectAmountPercentage = (percentage: number) => {
    localDispatch(
      chooseFromAmountPercentage({
        fromTokenBalance,
        percentage,
        fromTokenId: fromToken?.tokenId,
      })
    )
    if (!fromToken) {
      // Should never happen
      return
    }
    AppAnalytics.track(SwapEvents.swap_screen_percentage_selected, {
      tokenSymbol: fromToken.symbol,
      tokenId: fromToken.tokenId,
      tokenNetworkId: fromToken.networkId,
      percentage,
    })
  }

  const onPressLearnMore = () => {
    AppAnalytics.track(SwapEvents.swap_learn_more)
    navigate(Screens.WebViewScreen, { uri: links.swapLearnMore })
  }

  const onPressLearnMoreFees = () => {
    AppAnalytics.track(SwapEvents.swap_gas_fees_learn_more)
    navigate(Screens.WebViewScreen, { uri: links.transactionFeesLearnMore })
  }

  const switchedToNetworkName = switchedToNetworkId && NETWORK_NAMES[switchedToNetworkId]

  const showCrossChainSwapNotification =
    toToken && fromToken && toToken.networkId !== fromToken.networkId && allowCrossChainSwaps

  const crossChainFeeCurrency = useSelector((state) =>
    feeCurrenciesSelector(state, fromToken?.networkId || networkConfig.defaultNetworkId)
  ).find((token) => token.isNative)
  const crossChainFee = getCrossChainFee(quote, crossChainFeeCurrency)

  // Compute the swap value in USD so we can gate against the wallet-wide
  // MIN_SWAP_USD floor regardless of whether the user is on the legacy
  // single-token path or the virtual Dolares aggregate path.
  const swapValueUsd = useMemo(() => {
    if (isVirtualDolares) return fromAmountUsd
    if (!fromToken || !fromToken.priceUsd) return new BigNumber(0)
    return parsedSwapAmount[Field.FROM].multipliedBy(fromToken.priceUsd)
  }, [isVirtualDolares, fromAmountUsd, fromToken, parsedSwapAmount])

  const getWarningStatuses = () => {
    // NOTE: If a new condition is added here, make sure to update `allowSwap` below if
    // the condition should prevent the user from swapping.
    const checks = {
      showSwitchedToNetworkWarning: !!switchedToNetworkId,
      showUnsupportedTokensWarning:
        !quoteUpdatePending && fetchSwapQuoteError?.message.includes(NO_QUOTE_ERROR_MESSAGE),
      // Block any swap below MIN_SWAP_USD. Squid's per-route minimums (e.g.
      // 1000 COPm ~= $0.29) would otherwise let the user confirm a tx that
      // reverts on chain (gas wasted). Surfaced as a banner before the
      // "Confirmar intercambio" button.
      showBelowMinSwapWarning:
        parsedSwapAmount[Field.FROM].gt(0) && swapValueUsd.gt(0) && swapValueUsd.lt(MIN_SWAP_USD),
      showInsufficientBalanceWarning:
        !isVirtualDolares && parsedSwapAmount[Field.FROM].gt(fromTokenBalance),
      showCrossChainFeeWarning:
        !quoteUpdatePending && crossChainFee?.nativeTokenBalanceDeficit.lt(0),
      showDecreaseSpendForGasWarning:
        !quoteUpdatePending &&
        quote?.preparedTransactions.type === 'need-decrease-spend-amount-for-gas',
      showNotEnoughBalanceForGasWarning:
        !quoteUpdatePending && quote?.preparedTransactions.type === 'not-enough-balance-for-gas',
      showMaxSwapAmountWarning: shouldShowMaxSwapAmountWarning && !confirmSwapFailed,
      showNoUsdPriceWarning:
        !confirmSwapFailed && !quoteUpdatePending && toToken && !toToken.priceUsd,
      showPriceImpactWarning:
        !confirmSwapFailed &&
        !quoteUpdatePending &&
        (quote?.estimatedPriceImpact
          ? new BigNumber(quote.estimatedPriceImpact).gte(priceImpactWarningThreshold)
          : false),
      showMissingPriceImpactWarning: !quoteUpdatePending && quote && !quote.estimatedPriceImpact,
    }

    // Only ever show a single warning, according to precedence as above.
    // Warnings that prevent the user from confirming the swap should
    // take higher priority over others.
    return Object.entries(checks).reduce(
      (acc, [name, status]) => {
        acc[name] = Object.values(acc).some(Boolean) ? false : !!status
        return acc
      },
      {} as Record<string, boolean>
    )
  }

  const {
    showCrossChainFeeWarning,
    showDecreaseSpendForGasWarning,
    showNotEnoughBalanceForGasWarning,
    showInsufficientBalanceWarning,
    showSwitchedToNetworkWarning,
    showMaxSwapAmountWarning,
    showNoUsdPriceWarning,
    showPriceImpactWarning,
    showUnsupportedTokensWarning,
    showMissingPriceImpactWarning,
    showBelowMinSwapWarning,
  } = getWarningStatuses()

  const allowSwap = useMemo(() => {
    if (showBelowMinSwapWarning) return false
    // No quote was obtained because Squid returned 429/502. The saga would
    // hit the same upstream and fail, so disable Confirmar until the next
    // refresh succeeds (the banner above tells the user to retry).
    if (isTransientUpstreamError) return false
    if (isVirtualDolares) {
      return (
        !!toTokenId &&
        !!multiSwapPlan &&
        multiSwapPlan.steps.length > 0 &&
        multiSwapPlan.shortfall.lte(0) &&
        fromAmountUsd.gt(0)
      )
    }
    return (
      !showDecreaseSpendForGasWarning &&
      !showNotEnoughBalanceForGasWarning &&
      !showInsufficientBalanceWarning &&
      !showCrossChainFeeWarning &&
      !confirmSwapIsLoading &&
      !quoteUpdatePending &&
      Object.values(parsedSwapAmount).every((amount) => amount.gt(0))
    )
  }, [
    isVirtualDolares,
    toTokenId,
    multiSwapPlan,
    fromAmountUsd,
    parsedSwapAmount,
    quoteUpdatePending,
    confirmSwapIsLoading,
    showInsufficientBalanceWarning,
    showDecreaseSpendForGasWarning,
    showNotEnoughBalanceForGasWarning,
    showCrossChainFeeWarning,
    showBelowMinSwapWarning,
    isTransientUpstreamError,
  ])
  // For the Dolares -> Pesos aggregate path the single `quote` is undefined
  // (the wallet runs N parallel quotes via useMultiSwapQuote). Synthesize the
  // fee components from the multi-step aggregate so the FeeInfoBottomSheet
  // shows real values instead of falling back to "Desconocido".
  //
  // - Network fee: rough flat estimate per step expressed in USDm (~Celo L2
  //   gas cost for a swap leg). USDm is in the wallet's token registry so the
  //   FeeAmount component can display it; CELO native, the real payer, is
  //   intentionally absent from the registry.
  // - App fee: the real per-step aggregated Squid app-fee summed in USD,
  //   surfaced via useMultiSwapQuote.aggregateAppFeeUsd. Also expressed in
  //   USDm (1:1 with USD for display).
  //
  // Calibration: on-chain measurement from tx 0xb7aa617c... showed a 3-step
  // atomic 7702 batch consumed 793,860 gas at 202 Gwei effective price. At
  // CELO ~ $0.30 that is $0.048 USD total, i.e. $0.016 per step. We round up
  // slightly to $0.020 to stay conservative under gas-price spikes; the user
  // never pays more on-chain than the max anyway.
  const NETWORK_FEE_USD_PER_STEP_ESTIMATE = new BigNumber(0.02)
  const NETWORK_FEE_MAX_MULTIPLIER = 1.5 // matches Celo L2 maxFee buffer
  const usdmTokenForFeeDisplay = useMemo(() => {
    return tokensById[networkConfig.usdmTokenId]
  }, [tokensById])

  const networkFee: SwapFeeAmount | undefined = useMemo(() => {
    if (isVirtualDolares) {
      if (!usdmTokenForFeeDisplay || multiSwapQuote.loading) return undefined
      const stepCount = multiSwapPlan?.steps.length ?? 0
      if (stepCount === 0) return undefined
      const estimateUsd = NETWORK_FEE_USD_PER_STEP_ESTIMATE.multipliedBy(stepCount)
      return {
        token: usdmTokenForFeeDisplay,
        amount: estimateUsd,
        maxAmount: estimateUsd.multipliedBy(NETWORK_FEE_MAX_MULTIPLIER),
      }
    }
    return getNetworkFee(quote)
  }, [isVirtualDolares, multiSwapQuote.loading, multiSwapPlan, usdmTokenForFeeDisplay, quote])

  const feeToken = networkFee?.token ? tokensById[networkFee.token.tokenId] : undefined

  const appFee: AppFeeAmount | undefined = useMemo(() => {
    if (isVirtualDolares) {
      if (!usdmTokenForFeeDisplay || multiSwapQuote.loading) return undefined
      // Average percentage across the legs that contributed to the aggregate.
      const fulfilledWithFee = multiSwapQuote.perStepQuotes.filter(
        (q) => q.appFeePercentageIncludedInPrice
      )
      const avgPercentage = fulfilledWithFee.length
        ? fulfilledWithFee
            .reduce((sum, q) => sum.plus(q.appFeePercentageIncludedInPrice ?? 0), new BigNumber(0))
            .dividedBy(fulfilledWithFee.length)
        : new BigNumber(0)
      return {
        amount: multiSwapQuote.aggregateAppFeeUsd,
        token: usdmTokenForFeeDisplay,
        percentage: avgPercentage,
      }
    }
    if (!quote || !fromToken) {
      return undefined
    }

    const percentage = new BigNumber(quote.appFeePercentageIncludedInPrice || 0)

    return {
      amount: parsedSwapAmount[Field.FROM].multipliedBy(percentage).dividedBy(100),
      token: fromToken,
      percentage,
    }
  }, [
    isVirtualDolares,
    multiSwapQuote.loading,
    multiSwapQuote.perStepQuotes,
    multiSwapQuote.aggregateAppFeeUsd,
    usdmTokenForFeeDisplay,
    quote,
    parsedSwapAmount,
    fromToken,
  ])

  useEffect(() => {
    if (showPriceImpactWarning || showMissingPriceImpactWarning) {
      if (!quote) {
        return
      }
      const fromToken = tokensById[quote.fromTokenId]
      const toToken = tokensById[quote.toTokenId]

      if (!fromToken || !toToken) {
        // Should never happen
        Logger.error(TAG, 'fromToken or toToken not found')
        return
      }

      AppAnalytics.track(SwapEvents.swap_price_impact_warning_displayed, {
        toToken: toToken.address,
        toTokenId: toToken.tokenId,
        toTokenNetworkId: toToken.networkId,
        toTokenIsImported: !!toToken.isManuallyImported,
        fromToken: fromToken.address,
        fromTokenId: fromToken.tokenId,
        fromTokenNetworkId: fromToken?.networkId,
        fromTokenIsImported: !!fromToken.isManuallyImported,
        amount: parsedSwapAmount[Field.FROM].toString(),
        amountType: 'sellAmount',
        priceImpact: quote.estimatedPriceImpact,
        provider: quote.provider,
      })
    }
  }, [showPriceImpactWarning || showMissingPriceImpactWarning])

  const feeCurrencies =
    quote && quote.preparedTransactions.type === 'not-enough-balance-for-gas'
      ? quote.preparedTransactions.feeCurrencies.map((feeCurrency) => feeCurrency.symbol).join(', ')
      : ''

  const tokenBottomSheetsConfig = [
    {
      fieldType: Field.FROM,
      // Picker shows real tokens only — the virtual "Dolares" aggregate is
      // the closed-state display, never a picker row. Symmetric with TO.
      tokens: swappableFromTokens,
      filterChips: filterChipsFrom,
      origin: TokenPickerOrigin.SwapFrom,
    },
    {
      fieldType: Field.TO,
      tokens: swappableToTokens,
      filterChips: filterChipsTo,
      origin: TokenPickerOrigin.SwapTo,
    },
  ]

  return (
    <SafeAreaView style={styles.safeAreaContainer} testID="SwapScreen">
      <CustomHeader
        style={{ paddingHorizontal: variables.contentPadding }}
        left={<BackButton />}
        title={t('swapScreen.title')}
      />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.swapAmountsContainer}>
          <SwapAmountInput
            onInputChange={handleChangeAmount}
            inputValue={inputSwapAmount[Field.FROM]}
            parsedInputValue={parsedSwapAmount[Field.FROM]}
            onSelectToken={handleShowTokenSelect(Field.FROM)}
            token={fromToken}
            style={styles.fromSwapAmountInput}
            loading={false}
            autoFocus
            inputError={fromSwapAmountError}
            buttonPlaceholder={t('swapScreen.selectTokenLabel')}
            borderRadius={Spacing.Regular16}
            showBalance={true}
          />
          <View style={styles.switchTokensContainer}>
            <Touchable
              borderless
              borderRadius={Spacing.Regular16}
              shouldRenderRippleAbove
              style={styles.switchTokens}
              onPress={handleSwitchTokens}
              testID="SwapScreen/SwitchTokens"
            >
              <CircledIcon radius={Spacing.Large32} backgroundColor={colors.black}>
                <ArrowDown color={colors.white} />
              </CircledIcon>
            </Touchable>
          </View>
          <SwapAmountInput
            // For virtual "Dolares" on FROM the regular `quote` is never
            // fetched (the FROM is synthetic; refreshQuote is gated). Show
            // the aggregated multi-swap output here instead so the user can
            // see how much they will receive across all the underlying steps.
            // Cap the displayed decimals via getDisplayDecimalsForToken
            // (stablecoins render at 2, other tokens at 6) so the TO field
            // reads like a monetary amount instead of dumping full BigNumber
            // precision into the UI. Since this field is `editable={false}`
            // for virtual Dolares the display decimals rule applies.
            parsedInputValue={
              isVirtualDolares ? multiSwapQuote.totalOutToken : parsedSwapAmount[Field.TO]
            }
            inputValue={
              isVirtualDolares
                ? multiSwapQuote.totalOutToken.gt(0)
                  ? (() => {
                      const d = getDisplayDecimalsForToken(toToken)
                      return multiSwapQuote.totalOutToken
                        .decimalPlaces(d, BigNumber.ROUND_DOWN)
                        .toFormat(d, { decimalSeparator })
                    })()
                  : ''
                : inputSwapAmount[Field.TO]
            }
            onSelectToken={handleShowTokenSelect(Field.TO)}
            token={toToken}
            style={styles.toSwapAmountInput}
            loading={isVirtualDolares ? multiSwapQuote.loading : quoteUpdatePending}
            buttonPlaceholder={t('swapScreen.selectTokenLabel')}
            editable={false}
            borderRadius={Spacing.Regular16}
            showBalance={true}
          />

          {showCrossChainSwapNotification && (
            <View style={styles.crossChainNotificationWrapper}>
              <CrossChainIndicator />
              <Text style={styles.crossChainNotification}>
                {t('swapScreen.crossChainNotification')}
              </Text>
            </View>
          )}
          <SwapTransactionDetails
            feeInfoBottomSheetRef={feeInfoBottomSheetRef}
            slippageInfoBottomSheetRef={slippageInfoBottomSheetRef}
            estimatedDurationBottomSheetRef={estimatedDurationBottomSheetRef}
            slippagePercentage={parsedSlippagePercentage}
            fromToken={fromToken}
            toToken={toToken}
            // Only pass when TO is the virtual aggregator and resolved to a
            // distinct concrete token; the panel uses presence to decide
            // whether to render the "Receiving in" row.
            settlementToken={
              toToken?.tokenId === DOLARES_VIRTUAL_TOKEN_ID &&
              quoteToToken &&
              quoteToToken.tokenId !== DOLARES_VIRTUAL_TOKEN_ID
                ? quoteToToken
                : undefined
            }
            // For virtual FROM the panel surfaces the per-token spend
            // breakdown (USDm / USDC / USDT) in-place; SwapScreen no longer
            // renders a separate DolaresMultiStepSummary block below the
            // confirm button.
            spendSteps={isVirtualDolares ? multiSwapPlan?.steps : undefined}
            // For virtual FROM the regular `quote.price` is undefined (the
            // multi-step path skips refreshQuote). Synthesize an effective
            // rate from the aggregated multi-swap result so the rate row
            // shows a meaningful value instead of returning null.
            exchangeRatePrice={
              isVirtualDolares
                ? multiSwapQuote.totalInUsd.gt(0) && multiSwapQuote.totalOutToken.gt(0)
                  ? multiSwapQuote.totalOutToken.dividedBy(multiSwapQuote.totalInUsd).toString()
                  : undefined
                : quote?.price
            }
            exchangeRateInfoBottomSheetRef={exchangeRateInfoBottomSheetRef}
            swapAmount={parsedSwapAmount[Field.FROM]}
            fetchingSwapQuote={isVirtualDolares ? multiSwapQuote.loading : quoteUpdatePending}
            appFee={appFee}
            estimatedDurationInSeconds={
              quote?.swapType === 'cross-chain' ? quote.estimatedDurationInSeconds : undefined
            }
            crossChainFee={crossChainFee}
            networkFee={networkFee}
            // Virtual Dolares uses a USDm placeholder token so the fee estimate
            // renders in local currency; the actual fee currency is chosen per
            // step at execution time (typically COPm via CIP-64 when it's the
            // cheapest available fee currency). Hide the "Pagada en" row to
            // avoid promising a specific token that the picker may not honor.
            hideFeePaidInRow={isVirtualDolares}
          />
          {showCrossChainFeeWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.crossChainFeeWarning.title', {
                tokenSymbol: crossChainFeeCurrency?.symbol,
              })}
              description={t('swapScreen.crossChainFeeWarning.body', {
                networkName:
                  NETWORK_NAMES[crossChainFeeCurrency?.networkId || networkConfig.defaultNetworkId],
                tokenSymbol: crossChainFeeCurrency?.symbol,
                tokenAmount: crossChainFee?.nativeTokenBalanceDeficit.abs().toFormat(),
              })}
              style={styles.warning}
            />
          )}
          {showDecreaseSpendForGasWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.decreaseSwapAmountForGasWarning.title', {
                feeTokenSymbol: feeToken?.symbol,
              })}
              description={t('swapScreen.decreaseSwapAmountForGasWarning.body', {
                feeTokenSymbol: feeToken?.symbol,
              })}
              onPressCta={() => {
                if (
                  !quote ||
                  quote.preparedTransactions.type !== 'need-decrease-spend-amount-for-gas'
                )
                  return
                handleChangeAmount(quote.preparedTransactions.decreasedSpendAmount.toString())
              }}
              ctaLabel={t('swapScreen.decreaseSwapAmountForGasWarning.cta')}
              style={styles.warning}
            />
          )}
          {showNotEnoughBalanceForGasWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.notEnoughBalanceForGas.title')}
              description={t('swapScreen.notEnoughBalanceForGas.description', {
                feeCurrencies,
              })}
              style={styles.warning}
              onPressCta={onPressLearnMoreFees}
            />
          )}
          {showInsufficientBalanceWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.insufficientBalanceWarning.title', {
                tokenSymbol: fromToken?.symbol,
              })}
              description={t('swapScreen.insufficientBalanceWarning.body', {
                tokenSymbol: fromToken?.symbol,
              })}
              style={styles.warning}
            />
          )}
          {showUnsupportedTokensWarning && (
            <InLineNotification
              variant={NotificationVariant.Info}
              title={t('swapScreen.unsupportedTokensWarning.title')}
              description={t('swapScreen.unsupportedTokensWarning.body')}
              style={styles.warning}
            />
          )}
          {showSwitchedToNetworkWarning && (
            <InLineNotification
              variant={NotificationVariant.Info}
              title={t('swapScreen.switchedToNetworkWarning.title', {
                networkName: switchedToNetworkName,
              })}
              description={t('swapScreen.switchedToNetworkWarning.body', {
                networkName: switchedToNetworkName,
                context: selectingField === Field.FROM ? 'swapTo' : 'swapFrom',
              })}
              style={styles.warning}
              testID="SwitchedToNetworkWarning"
            />
          )}
          {showMaxSwapAmountWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.maxSwapAmountWarning.titleV1_74', {
                tokenSymbol: fromToken?.symbol,
              })}
              description={t('swapScreen.maxSwapAmountWarning.bodyV1_74', {
                tokenSymbol: fromToken?.symbol,
              })}
              ctaLabel={t('swapScreen.maxSwapAmountWarning.learnMore')}
              style={styles.warning}
              onPressCta={onPressLearnMoreFees}
              testID="MaxSwapAmountWarning"
            />
          )}
          {showPriceImpactWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.priceImpactWarning.title')}
              description={t('swapScreen.priceImpactWarning.body')}
              style={styles.warning}
            />
          )}
          {showNoUsdPriceWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.noUsdPriceWarning.title', { localCurrency })}
              description={t('swapScreen.noUsdPriceWarning.description', {
                localCurrency,
                tokenSymbol: toToken?.symbol,
              })}
              style={styles.warning}
            />
          )}
          {showMissingPriceImpactWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.missingSwapImpactWarning.title')}
              description={t('swapScreen.missingSwapImpactWarning.body')}
              style={styles.warning}
            />
          )}
          {showBelowMinSwapWarning && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.belowMinSwapWarning.title')}
              description={t('swapScreen.belowMinSwapWarning.body', {
                minSwapUsd: MIN_SWAP_USD.toFixed(2),
              })}
              style={styles.warning}
            />
          )}
          {isTransientUpstreamError && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.upstreamUnavailableWarning.title')}
              description={t('swapScreen.upstreamUnavailableWarning.body')}
              style={styles.warning}
            />
          )}
          {confirmSwapFailed && (
            <InLineNotification
              variant={NotificationVariant.Warning}
              title={t('swapScreen.confirmSwapFailedWarning.title')}
              description={t('swapScreen.confirmSwapFailedWarning.body')}
              style={styles.warning}
            />
          )}
          {isVirtualDolares && multiSwapPlan && multiSwapPlan.shortfall.gt(0) && (
            <View testID="ShortfallBanner" style={styles.shortfallBanner}>
              <Text style={typeScale.labelSemiBoldMedium}>{t('dollarsSpend.shortfall.title')}</Text>
              <Text style={typeScale.bodySmall}>
                {t('dollarsSpend.shortfall.body', {
                  availableUsd: `$${dollarSnapshots
                    .reduce(
                      (sum, s) => sum.plus(s.balance.multipliedBy(s.priceUsd)),
                      new BigNumber(0)
                    )
                    .toFormat(2)}`,
                })}
              </Text>
            </View>
          )}
          {/* The virtual-FROM spend breakdown moved into the consolidated
              SwapTransactionDetails panel above (via the spendSteps prop)
              so both swap directions surface their details in the same
              shape. GoldBuyConfirmation still uses DolaresMultiStepSummary
              directly because that flow has its own card layout. */}
        </View>
        <Text style={styles.disclaimerText}>
          <Trans
            i18nKey="swapScreen.disclaimer"
            context={showUKCompliantVariant ? 'UK' : undefined}
          >
            <Text style={styles.disclaimerLink} onPress={onPressLearnMore}></Text>
          </Trans>
        </Text>
        <Button
          testID="ConfirmSwapButton"
          onPress={handleConfirmSwap}
          text={t('swapScreen.confirmSwap', { context: showUKCompliantVariant ? 'UK' : undefined })}
          size={BtnSizes.FULL}
          disabled={!allowSwap}
          showLoading={confirmSwapIsLoading}
        />
      </ScrollView>
      <EnterAmountOptions
        onPressAmount={handleSelectAmountPercentage}
        selectedAmount={selectedPercentage}
        flow="swap"
        testID="SwapEnterAmount/AmountOptions"
      />
      {tokenBottomSheetsConfig.map(({ fieldType, tokens, filterChips, origin }) => (
        <TokenBottomSheet
          key={`TokenBottomSheet/${fieldType}`}
          forwardedRef={tokenBottomSheetRefs[fieldType]}
          tokens={tokens}
          title={t('swapScreen.tokenBottomSheetTitle')}
          filterChips={filterChips}
          origin={origin}
          snapPoints={['90%']}
          onTokenSelected={handleSelectToken}
          searchEnabled={true}
          showPriceUsdUnavailableWarning={true}
          areSwapTokensShuffled={areSwapTokensShuffled}
        />
      ))}
      <BottomSheet
        forwardedRef={exchangeRateInfoBottomSheetRef}
        title={t('swapScreen.transactionDetails.exchangeRate')}
        description={t('swapScreen.transactionDetails.exchangeRateInfoV1_90', {
          context: appFee?.percentage?.isGreaterThan(0) ? 'withAppFee' : '',
          networkName: NETWORK_NAMES[fromToken?.networkId || networkConfig.defaultNetworkId],
          slippagePercentage: parsedSlippagePercentage,
          appFeePercentage: appFee?.percentage?.toFormat(),
        })}
        testId="ExchangeRateInfoBottomSheet"
      >
        <Button
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
          style={styles.bottomSheetButton}
          onPress={() => {
            exchangeRateInfoBottomSheetRef.current?.close()
          }}
          text={t('swapScreen.transactionDetails.infoDismissButton')}
        />
      </BottomSheet>
      <BottomSheet
        forwardedRef={estimatedDurationBottomSheetRef}
        title={t('swapScreen.transactionDetails.estimatedTransactionTime')}
        description={t('swapScreen.transactionDetails.estimatedTransactionTimeInfo')}
        testId="EstimatedDurationBottomSheet"
      >
        <Button
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
          style={styles.bottomSheetButton}
          onPress={() => {
            estimatedDurationBottomSheetRef.current?.close()
          }}
          text={t('swapScreen.transactionDetails.infoDismissButton')}
        />
      </BottomSheet>
      <BottomSheet
        forwardedRef={slippageInfoBottomSheetRef}
        title={t('swapScreen.transactionDetails.slippagePercentage')}
        description={t('swapScreen.transactionDetails.slippageToleranceInfoV1_90')}
        testId="SlippageInfoBottomSheet"
      >
        <Button
          type={BtnTypes.SECONDARY}
          size={BtnSizes.FULL}
          style={styles.bottomSheetButton}
          onPress={() => {
            slippageInfoBottomSheetRef.current?.close()
          }}
          text={t('swapScreen.transactionDetails.infoDismissButton')}
        />
      </BottomSheet>
      <FeeInfoBottomSheet
        forwardedRef={feeInfoBottomSheetRef}
        crossChainFee={crossChainFee}
        networkFee={networkFee}
        appFee={appFee}
        fetchingSwapQuote={fetchingSwapQuote}
      />
      <Toast
        withBackdrop
        showToast={!!selectingNoUsdPriceToken}
        variant={NotificationVariant.Warning}
        title={t('swapScreen.noUsdPriceWarning.title', { localCurrency })}
        description={t('swapScreen.noUsdPriceWarning.description', {
          localCurrency,
          tokenSymbol: selectingNoUsdPriceToken?.symbol,
        })}
        ctaLabel2={t('swapScreen.noUsdPriceWarning.ctaConfirm')}
        onPressCta2={handleConfirmSelectTokenNoUsdPrice}
        ctaLabel={t('swapScreen.noUsdPriceWarning.ctaDismiss')}
        onPressCta={handleDismissSelectTokenNoUsdPrice}
        onDismiss={handleDismissSelectTokenNoUsdPrice}
      />
      <TransactionFlowShell
        onRetry={() => {
          if (!toTokenId) return
          const remaining = planSpend({ requestedUsd: fromAmountUsd, balances: dollarSnapshots })
          if (remaining.shortfall.gt(0)) return
          dispatch(executeMultiSwap({ steps: remaining.steps, toTokenId }))
        }}
        onCancel={() => dispatch(multiSwapCleared())}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeAreaContainer: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.Regular16,
    flexGrow: 1,
  },
  swapAmountsContainer: {
    paddingBottom: Spacing.Thick24,
    flex: 1,
  },
  fromSwapAmountInput: {
    marginBottom: Spacing.Smallest8,
  },
  toSwapAmountInput: {
    marginBottom: Spacing.Small12,
  },
  disclaimerText: {
    ...typeScale.labelXXSmall,
    paddingBottom: Spacing.Smallest8,
    flexWrap: 'wrap',
    color: colors.gray3,
    textAlign: 'center',
  },
  disclaimerLink: {
    ...typeScale.labelXXSmall,
    color: colors.primary,
  },
  warning: {
    marginTop: Spacing.Thick24,
  },
  shortfallBanner: {
    marginTop: Spacing.Thick24,
    padding: Spacing.Regular16,
    backgroundColor: colors.warningLight,
    borderRadius: Spacing.Smallest8,
    gap: Spacing.Tiny4,
  },
  bottomSheetButton: {
    marginTop: Spacing.Thick24,
  },
  switchTokens: {
    position: 'absolute',
    top: -20,
    left: -Spacing.Regular16,
    zIndex: 1,
  },
  switchTokensContainer: {
    zIndex: 1,
    alignItems: 'center',
  },
  crossChainNotificationWrapper: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.Thick24,
  },
  crossChainNotification: {
    ...typeScale.labelXSmall,
    paddingLeft: Spacing.Tiny4,
    color: colors.gray4,
  },
})

export default SwapScreen
