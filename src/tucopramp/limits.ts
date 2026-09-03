// Operational caps for the TuCOPRamp integration.
//
// The server is the source of truth (`GET /v1/p2p/limits`), fetched at boot
// by fetchLimitsSaga and persisted in the tucopramp Redux slice with a 12h
// TTL. When the persisted value is present, callers get the runtime value;
// otherwise (fresh install, fetch still in flight on first boot, or fetch
// failure) callers fall back to TUCOPRAMP_HARDCODED_LIMITS below. The
// hardcoded default matches the server default the day this file was
// written (2026-08-31); when Ops changes the server caps, this hardcoded
// default stays as a safety net rather than being kept in lockstep.
//
// Callers should always go through getCachedLimits() so a runtime update
// from the server takes effect without a wallet release. Reading the
// individual fields as top-level constants would freeze them at import
// time and defeat the point of the runtime fetch.

import { store } from 'src/redux/store'
import { limitsSelector } from 'src/tucopramp/selectors'
import type { TucopRampLimits } from 'src/tucopramp/types'

export const TUCOPRAMP_HARDCODED_LIMITS: TucopRampLimits = {
  min_order_cop: 100_000,
  max_order_cop: 500_000,
  max_daily_cop: 1_000_000,
  max_monthly_cop: 3_000_000,
}

// Preferred lookup. Reads the persisted slice value; on cold cache falls back
// to the hardcoded default so the UI never renders `undefined` limits.
export function getCachedLimits(): TucopRampLimits {
  const state = store.getState()
  return limitsSelector(state) ?? TUCOPRAMP_HARDCODED_LIMITS
}

// Client-side cedula validation. Mirrors the server-side regex so the UI
// rejects obvious garbage before the round-trip; server still re-validates.
// Colombia national IDs are 6-10 digits, no letters, no separators. Anything
// outside the range gets 400 cedula_invalid_format from the server today.
export const CEDULA_REGEX = /^\d{6,10}$/

export function isValidCedula(cedula: string): boolean {
  return CEDULA_REGEX.test(cedula)
}
