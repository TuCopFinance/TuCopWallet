import { showError } from 'src/alert/actions'
import { ErrorMessages } from 'src/app/ErrorMessages'
import i18n from 'src/i18n'
import { store } from 'src/redux/store'
import { NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import getLockableViemWallet from 'src/viem/getLockableWallet'
import { getKeychainAccounts } from 'src/web3/contracts'
import networkConfig, { networkIdToNetwork } from 'src/web3/networkConfig'
import { Address, formatEther, parseEther, parseUnits } from 'viem'

import cCOPStaking from 'src/abis/ICCOPStaking'
import IERC20 from 'src/abis/IERC20'

const TAG = 'earn/marranitos/MarranitosContract'

// Direcciones de contratos
export const STAKING_ADDRESS = '0x33F9D44eef92314dAE345Aa64763B01cf484F3C6' as Address
const TOKEN_ADDRESS = '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as Address

// Duración de staking en segundos
export const STAKING_DURATIONS = {
  DAYS_30: 2592000, // 30 días
  DAYS_60: 5184000, // 60 días
  DAYS_90: 7776000, // 90 días
}

// Interfaz para los stakes
export interface Stake {
  amount: bigint
  startTime: bigint
  endTime: bigint
  duration: bigint
  claimed: boolean
  index?: number
}

///

export class MarranitosContract {
  private static instance: MarranitosContract
  private client = publicClient[networkIdToNetwork[NetworkId['celo-mainnet']]]

  public static getInstance(): MarranitosContract {
    if (!MarranitosContract.instance) {
      MarranitosContract.instance = new MarranitosContract()
    }
    return MarranitosContract.instance
  }

  /**
   * Obtiene los stakes del usuario
   */
  async getUserStakes(walletAddress: Address): Promise<Stake[]> {
    try {
      Logger.debug(TAG, `Getting stakes for user: ${walletAddress}`)

      const stakes = (await this.client.readContract({
        address: STAKING_ADDRESS,
        abi: cCOPStaking.abi,
        functionName: 'getUserStakes',
        args: [walletAddress],
      })) as any[]

      Logger.debug(TAG, `Found ${stakes.length} stakes`)
      return stakes as unknown as Stake[]
    } catch (error) {
      Logger.error(TAG, 'Error getting user stakes', error)
      return []
    }
  }

  /**
   * Obtiene el balance de tokens CCOP del usuario
   */
  async getTokenBalance(walletAddress: Address): Promise<string> {
    try {
      Logger.debug(TAG, `Getting token balance for: ${walletAddress}`)

      // Ensure wallet address is properly formatted
      const formattedWalletAddress = walletAddress as Address

      const balance = (await this.client.readContract({
        address: TOKEN_ADDRESS,
        abi: IERC20.abi,
        functionName: 'balanceOf',
        args: [formattedWalletAddress],
      })) as bigint

      Logger.debug(TAG, `Current balance pool: ${balance}`)

      const symbol = await this.client.readContract({
        address: TOKEN_ADDRESS,
        abi: IERC20.abi,
        functionName: 'symbol',
      })

      // Format with 4 decimal places for better readability
      return `${Number(formatEther(balance)).toFixed(4)} ${symbol}`
    } catch (error) {
      Logger.error(TAG, 'Error getting token balance', error)
      return '0 CCOP'
    }
  }

  /**
   * Realiza un stake de tokens
   */
  // Modificar la función stake para usar el enfoque de authentication.ts para encontrar la cuenta
  async stake(
    amount: string,
    duration: number,
    walletAddress: Address,
    passphrase: string
  ): Promise<boolean> {
    try {
      Logger.debug(TAG, 'stake', amount, duration, walletAddress, passphrase)

      // Validar duración
      if (
        ![STAKING_DURATIONS.DAYS_30, STAKING_DURATIONS.DAYS_60, STAKING_DURATIONS.DAYS_90].includes(
          duration
        )
      ) {
        throw new Error(i18n.t('earnFlow.staking.invalidDuration'))
      }

      // Validar que el monto sea un número válido
      if (isNaN(Number(amount)) || Number(amount) <= 0) {
        throw new Error(i18n.t('earnFlow.staking.invalidAmount'))
      }

      // Convertir amount a wei
      Logger.debug(TAG, 'amount', amount)
      const amountWei = parseEther(amount, 'wei')
      Logger.debug(TAG, 'amountWei', amountWei)

      // Obtener wallet usando un enfoque más directo
      Logger.debug(TAG, `Getting keychain accounts for address: ${walletAddress}`)

      // Simplificar la búsqueda de la cuenta - usar directamente el wallet
      const chain = networkConfig.viemChain.celo
      Logger.debug(TAG, 'chain', chain)

      // Usar directamente getLockableViemWallet sin buscar la cuenta manualmente
      const accounts = await getKeychainAccounts()
      Logger.debug(TAG, 'accounts', accounts)
      const formattedWalletAddress = walletAddress as Address
      const wallet = getLockableViemWallet(accounts, chain, formattedWalletAddress)
      Logger.debug(TAG, 'wallet', wallet)
      if (!wallet) {
        Logger.error(TAG, `Could not create wallet for address ${formattedWalletAddress}`)
        throw new Error(`Could not create wallet for address ${formattedWalletAddress}`)
      }

      // Verificar balance
      const balance = (await this.client.readContract({
        address: TOKEN_ADDRESS as Address,
        abi: IERC20.abi,
        functionName: 'balanceOf',
        args: [formattedWalletAddress],
      })) as bigint

      Logger.debug(TAG, `Current balance: ${balance}`)
      Logger.debug(TAG, `Current amountWei: ${amountWei}`)

      if (balance < amountWei) {
        throw new Error(i18n.t('earnFlow.staking.insufficientBalance'))
      }

      // Verificar allowance
      const allowance = (await this.client.readContract({
        address: TOKEN_ADDRESS,
        abi: IERC20.abi,
        functionName: 'allowance',
        args: [formattedWalletAddress, STAKING_ADDRESS],
      })) as bigint
      Logger.debug(TAG, `Current allowance: ${allowance}`)

      // Aprobar tokens si es necesario
      if (allowance < amountWei) {
        Logger.debug(TAG, 'Approving tokens...')
        Logger.debug(TAG, `formattedWalletAddress`, formattedWalletAddress)
        Logger.debug(TAG, `STAKING_ADDRESS`, STAKING_ADDRESS)
        Logger.debug(TAG, `amountWei`, amountWei)

        // Asegurarnos de que la cuenta esté desbloqueada
        const unlocked = await wallet.unlockAccount(passphrase, 300)
        if (!unlocked) {
          throw new Error('No se pudo desbloquear la cuenta')
        }

        try {
          Logger.debug(TAG, `Approving tokens...`)

          const approveTx = await await wallet.writeContract({
            address: TOKEN_ADDRESS, // Dirección del contrato del token
            abi: IERC20.abi,
            functionName: 'approve',
            args: [
              STAKING_ADDRESS, // Dirección del contrato o wallet que va a gastar
              parseUnits(amount, 18), // Monto a aprobar (en este caso 1000 tokens con 18 decimales)
            ],
          })

          Logger.debug(TAG, `Approval transaction hash: ${approveTx}`)
          // Esperar confirmación
          await this.client.waitForTransactionReceipt({ hash: approveTx })
          Logger.debug(TAG, 'Tokens approved')
        } catch (error) {
          Logger.error(TAG, 'Error approving tokens:', error)
          throw error
        }
      }

      // Hacer stake con configuración simplificada
      Logger.debug(TAG, `Staking ${parseUnits(amount, 18)} tokens for ${duration} seconds`)
      try {
        // Simplificar la configuración de la transacción
        const stakeTx = await wallet
          .writeContract({
            address: STAKING_ADDRESS,
            abi: cCOPStaking.abi,
            functionName: 'stake',
            args: [parseUnits(amount, 18), duration as any],
          })
          .catch((error) => {
            Logger.error(TAG, 'Error staking tokens:', error)
            throw error
          })

        Logger.debug(TAG, `Stake transaction hash: ${stakeTx}`)

        // Esperar confirmación
        await this.client.waitForTransactionReceipt({ hash: stakeTx })
        Logger.debug(TAG, 'Stake successful!')
      } catch (stakeError) {
        Logger.error(TAG, 'Error executing stake transaction', stakeError)
        if (stakeError instanceof Error) {
          Logger.error(TAG, `Stake error message: ${stakeError.message}`)
          Logger.error(TAG, `Stake error stack: ${stakeError.stack}`)
        }
        throw stakeError
      }

      return false
    } catch (error) {
      Logger.error(TAG, 'Error staking tokens', error)
      store.dispatch(showError(ErrorMessages.GENERIC_ERROR))
      return false
    }
  }

  /**
   * Retira tokens de un stake
   */
  async withdraw(
    stakeIndex: number,
    walletAddress: Address,
    passphrase: string,
    confirmEarlyWithdraw = false
  ): Promise<boolean | { type: 'EARLY_WITHDRAW_CONFIRMATION'; data: any }> {
    try {
      Logger.debug(TAG, `Withdrawing stake at index ${stakeIndex}`)

      // Validar que el índice sea un número válido
      if (isNaN(stakeIndex) || stakeIndex < 0) {
        throw new Error(i18n.t('earnFlow.staking.invalidStakeIndex'))
      }

      // Obtener wallet usando el enfoque simplificado
      const accounts = await getKeychainAccounts()
      const chain = networkConfig.viemChain.celo
      const formattedWalletAddress = walletAddress as Address

      // Usar directamente getLockableViemWallet sin buscar la cuenta manualmente
      const wallet = getLockableViemWallet(accounts, chain, formattedWalletAddress)

      // Verificar el estado del stake
      const stakes = await this.getUserStakes(formattedWalletAddress)

      if (!stakes || !stakes[stakeIndex]) {
        throw new Error(i18n.t('earnFlow.staking.stakeNotFound'))
      }

      const stake = stakes[stakeIndex]
      const currentTime = BigInt(Math.floor(Date.now() / 1000))

      if (stake.claimed) {
        throw new Error(i18n.t('earnFlow.staking.alreadyClaimed'))
      }

      // Verificar si es retiro anticipado
      if (currentTime < stake.endTime && !confirmEarlyWithdraw) {
        // Calcular tiempo restante en días
        const diasRestantes = Math.ceil(Number((stake.endTime - currentTime) / BigInt(86400)))

        // Usar el método existente para calcular la penalización
        const { penalty, finalAmount } = this.calculateEarlyWithdrawPenalty(stake)

        // Retornar información para que la UI muestre la confirmación
        return {
          type: 'EARLY_WITHDRAW_CONFIRMATION',
          data: {
            stakeIndex,
            remainingDays: diasRestantes,
            amount: formatEther(stake.amount),
            penalty,
            finalAmount,
          },
        }
      }

      // Desbloquear cuenta con mejor manejo de errores
      try {
        const unlocked = await wallet.unlockAccount(passphrase, 300) // 5 minutos
        if (!unlocked) {
          throw new Error(i18n.t('global.invalidPassword'))
        }
        Logger.debug(TAG, `Account unlocked successfully`)
      } catch (unlockError) {
        Logger.error(TAG, 'Error unlocking account', unlockError)
        throw new Error(i18n.t('global.invalidPassword'))
      }

      let tx: `0x${string}`

      // Ejecutar el retiro (normal o anticipado)
      if (currentTime < stake.endTime) {
        // Es un retiro anticipado
        Logger.debug(TAG, `Executing early withdrawal for stake ${stakeIndex}`)
        tx = await wallet.writeContract({
          address: STAKING_ADDRESS,
          abi: cCOPStaking.abi,
          functionName: 'earlyWithdraw',
          args: [BigInt(stakeIndex)],
        })
      } else {
        // Retiro normal
        Logger.debug(TAG, `Executing normal withdrawal for stake ${stakeIndex}`)
        tx = await wallet.writeContract({
          address: STAKING_ADDRESS,
          abi: cCOPStaking.abi,
          functionName: 'withdraw',
          args: [BigInt(stakeIndex)],
        })
      }

      // Esperar confirmación
      await this.client.waitForTransactionReceipt({ hash: tx })
      Logger.debug(TAG, 'Withdraw successful!')

      return true
    } catch (error) {
      Logger.error(TAG, 'Error withdrawing stake', error)
      store.dispatch(showError(ErrorMessages.GENERIC_ERROR))
      return false
    }
  }

  /**
   * Calcula los días restantes para un stake
   */
  calculateRemainingDays(stake: Stake): number {
    const currentTime = BigInt(Math.floor(Date.now() / 1000))
    if (currentTime >= stake.endTime) return 0

    return Number((stake.endTime - currentTime) / BigInt(86400))
  }

  /**
   * Calcula la penalización por retiro anticipado (20%)
   */
  calculateEarlyWithdrawPenalty(stake: Stake): { penalty: string; finalAmount: string } {
    const amount = stake.amount
    const penalty = (amount * BigInt(20)) / BigInt(100)
    const finalAmount = amount - penalty

    return {
      penalty: formatEther(penalty),
      finalAmount: formatEther(finalAmount),
    }
  }

  /**
   * Calcula el APY efectivo basado en la duración del stake
   */
  calculateEffectiveAPY(apy: string, duration: number): string {
    // Convertir APY anual a la duración específica
    const annualAPY = parseFloat(apy)
    const durationInYears = duration / (365 * 86400) // Convertir segundos a años
    const effectiveAPY = annualAPY * durationInYears

    return effectiveAPY.toFixed(2)
  }
}

export default MarranitosContract.getInstance()
