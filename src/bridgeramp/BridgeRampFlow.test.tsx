import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import BridgeRampFlow from 'src/bridgeramp/BridgeRampFlow'
import { getCopmOracleStatus } from 'src/bridgeramp/mentoOracle'
import { MentoOracleUnavailableError, quoteMentoSwap } from 'src/bridgeramp/mentoRouter'
import { Screens } from 'src/navigator/Screens'
import { getMockStackScreenProps } from 'test/utils'

jest.mock('src/bridgeramp/mentoOracle')
jest.mock('src/bridgeramp/mentoRouter', () => ({
  ...jest.requireActual('src/bridgeramp/mentoRouter'),
  quoteMentoSwap: jest.fn(),
}))

const mockOracle = jest.mocked(getCopmOracleStatus)
const mockQuote = jest.mocked(quoteMentoSwap)

const freshOracle = {
  fresh: true,
  lastReportAt: 1_791_579_364,
  ageSeconds: 60,
  expirySeconds: 360,
  copPerUsd: 3195,
}

function renderFlow(direction: 'offramp' | 'onramp') {
  return render(
    <BridgeRampFlow {...getMockStackScreenProps(Screens.BridgeRampFlow, { direction })} />
  )
}

describe('BridgeRampFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockOracle.mockResolvedValue(freshOracle)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('quotes a COPm -> USDC withdrawal through Mento for the typed amount', async () => {
    const amountIn = BigInt('800000000000000000000000')
    mockQuote.mockResolvedValue({
      direction: 'copmToUsdc',
      amountIn,
      amountOut: BigInt(247_338_318),
      amountInWhole: new BigNumber('800000'),
      amountOutWhole: new BigNumber('247.338318'),
      copPerUsd: new BigNumber('3234.44'),
      quotedAt: 0,
    })

    const { getByTestId, queryByTestId } = renderFlow('offramp')
    fireEvent.changeText(getByTestId('bridgeramp-amount'), '800000')
    await act(async () => {
      jest.advanceTimersByTime(500)
    })

    await waitFor(() => expect(getByTestId('bridgeramp-quote')).toBeTruthy())
    expect(mockQuote).toHaveBeenCalledWith('copmToUsdc', amountIn)
    expect(getByTestId('bridgeramp-quote')).toHaveTextContent('800,000 pesos digitales')
    expect(getByTestId('bridgeramp-quote')).toHaveTextContent('247.34 USDC')
    expect(getByTestId('bridgeramp-quote')).toHaveTextContent('3,234.44 COP / USD')
    expect(queryByTestId('bridgeramp-oracle-stale')).toBeNull()
    expect(getByTestId('bridgeramp-continue')).toBeDisabled()
  })

  it('quotes USDC -> COPm for a deposit', async () => {
    mockQuote.mockResolvedValue({
      direction: 'usdcToCopm',
      amountIn: BigInt(100_000_000),
      amountOut: BigInt('319000000000000000000000'),
      amountInWhole: new BigNumber('100'),
      amountOutWhole: new BigNumber('319000'),
      copPerUsd: new BigNumber('3190'),
      quotedAt: 0,
    })

    const { getByTestId } = renderFlow('onramp')
    fireEvent.changeText(getByTestId('bridgeramp-amount'), '320000')
    await act(async () => {
      jest.advanceTimersByTime(500)
    })

    await waitFor(() => expect(getByTestId('bridgeramp-quote')).toBeTruthy())
    expect(mockQuote).toHaveBeenCalledWith('usdcToCopm', expect.any(BigInt))
    expect(getByTestId('bridgeramp-quote')).toHaveTextContent('319,000 pesos digitales')
  })

  it('shows the banking-hours notice when the oracle has no valid median', async () => {
    mockQuote.mockRejectedValue(new MentoOracleUnavailableError())

    const { getByTestId, queryByTestId } = renderFlow('offramp')
    fireEvent.changeText(getByTestId('bridgeramp-amount'), '100000')
    await act(async () => {
      jest.advanceTimersByTime(500)
    })

    await waitFor(() => expect(getByTestId('bridgeramp-oracle-stale')).toBeTruthy())
    expect(queryByTestId('bridgeramp-quote')).toBeNull()
  })

  it('does not quote amounts under the Bridge minimum', async () => {
    const { getByTestId, getByText } = renderFlow('offramp')
    fireEvent.changeText(getByTestId('bridgeramp-amount'), '3999')
    await act(async () => {
      jest.advanceTimersByTime(500)
    })

    expect(mockQuote).not.toHaveBeenCalled()
    expect(getByText('bridgeramp.amountBelowMin, {"min":"4.000"}')).toBeTruthy()
  })
})
