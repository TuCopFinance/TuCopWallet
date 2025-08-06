import { jumpstartClaim } from 'src/jumpstart/saga'
import Logger from 'src/utils/Logger'
import { getDynamicConfigParams } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs } from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'
import { Address, Hex } from 'viem'
import { call, delay, put } from 'typed-redux-saga'

const TAG = 'jumpstart/newWalletFunding'

export interface NewWalletFundingConfig {
  enabled: boolean
  delayMs: number
  retryAttempts: number
  retryDelayMs: number
  networkIds: NetworkId[]
}

export const DEFAULT_NEW_WALLET_FUNDING_CONFIG: NewWalletFundingConfig = {
  enabled: true,
  delayMs: 5000, // Wait 5 seconds after wallet creation
  retryAttempts: 3,
  retryDelayMs: 10000, // 10 seconds between retries
  networkIds: [NetworkId['celo-mainnet'], NetworkId['celo-alfajores']],
}

export function* attemptNewWalletFunding(
  privateKey: Hex,
  walletAddress: Address,
  config: NewWalletFundingConfig = DEFAULT_NEW_WALLET_FUNDING_CONFIG
) {
  if (!config.enabled) {
    Logger.debug(TAG, 'New wallet funding is disabled')
    return
  }

  try {
    Logger.debug(TAG, 'Attempting new wallet funding')

    // Wait a bit to ensure wallet is fully initialized
    yield* delay(config.delayMs)

    // Get jumpstart configuration
    const jumpstartConfig = getDynamicConfigParams(
      DynamicConfigs[StatsigDynamicConfigs.WALLET_JUMPSTART_CONFIG]
    )

    if (!jumpstartConfig?.jumpstartContracts) {
      Logger.warn(TAG, 'Jumpstart contracts configuration not found')
      return
    }

    let fundingSuccess = false

    for (const networkId of config.networkIds) {
      const contractConfig = jumpstartConfig.jumpstartContracts[networkId]

      if (!contractConfig?.contractAddress) {
        Logger.debug(TAG, `No jumpstart contract for network ${networkId}`)
        continue
      }

      for (let attempt = 0; attempt < config.retryAttempts; attempt++) {
        try {
          Logger.debug(TAG, `Attempting jumpstart claim on ${networkId}, attempt ${attempt + 1}`)

          yield* call(jumpstartClaim, privateKey, networkId, walletAddress)

          fundingSuccess = true
          Logger.info(TAG, `Successfully claimed jumpstart funding on ${networkId}`)
          break
        } catch (error: any) {
          // If already claimed, that's fine - don't retry
          if (error?.message?.includes('Already claimed')) {
            Logger.debug(TAG, `Jumpstart already claimed on ${networkId}`)
            fundingSuccess = true
            break
          }

          Logger.warn(
            TAG,
            `Failed to claim jumpstart on ${networkId}, attempt ${attempt + 1}:`,
            error?.message
          )

          // Wait before retry (except on last attempt)
          if (attempt < config.retryAttempts - 1) {
            yield* delay(config.retryDelayMs)
          }
        }
      }

      // If we successfully funded on one network, that's enough
      if (fundingSuccess) {
        break
      }
    }

    if (!fundingSuccess) {
      Logger.warn(TAG, 'Failed to claim jumpstart funding on any network')
    }
  } catch (error) {
    Logger.error(TAG, 'Unexpected error in new wallet funding:', error)
  }
}

export function* checkAndFundNewWallet(
  privateKey: Hex,
  walletAddress: Address,
  isNewWallet: boolean
) {
  if (!isNewWallet) {
    Logger.debug(TAG, 'Not a new wallet, skipping funding check')
    return
  }

  // Run funding attempt in background (non-blocking)
  yield* call(attemptNewWalletFunding, privateKey, walletAddress)
}
