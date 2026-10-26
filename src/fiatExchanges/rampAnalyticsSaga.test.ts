import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import {
  depositCreating,
  depositFailed,
  depositSettled,
  withdrawCreating,
  withdrawFailed,
  withdrawPayoutUpdated,
  withdrawReady,
} from 'src/bridgeramp/slice'
import {
  handleRampAnalyticsAction,
  resetRampFunnelStages,
} from 'src/fiatExchanges/rampAnalyticsSaga'
import {
  offrampAdvance,
  offrampError,
  offrampOrderCreated,
  offrampQuoteReady,
  offrampQuoting,
} from 'src/tucopramp/slice'

jest.mock('src/analytics/AppAnalytics')

const track = AppAnalytics.track as jest.Mock

// Feeds actions through the handler one by one, the way takeEvery would.
function feed(actions: unknown[]) {
  actions.forEach((action) => handleRampAnalyticsAction(action as never))
}

const eventNames = () => track.mock.calls.map((call) => call[0])

beforeEach(() => {
  jest.clearAllMocks()
  resetRampFunnelStages()
})

describe('rampAnalyticsSaga', () => {
  it('reports the TuCOP Ramp P2P withdraw funnel in order', () => {
    feed([
      offrampQuoting(),
      offrampQuoteReady({} as never),
      offrampOrderCreated({} as never),
      offrampAdvance({ status: 'completed' } as never),
    ])

    expect(eventNames()).toEqual([
      FiatExchangeEvents.ramp_flow_start,
      FiatExchangeEvents.ramp_quote_ready,
      FiatExchangeEvents.ramp_order_created,
      FiatExchangeEvents.ramp_flow_completed,
    ])
    track.mock.calls.forEach((call) => {
      expect(call[1]).toMatchObject({ ramp: 'tucopramp_p2p', direction: 'offramp' })
    })
  })

  it('does not report completion for a non-final advance', () => {
    feed([offrampQuoting(), offrampAdvance({ status: 'processing' } as never)])

    expect(eventNames()).toEqual([FiatExchangeEvents.ramp_flow_start])
  })

  it('attributes a failure to the last stage the run reached', () => {
    feed([
      offrampQuoting(),
      offrampQuoteReady({} as never),
      offrampError({ code: 'quote_expired' } as never),
    ])

    expect(track).toHaveBeenLastCalledWith(FiatExchangeEvents.ramp_flow_error, {
      ramp: 'tucopramp_p2p',
      direction: 'offramp',
      stage: 'quote',
      errorCode: 'quote_expired',
    })
  })

  it('reports the Bridge withdraw funnel, including the payout outcome', () => {
    feed([
      withdrawCreating({ copmAmountIn: '1000' } as never),
      withdrawReady({} as never),
      withdrawPayoutUpdated({ status: 'payment_processed' } as never),
    ])

    expect(eventNames()).toEqual([
      FiatExchangeEvents.ramp_flow_start,
      FiatExchangeEvents.ramp_quote_ready,
      FiatExchangeEvents.ramp_flow_completed,
    ])
    track.mock.calls.forEach((call) => {
      expect(call[1]).toMatchObject({ ramp: 'tucopramp_bridge', direction: 'offramp' })
    })
  })

  it('reports a returned Bridge payout as a failure', () => {
    feed([
      withdrawCreating({ copmAmountIn: '1000' } as never),
      withdrawPayoutUpdated({ status: 'returned' } as never),
    ])

    expect(track).toHaveBeenLastCalledWith(FiatExchangeEvents.ramp_flow_error, {
      ramp: 'tucopramp_bridge',
      direction: 'offramp',
      stage: 'start',
      errorCode: 'payout_returned',
    })
  })

  it('stays quiet while a Bridge payout is still processing', () => {
    feed([
      withdrawCreating({ copmAmountIn: '1000' } as never),
      withdrawPayoutUpdated({ status: 'payment_submitted' } as never),
    ])

    expect(eventNames()).toEqual([FiatExchangeEvents.ramp_flow_start])
  })

  it('reports the Bridge deposit funnel', () => {
    feed([depositCreating({} as never), depositSettled({ usdcBaseline: '0', at: 1 } as never)])

    expect(eventNames()).toEqual([
      FiatExchangeEvents.ramp_flow_start,
      FiatExchangeEvents.ramp_flow_completed,
    ])
    track.mock.calls.forEach((call) => {
      expect(call[1]).toMatchObject({ ramp: 'tucopramp_bridge', direction: 'onramp' })
    })
  })

  it('carries the error code on a failed Bridge run', () => {
    feed([
      withdrawCreating({ copmAmountIn: '1' } as never),
      withdrawFailed({ code: 'no_wallet' } as never),
    ])

    expect(track).toHaveBeenLastCalledWith(
      FiatExchangeEvents.ramp_flow_error,
      expect.objectContaining({ errorCode: 'no_wallet' })
    )
  })

  it('keeps the two ramps independent', () => {
    feed([
      offrampQuoting(),
      offrampQuoteReady({} as never),
      depositCreating({} as never),
      depositFailed({ code: 'deposit_boom' } as never),
    ])

    // The Bridge deposit failed at 'start'; the P2P run reaching 'quote' must
    // not bleed into it.
    expect(track).toHaveBeenLastCalledWith(FiatExchangeEvents.ramp_flow_error, {
      ramp: 'tucopramp_bridge',
      direction: 'onramp',
      stage: 'start',
      errorCode: 'deposit_boom',
    })
  })

  it('ignores actions it does not watch', () => {
    feed([{ type: 'something/else', payload: {} }])

    expect(track).not.toHaveBeenCalled()
  })
})
