import BigNumber from 'bignumber.js'
import { buildDolaresVirtualToken } from 'src/dollarsSpend/dolaresVirtualToken'
import { DOLARES_VIRTUAL_TOKEN_ID } from 'src/dollarsSpend/types'
import { NetworkId } from 'src/transactions/types'

describe('buildDolaresVirtualToken', () => {
  it('returns null when no dollar tokens have positive USD value', () => {
    const result = buildDolaresVirtualToken({
      snapshots: [],
      networkId: NetworkId['celo-mainnet'],
    })
    expect(result).toBeNull()
  })

  it('builds a synthetic token with aggregated USD balance', () => {
    const result = buildDolaresVirtualToken({
      snapshots: [
        {
          symbol: 'USAT',
          tokenId: 'celo-mainnet:usat',
          balance: new BigNumber(30),
          priceUsd: new BigNumber(1),
          decimals: 6,
          minAmountUsd: new BigNumber(0),
        },
        {
          symbol: 'USDm',
          tokenId: 'celo-mainnet:usdm',
          balance: new BigNumber(50),
          priceUsd: new BigNumber(1),
          decimals: 18,
          minAmountUsd: new BigNumber(0),
        },
      ],
      networkId: NetworkId['celo-mainnet'],
    })
    expect(result).not.toBeNull()
    expect(result!.tokenId).toBe(DOLARES_VIRTUAL_TOKEN_ID)
    expect(result!.symbol).toBe('Dolares')
    expect(result!.balance.toString()).toBe('80')
    expect(result!.priceUsd?.toString()).toBe('1')
    expect(result!.networkId).toBe('celo-mainnet')
    expect(result!.decimals).toBe(2)
  })
})
