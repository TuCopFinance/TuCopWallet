import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import * as React from 'react'
import { Provider } from 'react-redux'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { FiatExchangeEvents } from 'src/analytics/Events'
import { getCopmOracleStatus } from 'src/bridgeramp/mentoOracle'
import SelectRampProvider from 'src/fiatExchanges/SelectRampProvider'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { RootState } from 'src/redux/reducers'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { checkActiveOfframpOrder } from 'src/tucopramp/saga'
import { RecursivePartial, createMockStore, getMockStackScreenProps } from 'test/utils'

jest.mock('src/statsig')
jest.mock('src/bridgeramp/mentoOracle')

const mockOracle = jest.mocked(getCopmOracleStatus)

const freshOracle = {
  fresh: true,
  lastReportAt: 1_791_579_364,
  ageSeconds: 60,
  expirySeconds: 360,
  copPerUsd: 3195,
}

function enableGates(gates: StatsigFeatureGates[]) {
  jest.mocked(getFeatureGate).mockImplementation((gate) => gates.includes(gate))
}

function renderScreen(
  direction: 'offramp' | 'onramp',
  storeOverrides: RecursivePartial<RootState> = {}
) {
  const store = createMockStore(storeOverrides)
  const result = render(
    <Provider store={store}>
      <SelectRampProvider {...getMockStackScreenProps(Screens.SelectRampProvider, { direction })} />
    </Provider>
  )
  return { ...result, store }
}

