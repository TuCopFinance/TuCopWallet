import _ from 'lodash'
import { Environment as PersonaEnvironment } from 'react-native-persona'
import {
  APP_REGISTRY_NAME,
  BIDALI_URL,
  DEFAULT_FORNO_URL,
  DEFAULT_TESTNET,
  RECAPTCHA_SITE_KEY,
} from 'src/config'
import { Network, NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { CiCoCurrency, Currency } from 'src/utils/currencies'
import { Address, TypedDataDefinition } from 'viem'
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  celo,
  celoAlfajores,
  mainnet as ethereum,
  sepolia as ethereumSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  Chain as ViemChain,
} from 'viem/chains'

export enum Testnets {
  alfajores = 'alfajores',
  mainnet = 'mainnet',
}

interface NetworkConfig {
  networkId: string
  blockchainApiUrl: string
  cloudFunctionsUrl: string
  hooksApiUrl: string
  sentryTracingUrls: string[]
  allowedMtwImplementations: string[]
  currentMtwImplementationAddress: string
  recaptchaSiteKey: string
  bidaliUrl: string
  providerFetchUrl: string
  getFiatConnectProvidersUrl: string
  getFiatConnectQuotesUrl: string
  simplexApiUrl: string
  fetchUserLocationDataUrl: string
  walletConnectEndpoint: string
  personaEnvironment: PersonaEnvironment
  inHouseLiquidityURL: string
  setRegistrationPropertiesUrl: string
  setRegistrationPropertiesAuth: TypedDataDefinition
  fetchExchangesUrl: string
  nftsAppUrl: string
  getSwapQuoteUrl: string
  walletJumpstartUrl: string
  verifyPhoneNumberUrl: string
  resolvePhoneNumberUrl: string
  verifySmsCodeUrl: string
  lookupPhoneNumberUrl: string
  lookupAddressUrl: string
  checkAddressVerifiedUrl: string
  revokePhoneNumberUrl: string
  migratePhoneVerificationUrl: string
  resolveId: string
  getNftsByOwnerAddressUrl: string
  cabApiKey: string
  cabIssueSmsCodeUrl: string
  cabIssueAppKeyshareUrl: string
  cabStoreEncryptedMnemonicUrl: string
  cabGetEncryptedMnemonicUrl: string
  cabDeleteEncryptedMnemonicUrl: string
  cabLoginUrl: string
  cabClockUrl: string
  networkToNetworkId: Record<Network, NetworkId>
  defaultNetworkId: NetworkId
  getTokensInfoUrl: string
  getPointsHistoryUrl: string
  trackPointsEventUrl: string
  getPointsBalanceUrl: string
  simulateTransactionsUrl: string
  viemChain: {
    [key in Network]: ViemChain
  }
  currencyToTokenId: {
    [key in CiCoCurrency | Currency]: string
  }
  celoTokenAddress: Address
  celoGasPriceMinimumAddress: Address
  alchemyRpcUrl: Record<Exclude<Network, Network.Celo>, string>
  usdtTokenId: string
  ccopTokenId: string
  ceurTokenId: string
  crealTokenId: string
  celoTokenId: string
  spendTokenIds: string[]
  saveContactsUrl: string
  getPointsConfigUrl: string
  internalRpcUrl: Record<Network.Arbitrum, string>
  authHeaderIssuer: string
  web3AuthVerifier: string
  crossChainExplorerUrl: string
  getWalletTransactionsUrl: string
  getWalletBalancesUrl: string
  getExchangeRateUrl: string
}

const ALCHEMY_ETHEREUM_RPC_URL_STAGING = 'https://eth-sepolia.g.alchemy.com/v2/'
const ALCHEMY_ETHEREUM_RPC_URL_MAINNET = 'https://eth-mainnet.g.alchemy.com/v2/'

const ALCHEMY_ARBITRUM_RPC_URL_STAGING = 'https://arb-sepolia.g.alchemy.com/v2/'
const ALCHEMY_ARBITRUM_RPC_URL_MAINNET = 'https://arb-mainnet.g.alchemy.com/v2/'

const ALCHEMY_OPTIMISM_RPC_URL_STAGING = 'https://opt-sepolia.g.alchemy.com/v2/'
const ALCHEMY_OPTIMISM_RPC_URL_MAINNET = 'https://opt-mainnet.g.alchemy.com/v2/'

const ALCHEMY_POLYGON_POS_RPC_URL_STAGING = 'https://polygon-amoy.g.alchemy.com/v2/'
const ALCHEMY_POLYGON_POS_RPC_URL_MAINNET = 'https://polygon-mainnet.g.alchemy.com/v2/'

const ALCHEMY_BASE_RPC_URL_STAGING = 'https://base-sepolia.g.alchemy.com/v2/'
const ALCHEMY_BASE_RPC_URL_MAINNET = 'https://base-mainnet.g.alchemy.com/v2/'

export type BlockExplorerUrls = {
  [key in NetworkId]: {
    baseTxUrl: string
    baseAddressUrl: string
    baseTokenUrl: string
    baseNftUrl: string
  }
}

export type NetworkIdToNetwork = {
  [key in NetworkId]: Network
}

const CELO_TOKEN_ADDRESS_STAGING = '0x471EcE3750Da237f93B8E339c536989b8978a438'
const CELO_TOKEN_ADDRESS_MAINNET = '0x471ece3750da237f93b8e339c536989b8978a438'

