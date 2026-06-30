import BigNumber from 'bignumber.js'
import {
  BOOTSTRAP_DEBOUNCE_MS,
  detectShouldOfferBootstrap,
} from 'src/wri/feeAdapterBootstrap/detect'
import type { State as BootstrapState } from 'src/wri/feeAdapterBootstrap/slice'
import networkConfig from 'src/web3/networkConfig'

function freshState(overrides?: Partial<BootstrapState['byAdapter']>): BootstrapState {
  return {
    byAdapter: {
      USDC: { bootstrapped: false, lastAttemptAt: null, lastSuccessAt: null, lastError: null },
      USDT: { bootstrapped: false, lastAttemptAt: null, lastSuccessAt: null, lastError: null },
      ...overrides,
    },
    pending: null,
  }
}

const NOW = 1_700_000_000_000

describe('detectShouldOfferBootstrap', () => {
  it('skips when the gate is off', () => {
    const result = detectShouldOfferBootstrap({
      balances: [{ tokenId: networkConfig.usdcTokenId, balance: new BigNumber(5) }],
      bootstrapState: freshState(),
      now: NOW,
      gateOn: false,
    })
    expect(result).toEqual({ shouldOffer: false, reason: 'gate-off' })
  })

  it('offers USDC when the user has only USDC and no other gas option', () => {
    const result = detectShouldOfferBootstrap({
      balances: [{ tokenId: networkConfig.usdcTokenId, balance: new BigNumber(10) }],
      bootstrapState: freshState(),
      now: NOW,
      gateOn: true,
    })
    expect(result).toEqual({ shouldOffer: true, adaptersToBootstrap: ['USDC'] })
  })

  it('offers both USDC and USDT when the user has balance in both', () => {
    const result = detectShouldOfferBootstrap({
      balances: [
        { tokenId: networkConfig.usdcTokenId, balance: new BigNumber(5) },
        { tokenId: networkConfig.usdtTokenId, balance: new BigNumber(3) },
      ],
      bootstrapState: freshState(),
      now: NOW,
      gateOn: true,
    })
    expect(result).toEqual({ shouldOffer: true, adaptersToBootstrap: ['USDC', 'USDT'] })
  })

  it('skips when the user has zero USDC and zero USDT', () => {
    const result = detectShouldOfferBootstrap({
      balances: [],
      bootstrapState: freshState(),
      now: NOW,
      gateOn: true,
    })
    expect(result).toEqual({ shouldOffer: false, reason: 'no-dollar-balance' })
  })

  it('skips when the user has CELO native balance', () => {
    const result = detectShouldOfferBootstrap({
      balances: [
        { tokenId: networkConfig.usdcTokenId, balance: new BigNumber(5) },
        { tokenId: networkConfig.celoTokenId, balance: new BigNumber('0.001') },
      ],
      bootstrapState: freshState(),
      now: NOW,
      gateOn: true,
    })
    expect(result).toEqual({ shouldOffer: false, reason: 'has-other-gas-option' })
  })

  it('skips when the user has USDm balance (Mento stable pays gas without approve)', () => {
    const result = detectShouldOfferBootstrap({
      balances: [
        { tokenId: networkConfig.usdtTokenId, balance: new BigNumber(2) },
        { tokenId: networkConfig.usdmTokenId, balance: new BigNumber('0.5') },
      ],
      bootstrapState: freshState(),
      now: NOW,
      gateOn: true,
    })
    expect(result).toEqual({ shouldOffer: false, reason: 'has-other-gas-option' })
  })

  it('skips when both adapters are already locally flagged as bootstrapped', () => {
    const result = detectShouldOfferBootstrap({
      balances: [
        { tokenId: networkConfig.usdcTokenId, balance: new BigNumber(5) },
        { tokenId: networkConfig.usdtTokenId, balance: new BigNumber(2) },
      ],
      bootstrapState: freshState({
        USDC: { bootstrapped: true, lastAttemptAt: null, lastSuccessAt: NOW, lastError: null },
        USDT: { bootstrapped: true, lastAttemptAt: null, lastSuccessAt: NOW, lastError: null },
      }),
      now: NOW,
      gateOn: true,
    })
    expect(result).toEqual({ shouldOffer: false, reason: 'all-adapters-bootstrapped' })
  })

  it('still offers USDT when USDC is bootstrapped but USDT is not', () => {
    const result = detectShouldOfferBootstrap({
      balances: [
        { tokenId: networkConfig.usdcTokenId, balance: new BigNumber(5) },
        { tokenId: networkConfig.usdtTokenId, balance: new BigNumber(2) },
      ],
      bootstrapState: freshState({
        USDC: { bootstrapped: true, lastAttemptAt: null, lastSuccessAt: NOW, lastError: null },
      }),
      now: NOW,
      gateOn: true,
    })
    expect(result).toEqual({ shouldOffer: true, adaptersToBootstrap: ['USDT'] })
  })

  it('skips when every candidate adapter is within the 24h debounce window', () => {
    const halfWindow = BOOTSTRAP_DEBOUNCE_MS / 2
    const result = detectShouldOfferBootstrap({
      balances: [
        { tokenId: networkConfig.usdcTokenId, balance: new BigNumber(5) },
        { tokenId: networkConfig.usdtTokenId, balance: new BigNumber(2) },
      ],
      bootstrapState: freshState({
        USDC: {
          bootstrapped: false,
          lastAttemptAt: NOW - halfWindow,
          lastSuccessAt: null,
          lastError: 'transient',
        },
        USDT: {
          bootstrapped: false,
          lastAttemptAt: NOW - halfWindow,
          lastSuccessAt: null,
          lastError: 'transient',
        },
      }),
      now: NOW,
      gateOn: true,
    })
    expect(result).toEqual({ shouldOffer: false, reason: 'in-debounce-window' })
  })

  it('still fires when at least one candidate is outside the debounce window', () => {
    const halfWindow = BOOTSTRAP_DEBOUNCE_MS / 2
    const beyondWindow = BOOTSTRAP_DEBOUNCE_MS + 1000
    const result = detectShouldOfferBootstrap({
      balances: [
        { tokenId: networkConfig.usdcTokenId, balance: new BigNumber(5) },
        { tokenId: networkConfig.usdtTokenId, balance: new BigNumber(2) },
      ],
      bootstrapState: freshState({
        USDC: {
          bootstrapped: false,
          lastAttemptAt: NOW - halfWindow,
          lastSuccessAt: null,
          lastError: 'transient',
        },
        USDT: {
          bootstrapped: false,
          lastAttemptAt: NOW - beyondWindow,
          lastSuccessAt: null,
          lastError: 'transient',
        },
      }),
      now: NOW,
      gateOn: true,
    })
    // Saga sees both candidates and lets backend decide which to skip; the
    // detector only gates on "any one is fresh enough to attempt".
    expect(result).toEqual({ shouldOffer: true, adaptersToBootstrap: ['USDC', 'USDT'] })
  })
})
