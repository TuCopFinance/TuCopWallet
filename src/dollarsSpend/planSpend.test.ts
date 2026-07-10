import BigNumber from 'bignumber.js'
import { planSpend } from 'src/dollarsSpend/planSpend'
import { DollarTokenBalanceSnapshot } from 'src/dollarsSpend/types'

// Helpers to build snapshots quickly. Order in helper does NOT influence
// the planner; planner enforces SPEND_ORDER internally.
function snap(
  symbol: 'USAT' | 'USDm' | 'USDC' | 'USDT',
  tokenId: string,
  balance: number,
  priceUsd = 1,
  minAmountUsd = 0
): DollarTokenBalanceSnapshot {
  // Real on-chain values: USDT/USDC/USAT = 6, USDm = 18. Exact number does
  // not affect planSpend, but the type now requires it so the wei-conversion
  // downstream has what it needs.
  const decimals = symbol === 'USDm' ? 18 : 6
  return {
    symbol,
    tokenId,
    balance: new BigNumber(balance),
    priceUsd: new BigNumber(priceUsd),
    decimals,
    minAmountUsd: new BigNumber(minAmountUsd),
  }
}

const USAT = (b: number, p = 1, m = 0) => snap('USAT', 'celo-mainnet:usat', b, p, m)
const USDM = (b: number, p = 1, m = 0) => snap('USDm', 'celo-mainnet:usdm', b, p, m)
const USDC = (b: number, p = 1, m = 0) => snap('USDC', 'celo-mainnet:usdc', b, p, m)
const USDT = (b: number, p = 1, m = 0) => snap('USDT', 'celo-mainnet:usdt', b, p, m)

describe('planSpend', () => {
  it('returns no steps and zero shortfall when requested is 0', () => {
    const plan = planSpend({
      requestedUsd: new BigNumber(0),
      balances: [USAT(100), USDT(100)],
    })
    expect(plan.steps).toEqual([])
    expect(plan.shortfall.toString()).toBe('0')
  })

  it('uses USAT alone when it covers the request', () => {
    const plan = planSpend({
      requestedUsd: new BigNumber(25),
      balances: [USAT(100), USDM(100), USDC(100), USDT(100)],
    })
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].symbol).toBe('USAT')
    expect(plan.steps[0].amountUsd.toString()).toBe('25')
    expect(plan.shortfall.toString()).toBe('0')
  })

  it('walks the spend order when no single token covers', () => {
    const plan = planSpend({
      requestedUsd: new BigNumber(150),
      balances: [USAT(30), USDM(50), USDC(100), USDT(200)],
    })
    expect(plan.steps.map((s) => s.symbol)).toEqual(['USAT', 'USDm', 'USDC'])
    expect(plan.steps[0].amountUsd.toString()).toBe('30')
    expect(plan.steps[1].amountUsd.toString()).toBe('50')
    expect(plan.steps[2].amountUsd.toString()).toBe('70')
    expect(plan.shortfall.toString()).toBe('0')
  })

  it('respects priority even when later token covers alone', () => {
    // USDT has $200 alone; planner still consumes USAT first then USDm etc.
    const plan = planSpend({
      requestedUsd: new BigNumber(120),
      balances: [USAT(30), USDM(50), USDC(0), USDT(200)],
    })
    expect(plan.steps.map((s) => s.symbol)).toEqual(['USAT', 'USDm', 'USDT'])
    expect(plan.steps[2].amountUsd.toString()).toBe('40')
    expect(plan.shortfall.toString()).toBe('0')
  })

  it('skips tokens with balanceUsd below minAmountUsd (dust filter)', () => {
    const plan = planSpend({
      requestedUsd: new BigNumber(20),
      balances: [USAT(0.5, 1, 1), USDM(50, 1, 1), USDT(0, 1, 1)],
    })
    expect(plan.steps.map((s) => s.symbol)).toEqual(['USDm'])
    expect(plan.steps[0].amountUsd.toString()).toBe('20')
    expect(plan.shortfall.toString()).toBe('0')
  })

  it('reports shortfall when total balance is insufficient', () => {
    const plan = planSpend({
      requestedUsd: new BigNumber(500),
      balances: [USAT(30), USDM(50), USDC(70), USDT(50)],
    })
    expect(plan.steps.map((s) => s.symbol)).toEqual(['USAT', 'USDm', 'USDC', 'USDT'])
    expect(plan.shortfall.toString()).toBe('300')
  })

  it('accounts for priceUsd != 1 when computing USD per token', () => {
    // 100 USDm at 0.998 USD = 99.8 USD
    const plan = planSpend({
      requestedUsd: new BigNumber(50),
      balances: [USAT(0), USDM(100, 0.998), USDT(200)],
    })
    expect(plan.steps.map((s) => s.symbol)).toEqual(['USDm'])
    expect(plan.steps[0].amountUsd.toString()).toBe('50')
    // 50 USD / 0.998 = 50.10020... USDm whole units
    expect(plan.steps[0].amountTokenWhole.toFixed(2)).toBe('50.10')
  })

  it('handles a token with priceUsd = 0 by skipping it', () => {
    const plan = planSpend({
      requestedUsd: new BigNumber(20),
      balances: [USAT(100, 0), USDM(50)],
    })
    expect(plan.steps.map((s) => s.symbol)).toEqual(['USDm'])
  })

  it('ignores balances for tokens not in SPEND_ORDER', () => {
    // CELO native or random token in the balances array should be ignored.
    const plan = planSpend({
      requestedUsd: new BigNumber(20),
      balances: [
        USAT(0),
        USDM(0),
        USDC(0),
        USDT(0),
        // Random token that planSpend should ignore
        {
          symbol: 'CELO' as any,
          tokenId: 'celo-mainnet:native',
          balance: new BigNumber(100),
          priceUsd: new BigNumber(0.3),
          minAmountUsd: new BigNumber(0),
        } as any,
      ],
    })
    expect(plan.steps).toEqual([])
    expect(plan.shortfall.toString()).toBe('20')
  })
})
