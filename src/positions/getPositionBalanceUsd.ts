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
// - AppTokenPosition on COPm (Neeru vault shares): balance already in COPm.
// - ContractPosition or non-COPm AppTokenPosition: fall back to
//   balanceUsd * usdToLocalRate, since underlying tokens can be anything.
export function getPositionBalanceLocal(
  position: Position,
  usdToLocalRate: string | null
): BigNumber {
  if (position.type === 'app-token' && position.tokenId === networkConfig.copmTokenId) {
    return new BigNumber(position.balance)
  }
  const usd = getPositionBalanceUsd(position)
  return usdToLocalRate ? usd.multipliedBy(usdToLocalRate) : new BigNumber(0)
}
