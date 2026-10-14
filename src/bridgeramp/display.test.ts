import type { TFunction } from 'i18next'
import { Party } from 'src/bridgeramp/api'
import { feeUnitLabel, partyBlocker } from 'src/bridgeramp/display'

const t = ((key: string) => key) as unknown as TFunction

const party = (
  overrides: Partial<Party> & { kyc?: string; tos?: string; cop?: string }
): Party => ({
  id: 'pty_1',
  type: 'individual',
  restricted: overrides.restricted ?? false,
  status: {
    kyc: overrides.kyc ?? 'approved',
    tos: overrides.tos ?? 'accepted',
    endorsements: [{ name: 'cop', status: overrides.cop ?? 'approved' }],
  },
  created_at: '',
  updated_at: '',
})

describe('feeUnitLabel', () => {
  it.each([
    ['COPm', 'bridgeramp.units.pesosWord'],
    ['USDm', 'bridgeramp.units.dollarsWord'],
    ['USDC', 'bridgeramp.units.dollarsWord'],
    ['USDT', 'bridgeramp.units.dollarsWord'],
    ['CELO', 'CELO'],
  ])('names %s as %s', (symbol, expected) => {
    expect(feeUnitLabel(t, symbol)).toBe(expected)
  })
})

describe('partyBlocker', () => {
  it.each([
    [{}, null],
    [{ restricted: true, kyc: 'rejected' }, 'restricted'],
    [{ kyc: 'rejected' }, 'rejected'],
    [{ kyc: 'suspended' }, 'suspended'],
    [{ kyc: 'under_review', tos: 'pending' }, 'under_review'],
    [{ kyc: 'not_started', tos: 'pending' }, 'kyc_incomplete'],
    [{ kyc: 'incomplete' }, 'kyc_incomplete'],
    [{ tos: 'pending' }, 'tos_pending'],
    [{ cop: 'pending' }, 'endorsement_pending'],
  ])('maps %o to %s', (overrides, expected) => {
    expect(partyBlocker(party(overrides))).toBe(expected)
  })
})
