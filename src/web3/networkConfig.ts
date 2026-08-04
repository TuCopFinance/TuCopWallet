import _ from 'lodash'
import { Environment as PersonaEnvironment } from 'react-native-persona'
import { APP_REGISTRY_NAME, BIDALI_URL, DEFAULT_FORNO_URL, RECAPTCHA_SITE_KEY } from 'src/config'
import { Network, NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { CiCoCurrency, Currency } from 'src/utils/currencies'
import { Address, TypedDataDefinition } from 'viem'
import {
  arbitrum,
  base,
  celo,
  mainnet as ethereum,
  optimism,
  polygon,
  Chain as ViemChain,
} from 'viem/chains'

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
  copmTokenId: string
  xaut0TokenId: string
  usdcTokenId: string
  usdmTokenId: string
  usatTokenId: string
  ceurTokenId: string
  crealTokenId: string
  celoTokenId: string
  batchExecutorAddressCelo: Address
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
  getXautPriceUrl: string
  blockscoutProxyBase: string
  wriDelegateRelayUrl: string
  wriTxFeedUrl: string
  wriTxWatchUrl: string
  wriFeeAdapterBootstrapUrl: string
  wriFeeAdapterAddresses: {
    USDC: Address
    USDT: Address
  }
  tucopBackendApiUrl: string
}

const ALCHEMY_ETHEREUM_RPC_URL_MAINNET = 'https://eth-mainnet.g.alchemy.com/v2/'
const ALCHEMY_ARBITRUM_RPC_URL_MAINNET = 'https://arb-mainnet.g.alchemy.com/v2/'
const ALCHEMY_OPTIMISM_RPC_URL_MAINNET = 'https://opt-mainnet.g.alchemy.com/v2/'
const ALCHEMY_POLYGON_POS_RPC_URL_MAINNET = 'https://polygon-mainnet.g.alchemy.com/v2/'
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

const CELO_TOKEN_ADDRESS_MAINNET = '0x471ece3750da237f93b8e339c536989b8978a438'

// From https://docs.celo.org/contract-addresses
const CELO_GAS_PRICE_MINIMUM_ADDRESS_MAINNET = '0xdfca3a8d7699d8bafe656823ad60c17cb8270ecc'

const CELO_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:native`

const CUSD_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0x765de816845861e75a25fca122bb6898b8b1282a`

const CEUR_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73`

const CREAL_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0xe8537a3d056da446677b9e9d6c5db704eaab4787`

const ETH_TOKEN_ID_MAINNET = `${NetworkId['ethereum-mainnet']}:native`

const COPM_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0x8a567e2ae79ca692bd748ab832081c45de4041ea`

export const USDT_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e`

// XAUt0 (Tether Gold) - 6 decimals, 1 token = 1 troy ounce of gold
export const XAUT0_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff`
export const XAUT0_ADDRESS_MAINNET = '0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff' as Address

// USDC (Circle native on Celo) - 6 decimals
const USDC_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0xceba9300f2b948710d2653dd7b07f33a8b32118c`

// USDm = rebranded cUSD - 18 decimals - SAME contract as cUSD
const USDM_TOKEN_ID_MAINNET = CUSD_TOKEN_ID_MAINNET

// USAT (Tether America USD, US-regulated Anchorage Digital) - 6 decimals
const USAT_TOKEN_ID_MAINNET = `${NetworkId['celo-mainnet']}:0xd2ab3c9a02dbbab236bfec45d1d755df4267f771`

