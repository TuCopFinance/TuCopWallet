import { useEffect, useState } from 'react'
import BigNumber from 'bignumber.js'
import { useSelector } from 'src/redux/hooks'
import { walletAddressSelector } from 'src/web3/selectors'
import { publicClient } from 'src/viem'
import { erc20Abi } from 'viem'
import Logger from 'src/utils/Logger'
import { XAUT0_DECIMALS } from './types'

const TAG = 'gold/useXaut0Balance'

// XAUt0 token address on Celo mainnet
const XAUT0_ADDRESS = '0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff' as const

/**
 * Hook to fetch XAUt0 balance directly from blockchain
 * This is needed because XAUt0 may not be in the default token list
 */
export function useXaut0Balance() {
  const walletAddress = useSelector(walletAddressSelector)
  const [balance, setBalance] = useState<BigNumber>(new BigNumber(0))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBalance = async () => {
      if (!walletAddress) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const rawBalance = await publicClient.celo.readContract({
          address: XAUT0_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        })

        const formattedBalance = new BigNumber(rawBalance.toString()).shiftedBy(-XAUT0_DECIMALS)
        setBalance(formattedBalance)
        Logger.debug(TAG, `XAUt0 balance: ${formattedBalance.toString()}`)
      } catch (err) {
        Logger.error(TAG, 'Failed to fetch XAUt0 balance', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setBalance(new BigNumber(0))
      } finally {
        setLoading(false)
      }
    }

    fetchBalance()
  }, [walletAddress])

  const refetch = async () => {
    if (!walletAddress) return

    try {
      setLoading(true)
      const rawBalance = await publicClient.celo.readContract({
        address: XAUT0_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`],
      })

      const formattedBalance = new BigNumber(rawBalance.toString()).shiftedBy(-XAUT0_DECIMALS)
      setBalance(formattedBalance)
    } catch (err) {
      Logger.error(TAG, 'Failed to refetch XAUt0 balance', err)
    } finally {
      setLoading(false)
    }
  }

  return { balance, loading, error, refetch }
}
