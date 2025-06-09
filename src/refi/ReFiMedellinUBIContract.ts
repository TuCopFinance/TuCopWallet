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
        }
      }

      // Buscar eventos de claim recientes para esta dirección
      const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
      const currentBlock = await this.client.getBlockNumber()

      // Reducir el rango de búsqueda para evitar el límite del RPC
      // En Celo, aproximadamente 1 bloque cada 5 segundos
      // 7 días = 604,800 segundos / 5 = 120,960 bloques
      // Limitamos a 10,000 bloques (aproximadamente 14 horas) para evitar el límite
      const maxBlockRange = BigInt(10000)
      const fromBlock = currentBlock - maxBlockRange

      Logger.debug(
        TAG,
        `Searching for claim events from block ${fromBlock} to ${currentBlock} (range: ${maxBlockRange} blocks)`
      )

      let claimEvents: any[] = []

      try {
        claimEvents = await this.client.getLogs({
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
      } catch (eventError) {
        Logger.warn(TAG, 'Could not fetch claim events, assuming no recent claims:', eventError)
        // Si no podemos obtener eventos, asumimos que no hay claims recientes
        claimEvents = []
      }

      Logger.debug(TAG, `Found ${claimEvents.length} claim events for address ${walletAddress}`)

      let lastClaimTimestamp: number | undefined
      let hasClaimedThisWeek = false

      if (claimEvents.length > 0) {
        // Obtener el timestamp del último claim
        const lastEvent = claimEvents[claimEvents.length - 1]
        const block = await this.client.getBlock({ blockHash: lastEvent.blockHash! })
        lastClaimTimestamp = Number(block.timestamp)

        // Verificar si fue en la última semana
        hasClaimedThisWeek = lastClaimTimestamp > oneWeekAgo

        Logger.debug(
          TAG,
          `Last claim timestamp: ${lastClaimTimestamp}, claimed this week: ${hasClaimedThisWeek}`
        )
      } else {
        Logger.debug(TAG, 'No recent claim events found in the searched range')
      }

      const nextClaimAvailable = lastClaimTimestamp
        ? lastClaimTimestamp + 7 * 24 * 60 * 60
        : undefined

      return {
        isBeneficiary: true,
        hasClaimedThisWeek,
        lastClaimTimestamp,
        nextClaimAvailable,
      }
    } catch (error) {
      Logger.error(TAG, 'Error getting UBI status', error)
      throw error
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

        // Detectar diferentes tipos de errores
        if (error.message.includes('revert')) {
          if (error.message.includes('Already claimed') || error.message.includes('too soon')) {
            store.dispatch(showError(ErrorMessages.UBI_ALREADY_CLAIMED))
            return { success: false, error: 'Already claimed this week' }
          } else if (
            error.message.includes('Not beneficiary') ||
            error.message.includes('not eligible')
          ) {
            store.dispatch(showError(ErrorMessages.UBI_NOT_BENEFICIARY))
            return { success: false, error: 'Not a beneficiary' }
          }
        } else if (error.message.includes('User rejected') || error.message.includes('cancelled')) {
          return { success: false, error: 'Transaction cancelled by user' }
        } else if (error.message.includes('insufficient funds')) {
          store.dispatch(showError(ErrorMessages.INSUFFICIENT_FUNDS_FOR_GAS))
          return { success: false, error: 'Insufficient funds for gas' }
        }
      }

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