// BatchExecutor contract that the EOA delegates to via EIP-7702 for the
// dollarsSpend single-tx path (Track C). Used by saga7702.ts to encode the
// authorization + execute(calls) calldata.
//
// Deployed on Celo mainnet (chainId 42220) via
// contracts/script/DeployBatchExecutor.s.sol targeting the hardened source
// at contracts/src/BatchExecutor.sol (onlySelf modifier + ReentrancyGuard):
//   tx: 0xf95d4dd423c9f300c00347360ca61d6d5c91152575f8e81358bb161546923c0c
//   block: 69877584 (0x42c3d50)
//   gasUsed: 268,405 (0x41675)
// Bytecode verified on-chain: 1783 chars matches the hardened artifact.
//
// An earlier deploy (0x97b99a4ac0BDA988B4c9C6BA1398deB22a577be4, tx
// 0x7744ce5119aa90310acea1eff58c64187203a96976c432eb980cf93451df1e61) used
// the SPIKE source and must never be wired here.
//
// The saga7702 path stays gated behind StatsigFeatureGates.WRI_DOLLARS_SPEND_7702_V1
// until Phase 1 internal dogfood + Phase 2 production rollout flip the flag.
export const BATCH_EXECUTOR_ADDRESS_CELO: Address = '0xaE6a87E88b55644Eda54C3AA55B11944eE5E1DFe'

const CLOUD_FUNCTIONS_MAINNET = 'https://api.mainnet.valora.xyz'

const BLOCKCHAIN_API_MAINNET = 'https://blockchain-api-dot-celo-mobile-mainnet.appspot.com'

const ALLOWED_MTW_IMPLEMENTATIONS_MAINNET: Address[] = [
  '0x6511FB5DBfe95859d8759AdAd5503D656E2555d7',
]

const CURRENT_MTW_IMPLEMENTATION_ADDRESS_MAINNET: Address =
  '0x6511FB5DBfe95859d8759AdAd5503D656E2555d7'

const GET_TOKENS_INFO_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getTokensInfoWithPrices`

const FETCH_EXCHANGES_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getExchanges`

const PROVIDER_FETCH_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/fetchProviders`

const GET_FIAT_CONNECT_PROVIDERS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getFiatConnectProviders`

const GET_FIAT_CONNECT_QUOTES_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getQuotes`

const SIMPLEX_API_URL_PROD = `${CLOUD_FUNCTIONS_MAINNET}/processSimplexRequest`

const FETCH_USER_LOCATION_DATA_PROD = `${CLOUD_FUNCTIONS_MAINNET}/fetchUserLocationData`

const SET_REGISTRATION_PROPERTIES_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/setRegistrationProperties`

const VERIFY_PHONE_NUMBER_MAINNET = `https://api-wallet-tucop-production.up.railway.app/api/wallets/request-otp`

const VERIFY_SMS_CODE_MAINNET = `https://api-wallet-tucop-production.up.railway.app/api/wallets/verify-otp`

const RESOLVE_PHONE_NUMBER_MAINNET = `https://api-wallet-tucop-production.up.railway.app/api/wallets/by-phone`

const LOOKUP_PHONE_NUMBER_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/lookupPhoneNumber`

const LOOKUP_ADDRESS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/lookupAddress`

const REVOKE_PHONE_NUMBER_MAINNET = `https://api-wallet-tucop-production.up.railway.app/api/wallets/unlink`

const MIGRATE_PHONE_VERIFICATION_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/migrateASv1Verification`

const CHECK_ADDRESS_VERIFIED_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/checkAddressVerified`

const RESOLVE_ID_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/resolveId`

const NFTS_APP_URL = 'https://nfts.valoraapp.com/'

// Swap quote now flows through TuCop's own backend proxy so the TuCop Squid
// integratorId is attached (Squid attribution + revenue share lands with us
// instead of Valora). The backend at TUCOP_BACKEND_BASE below preserves the
// FetchQuoteResponse shape that this app already consumes (drop-in URL flip).
const TUCOP_BACKEND_BASE_URL = 'https://tucop-backend-production.up.railway.app'

const GET_SWAP_QUOTE_URL = `${TUCOP_BACKEND_BASE_URL}/api/swap/quote`

const HOOKS_API_URL_MAINNET = `${TUCOP_BACKEND_BASE_URL}/hooks-api`

const GET_NFTS_BY_OWNER_ADDRESS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getNfts`

const CAB_API_KEY_MAINNET =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiY2xpZW50SWQiOiJkZWZhdWx0LWNsaWVudC1hcHAiLCJhcHBWZXJzaW9uIjoiMS4wLjAiLCJpYXQiOjE3NDUwODM0NjB9.oGiu-AmR08zj52leaGw6oJt6qUkPEYVl0tgLav8UeLs'

