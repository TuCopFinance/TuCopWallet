import { showMessage } from 'src/alert/actions'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { showErrorMessage } from 'src/components/ErrorMessage'
import { store } from 'src/redux/store'
import { captureBusinessError } from 'src/sentry/captureBusinessError'
import { addTxSubmittedBreadcrumb } from 'src/sentry/breadcrumbs'
import { feeCurrenciesSelector } from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import getLockableViemWallet from 'src/viem/getLockableWallet'
import { PreparedTransactionsResult, prepareTransactions } from 'src/viem/prepareTransactions'
import { getKeychainAccounts } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { Address, encodeFunctionData, parseEventLogs } from 'viem'

import ReFiColombiaSubsidies from 'src/abis/IReFiColombiaSubsidies'
import { getLastClaimTimestamp } from 'src/subsidies/subsidyEventHistory'

const TAG = 'subsidies/ReFiColombiaSubsidiesContract'

// Dirección del contrato ReFi Colombia Subsidies
export const REFI_COLOMBIA_SUBSIDIES_ADDRESS =
  '0x947c6db1569edc9fd37b017b791ca0f008ab4946' as Address

export interface UBIClaimStatus {
  isBeneficiary: boolean
  hasClaimedThisWeek: boolean
  lastClaimTimestamp?: number
  nextClaimAvailable?: number
}

export class ReFiColombiaSubsidiesContract {
  private static instance: ReFiColombiaSubsidiesContract
  private client = publicClient.celo

  static getInstance(): ReFiColombiaSubsidiesContract {
    if (!ReFiColombiaSubsidiesContract.instance) {
      ReFiColombiaSubsidiesContract.instance = new ReFiColombiaSubsidiesContract()
    }
    return ReFiColombiaSubsidiesContract.instance
  }

  /**
   * Verifica si el contrato está desplegado.
   * Lanza el error original de viem (URL, método, etc.) si el RPC falla,
   * para evitar el mensaje engañoso "No contract deployed" cuando el problema es de red.
   */
  async isContractDeployed(): Promise<boolean> {
    const code = await this.client.getCode({ address: REFI_COLOMBIA_SUBSIDIES_ADDRESS })
    const isDeployed = !!(code && code !== '0x')
    Logger.debug(TAG, `Contract deployed: ${isDeployed}, code length: ${code?.length || 0}`)
    return isDeployed
  }

  /**
   * Función para verificar si puede reclamar directamente del contrato
   */
  async canClaimThisWeek(address: Address): Promise<boolean> {
    try {
      Logger.debug(TAG, `Checking if ${address} can claim this week`)

      // Intentar hacer una llamada de prueba para ver si puede reclamar
      try {
        await this.client.simulateContract({
          address: REFI_COLOMBIA_SUBSIDIES_ADDRESS,
          abi: ReFiColombiaSubsidies.abi,
          functionName: 'claimSubsidy',
          args: [],
          account: address,
        })
        return true // Si la simulación pasa, puede reclamar
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (
          errorMessage.includes('Cannot claim yet') ||
          errorMessage.includes('already claimed') ||
          errorMessage.includes('too soon')
        ) {
          return false
        }
        // Otros errores podrían ser por falta de fondos, etc.
        Logger.warn(TAG, 'Simulation error (might still be able to claim):', errorMessage)
        return true
      }
    } catch (error) {
      Logger.warn(TAG, 'Error checking if can claim this week')
      captureBusinessError(error, {
        feature: 'subsidies',
        provider: 'refi-colombia-subsidies',
        action: 'can_claim_this_week',
        errorCode: 'simulate_failed',
      })
      return false
    }
  }

