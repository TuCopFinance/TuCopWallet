import { showError, showMessage } from 'src/alert/actions'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { store } from 'src/redux/store'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import getLockableViemWallet from 'src/viem/getLockableWallet'
import { getKeychainAccounts } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { Address, parseEventLogs } from 'viem'

import ReFiMedellinUBI from 'src/abis/IReFiMedellinUBI'

const TAG = 'refi/ReFiMedellinUBIContract'

// Dirección del contrato ReFi Medellín UBI
export const REFI_MEDELLIN_UBI_ADDRESS = '0x947c6db1569edc9fd37b017b791ca0f008ab4946' as Address

export interface UBIClaimStatus {
  isBeneficiary: boolean
  hasClaimedThisWeek: boolean
  lastClaimTimestamp?: number
  nextClaimAvailable?: number
}

export class ReFiMedellinUBIContract {
  private static instance: ReFiMedellinUBIContract
  private client = publicClient.celo

  static getInstance(): ReFiMedellinUBIContract {
    if (!ReFiMedellinUBIContract.instance) {
      ReFiMedellinUBIContract.instance = new ReFiMedellinUBIContract()
    }
    return ReFiMedellinUBIContract.instance
  }

  /**
   * Verifica si el contrato está desplegado y funcionando
   */
  async isContractDeployed(): Promise<boolean> {
    try {
      const code = await this.client.getCode({ address: REFI_MEDELLIN_UBI_ADDRESS })
      const isDeployed = !!(code && code !== '0x')
      Logger.debug(TAG, `Contract deployed: ${isDeployed}, code length: ${code?.length || 0}`)
      return isDeployed
    } catch (error) {
      Logger.error(TAG, 'Error checking contract deployment', error)
      return false
    }
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
          address: REFI_MEDELLIN_UBI_ADDRESS,
          abi: ReFiMedellinUBI.abi,
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
      Logger.error(TAG, 'Error checking if can claim this week', error)
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
        Logger.error(TAG, `Contract not deployed at ${REFI_MEDELLIN_UBI_ADDRESS}`)
        throw new Error(`No contract deployed at address ${REFI_MEDELLIN_UBI_ADDRESS}`)
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

      // Intentar obtener información de claims previos
      let lastClaimTimestamp: number | undefined
      let nextClaimAvailable: number | undefined

      try {
        // Buscar eventos de claim más recientes con rango reducido
        const currentBlock = await this.client.getBlockNumber()
        const blocksToSearch = 5000 // Reducir aún más el rango
        const fromBlock = currentBlock - BigInt(blocksToSearch)

        Logger.debug(
          TAG,
          `Searching for claim events from block ${fromBlock} to ${currentBlock} (range: ${blocksToSearch} blocks)`
        )

        const claimEvents = await this.client.getLogs({
          address: REFI_MEDELLIN_UBI_ADDRESS,
          event: {
            type: 'event',
            name: 'SubsidyClaimed',
            inputs: [
              { type: 'address', indexed: true, name: 'beneficiary' },
              { type: 'uint256', indexed: false, name: 'amount' },
            ],
          },
          args: {
            beneficiary: walletAddress,
          },
          fromBlock,
          toBlock: 'latest',
        })

        Logger.debug(TAG, `Found ${claimEvents.length} claim events for address ${walletAddress}`)

        if (claimEvents.length > 0) {
          // Obtener el evento más reciente
          const latestEvent = claimEvents[claimEvents.length - 1]
          const eventArgs = parseEventLogs({
            abi: ReFiMedellinUBI.abi,
            logs: [latestEvent],
          })[0]?.args as any

          if (eventArgs?.timestamp) {
            lastClaimTimestamp = Number(eventArgs.timestamp)
            // Calcular próximo claim disponible (asumiendo 7 días)
            nextClaimAvailable = lastClaimTimestamp + 7 * 24 * 60 * 60
            Logger.debug(TAG, `Last claim: ${new Date(lastClaimTimestamp * 1000).toISOString()}`)
            Logger.debug(
              TAG,
              `Next claim available: ${new Date(nextClaimAvailable * 1000).toISOString()}`
            )
          }
        } else {
          Logger.debug(TAG, 'No recent claim events found in the searched range')
        }
      } catch (error) {
        Logger.warn(TAG, 'Could not fetch claim events, using contract state only:', error)
      }

      return {
        isBeneficiary: true,
        hasClaimedThisWeek: !canClaim,
        lastClaimTimestamp,
        nextClaimAvailable,
      }
    } catch (error) {
      Logger.error(TAG, 'Error getting UBI status', error)
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
        address: REFI_MEDELLIN_UBI_ADDRESS,
        abi: ReFiMedellinUBI.abi,
        functionName: 'isBeneficiary',
        args: [walletAddress],
      })) as boolean

      Logger.debug(TAG, `Address ${walletAddress} is beneficiary: ${isBeneficiaryResult}`)
      return isBeneficiaryResult
    } catch (error) {
      Logger.error(TAG, 'Error checking if address is beneficiary', error)

      // Si el error es que no hay contrato, mostrar un mensaje más específico
      if (error instanceof Error && error.message.includes('No contract deployed')) {
        store.dispatch(showError(ErrorMessages.UBI_CLAIM_ERROR))
      }

      return false
    }
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
        store.dispatch(showError(ErrorMessages.UBI_NOT_BENEFICIARY))
        return { success: false, error: 'Not a beneficiary' }
      }

      if (ubiStatus.hasClaimedThisWeek) {
        Logger.warn(TAG, `Address ${walletAddress} has already claimed this week`)
        const nextClaimDate = ubiStatus.nextClaimAvailable
          ? new Date(ubiStatus.nextClaimAvailable * 1000).toLocaleDateString()
          : 'próxima semana'
        store.dispatch(showError(ErrorMessages.UBI_ALREADY_CLAIMED))
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
        Logger.error(TAG, `Could not create wallet for address ${walletAddress}`)
        throw new Error(`Could not create wallet for address ${walletAddress}`)
      }

      Logger.debug(TAG, 'Unlocking wallet account...')

      // Desbloquear la cuenta
      const unlocked = await wallet.unlockAccount(passphrase, 300)
      if (!unlocked) {
        throw new Error('No se pudo desbloquear la cuenta')
      }

      Logger.debug(TAG, 'Executing claim transaction...')

      // Ejecutar la transacción de claim
      const claimTx = await (wallet as any).writeContract({
        address: REFI_MEDELLIN_UBI_ADDRESS,
        abi: ReFiMedellinUBI.abi,
        functionName: 'claimSubsidy',
        args: [],
      })

      Logger.debug(TAG, `Claim transaction submitted: ${claimTx}`)

      // Esperar confirmación
      const receipt = await this.client.waitForTransactionReceipt({
        hash: claimTx,
        timeout: 60000, // 60 segundos timeout
      })

      Logger.debug(TAG, `Transaction confirmed in block ${receipt.blockNumber}`)

      // Parsear eventos usando viem
      const parsedLogs = parseEventLogs({
        abi: ReFiMedellinUBI.abi,
        logs: receipt.logs,
      })

      Logger.debug(TAG, `Parsed ${parsedLogs.length} events from transaction`)

      // Buscar el evento SubsidyClaimed
      const claimEvent = parsedLogs.find((log) => log.eventName === 'SubsidyClaimed')

      if (claimEvent) {
        const { beneficiary, amount } = claimEvent.args as { beneficiary: Address; amount: bigint }
        Logger.debug(
          TAG,
          `SubsidyClaimed event found: beneficiary=${beneficiary}, amount=${amount}`
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
      Logger.error(TAG, 'Error claiming UBI subsidy', error)

      let errorMessage = 'Error desconocido'

      if (error instanceof Error) {
        errorMessage = error.message

        // Detectar errores específicos del contrato
        if (errorMessage.includes('Cannot claim yet')) {
          Logger.warn(TAG, 'User tried to claim but cannot claim yet (already claimed this week)')
          store.dispatch(showError(ErrorMessages.UBI_ALREADY_CLAIMED))
          return { success: false, error: 'Ya has reclamado tu subsidio esta semana' }
        } else if (errorMessage.includes('already claimed')) {
          Logger.warn(TAG, 'User has already claimed this week')
          store.dispatch(showError(ErrorMessages.UBI_ALREADY_CLAIMED))
          return { success: false, error: 'Ya has reclamado tu subsidio esta semana' }
        } else if (
          errorMessage.includes('Not beneficiary') ||
          errorMessage.includes('not eligible')
        ) {
          Logger.warn(TAG, 'User is not a beneficiary')
          store.dispatch(showError(ErrorMessages.UBI_NOT_BENEFICIARY))
          return { success: false, error: 'No eres elegible para este subsidio' }
        } else if (errorMessage.includes('insufficient funds')) {
          Logger.warn(TAG, 'Insufficient funds for gas')
          store.dispatch(showError(ErrorMessages.INSUFFICIENT_FUNDS_FOR_GAS))
          return { success: false, error: 'Fondos insuficientes para pagar las tarifas de gas' }
        } else if (errorMessage.includes('User rejected') || errorMessage.includes('cancelled')) {
          Logger.info(TAG, 'Transaction cancelled by user')
          return { success: false, error: 'Transacción cancelada por el usuario' }
        }
      }

      // Error genérico
      Logger.error(TAG, 'Unknown error during claim:', errorMessage)
      store.dispatch(showError(ErrorMessages.UBI_CLAIM_ERROR))
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Función de debug para obtener información del contrato
   */
  async debugContractInfo(): Promise<void> {
    try {
      Logger.debug(TAG, '=== DEBUG CONTRACT INFO ===')
      Logger.debug(TAG, `Contract address: ${REFI_MEDELLIN_UBI_ADDRESS}`)

      const isDeployed = await this.isContractDeployed()
      Logger.debug(TAG, `Contract deployed: ${isDeployed}`)

      if (isDeployed) {
        const currentBlock = await this.client.getBlockNumber()
        Logger.debug(TAG, `Current block: ${currentBlock}`)

        // Intentar obtener algunos eventos recientes con un rango más pequeño
        try {
          const recentEvents = await this.client.getLogs({
            address: REFI_MEDELLIN_UBI_ADDRESS,
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
      Logger.error(TAG, 'Error in debug info', error)
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
        Logger.error(TAG, `Contract not deployed at ${REFI_MEDELLIN_UBI_ADDRESS}`)
        throw new Error(`No contract deployed at address ${REFI_MEDELLIN_UBI_ADDRESS}`)
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
      Logger.error(TAG, 'Error getting basic UBI status', error)
      throw error
    }
  }
}

export default ReFiMedellinUBIContract.getInstance()