const CAB_ISSUE_SMS_CODE_MAINNET = `https://twilio-service.up.railway.app/otp/send`
const CAB_STORE_ENCRYPTED_MNEMONIC_MAINNET = `https://twilio-service.up.railway.app/keyless-backup`

const CAB_ISSUE_APP_KEYSHARE_MAINNET = `https://twilio-service.up.railway.app/otp/verify`

const CAB_LOGIN_MAINNET = `https://twilio-service.up.railway.app/siwe/login`

const CAB_CLOCK_MAINNET = `https://twilio-service.up.railway.app/siwe/clock`

const CAB_GET_ENCRYPTED_MNEMONIC_MAINNET = `https://twilio-service.up.railway.app/keyless-backup`

const CAB_DELETE_ENCRYPTED_MNEMONIC_MAINNET = `https://twilio-service.up.railway.app/keyless-backup/delete`

const SAVE_CONTACTS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/saveContacts`

const GET_POINTS_HISTORY_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getPointsHistory`

const GET_POINTS_CONFIG_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getPointsConfig`
const TRACK_POINTS_EVENT_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/trackPointsEvent`
const GET_POINTS_BALANCE_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getPointsBalance`

const SIMULATE_TRANSACTIONS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/simulateTransactions`

const INTERNAL_ARBITRUM_RPC_URL_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/rpc/${NetworkId['arbitrum-one']}`

const GET_WALLET_TRANSACTIONS_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getWalletTransactions`

const GET_WALLET_BALANCES_MAINNET = `${CLOUD_FUNCTIONS_MAINNET}/getWalletBalances`

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

const CROSS_CHAIN_EXPLORER_URL = 'https://axelarscan.io/gmp/'

// TuCop backend proxies (Railway). Used to remove third-party API keys from the mobile app:
// - /api/prices/xaut       -> XAUt0 USD price (replaces CoinMarketCap)
// - /api/v2/...            -> Blockscout passthrough (replaces direct Blockscout calls + key)
const TUCOP_BACKEND_BASE = 'https://tucop-backend-production.up.railway.app'
const GET_XAUT_PRICE_URL = `${TUCOP_BACKEND_BASE}/api/prices/xaut?vs=usd`
const WRI_DELEGATE_RELAY_URL = `${TUCOP_BACKEND_BASE}/api/wri/delegate-relay`
// WRI Track C feed migration (gated by StatsigFeatureGates.WRI_TX_FEED_TUCOP_V1):
// indexer-backed feed that classifies EIP-7702 atomic batches Valora ignores.
// Same response shape as getWalletTransactions, so the swap is just a baseUrl
// flip inside transactions/api.ts. /watch registers wallets so the indexer
// tracks them going forward.
const WRI_TX_FEED_URL = `${TUCOP_BACKEND_BASE}/api/transactions/feed`
const WRI_TX_WATCH_URL = `${TUCOP_BACKEND_BASE}/api/transactions/watch`
// Pre-authorization endpoint for the CIP-64 fee adapters (gated by
// WRI_COPM_FEE_BOOTSTRAP_V1). Mints one-time MAX_UINT256 approvals on the
// underlying USDC/USDT so users without CELO or Mento stables can still pay
// gas. Adapter addresses are sourced from celopedia (canonical Mento list).
const WRI_FEE_ADAPTER_BOOTSTRAP_URL = `${TUCOP_BACKEND_BASE}/api/wri/fee-adapter-bootstrap`
// Canonical CIP-64 fee adapter addresses on Celo mainnet, verified via the
// celopedia-skill builder guide (Allowed Fee Currencies table). Used by the
// fee-bootstrap flow to grant infinite approval on the underlying token. The
// adapter ABI is non-standard (no token()/owner() getters) so we don't read
// the underlying on-chain — celopedia is the source of truth.
const WRI_FEE_ADAPTER_USDC = '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B'
const WRI_FEE_ADAPTER_USDT = '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72'
const BLOCKSCOUT_PROXY_BASE = `${TUCOP_BACKEND_BASE}/api/v2`

