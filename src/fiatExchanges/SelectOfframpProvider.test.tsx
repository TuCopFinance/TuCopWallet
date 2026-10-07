import { render } from '@testing-library/react-native'
import * as React from 'react'
import SelectOfframpProvider from 'src/fiatExchanges/SelectOfframpProvider'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'

jest.mock('src/statsig')

describe('SelectOfframpProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the TuCOP Ramp tile with its brand line when the gate is on', () => {
    jest
      .mocked(getFeatureGate)
      .mockImplementation((gate) => gate === StatsigFeatureGates.SHOW_TUCOPRAMP_OFFRAMP)

    const { getByTestId, getByText } = render(<SelectOfframpProvider />)

    expect(getByTestId('offramp-provider-tucopramp')).toBeTruthy()
    expect(getByText('tucopramp.providerName')).toBeTruthy()
    expect(getByTestId('offramp-provider-tucopramp-by')).toHaveTextContent('tucopramp.providerBy')
  })

  it('hides the TuCOP Ramp tile when the gate is off', () => {
    jest.mocked(getFeatureGate).mockReturnValue(false)

    const { queryByTestId } = render(<SelectOfframpProvider />)

    expect(queryByTestId('offramp-provider-tucopramp')).toBeNull()
  })
})