describe('SelectRampProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOracle.mockResolvedValue(freshOracle)
  })

  it('lists TuCOP Ramp as coming soon when its gate is off and opens the P2P off-ramp flow', () => {
    enableGates([StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP])

    const { getByTestId, queryByTestId } = renderScreen('offramp')

    expect(getByTestId('ramp-provider-tucopramp-by')).toHaveTextContent(
      'rampProviders.tucopramp.by'
    )
    expect(getByTestId('ramp-provider-bridgeramp-coming-soon')).toHaveTextContent(
      'rampProviders.comingSoon'
    )
    expect(queryByTestId('ramp-provider-bridgeramp-blocked')).toBeNull()
    expect(mockOracle).not.toHaveBeenCalled()

    fireEvent.press(getByTestId('ramp-provider-bridgeramp'))
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.press(getByTestId('ramp-provider-tucopramp'))
    expect(navigate).toHaveBeenCalledWith(Screens.TuCOPRampOfframpFlow)
  })

  it('opens the TuCOP Ramp on-ramp flow for deposits', () => {
    enableGates([StatsigFeatureGates.SHOW_TUCOPRAMP_ONRAMP])

    const { getByTestId } = renderScreen('onramp')

    fireEvent.press(getByTestId('ramp-provider-tucopramp'))
    expect(navigate).toHaveBeenCalledWith(Screens.TuCOPRampOnrampFlow)
  })

  it('shows Bridge Ramp as available when the COPm oracle is fresh', async () => {
    enableGates([
      StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP,
      StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP,
    ])

    const { getByTestId, queryByTestId } = renderScreen('offramp')

    expect(getByTestId('ramp-provider-bridgeramp-by')).toHaveTextContent(
      'rampProviders.bridgeramp.by'
    )
    await waitFor(() => expect(queryByTestId('ramp-provider-bridgeramp-checking')).toBeNull())
    expect(queryByTestId('ramp-provider-bridgeramp-blocked')).toBeNull()

    fireEvent.press(getByTestId('ramp-provider-bridgeramp'))
    expect(navigate).toHaveBeenCalledWith(Screens.BridgeRampFlow, { direction: 'offramp' })
  })

  it('blocks Bridge Ramp when the COPm oracle is stale and keeps TuCOP Ramp usable', async () => {
    enableGates([
      StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP,
      StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP,
    ])
    mockOracle.mockResolvedValue({ ...freshOracle, fresh: false, ageSeconds: 22_816 })

    const { getByTestId } = renderScreen('offramp')

    await waitFor(() =>
      expect(getByTestId('ramp-provider-bridgeramp-blocked')).toHaveTextContent(
        'rampProviders.bridgeramp.outsideHours'
      )
    )
    await act(async () => {
      fireEvent.press(getByTestId('ramp-provider-bridgeramp'))
    })
    expect(navigate).not.toHaveBeenCalledWith(Screens.BridgeRampFlow, expect.anything())

    fireEvent.press(getByTestId('ramp-provider-tucopramp'))
    expect(navigate).toHaveBeenCalledWith(Screens.TuCOPRampOfframpFlow)
  })

  it('blocks Bridge Ramp when the oracle cannot be read', async () => {
    enableGates([StatsigFeatureGates.SHOW_BRIDGERAMP_ONRAMP])
    mockOracle.mockRejectedValue(new Error('rpc down'))

    const { getByTestId } = renderScreen('onramp')

    await waitFor(() =>
      expect(getByTestId('ramp-provider-bridgeramp-blocked')).toHaveTextContent(
        'rampProviders.bridgeramp.unreachable'
      )
    )
  })

  it('tells the user when no provider is enabled', () => {
    enableGates([])

    const { getByTestId } = renderScreen('offramp')

    expect(getByTestId('ramp-provider-none')).toBeTruthy()
  })
  it('uses the no-alternative copy when TuCOP Ramp P2P is hidden', async () => {
    enableGates([StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP])
    mockOracle.mockResolvedValue({ ...freshOracle, fresh: false, ageSeconds: 22_816 })

    const { getByTestId } = renderScreen('offramp')

    await waitFor(() =>
      expect(getByTestId('ramp-provider-bridgeramp-blocked')).toHaveTextContent(
        'rampProviders.bridgeramp.outsideHoursNoAlternative'
      )
    )
  })

  it('retries the availability check right away after an error', async () => {
    enableGates([
      StatsigFeatureGates.SHOW_TUCOPRAMP_ONRAMP,
      StatsigFeatureGates.SHOW_BRIDGERAMP_ONRAMP,
    ])
    mockOracle.mockRejectedValueOnce(new Error('rpc down'))

    const { getByTestId, queryByTestId } = renderScreen('onramp')

    await waitFor(() => expect(getByTestId('ramp-provider-bridgeramp-retry')).toBeTruthy())
    expect(mockOracle).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.press(getByTestId('ramp-provider-bridgeramp-retry'))
    })

    await waitFor(() => expect(queryByTestId('ramp-provider-bridgeramp-blocked')).toBeNull())
    expect(mockOracle).toHaveBeenCalledTimes(2)
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.press(getByTestId('ramp-provider-bridgeramp'))
    expect(navigate).toHaveBeenCalledWith(Screens.BridgeRampFlow, { direction: 'onramp' })
  })

  it('tracks the chooser opening and the chosen ramp', async () => {
    enableGates([
      StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP,
      StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP,
    ])

    const { getByTestId, queryByTestId } = renderScreen('offramp')

    expect(AppAnalytics.track).toHaveBeenCalledWith(FiatExchangeEvents.ramp_chooser_open, {
      direction: 'offramp',
    })

    fireEvent.press(getByTestId('ramp-provider-tucopramp'))
    expect(AppAnalytics.track).toHaveBeenCalledWith(FiatExchangeEvents.ramp_chooser_select, {
      ramp: 'tucopramp_p2p',
      direction: 'offramp',
    })

    await waitFor(() => expect(queryByTestId('ramp-provider-bridgeramp-checking')).toBeNull())
    fireEvent.press(getByTestId('ramp-provider-bridgeramp'))
    expect(AppAnalytics.track).toHaveBeenCalledWith(FiatExchangeEvents.ramp_chooser_select, {
      ramp: 'tucopramp_bridge',
      direction: 'offramp',
    })
  })

  it('checks for an active TuCOP Ramp P2P withdrawal on mount', () => {
    enableGates([StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP])

    const { store, queryByTestId } = renderScreen('offramp')

    expect(store.getActions()).toContainEqual(checkActiveOfframpOrder())
    expect(queryByTestId('ramp-resume-offramp')).toBeNull()
  })

  it('offers to resume an active P2P withdrawal even when its gate is off', () => {
    enableGates([StatsigFeatureGates.SHOW_BRIDGERAMP_OFFRAMP])

    const { getByTestId } = renderScreen('offramp', {
      tucopramp: { offramp: { activeCheckStatus: 'done', activeOrderId: 'order-1' } },
    })

    expect(getByTestId('ramp-provider-tucopramp-coming-soon')).toBeTruthy()
    expect(getByTestId('ramp-resume-offramp')).toBeTruthy()

    fireEvent.press(getByTestId('ramp-resume-offramp/rampProviders.resumeOfframp.cta'))
    expect(navigate).toHaveBeenCalledWith(Screens.TuCOPRampOfframpFlow)
  })

  it('lists TuCOP Ramp P2P as coming soon for deposits while its gate is off', () => {
    enableGates([StatsigFeatureGates.SHOW_BRIDGERAMP_ONRAMP])

    const { getByTestId } = renderScreen('onramp')

    expect(getByTestId('ramp-provider-tucopramp-coming-soon')).toBeTruthy()
    fireEvent.press(getByTestId('ramp-provider-tucopramp'))
    expect(navigate).not.toHaveBeenCalledWith(Screens.TuCOPRampOnrampFlow)
  })

  it('shows the resume banner while a local P2P withdrawal is processing', () => {
    enableGates([])

    const { getByTestId } = renderScreen('onramp', {
      tucopramp: { offramp: { status: 'processing' } },
    })

    expect(getByTestId('ramp-resume-offramp')).toBeTruthy()
  })
})