const networkConfig: NetworkConfig = {
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
    // CiCoCurrency.CELO === Currency.Celo === 'CELO' (single key satisfies both)
    [CiCoCurrency.CELO]: CELO_TOKEN_ID_MAINNET,
    // External-facing CiCoCurrency keeps legacy cXXX strings (FiatConnect contract).
    [CiCoCurrency.cUSD]: CUSD_TOKEN_ID_MAINNET,
    [CiCoCurrency.cEUR]: CEUR_TOKEN_ID_MAINNET,
    [CiCoCurrency.cREAL]: CREAL_TOKEN_ID_MAINNET,
    [CiCoCurrency.ETH]: ETH_TOKEN_ID_MAINNET,
    // Internal-facing Currency uses new XXXm naming and points to the same token.
    [Currency.Dollar]: CUSD_TOKEN_ID_MAINNET,
    [Currency.Euro]: CEUR_TOKEN_ID_MAINNET,
    [CiCoCurrency.USDT]: USDT_TOKEN_ID_MAINNET, // also satisfies Currency.USDT (same string 'USDT')
    [CiCoCurrency.USDC]: USDC_TOKEN_ID_MAINNET, // also satisfies Currency.USDC
    [CiCoCurrency.USAT]: USAT_TOKEN_ID_MAINNET, // also satisfies Currency.USAT
    [CiCoCurrency.COPm]: COPM_TOKEN_ID_MAINNET, // also satisfies Currency.COP
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
  copmTokenId: COPM_TOKEN_ID_MAINNET,
  usdtTokenId: USDT_TOKEN_ID_MAINNET,
  xaut0TokenId: XAUT0_TOKEN_ID_MAINNET,
  usdcTokenId: USDC_TOKEN_ID_MAINNET,
  usdmTokenId: USDM_TOKEN_ID_MAINNET,
  usatTokenId: USAT_TOKEN_ID_MAINNET,
  batchExecutorAddressCelo: BATCH_EXECUTOR_ADDRESS_CELO,
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
  getXautPriceUrl: GET_XAUT_PRICE_URL,
  blockscoutProxyBase: BLOCKSCOUT_PROXY_BASE,
  wriDelegateRelayUrl: WRI_DELEGATE_RELAY_URL,
  wriTxFeedUrl: WRI_TX_FEED_URL,
  wriTxWatchUrl: WRI_TX_WATCH_URL,
  wriFeeAdapterBootstrapUrl: WRI_FEE_ADAPTER_BOOTSTRAP_URL,
  wriFeeAdapterAddresses: {
    USDC: WRI_FEE_ADAPTER_USDC,
    USDT: WRI_FEE_ADAPTER_USDT,
  },
  tucopBackendApiUrl: TUCOP_BACKEND_BASE,
}

const CELOSCAN_BASE_URL_MAINNET = 'https://celoscan.io'

const ETHERSCAN_BASE_URL_MAINNET = 'https://etherscan.io'

const ARBISCAN_BASE_URL_ONE = 'https://arbiscan.io'

const OP_MAINNET_EXPLORER_BASE_URL = 'https://optimistic.etherscan.io'

const POLYGON_POS_BASE_URL_MAINNET = 'https://polygonscan.com'

const BASE_BASE_URL_MAINNET = 'https://basescan.org'

