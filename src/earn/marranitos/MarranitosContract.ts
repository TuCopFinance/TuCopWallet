import { showError } from 'src/alert/actions'
import { ErrorMessages } from 'src/app/ErrorMessages'
import i18n from 'src/i18n'
import { store } from 'src/redux/store'
import Logger from 'src/utils/Logger'
import getLockableViemWallet from 'src/viem/getLockableWallet'
import { getKeychainAccounts } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { Address, formatEther, parseEther } from 'viem'

const TAG = 'earn/marranitos/MarranitosContract'

// Direcciones de contratos
const STAKING_ADDRESS = '0x33F9D44eef92314dAE345Aa64763B01cf484F3C6' as Address
const TOKEN_ADDRESS = '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as Address

// ABIs
const STAKING_ABI = [
  'function stake(uint256 _amount, uint256 _duration) external',
  'function withdraw(uint256 _stakeIndex) external',
  'function earlyWithdraw(uint256 _stakeIndex) external',
  'function getUserStakes(address _user) external view returns (tuple(uint256 amount, uint256 startTime, uint256 endTime, uint256 duration, bool claimed)[])',
  'function stakingToken() external view returns (address)',
]

const TOKEN_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function symbol() external view returns (string)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]

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
}

export class MarranitosContract {
  private static instance: MarranitosContract

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
      const publicClient = networkConfig.publicClient.celo

      const stakes = await publicClient.readContract({
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'getUserStakes',
        args: [walletAddress],
      })

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
  /**
   * Obtiene el balance de tokens CCOP del usuario
   */
  async getTokenBalance(walletAddress: Address): Promise<string> {
    try {
      Logger.debug(TAG, `Getting token balance for: ${walletAddress}`)

      // Ensure wallet address is properly formatted
      const formattedWalletAddress = walletAddress as Address

      // Fix: Use the correct property for public client
      const publicClient = networkConfig.publicClient.celo

      const balance = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'balanceOf',
        args: [formattedWalletAddress],
      })

      const symbol = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
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
      Logger.debug(TAG, `Staking ${amount} tokens for ${duration} seconds`)

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
      const amountWei = parseEther(amount)

      // Obtener wallet usando un enfoque más directo
      Logger.debug(TAG, `Getting keychain accounts for address: ${walletAddress}`)
      const accounts = await getKeychainAccounts()

      if (!accounts) {
        Logger.error(TAG, 'No accounts returned from keychain')
        throw new Error(
          'No accounts found in keychain. Please ensure your wallet is properly set up.'
        )
      }

      const formattedWalletAddress = walletAddress as Address
      Logger.debug(TAG, `Looking for account with address: ${formattedWalletAddress}`)

      // Simplificar la búsqueda de la cuenta - usar directamente el wallet
      const chain = networkConfig.viemChain.celo

      // Verificar que chain sea un objeto válido
      if (!chain || typeof chain !== 'object') {
        Logger.error(TAG, `Invalid chain configuration: ${JSON.stringify(chain)}`)
        throw new Error('Invalid chain configuration')
      }

      Logger.debug(TAG, `Creating wallet with chain ID: ${chain.id}`)

      // Verificar estructura de accounts antes de usarlo
      Logger.debug(
        TAG,
        `Accounts structure: ${JSON.stringify(accounts, null, 2).substring(0, 100)}...`
      )

      const wallet = getLockableViemWallet(accounts, chain, formattedWalletAddress)

      if (!wallet) {
        Logger.error(TAG, `Could not create wallet for address ${formattedWalletAddress}`)
        throw new Error(`Could not create wallet for address ${formattedWalletAddress}`)
      }

      // Desbloquear cuenta con manejo de errores mejorado
      try {
        Logger.debug(TAG, `Attempting to unlock account with provided passphrase`)
        const unlocked = await wallet.unlockAccount(passphrase, 300) // 5 minutos
        if (!unlocked) {
          throw new Error(i18n.t('global.invalidPassword'))
        }
        Logger.debug(TAG, `Account unlocked successfully`)
      } catch (unlockError) {
        Logger.error(TAG, 'Error unlocking account', unlockError)
        throw new Error(i18n.t('global.invalidPassword'))
      }