// From https://docs.celo.org/contract-addresses
const CELO_GAS_PRICE_MINIMUM_ADDRESS_STAGING = '0xd0bf87a5936ee17014a057143a494dc5c5d51e5e'
const CELO_GAS_PRICE_MINIMUM_ADDRESS_MAINNET = '0xdfca3a8d7699d8bafe656823ad60c17cb8270ecc'

const CELO_TOKEN_ID_STAGING = `${NetworkId['celo-alfajores']}:native`
const CELO_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:native`

const CUSD_TOKEN_ID_STAGING = `${NetworkId['celo-alfajores']}:0x874069fa1eb16d44d622f2e0ca25eea172369bc1`
const CUSD_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0x765de816845861e75a25fca122bb6898b8b1282a`

const CEUR_TOKEN_ID_STAGING = `${NetworkId['celo-alfajores']}:0x10c892a6ec43a53e45d0b916b4b7d383b1b78c0f`
const CEUR_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73`

const CREAL_TOKEN_ID_STAGING = `${NetworkId['celo-alfajores']}:0xe4d517785d091d3c54818832db6094bcc2744545`
const CREAL_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0xe8537a3d056da446677b9e9d6c5db704eaab4787`

const ETH_TOKEN_ID_STAGING = `${NetworkId['ethereum-sepolia']}:native`
const ETH_TOKEN_ID_MAINNET = `${NetworkId['ethereum-mainnet']}:native`

const CCOP_TOKEN_ID_STAGING = `${NetworkId['celo-alfajores']}:0xF0B11c888CbC5F72BD25A935E9762397ed41eF67`
const CCOP_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0x8a567e2ae79ca692bd748ab832081c45de4041ea`

const USDT_TOKEN_ID_STAGING = `${NetworkId['celo-alfajores']}:0xD29b6645bB2150789e7dC53e933f2478aCcb742C`
export const USDT_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e`

const CLOUD_FUNCTIONS_STAGING = 'https://api.alfajores.valora.xyz'
const CLOUD_FUNCTIONS_MAINNET = 'https://api.mainnet.valora.xyz'

const BLOCKCHAIN_API_STAGING = 'https://blockchain-api-dot-celo-mobile-alfajores.appspot.com'
const BLOCKCHAIN_API_MAINNET = 'https://blockchain-api-dot-celo-mobile-mainnet.appspot.com'

const ALLOWED_MTW_IMPLEMENTATIONS_MAINNET: Address[] = [
  '0x6511FB5DBfe95859d8759AdAd5503D656E2555d7',
]
const ALLOWED_MTW_IMPLEMENTATIONS_STAGING: Address[] = [
  '0x5C9a6E3c3E862eD306E2E3348EBC8b8310A99e5A',
  '0x88a2b9B8387A1823D821E406b4e951337fa1D46D',
]

const CURRENT_MTW_IMPLEMENTATION_ADDRESS_MAINNET: Address =
  '0x6511FB5DBfe95859d8759AdAd5503D656E2555d7'
const CURRENT_MTW_IMPLEMENTATION_ADDRESS_STAGING: Address =
  '0x5C9a6E3c3E862eD306E2E3348EBC8b8310A99e5A'

const GET_TOKENS_INFO_URL_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getTokensInfoWithPrices`
const GET_TOKENS_INFO_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getTokensInfoWithPrices`

const FETCH_EXCHANGES_URL_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getExchanges`
const FETCH_EXCHANGES_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getExchanges`

const PROVIDER_FETCH_URL_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/fetchProviders`
const PROVIDER_FETCH_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/fetchProviders`

const GET_FIAT_CONNECT_PROVIDERS_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getFiatConnectProviders`
const GET_FIAT_CONNECT_PROVIDERS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getFiatConnectProviders`

const GET_FIAT_CONNECT_QUOTES_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getQuotes`
const GET_FIAT_CONNECT_QUOTES_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getQuotes`

const SIMPLEX_API_URL_STAGING = `${CLOUD_FUNCTIONS_STAGING}/processSimplexRequest`
const SIMPLEX_API_URL_PROD = `${CLOUD_FUNCTIONS_MAINNET}/processSimplexRequest`

const FETCH_USER_LOCATION_DATA_STAGING = `${CLOUD_FUNCTIONS_STAGING}/fetchUserLocationData`
const FETCH_USER_LOCATION_DATA_PROD = `${CLOUD_FUNCTIONS_MAINNET}/fetchUserLocationData`

const SET_REGISTRATION_PROPERTIES_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/setRegistrationProperties`
const SET_REGISTRATION_PROPERTIES_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/setRegistrationProperties`

const VERIFY_PHONE_NUMBER_ALFAJORES = `https://api-wallet-tlf-production.up.railway.app/api/wallets/request-otp`
const VERIFY_PHONE_NUMBER_MAINNET = `https://api-wallet-tlf-production.up.railway.app/api/wallets/request-otp`

const VERIFY_SMS_CODE_ALFAJORES = `https://api-wallet-tlf-production.up.railway.app/api/wallets/verify-otp`
const VERIFY_SMS_CODE_MAINNET = `https://api-wallet-tlf-production.up.railway.app/api/wallets/verify-otp`

const RESOLVE_PHONE_NUMBER_ALFAJORES = `https://api-wallet-tlf-production.up.railway.app/api/wallets/by-phone`
const RESOLVE_PHONE_NUMBER_MAINNET = `https://api-wallet-tlf-production.up.railway.app/api/wallets/by-phone`

