import { getDynamicConfigParams, getFeatureGate } from 'src/statsig'
import { DynamicConfigs } from 'src/statsig/constants'
import { StatsigDynamicConfigs, StatsigFeatureGates } from 'src/statsig/types'
import { Address, isAddress } from 'viem'

// Resolved runtime shape of the earthquake donation Statsig config. The
// dynamic config is server-controlled so ReFi Colombia can rotate the
// destination Safe, tune the match copy, retarget presets, or extend the
// campaign without shipping a wallet release. Defaults live in
// src/statsig/constants.ts; this helper reads whatever Statsig has right
// now, coerces + sanity-checks the fields, and normalizes them into a
// shape the sheet + card can consume without re-parsing.
export interface EarthquakeDonationConfig {
  destinationAddress: Address
  matchPercentage: number
  presetAmounts: number[]
  refiInstagramUrl: string
  refiTwitterUrl: string
  safeExplorerUrl: string
}

export function isEarthquakeDonationEnabled(): boolean {
  return getFeatureGate(StatsigFeatureGates.SHOW_EARTHQUAKE_DONATION_2026_08)
}

// Read + validate the config. On any invalid field (bad address, negative
// match, non-numeric presets) fall back to the defaults from
// DynamicConfigs so the feature stays operational — the campaign copy is
// worse than the feature crashing.
export function getEarthquakeDonationConfig(): EarthquakeDonationConfig {
  const defaults = DynamicConfigs[StatsigDynamicConfigs.EARTHQUAKE_DONATION_CONFIG].defaultValues
  const raw = getDynamicConfigParams(
    DynamicConfigs[StatsigDynamicConfigs.EARTHQUAKE_DONATION_CONFIG]
  )
  const destinationAddress = isAddress(String(raw.destinationAddress ?? ''))
    ? (raw.destinationAddress as Address)
    : (defaults.destinationAddress as Address)
  const matchPercentage =
    typeof raw.matchPercentage === 'number' &&
    raw.matchPercentage >= 0 &&
    raw.matchPercentage <= 100
      ? raw.matchPercentage
      : defaults.matchPercentage
  const presetsRaw = Array.isArray(raw.presetAmounts) ? raw.presetAmounts : defaults.presetAmounts
  const presetAmounts = presetsRaw
    .map((v) => (typeof v === 'number' ? v : Number(v)))
    .filter((v) => Number.isFinite(v) && v > 0)
  return {
    destinationAddress,
    matchPercentage,
    presetAmounts: presetAmounts.length > 0 ? presetAmounts : (defaults.presetAmounts as number[]),
    refiInstagramUrl: String(raw.refiInstagramUrl ?? defaults.refiInstagramUrl),
    refiTwitterUrl: String(raw.refiTwitterUrl ?? defaults.refiTwitterUrl),
    safeExplorerUrl: String(raw.safeExplorerUrl ?? defaults.safeExplorerUrl),
  }
}