      // Verificar balance
      const publicClient = networkConfig.publicClient.celo
      const balance = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'balanceOf',
        args: [formattedWalletAddress],
      })

      if (balance < amountWei) {
        throw new Error(i18n.t('earnFlow.staking.insufficientBalance'))
      }

      // Verificar allowance
      const allowance = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'allowance',
        args: [formattedWalletAddress, STAKING_ADDRESS],
      })

      // Aprobar tokens si es necesario
      if (allowance < amountWei) {
        Logger.debug(TAG, 'Approving tokens...')
        try {
          // Usar un objeto de configuración más simple
          const approveTx = await wallet.writeContract({
            address: TOKEN_ADDRESS,
            abi: TOKEN_ABI,
            functionName: 'approve',
            args: [STAKING_ADDRESS, amountWei],
            chain: chain,
            account: formattedWalletAddress,
          })

          Logger.debug(TAG, `Approval transaction hash: ${approveTx}`)

          // Esperar confirmación
          await publicClient.waitForTransactionReceipt({ hash: approveTx })
          Logger.debug(TAG, 'Tokens approved')
        } catch (approveError) {
          Logger.error(TAG, 'Error approving tokens', approveError)
          if (approveError instanceof Error) {
            Logger.error(TAG, `Approval error message: ${approveError.message}`)
          }
          throw new Error(i18n.t('earnFlow.staking.approvalFailed'))
        }
      }

      // Hacer stake con configuración simplificada
      Logger.debug(TAG, `Staking ${formatEther(amountWei)} tokens for ${duration} seconds`)
      try {
        // Simplificar la configuración de la transacción
        const stakeTx = await wallet.writeContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: 'stake',
          chain,
          account: formattedWalletAddress,
        })

        Logger.debug(TAG, `Stake transaction hash: ${stakeTx}`)

        // Esperar confirmación
        await publicClient.waitForTransactionReceipt({ hash: stakeTx })
        Logger.debug(TAG, 'Stake successful!')

        return true
      } catch (stakeError) {
        Logger.error(TAG, 'Error executing stake transaction', stakeError)
        if (stakeError instanceof Error) {
          Logger.error(TAG, `Stake error message: ${stakeError.message}`)
          Logger.error(TAG, `Stake error stack: ${stakeError.stack}`)
        }
        throw stakeError
      }
    } catch (error) {
      Logger.error(TAG, 'Error staking tokens', error)
      store.dispatch(showError(ErrorMessages.GENERIC_ERROR))
      return false
    }
  }

  /**
   * Retira tokens de un stake
   */
  async withdraw(stakeIndex: number, walletAddress: Address, passphrase: string): Promise<boolean> {
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

      // Verificar el estado del stake
      const publicClient = networkConfig.publicClient.celo
      const stakes = await this.getUserStakes(formattedWalletAddress)

      if (!stakes || !stakes[stakeIndex]) {
        throw new Error(i18n.t('earnFlow.staking.stakeNotFound'))
      }

      const stake = stakes[stakeIndex]
      const currentTime = BigInt(Math.floor(Date.now() / 1000))

      if (stake.claimed) {
        throw new Error(i18n.t('earnFlow.staking.alreadyClaimed'))
      }

      let tx: `0x${string}`

      // Verificar si es retiro anticipado
      if (currentTime < stake.endTime) {
        // Es un retiro anticipado
        tx = await wallet.writeContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: 'earlyWithdraw',
          args: [BigInt(stakeIndex)],
          chain,
          account: formattedWalletAddress,
        })
      } else {
        // Retiro normal
        tx = await wallet.writeContract({
          address: STAKING_ADDRESS,
          abi: STAKING_ABI,
          functionName: 'withdraw',
          args: [BigInt(stakeIndex)],
          chain,
          account: formattedWalletAddress,
        })
      }

      // Esperar confirmación
      await publicClient.waitForTransactionReceipt({ hash: tx })
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
  /**
   * Prepara una transacción de staking sin ejecutarla
   */
  async prepareStakeTransaction(amount: string, duration: number, walletAddress: Address) {
    try {
      // Validaciones
      if (
        ![STAKING_DURATIONS.DAYS_30, STAKING_DURATIONS.DAYS_60, STAKING_DURATIONS.DAYS_90].includes(
          duration
        )
      ) {
        throw new Error(i18n.t('earnFlow.staking.invalidDuration'))
      }

      if (isNaN(Number(amount)) || Number(amount) <= 0) {
        throw new Error(i18n.t('earnFlow.staking.invalidAmount'))
      }

      // Convertir amount a wei
      const amountWei = parseEther(amount)

      // Verificar balance
      const publicClient = networkConfig.publicClient.celo
      const balance = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      })

      if (balance < amountWei) {
        return {
          type: 'insufficient-balance',
          requiredAmount: amountWei,
          currentBalance: balance,
        }
      }

      // Verificar allowance
      const allowance = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: 'allowance',
        args: [walletAddress, STAKING_ADDRESS],
      })

      // Calcular transacciones necesarias
      const transactions = []

      // Si se necesita aprobar tokens
      if (allowance < amountWei) {
        transactions.push({
          type: 'approve',
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: 'approve',
          args: [STAKING_ADDRESS, amountWei],
        })
      }

      // Transacción de stake
      transactions.push({
        type: 'stake',
        address: STAKING_ADDRESS,
        abi: STAKING_ABI,
        functionName: 'stake',
        args: [amountWei, BigInt(duration)],
      })

      return {
        type: 'possible',
        transactions,
        amount: amountWei,
        duration,
      }
    } catch (error) {
      Logger.error(TAG, 'Error preparing stake transaction', error)
      return {
        type: 'error',
        error,
      }
    }
  }
}

export default MarranitosContract.getInstance()
