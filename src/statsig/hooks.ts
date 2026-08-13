import { useEffect, useState } from 'react'
import { getFeatureGate, getStatsigClient } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'

// React hook that returns a Statsig gate value AND re-evaluates when the
// Statsig client's internal values change (initialize + refresh). Fixes
// the race where `useMemo(() => getFeatureGate(x), [])` froze the default
// (false) value while the SDK bundle was still fetching, so any gate
// created after the last cached bundle stayed hidden for the entire JS
// session even after the SDK caught up. Applies to any gate that can be
// server-side flipped mid-campaign (donations, feature flags rolled out
// after the app version shipped, etc).
export function useFeatureGate(gate: StatsigFeatureGates): boolean {
  const [value, setValue] = useState<boolean>(() => getFeatureGate(gate))
  useEffect(() => {
    // Re-evaluate immediately in case the value changed between the useState
    // initializer and this effect firing (common on cold app open when
    // Statsig init resolves between render and effect).
    setValue(getFeatureGate(gate))
    const client = getStatsigClient()
    if (!client) return
    const listener = () => setValue(getFeatureGate(gate))
    client.on('values_updated', listener)
    return () => {
      client.off('values_updated', listener)
    }
  }, [gate])
  return value
}
