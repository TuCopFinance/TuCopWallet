import { StatsigFeatureGates } from 'src/statsig/types'

// 'offramp': the user turns COPm into COP in their bank account (withdraw).
// 'onramp': the user turns COP from their bank into COPm (deposit).
export type RampDirection = 'offramp' | 'onramp'

// The two providers the wallet offers for deposits and withdrawals, in display
// order.
//
// TuCOP Ramp P2P (`tucopramp`) is the direct ramp: COPm goes to the TuCOP multisig and an
// operator pays COP from TuCOP's Bancolombia account (or the other way round
// for deposits). 1:1, no fee, up to 24 hours.
//
// TuCOP Ramp (`bridgeramp`, powered by Bridge) uses Bridge as the provider: COPm is swapped to USDC on Mento
// and liquidated by Bridge to the user's own Bre-B key (or the other way
// round). Minutes, with a fee, and only while Mento's COPm oracle is live.
type RampProviderId = 'tucopramp' | 'bridgeramp'

// Value reported to analytics. Named after what the user sees (both are
// "TuCOP Ramp"), not after the code modules.
export type RampAnalyticsId = 'tucopramp_p2p' | 'tucopramp_bridge'

// Stage a ramp run had reached when it failed. Mirrors the funnel events in
// FiatExchangeEvents so a drop-off can be attributed to a step.
export type RampFunnelStage = 'start' | 'quote' | 'order' | 'settlement'

export interface RampProviderDefinition {
  id: RampProviderId
  analyticsId: RampAnalyticsId
  gate: Record<RampDirection, StatsigFeatureGates>
  // i18n keys live under `rampProviders.<id>.*`
  i18nKey: string
  // TuCOP Ramp (Bridge) depends on the Mento COPm oracle; TuCOP Ramp P2P does not.
  requiresCopmOracle: boolean
}

export const RAMP_PROVIDERS: RampProviderDefinition[] = [
  {
    id: 'tucopramp',
    analyticsId: 'tucopramp_p2p',
    gate: {
      offramp: StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP,
      onramp: StatsigFeatureGates.SHOW_TUCOPRAMP_ONRAMP,
    },
    i18nKey: 'rampProviders.tucopramp',
    requiresCopmOracle: false,
  },
  {
    id: 'bridgeramp',
    analyticsId: 'tucopramp_bridge',
    gate: {
      offramp: StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP,
      onramp: StatsigFeatureGates.SHOW_BRIDGERAMP_ONRAMP,
    },
    i18nKey: 'rampProviders.bridgeramp',
    requiresCopmOracle: true,
  },
]
