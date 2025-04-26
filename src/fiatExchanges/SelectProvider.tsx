import { RouteProp } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import _ from 'lodash'
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useAsync } from 'react-async-hook'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { showError } from 'src/alert/actions'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { coinbasePayEnabledSelector } from 'src/app/selectors'
import BackButton from 'src/components/BackButton'
import Dialog from 'src/components/Dialog'
import ListItem from 'src/components/ListItem'
import Touchable from 'src/components/Touchable'
import { FETCH_FIATCONNECT_QUOTES } from 'src/config'
import { CoinbasePaymentSection } from 'src/fiatExchanges/CoinbasePaymentSection'
import { ExternalExchangeProvider } from 'src/fiatExchanges/ExternalExchanges'
import {
  PaymentMethodSection,
  PaymentMethodSectionMethods,
} from 'src/fiatExchanges/PaymentMethodSection'
import { CryptoAmount, FiatAmount } from 'src/fiatExchanges/amount'
import { normalizeQuotes } from 'src/fiatExchanges/quotes/normalizeQuotes'
import {
  ProviderSelectionAnalyticsData,
  SelectProviderExchangesLink,
  SelectProviderExchangesText,
} from 'src/fiatExchanges/types'
import {
  fiatConnectQuotesErrorSelector,
  fiatConnectQuotesLoadingSelector,
  fiatConnectQuotesSelector,
  selectFiatConnectQuoteLoadingSelector,
} from 'src/fiatconnect/selectors'
import { fetchFiatConnectQuotes } from 'src/fiatconnect/slice'
import { readOnceFromFirebase } from 'src/firebase/firebase'
import InfoIcon from 'src/icons/InfoIcon'
import {
  getDefaultLocalCurrencyCode,
  getLocalCurrencyCode,
  usdToLocalCurrencyRateSelector,
} from 'src/localCurrency/selectors'
import { customEmptyHeader } from 'src/navigator/Headers'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { StackParamList } from 'src/navigator/types'
import { userLocationDataSelector } from 'src/networkInfo/selectors'
import { useDispatch, useSelector } from 'src/redux/hooks'
import { getDynamicConfigParams, getFeatureGate } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs, StatsigFeatureGates } from 'src/statsig/types'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'
import variables from 'src/styles/variables'
import { useTokenInfo } from 'src/tokens/hooks'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { navigateToURI } from 'src/utils/linking'
import networkConfig, { CCOP_TOKEN_ID_MAINNET, USDT_TOKEN_ID_MAINNET } from 'src/web3/networkConfig'
import { currentAccountSelector } from 'src/web3/selectors'
import { uuidV4 } from 'web3-utils'
import {
  CICOFlow,
  // FiatExchangeFlow,
  LegacyMobileMoneyProvider,
  PaymentMethod,
  fetchExchanges,
  fetchLegacyMobileMoneyProviders,
  fetchProviders,
  filterLegacyMobileMoneyProviders,
  filterProvidersByPaymentMethod,
  getProviderSelectionAnalyticsData,
} from './utils'

const TransakIcono = require('./transak.png')

const TAG = 'SelectProviderScreen'

type Props = NativeStackScreenProps<StackParamList, Screens.SelectProvider>

const paymentMethodSections: PaymentMethodSectionMethods[] = [
  PaymentMethod.Card,
  PaymentMethod.Bank,
  PaymentMethod.FiatConnectMobileMoney,
  PaymentMethod.Airtime,
]

