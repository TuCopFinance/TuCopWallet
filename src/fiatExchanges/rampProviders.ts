import { StatsigFeatureGates } from 'src/statsig/types'

// 'offramp': the user turns COPm into COP in their bank account (withdraw).
// 'onramp': the user turns COP from their bank into COPm (deposit).
export type RampDirection = 'offramp' | 'onramp'

// The two providers the wallet offers under Spend, in display order.
//
// TuCOP Ramp is the direct ramp: COPm goes to the TuCOP multisig and an
// operator pays COP from TuCOP's Bancolombia account (or the other way round
// for deposits). 1:1, no fee, up to 24 hours.
//
// Bridge Ramp uses Bridge as the provider: COPm is swapped to USDC on Mento
// and liquidated by Bridge to the user's own Bre-B key (or the other way
// round). Minutes, with a fee, and only while Mento's COPm oracle is live.
type RampProviderId = 'tucopramp' | 'bridgeramp'

export interface RampProviderDefinition {
  id: RampProviderId
  gate: Record<RampDirection, StatsigFeatureGates>
  // i18n keys live under `rampProviders.<id>.*`
  i18nKey: string
  // Bridge Ramp depends on the Mento COPm oracle; TuCOP Ramp does not.
  requiresCopmOracle: boolean
}

export const RAMP_PROVIDERS: RampProviderDefinition[] = [
  {
    id: 'tucopramp',
    gate: {
      offramp: StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP,
      onramp: StatsigFeatureGates.SHOW_TUCOPRAMP_ONRAMP,
    },
    i18nKey: 'rampProviders.tucopramp',
    requiresCopmOracle: false,
  },
  {
    id: 'bridgeramp',
    gate: {
      offramp: StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP,
      onramp: StatsigFeatureGates.SHOW_BRIDGERAMP_ONRAMP,
    },
    i18nKey: 'rampProviders.bridgeramp',
    requiresCopmOracle: true,
  },
]