  /**
   * Obtiene el estado completo del UBI para una dirección
   */
  async getUBIStatus(walletAddress: Address): Promise<UBIClaimStatus> {
    try {
      Logger.debug(TAG, `Getting UBI status for address ${walletAddress}`)

      // Verificar si el contrato está desplegado
      const isDeployed = await this.isContractDeployed()
      if (!isDeployed) {
        Logger.warn(TAG, `Contract not deployed at ${REFI_COLOMBIA_SUBSIDIES_ADDRESS}`)
        throw new Error(`No contract deployed at address ${REFI_COLOMBIA_SUBSIDIES_ADDRESS}`)
      }

      // Verificar si es beneficiario
      const isBeneficiary = await this.isBeneficiary(walletAddress)

      if (!isBeneficiary) {
        return {
          isBeneficiary: false,
          hasClaimedThisWeek: false,
          lastClaimTimestamp: undefined,
          nextClaimAvailable: undefined,
        }
      }

      // Verificar si puede reclamar esta semana
      const canClaim = await this.canClaimThisWeek(walletAddress)
      Logger.debug(TAG, `Can claim this week: ${canClaim}`)

      const lastClaimTimestamp = await getLastClaimTimestamp(walletAddress)
      const nextClaimAvailable =
        lastClaimTimestamp !== undefined ? lastClaimTimestamp + 7 * 24 * 60 * 60 : undefined

      if (lastClaimTimestamp !== undefined) {
        Logger.debug(TAG, `Last claim: ${new Date(lastClaimTimestamp * 1000).toISOString()}`)
      }

      return {
        isBeneficiary: true,
        hasClaimedThisWeek: !canClaim,
        lastClaimTimestamp,
        nextClaimAvailable,
      }
    } catch (error) {
      Logger.warn(TAG, 'Error getting UBI status, falling back to basic status')
      captureBusinessError(error, {
        feature: 'subsidies',
        provider: 'refi-colombia-subsidies',
        action: 'get_ubi_status',
        errorCode:
          error instanceof Error && error.message.includes('No contract deployed')
            ? 'contract_not_deployed'
            : 'rpc_error',
      })
      return this.getBasicUBIStatus(walletAddress)
    }
  }

  /**
   * Verifica si la dirección es beneficiaria del UBI
   */
  async isBeneficiary(walletAddress: Address): Promise<boolean> {
    try {
      Logger.debug(TAG, `Checking if address ${walletAddress} is beneficiary`)

      const isBeneficiaryResult = (await this.client.readContract({
        address: REFI_COLOMBIA_SUBSIDIES_ADDRESS,
        abi: ReFiColombiaSubsidies.abi,
        functionName: 'isBeneficiary',
        args: [walletAddress],
      })) as boolean

      Logger.debug(TAG, `Address ${walletAddress} is beneficiary: ${isBeneficiaryResult}`)
      return isBeneficiaryResult
    } catch (error) {
      Logger.warn(TAG, 'Error checking if address is beneficiary')
      captureBusinessError(error, {
        feature: 'subsidies',
        provider: 'refi-colombia-subsidies',
        action: 'is_beneficiary',
        errorCode:
          error instanceof Error && error.message.includes('No contract deployed')
            ? 'contract_not_deployed'
            : 'rpc_error',
      })

      // Si el error es que no hay contrato, mostrar un mensaje más específico
      if (error instanceof Error && error.message.includes('No contract deployed')) {
        showErrorMessage({
          error,
          context: { screen: 'subsidies', action: 'isBeneficiary' },
          variant: 'sheet',
        })
      }

      return false
    }
  }

  /**
   * Encode the claim call + run prepareTransactions against Celo mainnet
   * fee currencies. Returns the same PreparedTransactionsResult shape used
   * by swap/send so callers can either display a fee preview
   * (FeeSummary) or forward it into a signer. Isolated from claimSubsidy so
   * the screen can render the network fee before the user commits.
   *
   * feeCurrencies is a parameter (not read from store) so this method stays
   * pure and testable, and so a screen can pass a curated subset if needed.
   */
  async prepareClaimTransaction(
    walletAddress: Address,
    feeCurrencies: TokenBalance[]
  ): Promise<PreparedTransactionsResult> {
    const claimCallData = encodeFunctionData({
      abi: ReFiColombiaSubsidies.abi,
      functionName: 'claimSubsidy',
      args: [],
    })
    return prepareTransactions({
      feeCurrencies,
      baseTransactions: [
        {
          from: walletAddress,
          to: REFI_COLOMBIA_SUBSIDIES_ADDRESS,
          data: claimCallData,
        },
      ],
      origin: 'subsidies',
    })
  }

