import BigNumber from 'bignumber.js'
import { execFileSync } from 'child_process'
import path from 'path'
import { convertLocalToTokenAmount, convertTokenToLocalAmount } from 'src/tokens/utils'
import networkConfig from 'src/web3/networkConfig'
import type { TokenBalance } from 'src/tokens/slice'

// TuCop's absolute invariant: 1 COPm always renders as 1 COP, and 1 COP
// always maps to 1 COPm. This has regressed multiple times (PR #288 was
// one prior fix that only patched the earn pool cards and left the rest of
// the app on the double-oracle path). This test file locks the invariant
// in two ways:
//   1. The helpers themselves short-circuit for COPm regardless of rate.
//   2. A repo grep guard fails the build if a new callsite introduces the
//      inline `priceUsd * usdToLocalRate` pattern outside the allowlist.

const copmTokenInfo: TokenBalance = {
  tokenId: networkConfig.copmTokenId,
  address: '0x8a567e2ae79ca692bd748ab832081c45de4041ea',
  networkId: 'celo-mainnet' as TokenBalance['networkId'],
  symbol: 'COPm',
  decimals: 18,
  balance: new BigNumber(1234.56),
  name: 'Colombian Peso',
  priceUsd: new BigNumber(0.00025), // realistic COPm/USD oracle price
  showZeroBalance: true,
  isNative: false,
  isFeeCurrency: true,
  priceFetchedAt: 0,
  lastKnownPriceUsd: new BigNumber(0.00025),
}

const nonCopmTokenInfo: TokenBalance = {
  ...copmTokenInfo,
  tokenId: 'celo-mainnet:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
  address: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
  symbol: 'USDT',
  decimals: 6,
  priceUsd: new BigNumber(1),
}

describe('COPm <-> COP is always 1:1', () => {
  it('convertTokenToLocalAmount returns raw COPm balance, ignoring priceUsd and usdToLocalRate', () => {
    const local = convertTokenToLocalAmount({
      tokenAmount: new BigNumber(1234.56),
      tokenInfo: copmTokenInfo,
      usdToLocalRate: '4000',
    })
    expect(local?.toFixed()).toBe('1234.56')
  })

  it('convertTokenToLocalAmount short-circuits COPm even without usdToLocalRate', () => {
    const local = convertTokenToLocalAmount({
      tokenAmount: new BigNumber(1234.56),
      tokenInfo: copmTokenInfo,
      usdToLocalRate: null,
    })
    expect(local?.toFixed()).toBe('1234.56')
  })

  it('convertLocalToTokenAmount returns raw COP amount as COPm units, ignoring rates', () => {
    const tok = convertLocalToTokenAmount({
      localAmount: new BigNumber(500),
      tokenInfo: copmTokenInfo,
      usdToLocalRate: '4000',
    })
    expect(tok?.toFixed()).toBe('500')
  })

  it('non-COPm tokens still convert through priceUsd * usdToLocalRate', () => {
    const local = convertTokenToLocalAmount({
      tokenAmount: new BigNumber(10),
      tokenInfo: nonCopmTokenInfo,
      usdToLocalRate: '4000',
    })
    // 10 USDT * 1 USD/USDT * 4000 COP/USD = 40_000 COP
    expect(local?.toFixed()).toBe('40000')
  })
})

// Anti-pattern grep. Any new callsite doing inline priceUsd * usdToLocal
// (in either order) is potential COPm drift. All correct callsites go
// through convertTokenToLocalAmount / convertLocalToTokenAmount /
// getPositionBalanceLocal / getEarnPositionBalanceValues. If you have to
// add a new file to the allowlist below, justify why COPm cannot flow
// through it -- it is very rare for that to be true.
describe('no new inline priceUsd * usdToLocalRate conversions', () => {
  const REPO_ROOT = path.resolve(__dirname, '../..')
  const ALLOWLIST = new Set<string>([
    // Canonical implementations of the 1:1 short-circuit. The helpers
    // themselves must contain the fallback multiplication for non-COPm
    // tokens; every OTHER caller in the app is expected to route through
    // them instead of duplicating the inline pattern.
    'src/tokens/utils.ts',
    // Legitimate: gold-only conversions. Gold flows never touch COPm.
    'src/gold/GoldEntrypoint.tsx',
    'src/gold/GoldBuyEnterAmount.tsx',
    'src/gold/GoldBuyConfirmation.tsx',
    'src/gold/GoldSellConfirmation.tsx',
    'src/gold/GoldSellEnterAmount.tsx',
    'src/gold/GoldPriceAlerts.tsx',
    'src/gold/GoldHome.tsx',
  ])

  it('rejects new callsites doing balance.multipliedBy(priceUsd).multipliedBy(usdToLocalRate) or vice versa', () => {
    let hits: string[] = []
    try {
      const raw = execFileSync(
        'git',
        [
          'grep',
          '-n',
          '--extended-regexp',
          '(priceUsd[^\\n]{0,120}(multipliedBy|times)[^\\n]{0,80}usdToLocal|usdToLocal[^\\n]{0,120}(multipliedBy|times)[^\\n]{0,80}priceUsd)',
          '--',
          'src/',
        ],
        { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      )
      hits = raw
        .split('\n')
        .filter(Boolean)
        // Ignore this test file and any file explicitly allowlisted above.
        .filter((line) => !line.includes('copmPegInvariant.test.ts'))
        .filter((line) => {
          const filePath = line.split(':')[0]
          return !ALLOWLIST.has(filePath)
        })
        .filter((line) => {
          // Strip line-number prefix "src/foo.ts:42:" to inspect the code.
          const content = line.split(':').slice(2).join(':').trimStart()
          // Comments and doc lines never execute; ignore.
          return !content.startsWith('//') && !content.startsWith('*') && !content.startsWith('#')
        })
    } catch {
      // git grep exits non-zero when no matches; that is the desired state.
      hits = []
    }

    if (hits.length > 0) {
      // Surface the fix hint before the assertion so the failure message
      // in CI carries the actionable instructions and the offending lines.
      // eslint-disable-next-line no-console
      console.error(
        [
          'Inline priceUsd * usdToLocalRate detected. TuCop treats every COPm balance as 1:1 with COP.',
          'Route the pair through:',
          '  - convertTokenToLocalAmount / convertLocalToTokenAmount   (src/tokens/utils.ts)',
          '  - getPositionBalanceLocal                                 (src/positions/getPositionBalanceUsd.ts)',
          '  - getEarnPositionBalanceValues                            (src/earn/utils.ts)',
          'Or, if this file genuinely cannot touch COPm, add it to ALLOWLIST in',
          'src/tokens/copmPegInvariant.test.ts with a comment explaining why.',
          '',
          'Offending lines:',
          ...hits.map((h) => '  ' + h),
        ].join('\n')
      )
    }
    expect(hits).toEqual([])
  })
})
