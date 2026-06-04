import BigNumber from 'bignumber.js'
import {
  inFlightSelector,
  hasInFlightSelector,
  inFlightProgressSelector,
} from 'src/dollarsSpend/selectors'
import { SpendStep } from 'src/dollarsSpend/types'

const step: SpendStep = {
  tokenId: 'celo-mainnet:usat',
  symbol: 'USAT',
  amountUsd: new BigNumber(30),
  amountTokenWhole: new BigNumber(30),
}

describe('dollarsSpend selectors', () => {
  it('inFlightSelector returns null when no in-flight session', () => {
    expect(inFlightSelector({ dollarsSpend: { inFlight: null } } as any)).toBeNull()
  })

  it('inFlightSelector returns the in-flight session when present', () => {
    const session = {
      plannedSteps: [step],
      completedSteps: 0,
      failedAtIndex: null,
      lastError: null,
    }
    expect(inFlightSelector({ dollarsSpend: { inFlight: session } } as any)).toEqual(session)
  })

  it('hasInFlightSelector returns false / true', () => {
    expect(hasInFlightSelector({ dollarsSpend: { inFlight: null } } as any)).toBe(false)
    expect(
      hasInFlightSelector({
        dollarsSpend: {
          inFlight: {
            plannedSteps: [step],
            completedSteps: 0,
            failedAtIndex: null,
            lastError: null,
          },
        },
      } as any)
    ).toBe(true)
  })

  it('inFlightProgressSelector returns { completed, total, failedAtIndex }', () => {
    expect(
      inFlightProgressSelector({
        dollarsSpend: {
          inFlight: {
            plannedSteps: [step, step],
            completedSteps: 1,
            failedAtIndex: null,
            lastError: null,
          },
        },
      } as any)
    ).toEqual({ completed: 1, total: 2, failedAtIndex: null })
  })

  it('inFlightProgressSelector returns null when no in-flight', () => {
    expect(inFlightProgressSelector({ dollarsSpend: { inFlight: null } } as any)).toBeNull()
  })
})
