export enum StatsigDynamicConfigs {
  USERNAME_BLOCK_LIST = 'username_block_list',
  WALLET_NETWORK_TIMEOUT_SECONDS = 'wallet_network_timeout_seconds',
  DAPP_WEBVIEW_CONFIG = 'dapp_webview_config',
  SWAP_CONFIG = 'swap_config',
  CICO_TOKEN_INFO = 'cico_token_info',
  NFT_CELEBRATION_CONFIG = 'nft_celebration_config',
  EARN_STABLECOIN_CONFIG = 'earn_stablecoin_config',
  APP_CONFIG = 'app_config',
  EARN_CONFIG = 'earn_config',
  // Copy + destination address + preset amounts + social links for the
  // 2026-08-10 Colombia earthquake donation campaign. Server-side so we
  // can retarget cities, tune the match copy, rotate the Safe destination,
  // or extend the campaign without shipping a wallet release.
  EARTHQUAKE_DONATION_CONFIG = 'earthquake_donation_config',
}

// Separating into different enum from StatsigDynamicConfigs to allow for more strict typing
export enum StatsigMultiNetworkDynamicConfig {
  MULTI_CHAIN_FEATURES = 'multi_chain_features',
}

export enum StatsigFeatureGates {
  SHOW_POSITIONS = 'show_positions',
  SHOW_CLAIM_SHORTCUTS = 'show_claim_shortcuts',
  ALLOW_HOOKS_PREVIEW = 'allow_hooks_preview',
  APP_REVIEW = 'app_review',
  SHOW_IMPORT_TOKENS_FLOW = 'show_import_tokens_flow',
  SAVE_CONTACTS = 'save_contacts',
  SHOW_GET_STARTED = 'show_get_started',
  CLEVERTAP_INBOX = 'clevertap_inbox',
  SHOW_SWAP_TOKEN_FILTERS = 'show_swap_token_filters',
  SHUFFLE_SWAP_TOKENS_ORDER = 'shuffle_swap_tokens_order',
  SHOW_NFT_CELEBRATION = 'show_nft_celebration',
  SHOW_NFT_REWARD = 'show_nft_reward',
  SHOW_POINTS = 'show_points',
  SUBSIDIZE_STABLECOIN_EARN_GAS_FEES = 'subsidize_stablecoin_earn_gas_fees',
  SHOW_CASH_IN_TOKEN_FILTERS = 'show_cash_in_token_filters',
  ALLOW_CROSS_CHAIN_SWAPS = 'allow_cross_chain_swaps',
  SHOW_ONBOARDING_PHONE_VERIFICATION = 'show_onboarding_phone_verification',
  SHOW_APPLE_IN_CAB = 'show_apple_in_cab',
  SHOW_SWAP_AND_DEPOSIT = 'show_swap_and_deposit',
  SHOW_UK_COMPLIANT_VARIANT = 'show_uk_compliant_variant',
  ALLOW_EARN_PARTIAL_WITHDRAWAL = 'allow_earn_partial_withdrawal',
  SHOW_ZERION_TRANSACTION_FEED = 'show_zerion_transaction_feed',
  SHOW_NEERU_VAULTS = 'show_neeru_vaults',
  WRI_PREFLIGHT_SWAP_SIMULATION = 'wri_preflight_swap_simulation',
  WRI_DOLLARS_SPEND_7702_V1 = 'wri_dollars_spend_7702_v1',
  // Flip the transaction feed source from Valora's getWalletTransactions to
  // TuCop's own indexer (which classifies EIP-7702 atomic batches that Valora
  // ignores). Coordinated with backend's INDEXER_ENABLED=true; do not roll
  // out the wallet flag until the backend indexer is live AND has caught up
  // to the latest block. See tasks/plans/wri-tx-feed-tucop.md.
  WRI_TX_FEED_TUCOP_V1 = 'wri_tx_feed_tucop_v1',
  // Pre-approve the CIP-64 fee adapters for USDC/USDT (one-time MAX_UINT256
  // grants) so users without CELO or Mento stables can still pay gas with
  // their dollar balances. Decoupled from the feed flag — bootstrap is a
  // wallet-only action with no feed dependency.
  WRI_COPM_FEE_BOOTSTRAP_V1 = 'wri_copm_fee_bootstrap_v1',
  // Kill-switch for the 2026-08-10 Colombia earthquake donation feature.
  // When ON, the wallet shows the donation popup once per app-open session
  // AND renders a permanent card in the TabHome entrypoint list. When OFF
  // (default), neither surface renders — safe to keep this always ready
  // to enable/disable server-side without a release.
  SHOW_EARTHQUAKE_DONATION_2026_08 = 'show_earthquake_donation_2026_08',
  // Runtime switch for the token catalog + price source. When ON, the wallet
  // reads /api/tokens/info from the TuCop backend (multi-source stack: DIA
  // -> CoinGecko -> Mento oracle -> hardcoded 1.0). When OFF (default), the
  // wallet keeps hitting the legacy Valora cloud function inherited from the
  // fork (api.mainnet.valora.xyz/getTokensInfoWithPrices) which has been
  // returning priceUsd: null for all Celo stablecoins as of 2026-08-14.
  // Kept as a gate + default OFF so backend can validate the new endpoint
  // in prod with individual overrides / ramp % before flipping to 100%.
  USE_TUCOP_BACKEND_TOKENS_INFO = 'use_tucop_backend_tokens_info',
}

export enum StatsigExperiments {
  ONBOARDING_TERMS_AND_CONDITIONS = 'onboarding_terms_and_conditions',
}

export type StatsigParameter =
  | string
  | number
  | boolean
  | StatsigParameter[]
  | { [key: string]: StatsigParameter }
