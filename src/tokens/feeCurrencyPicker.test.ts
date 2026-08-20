import BigNumber from 'bignumber.js'
import { pickFeeCurrency } from 'src/tokens/feeCurrencyPicker'
import type { TokenBalance } from 'src/tokens/slice'
import { NetworkId } from 'src/transactions/types'

function tok(overrides: Partial<TokenBalance>): TokenBalance {
  return {
    tokenId: `celo-mainnet:${overrides.symbol?.toLowerCase() ?? 'x'}`,
    address: `0x${(overrides.symbol ?? 'x').padEnd(40, '0')}`,
    networkId: NetworkId['celo-mainnet'],
    symbol: 'X',
    name: overrides.symbol ?? 'X',
    decimals: 18,
    balance: new BigNumber(0),
    priceUsd: null,
    lastKnownPriceUsd: null,
    priceFetchedAt: 0,
    ...overrides,
  } as unknown as TokenBalance
}

const CELO = tok({ symbol: 'CELO', balance: new BigNumber(1), priceUsd: new BigNumber(0.5) })
const COPM = tok({
  symbol: 'COPm',
  balance: new BigNumber(10000),
  priceUsd: new BigNumber(0.00025),
})
const USDM = tok({ symbol: 'USDm', balance: new BigNumber(3), priceUsd: new BigNumber(1) })
const USDT = tok({
  symbol: 'USDT',
  balance: new BigNumber(2),
  priceUsd: new BigNumber(1),
  decimals: 6,
})

// Post Bug-E-reversal (2026-08-20): the picker is order-preserving. It walks
// the caller-supplied array top-to-bottom and returns the first candidate
// that clears every check. Callers rely on `feeCurrenciesSelector` to hand
// them an already-sorted list (CELO first for celo-mainnet, then COPm, USDm,
// USDC, USDT), and the picker just picks. There is no stables-first
// preference and no CELO deprioritization.
describe('pickFeeCurrency', () => {
  it('returns null when nothing is available', () => {
    expect(pickFeeCurrency({ available: [] })).toBeNull()
  })

  it('returns the first candidate that passes every check', () => {
    const result = pickFeeCurrency({ available: [CELO, USDM] })
    expect(result?.chosen.symbol).toBe('CELO')
    expect(result?.reason).toBe('first-viable')
    expect(result?.alternatives.map((t) => t.symbol)).toEqual(['USDm'])
    expect(result?.declined).toEqual([])
  })

  it('preserves the selector-supplied order across all passing candidates', () => {
    const result = pickFeeCurrency({ available: [CELO, COPM, USDM, USDT] })
    expect(result?.chosen.symbol).toBe('CELO')
    expect(result?.alternatives.map((t) => t.symbol)).toEqual(['COPm', 'USDm', 'USDT'])
  })

  it('excludes tokens being spent by tokenId', () => {
    const result = pickFeeCurrency({
      available: [CELO, USDM, COPM],
      excludeTokenIds: [CELO.tokenId],
    })
    expect(result?.chosen.symbol).toBe('USDm')
    expect(result?.alternatives.map((t) => t.symbol)).toEqual(['COPm'])
    expect(result?.declined).toEqual([{ token: CELO, reason: 'in-spending-set' }])
  })

  it('excludes tokens being spent by address (case-insensitive)', () => {
    const result = pickFeeCurrency({
      available: [USDM, COPM],
      excludeTokenIds: [USDM.address!.toUpperCase()],
    })
    expect(result?.chosen.symbol).toBe('COPm')
    expect(result?.declined[0]).toEqual({ token: USDM, reason: 'in-spending-set' })
  })

  it('rejects zero balances', () => {
    const empty = tok({ symbol: 'USDm', balance: new BigNumber(0), priceUsd: new BigNumber(1) })
    const result = pickFeeCurrency({ available: [empty, CELO] })
    expect(result?.chosen.symbol).toBe('CELO')
    expect(result?.declined).toEqual([{ token: empty, reason: 'insufficient-balance' }])
  })

  it('rejects candidates whose USD balance does not cover requiredGasUsd', () => {
    const dust = tok({ symbol: 'USDm', balance: new BigNumber(0.01), priceUsd: new BigNumber(1) })
    const result = pickFeeCurrency({
      available: [dust, CELO],
      requiredGasUsd: new BigNumber(0.05),
    })
    expect(result?.chosen.symbol).toBe('CELO')
    expect(result?.declined).toEqual([{ token: dust, reason: 'insufficient-balance' }])
  })

  it('rejects priceless tokens when requiredGasUsd is set', () => {
    const priceless = tok({ symbol: 'USDm', balance: new BigNumber(5), priceUsd: null })
    const result = pickFeeCurrency({
      available: [priceless, CELO],
      requiredGasUsd: new BigNumber(0.05),
    })
    expect(result?.chosen.symbol).toBe('CELO')
    expect(result?.declined).toEqual([{ token: priceless, reason: 'no-price-data' }])
  })

  it('accepts priceless tokens when requiredGasUsd is not set', () => {
    const priceless = tok({ symbol: 'USDm', balance: new BigNumber(5), priceUsd: null })
    const result = pickFeeCurrency({ available: [CELO, priceless] })
    expect(result?.chosen.symbol).toBe('CELO')
  })

  it('skips adapter-based candidates flagged by the caller', () => {
    const flaggedUsdm = tok({
      symbol: 'USDm',
      balance: new BigNumber(3),
      priceUsd: new BigNumber(1),
    })
    const result = pickFeeCurrency({
      available: [flaggedUsdm, COPM, CELO],
      adapterAllowanceMissing: [flaggedUsdm.address!],
    })
    expect(result?.chosen.symbol).toBe('COPm')
    expect(result?.declined).toEqual([{ token: flaggedUsdm, reason: 'adapter-allowance-missing' }])
  })

  it('returns null when every candidate is filtered out', () => {
    const result = pickFeeCurrency({
      available: [USDM, CELO],
      excludeTokenIds: [USDM.tokenId, CELO.tokenId],
    })
    expect(result).toBeNull()
  })
})
