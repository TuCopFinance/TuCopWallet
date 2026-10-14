import BigNumber from 'bignumber.js'
import type { TFunction } from 'i18next'
import { Party, partyCanTransact } from 'src/bridgeramp/api'

// Bridge pays nothing below this (COP). Enforced in the app until TuCOPRamp
// returns limits for the wallet consumer; the withdrawal address reports its
// own floor and that wins when present.
export const BRIDGE_MIN_COP = 4_000

// Amounts on these screens go through BigNumber's toFormat, which App.tsx
// configures with the device's separators, so every number reads the same.
export function formatCop(amount: BigNumber.Value): string {
  return new BigNumber(amount).toFormat(0)
}

// COPm, shown to the user as digital pesos.
export function digitalPesosLabel(t: TFunction, amount: BigNumber.Value): string {
  return t('bridgeramp.units.digitalPesos', { amount: formatCop(amount) })
}

// Bank pesos (COP) paid out or paid in.
export function pesosLabel(t: TFunction, amount: BigNumber.Value): string {
  return t('bridgeramp.units.pesos', { amount: formatCop(amount) })
}

// USDC / USDm, shown to the user as dollars (never the ticker).
export function dollarsLabel(t: TFunction, amount: BigNumber.Value): string {
  return t('bridgeramp.units.dollars', { amount: new BigNumber(amount).toFormat(2) })
}

const DOLLAR_SYMBOLS = new Set(['USDM', 'USDC', 'USDT'])

// The network fee can be paid in COPm or a dollar token; name the unit the
// way the rest of the app does instead of showing the raw symbol.
export function feeUnitLabel(t: TFunction, symbol: string): string {
  const upper = symbol.toUpperCase()
  if (upper === 'COPM') return t('bridgeramp.units.pesosWord')
  if (DOLLAR_SYMBOLS.has(upper)) return t('bridgeramp.units.dollarsWord')
  return symbol
}

// What keeps a party from using TuCOP Ramp, most serious first. Each one has
// its own message; null when the party can transact.
export type PartyBlocker =
  | 'restricted'
  | 'rejected'
  | 'suspended'
  | 'under_review'
  | 'kyc_incomplete'
  | 'tos_pending'
  | 'endorsement_pending'

export function partyBlocker(party: Party): PartyBlocker | null {
  if (partyCanTransact(party)) return null
  if (party.restricted) return 'restricted'
  const { kyc, tos } = party.status
  if (kyc === 'rejected') return 'rejected'
  // Bridge also reports paused / offboarded customers; same outcome for the
  // user: the account cannot be used and support has to look at it.
  if (kyc === 'suspended' || kyc === 'paused' || kyc === 'offboarded') return 'suspended'
  if (kyc === 'under_review' || kyc === 'pending') return 'under_review'
  if (kyc !== 'approved') return 'kyc_incomplete'
  if (tos !== 'accepted') return 'tos_pending'
  return 'endorsement_pending'
}