export default function SelectProviderScreen({ route, navigation }: Props) {
  const dispatch = useDispatch()
  const {
    flow,
    tokenId,
    amount: { crypto: cryptoAmount, fiat: fiatAmount },
  } = route.params
  const userLocation = useSelector(userLocationDataSelector)
  const account = useSelector(currentAccountSelector)
  const localCurrency = useSelector(getLocalCurrencyCode)
  const defaultCurrency = useSelector(getDefaultLocalCurrencyCode)
  const fiatConnectQuotes = useSelector(fiatConnectQuotesSelector)
  const fiatConnectQuotesLoading = useSelector(fiatConnectQuotesLoadingSelector)
  const fiatConnectQuotesError = useSelector(fiatConnectQuotesErrorSelector)
  const selectFiatConnectQuoteLoading = useSelector(selectFiatConnectQuoteLoadingSelector)
  const usdToLocalRate = useSelector(usdToLocalCurrencyRateSelector)
  const tokenInfo = useTokenInfo(tokenId)

  const { links } = getDynamicConfigParams(DynamicConfigs[StatsigDynamicConfigs.APP_CONFIG])
  const showUKCompliantVariant = getFeatureGate(StatsigFeatureGates.SHOW_UK_COMPLIANT_VARIANT)

  if (!tokenInfo) {
    throw new Error(`Token info not found for token ID ${tokenId}`)
  }

  const { t } = useTranslation()
  const coinbasePayEnabled = useSelector(coinbasePayEnabledSelector)
  const appIdResponse = useAsync(async () => readOnceFromFirebase('coinbasePay/appId'), [])
  const appId = appIdResponse.result
  const insets = useSafeAreaInsets()

  const [isUSDT, setIsUSDT] = useState(false)
  const [isCCOP, setCCOP] = useState(false)
  const [transakLoading, setTransakLoading] = useState(false)

  useEffect(() => {
    if (FETCH_FIATCONNECT_QUOTES) {
      dispatch(
        fetchFiatConnectQuotes({
          flow,
          digitalAsset: tokenInfo.symbol,
          cryptoAmount,
          fiatAmount,
        })
      )
    }

    if (tokenInfo.tokenId === USDT_TOKEN_ID_MAINNET) {
      setIsUSDT(true)
    }

    if (tokenInfo.tokenId === CCOP_TOKEN_ID_MAINNET) {
      setCCOP(true)
    }

    Logger.debug(TAG, 'token info', tokenInfo)
  }, [flow, tokenInfo.symbol, cryptoAmount])

  useEffect(() => {
    if (fiatConnectQuotesError) {
      dispatch(showError(ErrorMessages.PROVIDER_FETCH_FAILED))
    }
  }, [fiatConnectQuotesError])

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle:
        route.params.flow === CICOFlow.CashIn
          ? t(`fiatExchangeFlow.cashIn.selectProviderHeader`, {
              context: showUKCompliantVariant ? 'UK' : undefined,
            })
          : t(`fiatExchangeFlow.cashOut.selectProviderHeader`),
    })
  }, [route.params.flow])

  const asyncExchanges = useAsync(async () => {
    try {
      const availableExchanges = await fetchExchanges(
        userLocation.countryCodeAlpha2,
        tokenInfo.tokenId
      )

      return availableExchanges
    } catch (error) {
      Logger.error(TAG, 'error fetching exchanges, displaying an empty array')
      return []
    }
  }, [])

  const asyncProviders = useAsync(async () => {
    if (!account) {
      Logger.error(TAG, 'No account set')
      return
    }
    try {
      const [externalProviders, rawLegacyMobileMoneyProviders] = await Promise.all([
        fetchProviders({
          userLocation,
          walletAddress: account,
          fiatCurrency: localCurrency,
          digitalAsset: tokenInfo.symbol.toUpperCase(),
          fiatAmount,
          digitalAssetAmount: cryptoAmount,
          txType: flow === CICOFlow.CashIn ? 'buy' : 'sell',
          networkId: tokenInfo.networkId,
        }),
        fetchLegacyMobileMoneyProviders(),
      ])

      const legacyMobileMoneyProviders = filterLegacyMobileMoneyProviders(
        rawLegacyMobileMoneyProviders,
        flow,
        userLocation.countryCodeAlpha2,
        tokenInfo.tokenId
      )
      return { externalProviders, legacyMobileMoneyProviders }
    } catch (error) {
      dispatch(showError(ErrorMessages.PROVIDER_FETCH_FAILED))
    }
  }, [])

  const quotesLoading =
    asyncProviders.loading ||
    fiatConnectQuotesLoading ||
    asyncExchanges.loading ||
    selectFiatConnectQuoteLoading

  const normalizedQuotes = normalizeQuotes(
    flow,
    fiatConnectQuotes,
    asyncProviders.result?.externalProviders,
    tokenInfo.tokenId,
    tokenInfo.symbol
  )

  const exchanges = asyncExchanges.result ?? []
  const legacyMobileMoneyProviders = asyncProviders.result?.legacyMobileMoneyProviders
  const coinbaseProvider = filterProvidersByPaymentMethod(
    PaymentMethod.Coinbase,
    asyncProviders.result?.externalProviders
  )
  const coinbasePayVisible =
    flow === CICOFlow.CashIn &&
    coinbaseProvider &&
    !coinbaseProvider.restricted &&
    coinbasePayEnabled &&
    appId

  const analyticsData = getProviderSelectionAnalyticsData({
    normalizedQuotes,
    legacyMobileMoneyProviders,
    usdToLocalRate,
    tokenInfo,
    centralizedExchanges: exchanges,
    coinbasePayAvailable: coinbasePayVisible,
    transferCryptoAmount: cryptoAmount,
    cryptoType: tokenInfo.symbol,
  })

  useEffect(() => {
    if (!quotesLoading) {
      AppAnalytics.track(FiatExchangeEvents.cico_providers_fetch_quotes_result, {
        fiatType: localCurrency,
        defaultFiatType: defaultCurrency,
        ..._.omit(analyticsData, 'transferCryptoAmount'),
        ...(flow === CICOFlow.CashIn
          ? { flow, fiatAmount, cryptoAmount: undefined }
          : {
              flow,
              cryptoAmount,
              fiatAmount: undefined,
            }),
      })
    }
  }, [quotesLoading, localCurrency, defaultCurrency, analyticsData, flow, fiatAmount, cryptoAmount])

  if (quotesLoading) {
    return (
      <View style={styles.activityIndicatorContainer}>
        <ActivityIndicator testID="QuotesLoading" size="large" color={colors.accent} />
      </View>
    )
  }

  const availablePaymentMethods = normalizedQuotes.map((quote) => quote.getPaymentMethod())
  const somePaymentMethodsUnavailable = !paymentMethodSections.every((method) =>
    availablePaymentMethods.includes(method)
  )

  const handlePressDisclaimer = () => {
    navigate(Screens.WebViewScreen, { uri: links.funding })
  }

  const handleIntechchainProviderPress = async () => {
    try {
      setTransakLoading(true)

      const body = {
        externalOrderId: uuidV4(),
        externalUserId: account,
        providerCode: 'transak',
        currencyFrom: 'USD',
        currencyTo: 'CELO',
        amountFrom: String(fiatAmount),
        country: 'CO',
        walletAddress: account,
        paymentMethod: 'card',
      }

      // creamos la peticion a la api de intechchain
      const response = await fetch('https://exchange.intechchain.com/api/fiat/createOrder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      navigate(Screens.WebViewScreen, {
        uri: data.results.redirectUrl,
      })
    } catch (error) {
      Logger.error(TAG, 'Error fetching Transak quote', error)
      dispatch(showError(ErrorMessages.PROVIDER_FETCH_FAILED))
    } finally {
      setTransakLoading(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, Spacing.Thick24) }}>
      <AmountSpentInfo {...route.params} />

      <ListItem>
        {isCCOP && (
          <Touchable
            onPress={() => {
              navigate(Screens.WebViewScreen, {
                uri: 'https://app.buckspay.xyz/',
              })
            }}
            style={{ width: '100%' }}
          >
            <View
              style={{
                flexDirection: 'row',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 10,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: colors.lightPrimary,
              }}
            >
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: 'https://app.buckspay.xyz/favicon.ico' }}
                  style={styles.providerImage}
                />
              </View>
              <Text style={styles.newLabelText}>Buckspay</Text>
              <InfoIcon size={16} color={colors.gray5} />
            </View>
          </Touchable>
        )}

        {isUSDT && (
          <Touchable onPress={handleIntechchainProviderPress} style={{ width: '100%' }}>
            <View
              style={{
                flexDirection: 'row',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 10,
                paddingVertical: 10,
                borderRadius: 10,
                marginTop: 10,
                backgroundColor: colors.lightPrimary,
              }}
            >
              <View style={styles.imageContainer}>
                <Image
                  source={TransakIcono}
                  style={{ width: 40, height: 40, ...styles.providerImage }}
                />
              </View>
              <Text style={styles.newLabelText}>Transak</Text>
              {transakLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <InfoIcon size={16} color={colors.gray5} />
              )}
            </View>
          </Touchable>
        )}
      </ListItem>

      {paymentMethodSections.map((paymentMethod) => (
        <PaymentMethodSection
          key={paymentMethod}
          normalizedQuotes={normalizedQuotes}
          paymentMethod={paymentMethod}
          flow={flow}
          tokenId={tokenId}
          analyticsData={analyticsData}
        />
      ))}
      {(tokenInfo.networkId === NetworkId['celo-mainnet'] ||
        tokenInfo.networkId === NetworkId['celo-alfajores']) && (
        <LegacyMobileMoneySection
          providers={legacyMobileMoneyProviders || []}
          tokenId={tokenInfo.tokenId}
          flow={flow}
          analyticsData={analyticsData}
        />
      )}
      {coinbaseProvider && coinbasePayVisible && (
        <CoinbasePaymentSection
          cryptoAmount={cryptoAmount}
          coinbaseProvider={coinbaseProvider}
          appId={appId}
          analyticsData={analyticsData}
          tokenId={tokenInfo.tokenId}
        />
      )}
      <ExchangesSection
        exchanges={exchanges}
        selectedTokenId={tokenId}
        flow={flow}
        analyticsData={analyticsData}
      />

      {showUKCompliantVariant && (
        <View style={styles.disclaimerUKContainer}>
          <Text style={styles.disclaimerText}>{t('selectProviderScreen.disclaimerUK')}</Text>
        </View>
      )}
      {somePaymentMethodsUnavailable ? (
        <LimitedPaymentMethods flow={flow} />
      ) : (
        <View style={styles.disclaimerContainer}>
          <Text style={styles.disclaimerText}>
            <Trans i18nKey="selectProviderScreen.disclaimer">
              <Text style={styles.underline} onPress={handlePressDisclaimer}></Text>
            </Trans>
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

function AmountSpentInfo({ flow, tokenId, amount }: Props['route']['params']) {
  const localCurrency = useSelector(getLocalCurrencyCode)
  return (
    <View style={styles.amountSpentInfo} testID="AmountSpentInfo">
      <Text style={styles.amountSpentInfoText}>
        <Trans
          i18nKey={
            flow === CICOFlow.CashIn
              ? 'selectProviderScreen.cashIn.amountSpentInfo'
              : 'selectProviderScreen.cashOut.amountSpentInfo'
          }
        >
          {flow === CICOFlow.CashIn ? (
            <FiatAmount
              amount={amount.fiat}
              currency={localCurrency}
              testID="AmountSpentInfo/Fiat"
            />
          ) : (
            <CryptoAmount
              amount={amount.crypto}
              tokenId={tokenId}
              testID="AmountSpentInfo/Crypto"
            />
          )}
        </Trans>
      </Text>
    </View>
  )
}

function LimitedPaymentMethods({ flow }: { flow: CICOFlow }) {
  const { t } = useTranslation()
  const [isDialogVisible, setIsDialogVisible] = useState(false)

  const dismissDialog = () => {
    setIsDialogVisible(false)
  }
  const openDialog = () => {
    AppAnalytics.track(FiatExchangeEvents.cico_providers_unavailable_selected, {
      flow,
    })
    setIsDialogVisible(true)
  }

  useEffect(() => {
    AppAnalytics.track(FiatExchangeEvents.cico_providers_unavailable_impression, {
      flow,
    })
  }, [])

  return (
    <>
      <View style={styles.disclaimerContainer}>
        <Text style={styles.disclaimerText}>
          <Trans i18nKey="selectProviderScreen.disclaimerWithSomePaymentsUnavailable">
            <Text style={styles.underline} onPress={openDialog}></Text>
          </Trans>
        </Text>
      </View>
      <Dialog
        title={t('selectProviderScreen.whyMissingPayments')}
        isVisible={isDialogVisible}
        actionText={t('selectProviderScreen.dismiss')}
        actionPress={dismissDialog}
        isActionHighlighted={false}
        onBackgroundPress={dismissDialog}
      >
        <Text style={styles.dialog}>{t('selectProviderScreen.missingPaymentsExplained')}</Text>
      </Dialog>
    </>
  )
}

function ExchangesSection({
  exchanges = [],
  flow,
  selectedTokenId,
  analyticsData,
}: {
  exchanges: ExternalExchangeProvider[]
  flow: CICOFlow
  selectedTokenId: string
  analyticsData: ProviderSelectionAnalyticsData
}) {
  const { t } = useTranslation()

  const { addFundsExchangesText: exchangesText, addFundsExchangesLink: exchangesLink } =
    useMemo(() => {
      if (flow === CICOFlow.CashIn) {
        return {
          addFundsExchangesText: SelectProviderExchangesText.DepositFrom,
          addFundsExchangesLink: SelectProviderExchangesLink.ExchangeQRScreen,
        }
      }
      return {
        addFundsExchangesText: SelectProviderExchangesText.CryptoExchange,
        addFundsExchangesLink: SelectProviderExchangesLink.ExternalExchangesScreen,
      }
    }, [flow])

  if (!exchanges.length) {
    return null
  }

  const goToExchangesScreen = () => {
    AppAnalytics.track(FiatExchangeEvents.cico_providers_exchanges_selected, {
      flow,
      ...analyticsData,
    })
    if (exchangesLink === SelectProviderExchangesLink.ExchangeQRScreen) {
      navigate(Screens.ExchangeQR, { flow, exchanges })
    } else {
      navigate(Screens.ExternalExchanges, {
        tokenId: selectedTokenId,
        exchanges,
      })
    }
  }

  let header: string
  let text: string
  let rightText: string | null = null

  if (exchangesText === SelectProviderExchangesText.DepositFrom) {
    header = t('selectProviderScreen.depositFrom')
    text = t('selectProviderScreen.cryptoExchangeOrWallet')
  } else {
    header = t('selectProviderScreen.cryptoExchange')
    text = t('selectProviderScreen.feesVary')
    rightText = t('selectProviderScreen.viewExchanges')
  }

  return (
    <View testID="Exchanges" style={styles.container}>
      <Touchable onPress={goToExchangesScreen}>
        <View style={{ ...styles.expandableContainer, paddingVertical: 27 }}>
          <View style={styles.left}>
            <Text style={styles.categoryHeader}>{header}</Text>
            <Text style={styles.categoryText}>{text}</Text>
          </View>

          {!!rightText && (
            <View style={styles.right}>
              <Text style={styles.linkToOtherScreen}>{rightText}</Text>
            </View>
          )}
        </View>
      </Touchable>
    </View>
  )
}

function LegacyMobileMoneySection({
  providers,
  tokenId,
  flow,
  analyticsData,
}: {
  providers: LegacyMobileMoneyProvider[]
  tokenId: string
  flow: CICOFlow
  analyticsData: ProviderSelectionAnalyticsData
}) {
  const { t } = useTranslation()

  /**
   *  This component assumes that there is only one legacy mobile money provider at a time. When we add FiatConnect mobile money providers this
   * assumption will no longer be true and the UI will have to be updated to be more dynamic. Consider making PaymentMethodSection more
   * flexible to be able to handle mobile money as well when we start adding FiatConnect support.
   */
  const provider = providers[0]

  useEffect(() => {
    if (provider) {
      AppAnalytics.track(FiatExchangeEvents.cico_providers_section_impression, {
        flow,
        paymentMethod: PaymentMethod.MobileMoney,
        quoteCount: 1,
        providers: [provider.name],
      })
    }
  }, [])

  const goToProviderSite = () => {
    AppAnalytics.track(FiatExchangeEvents.cico_providers_quote_selected, {
      flow,
      paymentMethod: PaymentMethod.MobileMoney,
      provider: provider.name,
      feeCryptoAmount: undefined,
      kycRequired: false,
      isLowestFee: undefined,
      ...analyticsData,
    })
    navigateToURI(provider[tokenId === networkConfig.ccopTokenId ? 'ccop' : 'usdt'].url)
  }

  if (!provider) {
    return null
  }
  return (
    <View testID="LegacyMobileMoneySection" style={styles.container}>
      <Touchable onPress={goToProviderSite}>
        <View style={{ ...styles.expandableContainer, paddingVertical: 27 }}>
          <View style={styles.left}>
            <Text style={styles.categoryText}>{t('selectProviderScreen.feesVary')}</Text>
          </View>

          <View style={styles.right}>
            <Text style={styles.linkToOtherScreen}>{provider.name}</Text>
          </View>
        </View>
      </Touchable>
    </View>
  )
}

const styles = StyleSheet.create({
  activityIndicatorContainer: {
    paddingVertical: variables.contentPadding,
    flex: 1,
    alignContent: 'center',
    justifyContent: 'center',
  },
  container: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray2,
  },
  expandableContainer: {
    paddingHorizontal: Spacing.Regular16,
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'center',
  },
  // noPaymentMethods: {
  //   ...typeScale.bodyMedium,
  //   padding: variables.contentPadding,
  //   textAlign: 'center',
  // },
  // switchCurrency: {
  //   ...typeScale.labelLarge,
  //   color: colors.accent,
  //   padding: Spacing.Smallest8,
  // },
  // noPaymentMethodsContainer: {
  //   alignItems: 'center',
  //   padding: Spacing.Thick24,
  // },
  newLabelText: {
    ...typeScale.labelLarge,
  },
  left: {
    flex: 1,
  },
  right: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  categoryHeader: {
    ...typeScale.bodySmall,
  },
  categoryText: {
    ...typeScale.labelSemiBoldSmall,
    marginTop: 4,
  },
  linkToOtherScreen: {
    ...typeScale.labelSmall,
    color: colors.gray4,
  },
  disclaimerContainer: {
    padding: Spacing.Regular16,
  },
  disclaimerUKContainer: {
    paddingTop: Spacing.Thick24,
    paddingHorizontal: Spacing.Regular16,
  },
  disclaimerText: {
    ...typeScale.bodySmall,
    color: colors.gray4,
  },
  underline: {
    textDecorationLine: 'underline',
  },
  dialog: {
    ...typeScale.bodyMedium,
    textAlign: 'center',
  },
  imageContainer: {
    height: 40,
    width: 40,
  },
  providerImage: {
    flex: 10,
  },
  // contactSupport: {
  //   ...typeScale.labelLarge,
  //   color: colors.gray4,
  //   padding: Spacing.Smallest8,
  // },
  // newLabelContainer: {
  //   backgroundColor: colors.gray3,
  //   borderRadius: 100,
  //   paddingVertical: 4,
  //   paddingHorizontal: 8,
  //   marginTop: 4,
  //   marginLeft: 'auto',
  //   flexDirection: 'row',
  //   width: 'auto',
  // },
  amountSpentInfo: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: colors.gray1,
    borderRadius: 16,
  },
  amountSpentInfoText: {
    textAlign: 'center',
    ...typeScale.labelSemiBoldXSmall,
  },
})
SelectProviderScreen.navigationOptions = ({
  route,
}: {
  route: RouteProp<StackParamList, Screens.SelectProvider>
}) => ({
  ...customEmptyHeader,
  headerLeft: () => (
    <BackButton
      eventName={FiatExchangeEvents.cico_providers_back}
      eventProperties={{ flow: route.params.flow }}
    />
  ),
})