export const blockExplorerUrls: BlockExplorerUrls = {
  [NetworkId['celo-mainnet']]: {
    baseTxUrl: `${CELOSCAN_BASE_URL_MAINNET}/tx/`,
    baseAddressUrl: `${CELOSCAN_BASE_URL_MAINNET}/address/`,
    baseTokenUrl: `${CELOSCAN_BASE_URL_MAINNET}/token/`,
    baseNftUrl: 'https://explorer.celo.org/mainnet/token/',
  },
  [NetworkId['ethereum-mainnet']]: {
    baseTxUrl: `${ETHERSCAN_BASE_URL_MAINNET}/tx/`,
    baseAddressUrl: `${ETHERSCAN_BASE_URL_MAINNET}/address/`,
    baseTokenUrl: `${ETHERSCAN_BASE_URL_MAINNET}/token/`,
    baseNftUrl: `${ETHERSCAN_BASE_URL_MAINNET}/nft/`,
  },
  [NetworkId['arbitrum-one']]: {
    baseTxUrl: `${ARBISCAN_BASE_URL_ONE}/tx/`,
    baseAddressUrl: `${ARBISCAN_BASE_URL_ONE}/address/`,
    baseTokenUrl: `${ARBISCAN_BASE_URL_ONE}/token/`,
    baseNftUrl: `${ARBISCAN_BASE_URL_ONE}/token/`,
  },
  [NetworkId['op-mainnet']]: {
    baseTxUrl: `${OP_MAINNET_EXPLORER_BASE_URL}/tx/`,
    baseAddressUrl: `${OP_MAINNET_EXPLORER_BASE_URL}/address/`,
    baseTokenUrl: `${OP_MAINNET_EXPLORER_BASE_URL}/token/`,
    baseNftUrl: `${OP_MAINNET_EXPLORER_BASE_URL}/token/`,
  },
  [NetworkId['polygon-pos-mainnet']]: {
    baseTxUrl: `${POLYGON_POS_BASE_URL_MAINNET}/tx/`,
    baseAddressUrl: `${POLYGON_POS_BASE_URL_MAINNET}/address/`,
    baseTokenUrl: `${POLYGON_POS_BASE_URL_MAINNET}/token/`,
    baseNftUrl: `${POLYGON_POS_BASE_URL_MAINNET}/token/`,
  },
  [NetworkId['base-mainnet']]: {
    baseTxUrl: `${BASE_BASE_URL_MAINNET}/tx/`,
    baseAddressUrl: `${BASE_BASE_URL_MAINNET}/address/`,
    baseTokenUrl: `${BASE_BASE_URL_MAINNET}/token/`,
    baseNftUrl: `${BASE_BASE_URL_MAINNET}/token/`,
  },
}

export const networkIdToNetwork: NetworkIdToNetwork = {
  [NetworkId['celo-mainnet']]: Network.Celo,
  [NetworkId['ethereum-mainnet']]: Network.Ethereum,
  [NetworkId['arbitrum-one']]: Network.Arbitrum,
  [NetworkId['op-mainnet']]: Network.Optimism,
  [NetworkId['polygon-pos-mainnet']]: Network.PolygonPoS,
  [NetworkId['base-mainnet']]: Network.Base,
}

export const networkIdToWalletConnectChainId: Record<NetworkId, string> = {
  [NetworkId['celo-mainnet']]: 'eip155:42220',
  [NetworkId['ethereum-mainnet']]: 'eip155:1',
  [NetworkId['arbitrum-one']]: 'eip155:42161',
  [NetworkId['op-mainnet']]: 'eip155:10',
  [NetworkId['polygon-pos-mainnet']]: 'eip155:137',
  [NetworkId['base-mainnet']]: 'eip155:8453',
}

export const walletConnectChainIdToNetworkId: Record<string, NetworkId> = _.invert(
  networkIdToWalletConnectChainId
) as Record<string, NetworkId>

export const walletConnectChainIdToNetwork: Record<string, Network> = {}
for (const [walletConnectChainId, networkId] of Object.entries(walletConnectChainIdToNetworkId)) {
  walletConnectChainIdToNetwork[walletConnectChainId] = networkIdToNetwork[networkId]
}

Logger.info('Connecting to Celo mainnet')

// BucksPay offramp constants
export const BUCKSPAY_RECEIVER_ADDRESS = '0xB731D9D3840F5C237CB7CD091f6e0ff5f6562Dd0' as Address
export const BUCKSPAY_CELO_NETWORK_ID = 6
export const BUCKSPAY_API_BASE_URL = 'https://buckspay-webhook-production-ad81.up.railway.app'
export const BUCKSPAY_WEB_APP_URL = 'https://app.buckspay.xyz/'

export { COPM_TOKEN_ID_MAINNET }

export default networkConfig

// Derive chainId map from the existing walletConnect map.
export const networkIdToChainId: Record<NetworkId, number> = Object.fromEntries(
  Object.entries(networkIdToWalletConnectChainId).map(([networkId, wcChainId]) => [
    networkId,
    parseInt(wcChainId.split(':')[1], 10),
  ])
) as Record<NetworkId, number>
