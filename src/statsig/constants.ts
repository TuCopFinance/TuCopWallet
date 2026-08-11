import {
  StatsigDynamicConfigs,
  StatsigExperiments,
  StatsigMultiNetworkDynamicConfig,
  StatsigParameter,
} from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'

export const ExperimentConfigs = {
  // NOTE: the keys of defaultValues MUST be parameter names
  [StatsigExperiments.ONBOARDING_TERMS_AND_CONDITIONS]: {
    experimentName: StatsigExperiments.ONBOARDING_TERMS_AND_CONDITIONS,
    defaultValues: {
      variant: 'control' as 'control' | 'colloquial_terms' | 'checkbox',
    },
  },
} satisfies {
  [key in StatsigExperiments]: {
    experimentName: key
    defaultValues: { [key: string]: StatsigParameter }
  }
}

export const DynamicConfigs = {
  [StatsigDynamicConfigs.USERNAME_BLOCK_LIST]: {
    configName: StatsigDynamicConfigs.USERNAME_BLOCK_LIST,
    defaultValues: {
      blockedAdjectives: [] as string[],
      blockedNouns: [] as string[],
    },
  },
  [StatsigDynamicConfigs.WALLET_NETWORK_TIMEOUT_SECONDS]: {
    configName: StatsigDynamicConfigs.WALLET_NETWORK_TIMEOUT_SECONDS,
    defaultValues: {
      default: 15,
      cico: 30,
    },
  },
  [StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES]: {
    configName: StatsigMultiNetworkDynamicConfig.MULTI_CHAIN_FEATURES,
    defaultValues: {
      showCico: [networkConfig.defaultNetworkId],
      showBalances: [networkConfig.defaultNetworkId],
      showSend: [networkConfig.defaultNetworkId],
      showSwap: [networkConfig.defaultNetworkId],
      showTransfers: [networkConfig.defaultNetworkId],
      showWalletConnect: [networkConfig.defaultNetworkId],
      showApprovalTxsInHomefeed: [] as NetworkId[],
      showNfts: [networkConfig.defaultNetworkId],
      showPositions: [networkConfig.defaultNetworkId],
      showShortcuts: [networkConfig.defaultNetworkId],
    },
  },
  [StatsigDynamicConfigs.DAPP_WEBVIEW_CONFIG]: {
    configName: StatsigDynamicConfigs.DAPP_WEBVIEW_CONFIG,
    defaultValues: {
      disabledMediaPlaybackRequiresUserActionOrigins: [] as string[],
    },
  },
  [StatsigDynamicConfigs.SWAP_CONFIG]: {
    configName: StatsigDynamicConfigs.SWAP_CONFIG,
    defaultValues: {
      maxSlippagePercentage: '0.3',
      enableAppFee: false,
      popularTokenIds: [] as string[],
    },
  },
  [StatsigDynamicConfigs.CICO_TOKEN_INFO]: {
    configName: StatsigDynamicConfigs.CICO_TOKEN_INFO,
    defaultValues: {
      tokenInfo: {} as { [tokenId: string]: { cicoOrder: number } },
    },
  },
  [StatsigDynamicConfigs.NFT_CELEBRATION_CONFIG]: {
    configName: StatsigDynamicConfigs.NFT_CELEBRATION_CONFIG,
    defaultValues: {
      celebratedNft: {} as { networkId?: NetworkId; contractAddress?: string },
      deepLink: '',
      rewardExpirationDate: new Date(0).toISOString(),
      rewardReminderDate: new Date(0).toISOString(),
    },
  },
  [StatsigDynamicConfigs.EARN_STABLECOIN_CONFIG]: {
    configName: StatsigDynamicConfigs.EARN_STABLECOIN_CONFIG,
    defaultValues: {
      providerName: 'Aave',
      providerLogoUrl: '',
      providerTermsAndConditionsUrl: '',
      depositGasPadding: 0,
      approveGasPadding: 0,
      withdrawGasPadding: 0,
      rewardsGasPadding: 0,
      moreAavePoolsUrl: '',
    },
  },
  [StatsigDynamicConfigs.APP_CONFIG]: {
    configName: StatsigDynamicConfigs.APP_CONFIG,
    defaultValues: {
      minRequiredVersion: '0.0.0',
      links: {
        web: 'https://tucop.xyz/',
        tos: 'https://tucop.xyz/terminos-y-condiciones/',
        privacy: 'https://tucop.xyz/terminos-y-condiciones/',
        swapLearnMore: 'https://tucop.xyz/',
        transactionFeesLearnMore: 'https://tucop.xyz/',
        inviteRewardsNftsLearnMore: 'https://tucop.xyz/',
        inviteRewardsStableTokenLearnMore: 'https://tucop.xyz/',
        earnStablecoinsLearnMore: 'https://tucop.xyz/',
      },
    },
  },
  [StatsigDynamicConfigs.EARTHQUAKE_DONATION_CONFIG]: {
    configName: StatsigDynamicConfigs.EARTHQUAKE_DONATION_CONFIG,
    defaultValues: {
      // ReFi Colombia Gnosis Safe (Celo mainnet), dedicated to the
      // earthquake donation campaign. Multi-sig, verified on-chain
      // 2026-08-11: 342-byte SafeProxy bytecode, balance 0 CELO / 0 COPm
      // at wire time (fresh Safe spun up specifically for the campaign,
      // separate from any pre-existing ReFi Colombia treasury).
      destinationAddress: '0x8c5F869e1a5A39F378612d69c32E84d0114ab7C5',
      // 20% match: for every 100 pesos donated by the user, ReFi Colombia
      // contributes an additional 20 pesos out of the campaign fund.
      matchPercentage: 20,
      // Amounts in whole COPm (Pesos digitales). Preset chips render as
      // 10.000 / 50.000 / 100.000 / 250.000 / 500.000 pesos in es-419.
      presetAmounts: [10000, 50000, 100000, 250000, 500000] as number[],
      // Social + on-chain verification links. Update Statsig-side when the
      // real handles / Safe explorer are confirmed by ReFi Colombia.
      refiInstagramUrl: 'https://www.instagram.com/reficolombia/',
      refiTwitterUrl: 'https://x.com/ReFiColombia',
      safeExplorerUrl:
        'https://app.safe.global/home?safe=celo:0x8c5F869e1a5A39F378612d69c32E84d0114ab7C5',
    },
  },
  [StatsigDynamicConfigs.EARN_CONFIG]: {
    configName: StatsigDynamicConfigs.EARN_CONFIG,
    defaultValues: {
      supportedPools: [
        `${NetworkId['arbitrum-one']}:0x724dc807b04555b71ed48a6896b6f41593b8c637`,
        // Allbridge USDT
        `${NetworkId['celo-mainnet']}:0xfb2c7c10e731ebe96dabdf4a96d656bfe8e2b5af`,
        // Somm Real Yield ETH
        `${NetworkId['op-mainnet']}:0xc47bb288178ea40bf520a91826a3dee9e0dbfa4c`,
      ],
      supportedAppIds: ['allbridge', 'neeru-vaults'],
    },
  },
} satisfies {
  [key in StatsigDynamicConfigs | StatsigMultiNetworkDynamicConfig]: {
    configName: key
    defaultValues: { [key: string]: StatsigParameter }
  }
}