const LOOKUP_PHONE_NUMBER_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/lookupPhoneNumber`
const LOOKUP_PHONE_NUMBER_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/lookupPhoneNumber`

const LOOKUP_ADDRESS_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/lookupAddress`
const LOOKUP_ADDRESS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/lookupAddress`

const REVOKE_PHONE_NUMBER_ALFAJORES = `https://api-wallet-tlf-production.up.railway.app/api/wallets/by-phone`
const REVOKE_PHONE_NUMBER_MAINNET = `https://api-wallet-tlf-production.up.railway.app/api/wallets/unlink`

const MIGRATE_PHONE_VERIFICATION_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/migrateASv1Verification`
const MIGRATE_PHONE_VERIFICATION_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/migrateASv1Verification`

const CHECK_ADDRESS_VERIFIED_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/checkAddressVerified`
const CHECK_ADDRESS_VERIFIED_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/checkAddressVerified`

const RESOLVE_ID_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/resolveId`
const RESOLVE_ID_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/resolveId`

const NFTS_APP_URL = 'https://nfts.valoraapp.com/'

const GET_SWAP_QUOTE_URL = `${CLOUD_FUNCTIONS_MAINNET}/getSwapQuote`

const HOOKS_API_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/hooks-api`
const HOOKS_API_URL_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/hooks-api`

const JUMPSTART_CLAIM_URL_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/walletJumpstart`
const JUMPSTART_CLAIM_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/walletJumpstart`

const GET_NFTS_BY_OWNER_ADDRESS_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getNfts`
const GET_NFTS_BY_OWNER_ADDRESS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getNfts`

const CAB_API_KEY_MAINNET =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiY2xpZW50SWQiOiJkZWZhdWx0LWNsaWVudC1hcHAiLCJhcHBWZXJzaW9uIjoiMS4wLjAiLCJpYXQiOjE3NDUwODM0NjB9.oGiu-AmR08zj52leaGw6oJt6qUkPEYVl0tgLav8UeLs'
const CAB_API_KEY_ALFAJORES =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiY2xpZW50SWQiOiJkZWZhdWx0LWNsaWVudC1hcHAiLCJhcHBWZXJzaW9uIjoiMS4wLjAiLCJpYXQiOjE3NDUwODM0NjB9.oGiu-AmR08zj52leaGw6oJt6qUkPEYVl0tgLav8UeLs'

const CAB_ISSUE_SMS_CODE_ALFAJORES = `https://twilio-service.up.railway.app/otp/send`
const CAB_ISSUE_SMS_CODE_MAINNET = `https://twilio-service.up.railway.app/otp/send`
const CAB_STORE_ENCRYPTED_MNEMONIC_ALFAJORES = `https://twilio-service.up.railway.app/keyless-backup`
const CAB_STORE_ENCRYPTED_MNEMONIC_MAINNET = `https://twilio-service.up.railway.app/keyless-backup`

const CAB_ISSUE_APP_KEYSHARE_ALFAJORES = `https://twilio-service.up.railway.app/otp/verify`
const CAB_ISSUE_APP_KEYSHARE_MAINNET = `https://twilio-service.up.railway.app/otp/verify`

const CAB_LOGIN_ALFAJORES = `https://twilio-service.up.railway.app/siwe/login`
const CAB_LOGIN_MAINNET = `https://twilio-service.up.railway.app/siwe/login`

const CAB_CLOCK_ALFAJORES = `https://twilio-service.up.railway.app/siwe/clock`
const CAB_CLOCK_MAINNET = `https://twilio-service.up.railway.app/siwe/clock`

const CAB_GET_ENCRYPTED_MNEMONIC_ALFAJORES = `https://twilio-service.up.railway.app/keyless-backup`
const CAB_GET_ENCRYPTED_MNEMONIC_MAINNET = `https://twilio-service.up.railway.app/keyless-backup`

const CAB_DELETE_ENCRYPTED_MNEMONIC_ALFAJORES = `https://twilio-service.up.railway.app/keyless-backup/delete`
const CAB_DELETE_ENCRYPTED_MNEMONIC_MAINNET = `https://twilio-service.up.railway.app/keyless-backup/delete`

const SAVE_CONTACTS_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/saveContacts`
const SAVE_CONTACTS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/saveContacts`

const GET_POINTS_HISTORY_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getPointsHistory`
const GET_POINTS_HISTORY_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getPointsHistory`

const GET_POINTS_CONFIG_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getPointsConfig`
const GET_POINTS_CONFIG_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getPointsConfig`
const TRACK_POINTS_EVENT_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/trackPointsEvent`
const TRACK_POINTS_EVENT_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/trackPointsEvent`
const GET_POINTS_BALANCE_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getPointsBalance`
const GET_POINTS_BALANCE_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getPointsBalance`

const SIMULATE_TRANSACTIONS_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/simulateTransactions`
const SIMULATE_TRANSACTIONS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/simulateTransactions`

const INTERNAL_ARBITRUM_RPC_URL_STAGING = `${CLOUD_FUNCTIONS_STAGING}/rpc/${NetworkId['arbitrum-sepolia']}`
const INTERNAL_ARBITRUM_RPC_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/rpc/${NetworkId['arbitrum-one']}`

const GET_WALLET_TRANSACTIONS_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getWalletTransactions`
const GET_WALLET_TRANSACTIONS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getWalletTransactions`

const GET_WALLET_BALANCES_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getWalletBalances`
const GET_WALLET_BALANCES_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getWalletBalances`

const GET_EXCHANGE_RATE_ALFAJORES = `${CLOUD_FUNCTIONS_STAGING}/getExchangeRate`
const GET_EXCHANGE_RATE_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getExchangeRate`

