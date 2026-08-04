import BigNumber from 'bignumber.js'
import { Position } from 'src/positions/types'
import networkConfig from 'src/web3/networkConfig'

export function getPositionBalanceUsd(position: Position): BigNumber {
  let balanceUsd
  if (position.type === 'app-token') {
    const balance = new BigNumber(position.balance)
    balanceUsd = balance.multipliedBy(position.priceUsd)
  } else {
    balanceUsd = new BigNumber(position.balanceUsd)
  }

  return balanceUsd
}

// TuCop-specific: render every COP-denominated position balance as raw
// COPm units (1:1 with COP), skipping the priceUsd + usdToLocalRate
// round-trip that made totals drift with each oracle refresh.
//
// A position counts as COPm-denominated when:
// - The AppTokenPosition's own tokenId is COPm (direct COPm holding), OR
// - The EarnDataProps.depositTokenId is COPm (vault share whose
//   underlying deposit is COPm, e.g. Neeru vaults). Vault shares carry
//   their own tokenId and priceUsd; using those would multiply
//   share_balance * share_price * usdToLocalRate, drifting off COP.
//   Instead, when the deposit token is COPm, the position's COP value
//   is `balance * pricePerShare[0]` (== deposit-token amount, in COPm).
//
// - ContractPosition or non-COPm AppTokenPosition: fall back to
//   balanceUsd * usdToLocalRate, since underlying tokens can be anything.
export function getPositionBalanceLocal(
  position: Position,
  usdToLocalRate: string | null
): BigNumber {
  if (position.type === 'app-token') {
    const isDirectCopm = position.tokenId === networkConfig.copmTokenId
    const isCopmVaultShare = position.dataProps?.depositTokenId === networkConfig.copmTokenId
    if (isDirectCopm) {
      return new BigNumber(position.balance)
    }
    if (isCopmVaultShare) {
      const shareToDeposit = position.pricePerShare[0] ?? '1'
      return new BigNumber(position.balance).multipliedBy(shareToDeposit)
    }
  }
  const usd = getPositionBalanceUsd(position)
  return usdToLocalRate ? usd.multipliedBy(usdToLocalRate) : new BigNumber(0)
}
