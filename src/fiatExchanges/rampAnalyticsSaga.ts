import { PayloadAction } from '@reduxjs/toolkit'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import type { WithdrawalPayout } from 'src/bridgeramp/api'
import {
  depositCreating,
  depositFailed,
  depositReady,
  depositSettled,
  payoutOutcome,
  swapFailed,
  withdrawAwaitingPayout,
  withdrawCreating,
  withdrawFailed,
  withdrawPayoutUpdated,
  withdrawReady,
} from 'src/bridgeramp/slice'
import { RampAnalyticsId, RampDirection, RampFunnelStage } from 'src/fiatExchanges/rampProviders'
import {
  offrampAdvance,
  offrampCreatingOrder,
  offrampError,
  offrampOrderCreated,
  offrampQuoteReady,
  offrampQuoting,
  onrampAdvance,
  onrampCreatingOrder,
  onrampError,
  onrampOrderCreated,
  onrampQuoteReady,
  onrampQuoting,
} from 'src/tucopramp/slice'
import { call, takeEvery } from 'typed-redux-saga'

// Funnel instrumentation for both ramps.
//
// The flow screens are long and the sagas already carry the error handling, so
// rather than sprinkling track() calls through them this watcher listens to the
// slice actions the flows already dispatch. Adding a stage here never touches a
// screen, and a flow cannot forget to report one.
//
// Stages, in order: start -> quote -> order -> settlement. `ramp_flow_error`
// carries the last stage the run reached, which is what makes a drop-off
// attributable to a step.

const P2P: RampAnalyticsId = 'tucopramp_p2p'
const BRIDGE: RampAnalyticsId = 'tucopramp_bridge'

type Run = { ramp: RampAnalyticsId; direction: RampDirection }

const P2P_OFF: Run = { ramp: P2P, direction: 'offramp' }
const P2P_ON: Run = { ramp: P2P, direction: 'onramp' }
const BRIDGE_OFF: Run = { ramp: BRIDGE, direction: 'offramp' }
const BRIDGE_ON: Run = { ramp: BRIDGE, direction: 'onramp' }

// What each action means for the funnel. 'stage' only records progress without
// emitting, which is how `creating-order` is covered without double counting
// the order event.
type Step = 'start' | 'quote' | 'order' | 'completed' | 'error' | 'stage:order' | 'payout'

const STEPS: Record<string, { run: Run; step: Step }> = {
  [offrampQuoting.type]: { run: P2P_OFF, step: 'start' },
  [offrampQuoteReady.type]: { run: P2P_OFF, step: 'quote' },
  [offrampCreatingOrder.type]: { run: P2P_OFF, step: 'stage:order' },
  [offrampOrderCreated.type]: { run: P2P_OFF, step: 'order' },
  [offrampAdvance.type]: { run: P2P_OFF, step: 'completed' },
  [offrampError.type]: { run: P2P_OFF, step: 'error' },

  [onrampQuoting.type]: { run: P2P_ON, step: 'start' },
  [onrampQuoteReady.type]: { run: P2P_ON, step: 'quote' },
  [onrampCreatingOrder.type]: { run: P2P_ON, step: 'stage:order' },
  [onrampOrderCreated.type]: { run: P2P_ON, step: 'order' },
  [onrampAdvance.type]: { run: P2P_ON, step: 'completed' },
  [onrampError.type]: { run: P2P_ON, step: 'error' },

  [withdrawCreating.type]: { run: BRIDGE_OFF, step: 'start' },
  [withdrawReady.type]: { run: BRIDGE_OFF, step: 'quote' },
  [withdrawAwaitingPayout.type]: { run: BRIDGE_OFF, step: 'order' },
  [withdrawPayoutUpdated.type]: { run: BRIDGE_OFF, step: 'payout' },
  [withdrawFailed.type]: { run: BRIDGE_OFF, step: 'error' },
  [swapFailed.type]: { run: BRIDGE_OFF, step: 'error' },

  [depositCreating.type]: { run: BRIDGE_ON, step: 'start' },
  [depositReady.type]: { run: BRIDGE_ON, step: 'quote' },
  [depositSettled.type]: { run: BRIDGE_ON, step: 'completed' },
  [depositFailed.type]: { run: BRIDGE_ON, step: 'error' },
}

const WATCHED = Object.keys(STEPS)

// Last stage seen per run, so an error can say where it happened. Keyed by
// ramp + direction because the two ramps and the two directions are
// independent; a user can only have one run of each open at a time.
const lastStage = new Map<string, RampFunnelStage>()

const keyOf = (run: Run) => `${run.ramp}:${run.direction}`

function start(run: Run) {
  lastStage.set(keyOf(run), 'start')
  AppAnalytics.track(FiatExchangeEvents.ramp_flow_start, { ...run })
}

function quoted(run: Run) {
  lastStage.set(keyOf(run), 'quote')
  AppAnalytics.track(FiatExchangeEvents.ramp_quote_ready, { ...run })
}

function ordered(run: Run) {
  lastStage.set(keyOf(run), 'order')
  AppAnalytics.track(FiatExchangeEvents.ramp_order_created, { ...run })
}

function finish(run: Run) {
  lastStage.set(keyOf(run), 'settlement')
  AppAnalytics.track(FiatExchangeEvents.ramp_flow_completed, { ...run })
  lastStage.delete(keyOf(run))
}

function fail(run: Run, errorCode?: string) {
  AppAnalytics.track(FiatExchangeEvents.ramp_flow_error, {
    ...run,
    stage: lastStage.get(keyOf(run)) ?? 'start',
    errorCode,
  })
  lastStage.delete(keyOf(run))
}

// Exported for the tests: a finished run must not leak its stage into the next.
export function resetRampFunnelStages() {
  lastStage.clear()
}

export function handleRampAnalyticsAction(action: PayloadAction<Record<string, unknown>>) {
  const entry = STEPS[action.type]
  if (!entry) return
  const { run, step } = entry

  switch (step) {
    case 'start':
      return start(run)
    case 'quote':
      return quoted(run)
    case 'order':
      return ordered(run)
    case 'stage:order':
      lastStage.set(keyOf(run), 'order')
      return
    case 'completed':
      // tucopramp advances through many statuses on the same action; only the
      // final one is a completion.
      if (action.payload?.status === 'completed' || action.type === depositSettled.type) {
        finish(run)
      }
      return
    case 'payout': {
      // Reuse the slice's own mapping so this never drifts from the status the
      // reducer treats as final.
      const payout = action.payload as unknown as WithdrawalPayout
      const outcome = payoutOutcome(payout)
      if (outcome === 'completed') finish(run)
      if (outcome === 'failed') fail(run, `payout_${payout.status}`)
      return
    }
    case 'error':
      return fail(run, action.payload?.code as string | undefined)
  }
}

function* trackRampAction(action: PayloadAction<Record<string, unknown>>) {
  yield* call(handleRampAnalyticsAction, action)
}

export function* rampAnalyticsSaga() {
  yield* takeEvery(WATCHED, trackRampAction)
}