  /**
   * Reclama el subsidio UBI con mejor debug y manejo de errores
   */
  async claimSubsidy(
    walletAddress: Address,
    passphrase: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      Logger.debug(TAG, `Starting UBI claim process for address ${walletAddress}`)

      // Verificar el estado completo antes de proceder
      const ubiStatus = await this.getUBIStatus(walletAddress)

      if (!ubiStatus.isBeneficiary) {
        Logger.warn(TAG, `Address ${walletAddress} is not a beneficiary`)
        showErrorMessage({
          error: new Error(ErrorMessages.UBI_NOT_BENEFICIARY),
          context: { screen: 'subsidies', action: 'claimSubsidy' },
          variant: 'sheet',
        })
        return { success: false, error: 'Not a beneficiary' }
      }

      if (ubiStatus.hasClaimedThisWeek) {
        Logger.warn(TAG, `Address ${walletAddress} has already claimed this week`)
        const nextClaimDate = ubiStatus.nextClaimAvailable
          ? new Date(ubiStatus.nextClaimAvailable * 1000).toLocaleDateString()
          : 'proxima semana'
        showErrorMessage({
          error: new Error(ErrorMessages.UBI_ALREADY_CLAIMED),
          context: { screen: 'subsidies', action: 'claimSubsidy' },
          variant: 'sheet',
        })
        return {
          success: false,
          error: `Already claimed this week. Next claim available: ${nextClaimDate}`,
        }
      }

      // Obtener la cuenta y crear el wallet
      const chain = networkConfig.viemChain.celo
      const accounts = await getKeychainAccounts()
      const wallet = getLockableViemWallet(accounts, chain, walletAddress)

      if (!wallet) {
        Logger.warn(TAG, `Could not create wallet for address ${walletAddress}`)
        throw new Error(`Could not create wallet for address ${walletAddress}`)
      }

      Logger.debug(TAG, 'Unlocking wallet account...')

      // Desbloquear la cuenta
      const unlocked = await wallet.unlockAccount(passphrase, 300)
      if (!unlocked) {
        throw new Error('No se pudo desbloquear la cuenta')
      }

      Logger.debug(TAG, 'Preparing claim transaction...')

      const feeCurrencies = feeCurrenciesSelector(
        store.getState() as any,
        NetworkId['celo-mainnet']
      )

      Logger.debug(
        TAG,
        `Preparing claim transaction with ${feeCurrencies.length} candidate fee currencies`
      )

      const prepared = await this.prepareClaimTransaction(walletAddress, feeCurrencies)

      if (prepared.type !== 'possible') {
        Logger.warn(TAG, `Cannot prepare claim transaction: ${prepared.type}`)
        captureBusinessError(new Error(`prepare_${prepared.type}`), {
          feature: 'subsidies',
          provider: 'refi-colombia-subsidies',
          action: 'claim_subsidy',
          errorCode: 'insufficient_gas',
          extra: { prepareType: prepared.type },
        })
        showErrorMessage({
          error: new Error(ErrorMessages.INSUFFICIENT_FUNDS_FOR_GAS),
          context: { screen: 'subsidies', action: 'prepareClaimTransaction' },
          variant: 'sheet',
        })
        return {
          success: false,
          error: 'Not enough balance to pay for gas in any supported fee currency',
        }
      }

      Logger.debug(
        TAG,
        `Sending claim transaction with feeCurrency ${prepared.feeCurrency.symbol} (${prepared.feeCurrency.tokenId})`
      )
      addTxSubmittedBreadcrumb({
        feature: 'subsidies',
        feeCurrencySymbol: prepared.feeCurrency.symbol,
        networkId: NetworkId['celo-mainnet'],
      })

      const claimTx = await wallet.sendTransaction(prepared.transactions[0] as any)

      Logger.debug(TAG, `Claim transaction submitted: ${claimTx}`)

      // Esperar confirmación
      const receipt = await this.client.waitForTransactionReceipt({
        hash: claimTx,
        timeout: 60000, // 60 segundos timeout
      })

      Logger.debug(TAG, `Transaction confirmed in block ${receipt.blockNumber}`)

      // Parsear eventos usando viem
      const parsedLogs = parseEventLogs({
        abi: ReFiColombiaSubsidies.abi,
        logs: receipt.logs,
      })

      Logger.debug(TAG, `Parsed ${parsedLogs.length} events from transaction`)

      // Buscar el evento SubsidyClaimed
      const claimEvent = parsedLogs.find((log) => log.eventName === 'SubsidyClaimed')

      if (claimEvent) {
        const { beneficiaryAddress, amount, contractBalance } = claimEvent.args as {
          beneficiaryAddress: Address
          amount: bigint
          contractBalance: bigint
        }
        Logger.debug(
          TAG,
          `SubsidyClaimed event found: beneficiary=${beneficiaryAddress}, amount=${amount}, contractBalance=${contractBalance}`
        )

        store.dispatch(
          showMessage(
            'Tu subsidio ha sido reclamado exitosamente. Por favor actualiza y revisa tu saldo. Puedes regresar la próxima semana para reclamar nuevamente.'
          )
        )
        return { success: true, txHash: claimTx }
      } else {
        Logger.warn(TAG, 'Transaction succeeded but no SubsidyClaimed event found')
        Logger.debug(TAG, 'All parsed events:', parsedLogs)

        store.dispatch(
          showMessage(
            'Transacción completada, pero no se encontró el evento de reclamación. Verifica tu saldo.'
          )
        )
        return { success: true, txHash: claimTx }
      }
    } catch (error) {
      // Classify into a stable errorCode BEFORE calling captureBusinessError
      // so Sentry fingerprint groups the same failure across users regardless
      // of message wording. Only known-safe strings feed the tag; unknown
      // errors fall through to 'unknown' which still gets a Sentry event.
      const errorMessage = error instanceof Error ? error.message : String(error)
      let errorCode:
        | 'already_claimed_this_week'
        | 'not_beneficiary'
        | 'insufficient_gas'
        | 'user_cancelled'
        | 'contract_not_deployed'
        | 'wallet_locked'
        | 'receipt_timeout'
        | 'unknown' = 'unknown'
      if (errorMessage.includes('Cannot claim yet') || errorMessage.includes('already claimed')) {
        errorCode = 'already_claimed_this_week'
      } else if (
        errorMessage.includes('Not beneficiary') ||
        errorMessage.includes('not eligible')
      ) {
        errorCode = 'not_beneficiary'
      } else if (errorMessage.includes('insufficient funds')) {
        errorCode = 'insufficient_gas'
      } else if (errorMessage.includes('User rejected') || errorMessage.includes('cancelled')) {
        errorCode = 'user_cancelled'
      } else if (errorMessage.includes('No contract deployed')) {
        errorCode = 'contract_not_deployed'
      } else if (errorMessage.includes('desbloquear')) {
        errorCode = 'wallet_locked'
      } else if (errorMessage.toLowerCase().includes('timeout')) {
        errorCode = 'receipt_timeout'
      }
      // user_cancelled is not a bug -> skip Sentry; log locally for debug.
      if (errorCode === 'user_cancelled') {
        Logger.info(TAG, 'Transaction cancelled by user')
        return { success: false, error: 'Transacción cancelada por el usuario' }
      }
      captureBusinessError(error, {
        feature: 'subsidies',
        provider: 'refi-colombia-subsidies',
        action: 'claim_subsidy',
        errorCode,
      })
      Logger.warn(TAG, `Claim failed [${errorCode}]`)
      // User-facing sheet. The underlying error was already normalized by
      // errorCode above; sheet copy comes from ErrorMessages so users never
      // see raw exception messages (RPC 'internal error' text etc).
      let uiError: Error
      switch (errorCode) {
        case 'already_claimed_this_week':
          uiError = new Error(ErrorMessages.UBI_ALREADY_CLAIMED)
          break
        case 'not_beneficiary':
          uiError = new Error(ErrorMessages.UBI_NOT_BENEFICIARY)
          break
        case 'insufficient_gas':
          uiError = new Error(ErrorMessages.INSUFFICIENT_FUNDS_FOR_GAS)
          break
        default:
          uiError = error instanceof Error ? error : new Error(errorMessage)
      }
      showErrorMessage({
        error: uiError,
        context: { screen: 'subsidies', action: 'claimSubsidy' },
        variant: 'sheet',
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Función de debug para obtener información del contrato
   */
  async debugContractInfo(): Promise<void> {
    try {
      Logger.debug(TAG, '=== DEBUG CONTRACT INFO ===')
      Logger.debug(TAG, `Contract address: ${REFI_COLOMBIA_SUBSIDIES_ADDRESS}`)

      const isDeployed = await this.isContractDeployed()
      Logger.debug(TAG, `Contract deployed: ${isDeployed}`)

      if (isDeployed) {
        const currentBlock = await this.client.getBlockNumber()
        Logger.debug(TAG, `Current block: ${currentBlock}`)

        // Intentar obtener algunos eventos recientes con un rango más pequeño
        try {
          const recentEvents = await this.client.getLogs({
            address: REFI_COLOMBIA_SUBSIDIES_ADDRESS,
            fromBlock: currentBlock - BigInt(1000), // Solo últimos 1000 bloques
            toBlock: 'latest',
          })
          Logger.debug(TAG, `Recent events in last 1000 blocks: ${recentEvents.length}`)
        } catch (eventError) {
          Logger.debug(
            TAG,
            'Could not fetch recent events (this is normal if block range is too large):',
            eventError
          )
        }
      }

      Logger.debug(TAG, '=== END DEBUG INFO ===')
    } catch (error) {
      Logger.warn(TAG, 'Error in debug info (non-fatal, debug panel only)')
    }
  }

  /**
   * Obtiene el estado básico del UBI (solo verifica si es beneficiario)
   * Función de fallback cuando no se pueden obtener eventos
   */
  async getBasicUBIStatus(walletAddress: Address): Promise<UBIClaimStatus> {
    try {
      Logger.debug(TAG, `Getting basic UBI status for address ${walletAddress}`)

      // Verificar si el contrato está desplegado
      const isDeployed = await this.isContractDeployed()
      if (!isDeployed) {
        Logger.warn(TAG, `Contract not deployed at ${REFI_COLOMBIA_SUBSIDIES_ADDRESS}`)
        throw new Error(`No contract deployed at address ${REFI_COLOMBIA_SUBSIDIES_ADDRESS}`)
      }

      // Verificar si es beneficiario
      const isBeneficiary = await this.isBeneficiary(walletAddress)

      return {
        isBeneficiary,
        hasClaimedThisWeek: false, // No podemos determinar esto sin eventos
        lastClaimTimestamp: undefined,
        nextClaimAvailable: undefined,
      }
    } catch (error) {
      Logger.warn(TAG, 'Error getting basic UBI status')
      captureBusinessError(error, {
        feature: 'subsidies',
        provider: 'refi-colombia-subsidies',
        action: 'get_basic_ubi_status',
        errorCode:
          error instanceof Error && error.message.includes('No contract deployed')
            ? 'contract_not_deployed'
            : 'rpc_error',
      })
      throw error
    }
  }
}

export default ReFiColombiaSubsidiesContract.getInstance()
