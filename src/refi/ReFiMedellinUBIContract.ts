import { showError, showMessage } from 'src/alert/actions'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { store } from 'src/redux/store'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import getLockableViemWallet from 'src/viem/getLockableWallet'
import { getKeychainAccounts } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { Address, Log } from 'viem'

import ReFiMedellinUBI from 'src/abis/IReFiMedellinUBI'

const TAG = 'refi/ReFiMedellinUBIContract'

// Dirección del contrato ReFi Medellín UBI
export const REFI_MEDELLIN_UBI_ADDRESS = '0x947c6db1569edc9fd37b017b791ca0f008ab4946' as Address

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
   * Verifica si la dirección es beneficiaria del UBI
   */
  async isBeneficiary(walletAddress: Address): Promise<boolean> {
    try {
      Logger.debug(TAG, `Checking if address ${walletAddress} is beneficiary`)

      const isBeneficiary = (await this.client.readContract({
        address: REFI_MEDELLIN_UBI_ADDRESS,
        abi: ReFiMedellinUBI.abi,
        functionName: 'isbeneficiary',
        args: [walletAddress],
      })) as boolean

      Logger.debug(TAG, `Address ${walletAddress} is beneficiary: ${isBeneficiary}`)
      return isBeneficiary
    } catch (error) {
      Logger.error(TAG, 'Error checking if address is beneficiary', error)
      return false
    }
  }

  /**
   * Reclama el subsidio UBI
   */
  async claimSubsidy(
    walletAddress: Address,
    passphrase: string
  ): Promise<{ success: boolean; txHash?: string }> {
    try {
      Logger.debug(TAG, `Claiming UBI subsidy for address ${walletAddress}`)

      // Verificar primero si es beneficiario
      const isBeneficiary = await this.isBeneficiary(walletAddress)
      if (!isBeneficiary) {
        Logger.warn(TAG, `Address ${walletAddress} is not a beneficiary`)
        store.dispatch(showError(ErrorMessages.UBI_NOT_BENEFICIARY))
        return { success: false }
      }

      // Obtener la cuenta y crear el wallet
      const chain = networkConfig.viemChain.celo
      const accounts = await getKeychainAccounts()
      const wallet = getLockableViemWallet(accounts, chain, walletAddress)

      if (!wallet) {
        Logger.error(TAG, `Could not create wallet for address ${walletAddress}`)
        throw new Error(`Could not create wallet for address ${walletAddress}`)
      }

      // Desbloquear la cuenta
      const unlocked = await wallet.unlockAccount(passphrase, 300)
      if (!unlocked) {
        throw new Error('No se pudo desbloquear la cuenta')
      }

      // Ejecutar la transacción de claim
      const claimTx = await (wallet as any).writeContract({
        address: REFI_MEDELLIN_UBI_ADDRESS,
        abi: ReFiMedellinUBI.abi,
        functionName: 'claimsubsidy',
        args: [],
      })

      Logger.debug(TAG, `Claim transaction hash: ${claimTx}`)

      // Esperar confirmación
      const receipt = await this.client.waitForTransactionReceipt({ hash: claimTx })
      Logger.debug(TAG, 'UBI claim successful!')

      // Verificar si hubo un evento de claim exitoso
      const claimEvent = receipt.logs.find((log: Log) => {
        try {
          // Simplemente verificar si el log viene del contrato correcto
          return log.address.toLowerCase() === REFI_MEDELLIN_UBI_ADDRESS.toLowerCase()
        } catch {
          return false
        }
      })

      if (claimEvent) {
        store.dispatch(
          showMessage(
            'Tu subsidio ha sido reclamado, por favor actualiza y revisa tu saldo, puedes regresar la próxima semana'
          )
        )
        return { success: true, txHash: claimTx }
      } else {
        Logger.warn(TAG, 'Transaction succeeded but no SubsidyClaimed event found')
        store.dispatch(
          showMessage('Transacción completada, pero no se encontró el evento de reclamación')
        )
        return { success: true, txHash: claimTx }
      }
    } catch (error) {
      Logger.error(TAG, 'Error claiming UBI subsidy', error)
      if (error instanceof Error && error.message.includes('revert')) {
        store.dispatch(showError(ErrorMessages.UBI_ALREADY_CLAIMED))
      } else {
        store.dispatch(showError(ErrorMessages.UBI_CLAIM_ERROR))
      }
      return { success: false }
    }
  }
}

export default ReFiMedellinUBIContract.getInstance()
