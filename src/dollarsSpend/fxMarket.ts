// The COP FX rail rests on weekends: Mento suspends COP trading while the
// Colombian FX market is closed, and Squid answers 502 `squid_unavailable`
// for every Dolares -> Pesos leg (documented pattern, every Sat/Sun UTC;
// Sentry TUCOPWALLET-1H). Instead of letting the user fire a multi-swap that
// can only fail leg by leg, the planning surfaces close proactively during
// the window and tell the user to come back Monday. The runtime
// `squid_unavailable` handling stays in place as the belt for the edge hours
// around the boundary, where the upstream can close early or reopen late.
export function isCopFxWeekendPause(now: Date = new Date()): boolean {
  const day = now.getUTCDay()
  return day === 6 || day === 0
}
