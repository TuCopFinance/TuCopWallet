// Operational caps agreed with TuCOPRamp Ops on 2026-08-31, enforced server-side
// via Railway env vars (P2P_MIN_ORDER_COP / P2P_MAX_ORDER_COP /
// P2P_MAX_DAILY_COP / P2P_MAX_MONTHLY_COP). Duplicated here as soft validation
// so the UI can reject over-cap amounts before the round-trip. If Ops bumps
// the caps server-side, bump these constants in the same commit.

export const TUCOPRAMP_MIN_ORDER_COP = 100_000
export const TUCOPRAMP_MAX_ORDER_COP = 500_000
export const TUCOPRAMP_MAX_DAILY_COP = 1_000_000
export const TUCOPRAMP_MAX_MONTHLY_COP = 3_000_000
