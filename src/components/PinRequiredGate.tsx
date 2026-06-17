import React, { useEffect } from 'react'
import { useSelector } from 'src/redux/hooks'
import { walletAddressSelector } from 'src/web3/selectors'
import { pinTransactional, endTransactional } from 'src/pincode/PasswordCache'

interface Props {
  children: React.ReactNode
}

export function PinRequiredGate({ children }: Props) {
  const address = useSelector(walletAddressSelector)
  useEffect(() => {
    if (!address) return
    pinTransactional(address)
    return () => endTransactional(address)
  }, [address])
  return <>{children}</>
}

export default PinRequiredGate