const WEB3_AUTH_VERIFIER = 'valora-cab-auth0'

const BASE_SET_REGISTRATION_PROPERTIES_AUTH = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
    ],
    Message: [{ name: 'content', type: 'string' }],
  },
  domain: {
    name: APP_REGISTRY_NAME,
    version: '1',
  },
  message: {
    content: `${APP_REGISTRY_NAME.toLowerCase()} auth message`,
  },
  primaryType: 'Message',
} as const
const SET_REGISTRATION_PROPERTIES_AUTH_MAINNET = {
  ...BASE_SET_REGISTRATION_PROPERTIES_AUTH,
  domain: {
    ...BASE_SET_REGISTRATION_PROPERTIES_AUTH.domain,
    chainId: 42220,
  },
} as const
const SET_REGISTRATION_PROPERTIES_AUTH_ALFAJORES = {
  ...BASE_SET_REGISTRATION_PROPERTIES_AUTH,
  domain: {
    ...BASE_SET_REGISTRATION_PROPERTIES_AUTH.domain,
    chainId: 44787,
  },
} as const

const CROSS_CHAIN_EXPLORER_URL = 'https://axelarscan.io/gmp/'

const networkConfigs: { [testnet: string]: NetworkConfig } = {
  [Testnets.alfajores]: {
    networkId: '44787',
    networkToNetworkId: {
      [Network.Celo]: NetworkId['celo-alfajores'],
      [Network.Ethereum]: NetworkId['ethereum-sepolia'],
      [Network.Arbitrum]: NetworkId['arbitrum-sepolia'],
      [Network.Optimism]: NetworkId['op-sepolia'],
      [Network.PolygonPoS]: NetworkId['polygon-pos-amoy'],
      [Network.Base]: NetworkId['base-sepolia'],
    },
    defaultNetworkId: NetworkId['celo-alfajores'],
    // blockchainApiUrl: 'http://127.0.0.1:8080',
    blockchainApiUrl: BLOCKCHAIN_API_STAGING,
    cloudFunctionsUrl: CLOUD_FUNCTIONS_STAGING,
    hooksApiUrl: HOOKS_API_URL_ALFAJORES,
    sentryTracingUrls: [
      DEFAULT_FORNO_URL,
      BLOCKCHAIN_API_STAGING,
      CLOUD_FUNCTIONS_STAGING,
      'https://liquidity-dot-celo-mobile-alfajores.appspot.com',
    ],
    allowedMtwImplementations: ALLOWED_MTW_IMPLEMENTATIONS_STAGING,
    currentMtwImplementationAddress: CURRENT_MTW_IMPLEMENTATION_ADDRESS_STAGING,
    recaptchaSiteKey: RECAPTCHA_SITE_KEY,
    bidaliUrl: BIDALI_URL,
    providerFetchUrl: PROVIDER_FETCH_URL_ALFAJORES,
    getFiatConnectProvidersUrl: GET_FIAT_CONNECT_PROVIDERS_ALFAJORES,
    getFiatConnectQuotesUrl: GET_FIAT_CONNECT_QUOTES_ALFAJORES,
    simplexApiUrl: SIMPLEX_API_URL_STAGING,
    fetchUserLocationDataUrl: FETCH_USER_LOCATION_DATA_STAGING,
    walletConnectEndpoint: 'wss://relay.walletconnect.org',
    personaEnvironment: PersonaEnvironment.SANDBOX,
    inHouseLiquidityURL: 'https://liquidity-dot-celo-mobile-alfajores.appspot.com',
    setRegistrationPropertiesUrl: SET_REGISTRATION_PROPERTIES_ALFAJORES,
    setRegistrationPropertiesAuth: SET_REGISTRATION_PROPERTIES_AUTH_ALFAJORES,
    fetchExchangesUrl: FETCH_EXCHANGES_URL_ALFAJORES,
    nftsAppUrl: NFTS_APP_URL,
    getSwapQuoteUrl: GET_SWAP_QUOTE_URL,
    walletJumpstartUrl: JUMPSTART_CLAIM_URL_ALFAJORES,
    verifyPhoneNumberUrl: VERIFY_PHONE_NUMBER_ALFAJORES,
    verifySmsCodeUrl: VERIFY_SMS_CODE_ALFAJORES,
    resolvePhoneNumberUrl: RESOLVE_PHONE_NUMBER_ALFAJORES,
    lookupPhoneNumberUrl: LOOKUP_PHONE_NUMBER_ALFAJORES,
    lookupAddressUrl: LOOKUP_ADDRESS_ALFAJORES,
    checkAddressVerifiedUrl: CHECK_ADDRESS_VERIFIED_ALFAJORES,
    revokePhoneNumberUrl: REVOKE_PHONE_NUMBER_ALFAJORES,
    migratePhoneVerificationUrl: MIGRATE_PHONE_VERIFICATION_ALFAJORES,
    resolveId: RESOLVE_ID_ALFAJORES,
    getNftsByOwnerAddressUrl: GET_NFTS_BY_OWNER_ADDRESS_ALFAJORES,
    cabApiKey: CAB_API_KEY_ALFAJORES,
    cabIssueSmsCodeUrl: CAB_ISSUE_SMS_CODE_ALFAJORES,
    cabIssueAppKeyshareUrl: CAB_ISSUE_APP_KEYSHARE_ALFAJORES,
    cabStoreEncryptedMnemonicUrl: CAB_STORE_ENCRYPTED_MNEMONIC_ALFAJORES,
    cabGetEncryptedMnemonicUrl: CAB_GET_ENCRYPTED_MNEMONIC_ALFAJORES,
    cabDeleteEncryptedMnemonicUrl: CAB_DELETE_ENCRYPTED_MNEMONIC_ALFAJORES,
    cabLoginUrl: CAB_LOGIN_ALFAJORES,
    cabClockUrl: CAB_CLOCK_ALFAJORES,
    getTokensInfoUrl: GET_TOKENS_INFO_URL_ALFAJORES,
    getPointsHistoryUrl: GET_POINTS_HISTORY_ALFAJORES,
    trackPointsEventUrl: TRACK_POINTS_EVENT_ALFAJORES,
    getPointsBalanceUrl: GET_POINTS_BALANCE_ALFAJORES,
    simulateTransactionsUrl: SIMULATE_TRANSACTIONS_ALFAJORES,
    viemChain: {
      [Network.Celo]: celoAlfajores,
      [Network.Ethereum]: ethereumSepolia,
      [Network.Arbitrum]: arbitrumSepolia,
      [Network.Optimism]: optimismSepolia,
      [Network.PolygonPoS]: polygonAmoy,
      [Network.Base]: baseSepolia,
    },
    currencyToTokenId: {
      [CiCoCurrency.CELO]: CELO_TOKEN_ID_STAGING,
      [CiCoCurrency.cUSD]: CUSD_TOKEN_ID_STAGING,
      [CiCoCurrency.cEUR]: CEUR_TOKEN_ID_STAGING,
      [CiCoCurrency.cREAL]: CREAL_TOKEN_ID_STAGING,
      [CiCoCurrency.ETH]: ETH_TOKEN_ID_STAGING,
      [Currency.Celo]: CELO_TOKEN_ID_STAGING,
      [CiCoCurrency.USDT]: USDT_TOKEN_ID_STAGING,
      [CiCoCurrency.cCOP]: CCOP_TOKEN_ID_STAGING,
    },
    celoTokenAddress: CELO_TOKEN_ADDRESS_STAGING,
    celoGasPriceMinimumAddress: CELO_GAS_PRICE_MINIMUM_ADDRESS_STAGING,
    alchemyRpcUrl: {
      [Network.Ethereum]: ALCHEMY_ETHEREUM_RPC_URL_STAGING,
      [Network.Arbitrum]: ALCHEMY_ARBITRUM_RPC_URL_STAGING,
      [Network.Optimism]: ALCHEMY_OPTIMISM_RPC_URL_STAGING,
      [Network.PolygonPoS]: ALCHEMY_POLYGON_POS_RPC_URL_STAGING,
      [Network.Base]: ALCHEMY_BASE_RPC_URL_STAGING,
    },
    ceurTokenId: CEUR_TOKEN_ID_STAGING,
    crealTokenId: CREAL_TOKEN_ID_STAGING,
    celoTokenId: CELO_TOKEN_ID_STAGING,
    ccopTokenId: CCOP_TOKEN_ID_STAGING,
    usdtTokenId: USDT_TOKEN_ID_STAGING,
    spendTokenIds: [USDT_TOKEN_ID_STAGING, CCOP_TOKEN_ID_STAGING],
    saveContactsUrl: SAVE_CONTACTS_ALFAJORES,
    getPointsConfigUrl: GET_POINTS_CONFIG_ALFAJORES,
    internalRpcUrl: {
      [Network.Arbitrum]: INTERNAL_ARBITRUM_RPC_URL_STAGING,
    },
    authHeaderIssuer: APP_REGISTRY_NAME,
    web3AuthVerifier: WEB3_AUTH_VERIFIER,
    crossChainExplorerUrl: CROSS_CHAIN_EXPLORER_URL,
    getWalletTransactionsUrl: GET_WALLET_TRANSACTIONS_ALFAJORES,
    getWalletBalancesUrl: GET_WALLET_BALANCES_ALFAJORES,
    getExchangeRateUrl: GET_EXCHANGE_RATE_ALFAJORES,
  },
  [Testnets.mainnet]: {
    networkId: '42220',
    networkToNetworkId: {
      [Network.Celo]: NetworkId['celo-mainnet'],
      [Network.Ethereum]: NetworkId['ethereum-mainnet'],
      [Network.Arbitrum]: NetworkId['arbitrum-one'],
      [Network.Optimism]: NetworkId['op-mainnet'],
      [Network.PolygonPoS]: NetworkId['polygon-pos-mainnet'],
      [Network.Base]: NetworkId['base-mainnet'],
    },
    defaultNetworkId: NetworkId['celo-mainnet'],
    blockchainApiUrl: BLOCKCHAIN_API_MAINNET,
    cloudFunctionsUrl: CLOUD_FUNCTIONS_MAINNET,
    hooksApiUrl: HOOKS_API_URL_MAINNET,
    sentryTracingUrls: [
      DEFAULT_FORNO_URL,
      BLOCKCHAIN_API_MAINNET,
      CLOUD_FUNCTIONS_MAINNET,
      'https://liquidity-dot-celo-mobile-mainnet.appspot.com',
    ],
    allowedMtwImplementations: ALLOWED_MTW_IMPLEMENTATIONS_MAINNET,
    currentMtwImplementationAddress: CURRENT_MTW_IMPLEMENTATION_ADDRESS_MAINNET,
    recaptchaSiteKey: RECAPTCHA_SITE_KEY,
    bidaliUrl: BIDALI_URL,
    providerFetchUrl: PROVIDER_FETCH_URL_MAINNET,
    getFiatConnectProvidersUrl: GET_FIAT_CONNECT_PROVIDERS_MAINNET,
    getFiatConnectQuotesUrl: GET_FIAT_CONNECT_QUOTES_MAINNET,
    simplexApiUrl: SIMPLEX_API_URL_PROD,
    fetchUserLocationDataUrl: FETCH_USER_LOCATION_DATA_PROD,
    walletConnectEndpoint: 'wss://relay.walletconnect.org',
    personaEnvironment: PersonaEnvironment.PRODUCTION,
    inHouseLiquidityURL: 'https://liquidity-dot-celo-mobile-mainnet.appspot.com',
    setRegistrationPropertiesUrl: SET_REGISTRATION_PROPERTIES_MAINNET,
    setRegistrationPropertiesAuth: SET_REGISTRATION_PROPERTIES_AUTH_MAINNET,
    fetchExchangesUrl: FETCH_EXCHANGES_URL_MAINNET,
    nftsAppUrl: NFTS_APP_URL,
    getSwapQuoteUrl: GET_SWAP_QUOTE_URL,
    walletJumpstartUrl: JUMPSTART_CLAIM_URL_MAINNET,
    verifyPhoneNumberUrl: VERIFY_PHONE_NUMBER_MAINNET,
    verifySmsCodeUrl: VERIFY_SMS_CODE_MAINNET,
    resolvePhoneNumberUrl: RESOLVE_PHONE_NUMBER_MAINNET,
    lookupPhoneNumberUrl: LOOKUP_PHONE_NUMBER_MAINNET,
    lookupAddressUrl: LOOKUP_ADDRESS_MAINNET,
    checkAddressVerifiedUrl: CHECK_ADDRESS_VERIFIED_MAINNET,
    revokePhoneNumberUrl: REVOKE_PHONE_NUMBER_MAINNET,
    migratePhoneVerificationUrl: MIGRATE_PHONE_VERIFICATION_MAINNET,
    resolveId: RESOLVE_ID_MAINNET,
    getNftsByOwnerAddressUrl: GET_NFTS_BY_OWNER_ADDRESS_MAINNET,
    cabApiKey: CAB_API_KEY_MAINNET,
    cabIssueSmsCodeUrl: CAB_ISSUE_SMS_CODE_MAINNET,
    cabIssueAppKeyshareUrl: CAB_ISSUE_APP_KEYSHARE_MAINNET,
    cabStoreEncryptedMnemonicUrl: CAB_STORE_ENCRYPTED_MNEMONIC_MAINNET,
    cabGetEncryptedMnemonicUrl: CAB_GET_ENCRYPTED_MNEMONIC_MAINNET,
    cabDeleteEncryptedMnemonicUrl: CAB_DELETE_ENCRYPTED_MNEMONIC_MAINNET,
    cabLoginUrl: CAB_LOGIN_MAINNET,
    cabClockUrl: CAB_CLOCK_MAINNET,
    getTokensInfoUrl: GET_TOKENS_INFO_URL_MAINNET,
    getPointsHistoryUrl: GET_POINTS_HISTORY_MAINNET,
    trackPointsEventUrl: TRACK_POINTS_EVENT_MAINNET,
    getPointsBalanceUrl: GET_POINTS_BALANCE_MAINNET,
    simulateTransactionsUrl: SIMULATE_TRANSACTIONS_MAINNET,
    viemChain: {
      [Network.Celo]: celo,
      [Network.Ethereum]: ethereum,
      [Network.Arbitrum]: arbitrum,
      [Network.Optimism]: optimism,
      [Network.PolygonPoS]: polygon,
      [Network.Base]: base,
    },
    currencyToTokenId: {
      [CiCoCurrency.CELO]: CELO_TOKEN_ID_MAINNET,
      [CiCoCurrency.cUSD]: CUSD_TOKEN_ID_MAINNET,
      [CiCoCurrency.cEUR]: CEUR_TOKEN_ID_MAINNET,
      [CiCoCurrency.cREAL]: CREAL_TOKEN_ID_MAINNET,
      [CiCoCurrency.ETH]: ETH_TOKEN_ID_MAINNET,
      [Currency.Celo]: CELO_TOKEN_ID_MAINNET,
      [CiCoCurrency.USDT]: USDT_TOKEN_ID_MAINNET,
      [CiCoCurrency.cCOP]: CCOP_TOKEN_ID_MAINNET,
    },
    celoTokenAddress: CELO_TOKEN_ADDRESS_MAINNET,
    celoGasPriceMinimumAddress: CELO_GAS_PRICE_MINIMUM_ADDRESS_MAINNET,
    alchemyRpcUrl: {
      [Network.Ethereum]: ALCHEMY_ETHEREUM_RPC_URL_MAINNET,
      [Network.Arbitrum]: ALCHEMY_ARBITRUM_RPC_URL_MAINNET,
      [Network.Optimism]: ALCHEMY_OPTIMISM_RPC_URL_MAINNET,
      [Network.PolygonPoS]: ALCHEMY_POLYGON_POS_RPC_URL_MAINNET,
      [Network.Base]: ALCHEMY_BASE_RPC_URL_MAINNET,
    },
    ceurTokenId: CEUR_TOKEN_ID_MAINNET,
    crealTokenId: CREAL_TOKEN_ID_MAINNET,
    celoTokenId: CELO_TOKEN_ID_MAINNET,
    ccopTokenId: CCOP_TOKEN_ID_MAINNET,
    usdtTokenId: USDT_TOKEN_ID_MAINNET,
    spendTokenIds: [CUSD_TOKEN_ID_MAINNET, CELO_TOKEN_ID_MAINNET],
    saveContactsUrl: SAVE_CONTACTS_MAINNET,
    getPointsConfigUrl: GET_POINTS_CONFIG_MAINNET,
    internalRpcUrl: {
      [Network.Arbitrum]: INTERNAL_ARBITRUM_RPC_URL_MAINNET,
    },
    authHeaderIssuer: APP_REGISTRY_NAME,
    web3AuthVerifier: WEB3_AUTH_VERIFIER,
    crossChainExplorerUrl: CROSS_CHAIN_EXPLORER_URL,
    getWalletTransactionsUrl: GET_WALLET_TRANSACTIONS_MAINNET,
    getWalletBalancesUrl: GET_WALLET_BALANCES_MAINNET,
    getExchangeRateUrl: GET_EXCHANGE_RATE_MAINNET,
  },
}

