import { RAMP_PROVIDERS, RampDirection } from 'src/fiatExchanges/rampProviders'
import { navigate, navigateHome } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'

// Entry points into the ramp chooser (SelectRampProvider). Every surface that
// lets the user deposit or withdraw goes through these helpers so the chooser
// only opens when it has at least one option to show; otherwise the user gets
// the flow that existed before the ramps, never an empty screen.

// True when at least one ramp (TuCOP Ramp P2P or TuCOP Ramp) is enabled for
// the given direction.
export function isRampDirectionEnabled(direction: RampDirection): boolean {
  return RAMP_PROVIDERS.some((provider) => getFeatureGate(provider.gate[direction]))
}

// "Retirar": the chooser when a withdraw ramp is on, otherwise the legacy
// withdraw screen (cash out through the CICO providers).
export function navigateToWithdraw() {
  if (isRampDirectionEnabled('offramp')) {
    navigate(Screens.SelectRampProvider, { direction: 'offramp' })
  } else {
    navigate(Screens.WithdrawSpend)
  }
}

// "Recarga" / "Agregar": the chooser when a deposit ramp is on, otherwise the
// caller's legacy cash-in flow.
export function navigateToDeposit(legacyFlow: () => void) {
  if (isRampDirectionEnabled('onramp')) {
    navigate(Screens.SelectRampProvider, { direction: 'onramp' })
  } else {
    legacyFlow()
  }
}

type RampScreenGate =
  | { direction: RampDirection; gate: StatsigFeatureGates }
  | { direction: RampDirection; gate: null } // the chooser: any gate for the direction

function directionFromParams(params: Record<string, unknown>): RampDirection {
  return params.direction === 'onramp' ? 'onramp' : 'offramp'
}

function rampScreenGate(screen: string, params: Record<string, unknown>): RampScreenGate | null {
  switch (screen) {
    case Screens.TuCOPRampOfframpFlow:
      return { direction: 'offramp', gate: StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP }
    case Screens.TuCOPRampOnrampFlow:
      return { direction: 'onramp', gate: StatsigFeatureGates.SHOW_TUCOPRAMP_ONRAMP }
    case Screens.BridgeRampFlow: {
      const direction = directionFromParams(params)
      return {
        direction,
        gate:
          direction === 'onramp'
            ? StatsigFeatureGates.SHOW_BRIDGERAMP_ONRAMP
            : StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP,
      }
    }
    case Screens.SelectRampProvider:
      return { direction: directionFromParams(params), gate: null }
    default:
      return null
  }
}

// Guards deep links (e.g. push notifications through /openScreen) that point
// at a ramp screen. Returns true when it took care of the navigation because
// the target ramp is gated off: the user lands on the chooser if another ramp
// is still on for that direction, or on home otherwise. Returns false when
// the caller should navigate to the requested screen as usual.
export function redirectGatedRampDeepLink(
  screen: string,
  params: Record<string, unknown>
): boolean {
  const target = rampScreenGate(screen, params)
  if (!target) {
    return false
  }
  const allowed = target.gate
    ? getFeatureGate(target.gate)
    : isRampDirectionEnabled(target.direction)
  if (allowed) {
    return false
  }
  if (target.gate && isRampDirectionEnabled(target.direction)) {
    navigate(Screens.SelectRampProvider, { direction: target.direction })
  } else {
    navigateHome()
  }
  return true
}
