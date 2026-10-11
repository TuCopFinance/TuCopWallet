import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import * as React from 'react'
import { getCopmOracleStatus } from 'src/bridgeramp/mentoOracle'
import SelectRampProvider from 'src/fiatExchanges/SelectRampProvider'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { getMockStackScreenProps } from 'test/utils'

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

function renderScreen(direction: 'offramp' | 'onramp') {
  return render(
    <SelectRampProvider {...getMockStackScreenProps(Screens.SelectRampProvider, { direction })} />
  )
}

describe('SelectRampProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOracle.mockResolvedValue(freshOracle)
  })

  it('shows only TuCOP Ramp when the Bridge gate is off and opens the off-ramp flow', () => {
    enableGates([StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP])

    const { getByTestId, queryByTestId } = renderScreen('offramp')

    expect(getByTestId('ramp-provider-tucopramp-by')).toHaveTextContent(
      'rampProviders.tucopramp.by'
    )
    expect(queryByTestId('ramp-provider-bridgeramp')).toBeNull()
    expect(mockOracle).not.toHaveBeenCalled()

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
})
