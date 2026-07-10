import type { WalletClient } from 'viem'
import { zeroAddress } from 'viem'

export interface RevokeOpts {
  /** Optional Celo CIP-64 fee currency address (USDm, COPm, etc.) */
  feeCurrency?: `0x${string}`
}

/**
 * Signs an EIP-7702 authorization clearing the EOA's delegation by pointing
 * at the zero address, then submits the tx. After this tx confirms, the user's
 * EOA is back to a plain EOA with no delegated code.
 *
 * This is the kill-switch recovery mechanism per S4 rollback plan.
 */
export async function revokeDelegation(
  wallet: WalletClient,
  opts: RevokeOpts = {}
): Promise<`0x${string}`> {
  if (!wallet.account) throw new Error('revokeDelegation: wallet has no account')

  const authorization = await wallet.signAuthorization({
    contractAddress: zeroAddress,
    account: wallet.account,
  } as any)

  const hash = await wallet.sendTransaction({
    account: wallet.account,
    to: wallet.account.address,
    data: '0x',
    authorizationList: [authorization],
    ...(opts.feeCurrency ? { feeCurrency: opts.feeCurrency } : {}),
  } as any)

  return hash as `0x${string}`
}
