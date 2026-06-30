import { expectSaga } from 'redux-saga-test-plan'
import { getFeatureGate } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { registerWalletForFeedWatch } from 'src/transactions/registerWatchSaga'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'
import networkConfig from 'src/web3/networkConfig'

jest.mock('src/statsig', () => ({
  getFeatureGate: jest.fn(),
}))
jest.mock('src/utils/fetchWithTimeout', () => ({
  fetchWithTimeout: jest.fn(),
}))

const MOCK_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

describe('registerWalletForFeedWatch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('skips the POST when WRI_TX_FEED_TUCOP_V1 is off', async () => {
    jest.mocked(getFeatureGate).mockReturnValue(false)
    const fetchMock = jest.mocked(fetchWithTimeout)
    await expectSaga(registerWalletForFeedWatch, MOCK_WALLET).run()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs the address to wriTxWatchUrl when the gate is on', async () => {
    jest
      .mocked(getFeatureGate)
      .mockImplementation((g) => g === StatsigFeatureGates.WRI_TX_FEED_TUCOP_V1)
    jest
      .mocked(fetchWithTimeout)
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expectSaga(registerWalletForFeedWatch, MOCK_WALLET).run()

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1)
    const [url, opts] = jest.mocked(fetchWithTimeout).mock.calls[0]
    expect(url).toBe(networkConfig.wriTxWatchUrl)
    expect(opts?.method).toBe('POST')
    expect(opts?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(opts?.body).toBe(JSON.stringify({ address: MOCK_WALLET }))
  })

  it('does not throw when the backend returns 5xx; logs and exits', async () => {
    jest.mocked(getFeatureGate).mockReturnValue(true)
    jest
      .mocked(fetchWithTimeout)
      .mockResolvedValue(new Response('Internal Server Error', { status: 503 }))
    // The saga must not bubble — it's a fire-and-forget side effect that
    // retries on the next boot.
    await expect(expectSaga(registerWalletForFeedWatch, MOCK_WALLET).run()).resolves.not.toThrow()
  })

  it('does not throw when fetchWithTimeout itself throws (network down / abort)', async () => {
    jest.mocked(getFeatureGate).mockReturnValue(true)
    jest.mocked(fetchWithTimeout).mockRejectedValue(new Error('network unreachable'))
    await expect(expectSaga(registerWalletForFeedWatch, MOCK_WALLET).run()).resolves.not.toThrow()
  })
})
