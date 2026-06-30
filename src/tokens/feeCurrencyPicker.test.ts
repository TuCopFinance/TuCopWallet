import BigNumber from 'bignumber.js'
import { pickFeeCurrency, reorderForBugE } from 'src/tokens/feeCurrencyPicker'
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

describe('pickFeeCurrency', () => {
  it('returns null when nothing is available', () => {
    expect(pickFeeCurrency({ available: [] })).toBeNull()
  })

  it('prefers any stable over CELO (Bug E core)', () => {
    const result = pickFeeCurrency({ available: [CELO, USDM] })
    expect(result?.chosen.symbol).toBe('USDm')
    expect(result?.reason).toBe('preferred-stable')
    expect(result?.declined).toEqual([{ token: CELO, reason: 'celo-deprioritized' }])
  })

  it('preserves the selector-supplied stable order and keeps CELO as last alternative', () => {
    // available is already sorted by the selector (priority + USD balance);
    // picker must not re-sort within the non-CELO group. CELO stays in
    // alternatives because it remains a valid last-resort if every stable
    // attempt reverts on insufficient gas.
    const result = pickFeeCurrency({ available: [CELO, COPM, USDM, USDT] })
    expect(result?.chosen.symbol).toBe('COPm')
    expect(result?.alternatives.map((t) => t.symbol)).toEqual(['USDm', 'USDT', 'CELO'])
  })

  it('falls back to CELO when no stable passes the gates', () => {
    const result = pickFeeCurrency({ available: [CELO] })
    expect(result?.chosen.symbol).toBe('CELO')
    expect(result?.reason).toBe('celo-fallback')
    expect(result?.declined).toEqual([])
  })

  it('excludes tokens being spent by tokenId', () => {
    const result = pickFeeCurrency({
      available: [USDM, COPM, CELO],
      excludeTokenIds: [USDM.tokenId],
    })
    expect(result?.chosen.symbol).toBe('COPm')
    expect(result?.declined).toEqual([
      { token: USDM, reason: 'in-spending-set' },
      { token: CELO, reason: 'celo-deprioritized' },
    ])
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
    expect(result?.reason).toBe('celo-fallback')
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
    const result = pickFeeCurrency({ available: [priceless, CELO] })
    expect(result?.chosen.symbol).toBe('USDm')
  })

  it('skips adapter-based candidates flagged by the caller', () => {
    const result = pickFeeCurrency({
      available: [USDM, COPM, CELO],
      adapterAllowanceMissing: [USDM.address!],
    })
    expect(result?.chosen.symbol).toBe('COPm')
    expect(result?.declined).toEqual([
      { token: USDM, reason: 'adapter-allowance-missing' },
      { token: CELO, reason: 'celo-deprioritized' },
    ])
  })

  it('returns null when every candidate is filtered out', () => {
    const result = pickFeeCurrency({
      available: [USDM, CELO],
      excludeTokenIds: [USDM.tokenId, CELO.tokenId],
    })
    expect(result).toBeNull()
  })

  it('keeps every input in alternatives when none are excluded', () => {
    const result = pickFeeCurrency({ available: [CELO, USDM, COPM, USDT] })
    expect([result?.chosen.symbol, ...(result?.alternatives.map((t) => t.symbol) ?? [])]).toEqual([
      'USDm',
      'COPm',
      'USDT',
      'CELO',
    ])
  })

  it('lists alternatives in stable-then-CELO order for cascade fallback', () => {
    // Three stables + CELO all pass; alternatives let the saga retry on
    // insufficient-gas without re-running the picker.
    const result = pickFeeCurrency({ available: [CELO, USDM, COPM, USDT] })
    expect(result?.chosen.symbol).toBe('USDm')
    expect(result?.alternatives.map((t) => t.symbol)).toEqual(['COPm', 'USDT', 'CELO'])
  })
})

describe('reorderForBugE', () => {
  it('moves CELO to the end and keeps every other token in place', () => {
    const usdmZero = tok({
      symbol: 'USDm',
      balance: new BigNumber(0),
      priceUsd: new BigNumber(1),
    })
    const result = reorderForBugE([CELO, USDM, usdmZero, COPM])
    expect(result.map((t) => t.symbol)).toEqual(['USDm', 'USDm', 'COPm', 'CELO'])
    // Same length: nothing is filtered out by balance gates.
    expect(result.length).toBe(4)
  })

  it('is a no-op when CELO is not present', () => {
    expect(reorderForBugE([USDM, COPM])).toEqual([USDM, COPM])
  })

  it('returns an empty array for empty input', () => {
    expect(reorderForBugE([])).toEqual([])
  })
})