const CELOSCAN_BASE_URL_ALFAJORES = 'https://alfajores.celoscan.io'
const CELOSCAN_BASE_URL_MAINNET = 'https://celoscan.io'

const ETHERSCAN_BASE_URL_SEPOLIA = 'https://sepolia.etherscan.io'
const ETHERSCAN_BASE_URL_MAINNET = 'https://etherscan.io'

const ARBISCAN_BASE_URL_ONE = 'https://arbiscan.io'
const ARBISCAN_BASE_URL_SEPOLIA = 'https://sepolia.arbiscan.io'

const OP_MAINNET_EXPLORER_BASE_URL = 'https://optimistic.etherscan.io'
const OP_SEPOLIA_EXPLORER_BASE_URL = 'https://sepolia-optimism.etherscan.io'

const POLYGON_POS_BASE_URL_AMOY = 'https://amoy.polygonscan.com'
const POLYGON_POS_BASE_URL_MAINNET = 'https://polygonscan.com'

const BASE_BASE_URL_SEPOLIA = 'https://sepolia.basescan.org'
const BASE_BASE_URL_MAINNET = 'https://basescan.org'

export const blockExplorerUrls: BlockExplorerUrls = {
  [NetworkId['celo-mainnet']]: {
    baseTxUrl: `${CELOSCAN_BASE_URL_MAINNET}/tx/`,
    baseAddressUrl: `${CELOSCAN_BASE_URL_MAINNET}/address/`,
    baseTokenUrl: `${CELOSCAN_BASE_URL_MAINNET}/token/`,
    baseNftUrl: 'https://explorer.celo.org/mainnet/token/',
  },
  [NetworkId['celo-alfajores']]: {
    baseTxUrl: `${CELOSCAN_BASE_URL_ALFAJORES}/tx/`,
    baseAddressUrl: `${CELOSCAN_BASE_URL_ALFAJORES}/address/`,
    baseTokenUrl: `${CELOSCAN_BASE_URL_ALFAJORES}/token/`,
    baseNftUrl: 'https://explorer.celo.org/alfajores/token/',
  },
  [NetworkId['ethereum-mainnet']]: {
    baseTxUrl: `${ETHERSCAN_BASE_URL_MAINNET}/tx/`,
    baseAddressUrl: `${ETHERSCAN_BASE_URL_MAINNET}/address/`,
    baseTokenUrl: `${ETHERSCAN_BASE_URL_MAINNET}/token/`,
    baseNftUrl: `${ETHERSCAN_BASE_URL_MAINNET}/nft/`,
  },
  [NetworkId['ethereum-sepolia']]: {
    baseTxUrl: `${ETHERSCAN_BASE_URL_SEPOLIA}/tx/`,
    baseAddressUrl: `${ETHERSCAN_BASE_URL_SEPOLIA}/address/`,
    baseTokenUrl: `${ETHERSCAN_BASE_URL_SEPOLIA}/token/`,
    baseNftUrl: `${ETHERSCAN_BASE_URL_SEPOLIA}/nft/`,
  },
  [NetworkId['arbitrum-one']]: {
    baseTxUrl: `${ARBISCAN_BASE_URL_ONE}/tx/`,
    baseAddressUrl: `${ARBISCAN_BASE_URL_ONE}/address/`,
    baseTokenUrl: `${ARBISCAN_BASE_URL_ONE}/token/`,
    baseNftUrl: `${ARBISCAN_BASE_URL_ONE}/token/`,
  },
  [NetworkId['arbitrum-sepolia']]: {
    baseTxUrl: `${ARBISCAN_BASE_URL_SEPOLIA}/tx/`,
    baseAddressUrl: `${ARBISCAN_BASE_URL_SEPOLIA}/address/`,
    baseTokenUrl: `${ARBISCAN_BASE_URL_SEPOLIA}/token/`,
    baseNftUrl: `${ARBISCAN_BASE_URL_SEPOLIA}/token/`,
  },
  [NetworkId['op-mainnet']]: {
    baseTxUrl: `${OP_MAINNET_EXPLORER_BASE_URL}/tx/`,
    baseAddressUrl: `${OP_MAINNET_EXPLORER_BASE_URL}/address/`,
    baseTokenUrl: `${OP_MAINNET_EXPLORER_BASE_URL}/token/`,
    baseNftUrl: `${OP_MAINNET_EXPLORER_BASE_URL}/token/`,
  },
  [NetworkId['op-sepolia']]: {
    baseTxUrl: `${OP_SEPOLIA_EXPLORER_BASE_URL}/tx/`,
    baseAddressUrl: `${OP_SEPOLIA_EXPLORER_BASE_URL}/address/`,
    baseTokenUrl: `${OP_SEPOLIA_EXPLORER_BASE_URL}/token/`,
    baseNftUrl: `${OP_SEPOLIA_EXPLORER_BASE_URL}/token/`,
  },
  [NetworkId['polygon-pos-mainnet']]: {
    baseTxUrl: `${POLYGON_POS_BASE_URL_MAINNET}/tx/`,
    baseAddressUrl: `${POLYGON_POS_BASE_URL_MAINNET}/address/`,
    baseTokenUrl: `${POLYGON_POS_BASE_URL_MAINNET}/token/`,
    baseNftUrl: `${POLYGON_POS_BASE_URL_MAINNET}/token/`,
  },
  [NetworkId['polygon-pos-amoy']]: {
    baseTxUrl: `${POLYGON_POS_BASE_URL_AMOY}/tx/`,
    baseAddressUrl: `${POLYGON_POS_BASE_URL_AMOY}/address/`,
    baseTokenUrl: `${POLYGON_POS_BASE_URL_AMOY}/token/`,
    baseNftUrl: `${POLYGON_POS_BASE_URL_AMOY}/token/`,
  },
  [NetworkId['base-mainnet']]: {
    baseTxUrl: `${BASE_BASE_URL_MAINNET}/tx/`,
    baseAddressUrl: `${BASE_BASE_URL_MAINNET}/address/`,
    baseTokenUrl: `${BASE_BASE_URL_MAINNET}/token/`,
    baseNftUrl: `${BASE_BASE_URL_MAINNET}/token/`,
  },
  [NetworkId['base-sepolia']]: {
    baseTxUrl: `${BASE_BASE_URL_SEPOLIA}/tx/`,
    baseAddressUrl: `${BASE_BASE_URL_SEPOLIA}/address/`,
    baseTokenUrl: `${BASE_BASE_URL_SEPOLIA}/token/`,
    baseNftUrl: `${BASE_BASE_URL_SEPOLIA}/token/`,
  },
}

export const networkIdToNetwork: NetworkIdToNetwork = {
  [NetworkId['celo-mainnet']]: Network.Celo,
  [NetworkId['celo-alfajores']]: Network.Celo,
  [NetworkId['ethereum-mainnet']]: Network.Ethereum,
  [NetworkId['ethereum-sepolia']]: Network.Ethereum,
  [NetworkId['arbitrum-one']]: Network.Arbitrum,
  [NetworkId['arbitrum-sepolia']]: Network.Arbitrum,
  [NetworkId['op-mainnet']]: Network.Optimism,
  [NetworkId['op-sepolia']]: Network.Optimism,
  [NetworkId['polygon-pos-mainnet']]: Network.PolygonPoS,
  [NetworkId['polygon-pos-amoy']]: Network.PolygonPoS,
  [NetworkId['base-mainnet']]: Network.Base,
  [NetworkId['base-sepolia']]: Network.Base,
}

export const networkIdToWalletConnectChainId: Record<NetworkId, string> = {
  [NetworkId['celo-alfajores']]: 'eip155:44787',
  [NetworkId['celo-mainnet']]: 'eip155:42220',
  [NetworkId['ethereum-mainnet']]: 'eip155:1',
  [NetworkId['ethereum-sepolia']]: 'eip155:11155111',
  [NetworkId['arbitrum-one']]: 'eip155:42161',
  [NetworkId['arbitrum-sepolia']]: 'eip155:421614',
  [NetworkId['op-mainnet']]: 'eip155:10',
  [NetworkId['op-sepolia']]: 'eip155:11155420',
  [NetworkId['polygon-pos-mainnet']]: 'eip155:137',
  [NetworkId['polygon-pos-amoy']]: 'eip155:80002',
  [NetworkId['base-mainnet']]: 'eip155:8453',
  [NetworkId['base-sepolia']]: 'eip155:84531',
}

export const walletConnectChainIdToNetworkId: Record<string, NetworkId> = _.invert(
  networkIdToWalletConnectChainId
) as Record<string, NetworkId>

export const walletConnectChainIdToNetwork: Record<string, Network> = {}
for (const [walletConnectChainId, networkId] of Object.entries(walletConnectChainIdToNetworkId)) {
  walletConnectChainIdToNetwork[walletConnectChainId] = networkIdToNetwork[networkId]
}

Logger.info('Connecting to testnet: ', DEFAULT_TESTNET)

export { CCOP_TOKEN_ID_MAINNET }

export default networkConfigs[DEFAULT_TESTNET]

// En lugar de definir los valores repetidos, derivamos el mapeo de los valores existentes
export const networkIdToChainId: Record<NetworkId, number> = Object.fromEntries(
  Object.entries(networkIdToWalletConnectChainId).map(([networkId, wcChainId]) => [
    networkId,
    // Extraer el número de chainId del formato 'eip155:CHAIN_ID'
    parseInt(wcChainId.split(':')[1], 10),
  ])
) as Record<NetworkId, number>
