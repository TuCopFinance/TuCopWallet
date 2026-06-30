import BigNumber from 'bignumber.js'
import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { getFeatureGate } from 'src/statsig'
import { feeCurrenciesWithPositiveBalancesSelector } from 'src/tokens/selectors'
import { walletAddressSelector } from 'src/web3/selectors'
import networkConfig from 'src/web3/networkConfig'
import { BootstrapApiError, postFeeAdapterBootstrap } from 'src/wri/feeAdapterBootstrap/api'
import {
  bootstrapAccepted,
  bootstrapDismissed,
  bootstrapFailed,
  bootstrapSheetHidden,
  bootstrapSheetShown,
  bootstrapStarted,
  bootstrapSucceeded,
} from 'src/wri/feeAdapterBootstrap/slice'
import { handleAccept, handleDismiss, maybeOfferBootstrap } from 'src/wri/feeAdapterBootstrap/saga'

jest.mock('src/statsig', () => ({
  getFeatureGate: jest.fn(),
}))
jest.mock('src/wri/feeAdapterBootstrap/api', () => ({
  ...jest.requireActual('src/wri/feeAdapterBootstrap/api'),
  postFeeAdapterBootstrap: jest.fn(),
}))

const MOCK_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

const freshBootstrapState = {
  byAdapter: {
    USDC: { bootstrapped: false, lastAttemptAt: null, lastSuccessAt: null, lastError: null },
    USDT: { bootstrapped: false, lastAttemptAt: null, lastSuccessAt: null, lastError: null },
  },
  pending: null,
}

describe('handleAccept', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('marks every candidate started then succeeded for approved + already_approved tokens', async () => {
    jest.mocked(postFeeAdapterBootstrap).mockResolvedValue({
      ok: true,
      relayAddress: '0xrelay',
      results: [
        {
          tokenSymbol: 'USDC',
          tokenAddress: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
          adapterAddress: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
          status: 'approved',
          txHash: '0xtx1',
          alreadyApproved: false,
        },
        {
          tokenSymbol: 'USDT',
          tokenAddress: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
          adapterAddress: '0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72',
          status: 'already_approved',
          txHash: null,
          alreadyApproved: true,
        },
      ],
    })

    await expectSaga(handleAccept, bootstrapAccepted({ candidates: ['USDC', 'USDT'] }))
      .provide([[matchers.select.selector(walletAddressSelector), MOCK_WALLET]])
      .put(bootstrapStarted({ adapter: 'USDC' }))
      .put(bootstrapStarted({ adapter: 'USDT' }))
      .put(bootstrapSucceeded({ adapter: 'USDC' }))
      .put(bootstrapSucceeded({ adapter: 'USDT' }))
      .put(bootstrapSheetHidden())
      .run()
  })

  it('marks failed when backend returns relay_failed', async () => {
    jest.mocked(postFeeAdapterBootstrap).mockResolvedValue({
      ok: true,
      relayAddress: '0xrelay',
      results: [
        {
          tokenSymbol: 'USDC',
          tokenAddress: '0xceba9300f2b948710d2653dd7b07f33a8b32118c',
          adapterAddress: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
          status: 'relay_failed',
          txHash: null,
          alreadyApproved: false,
        },
      ],
    })

    await expectSaga(handleAccept, bootstrapAccepted({ candidates: ['USDC'] }))
      .provide([[matchers.select.selector(walletAddressSelector), MOCK_WALLET]])
      .put(bootstrapStarted({ adapter: 'USDC' }))
      .put.actionType(bootstrapFailed.type)
      .put(bootstrapSheetHidden())
      .run()
  })

  it('marks every candidate failed when the api throws BootstrapApiError', async () => {
    jest
      .mocked(postFeeAdapterBootstrap)
      .mockRejectedValue(new BootstrapApiError('not-delegated', 'user not delegated'))

    await expectSaga(handleAccept, bootstrapAccepted({ candidates: ['USDC', 'USDT'] }))
      .provide([[matchers.select.selector(walletAddressSelector), MOCK_WALLET]])
      .put(bootstrapStarted({ adapter: 'USDC' }))
      .put(bootstrapStarted({ adapter: 'USDT' }))
      .put.actionType(bootstrapFailed.type)
      .put(bootstrapSheetHidden())
      .run()
  })

  it('hides the sheet and skips the api call when wallet address is unset', async () => {
    await expectSaga(handleAccept, bootstrapAccepted({ candidates: ['USDC'] }))
      .provide([[matchers.select.selector(walletAddressSelector), null]])
      .put(bootstrapSheetHidden())
      .not.put.actionType(bootstrapStarted.type)
      .run()
    expect(postFeeAdapterBootstrap).not.toHaveBeenCalled()
  })

  it('tolerates non-BootstrapApiError thrown from the api (network down, generic error)', async () => {
    jest.mocked(postFeeAdapterBootstrap).mockRejectedValue(new Error('boom unexpected'))
    await expectSaga(handleAccept, bootstrapAccepted({ candidates: ['USDC'] }))
      .provide([[matchers.select.selector(walletAddressSelector), MOCK_WALLET]])
      .put(bootstrapStarted({ adapter: 'USDC' }))
      .put(bootstrapFailed({ adapter: 'USDC', errorMessage: 'boom unexpected' }))
      .put(bootstrapSheetHidden())
      .run()
  })
})

describe('handleDismiss', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('marks lastAttemptAt for each candidate so the 24h debounce kicks in, then hides the sheet', async () => {
    await expectSaga(handleDismiss, bootstrapDismissed({ candidates: ['USDC', 'USDT'] }))
      .put(bootstrapStarted({ adapter: 'USDC' }))
      .put(bootstrapStarted({ adapter: 'USDT' }))
      .put(bootstrapSheetHidden())
      .run()
    expect(postFeeAdapterBootstrap).not.toHaveBeenCalled()
  })
})

describe('maybeOfferBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the sheet when the detector returns shouldOffer=true', async () => {
    jest.mocked(getFeatureGate).mockReturnValue(true)
    const usdcBalance = {
      tokenId: networkConfig.usdcTokenId,
      balance: new BigNumber(5),
    } as any

    // Anonymous selector for the slice; provide via the dynamic select handler
    // so we can branch on the actual selector function reference.
    await expectSaga(maybeOfferBootstrap)
      .provide({
        select: ({ selector }, next) => {
          if (selector === walletAddressSelector) return MOCK_WALLET
          if (selector === feeCurrenciesWithPositiveBalancesSelector) return [usdcBalance]
          // Inline selector: state => state.wriFeeAdapterBootstrap
          return freshBootstrapState
        },
      })
      .put(bootstrapSheetShown({ candidates: ['USDC'] }))
      .run()
  })

  it('skips when the gate is off', async () => {
    jest.mocked(getFeatureGate).mockReturnValue(false)
    await expectSaga(maybeOfferBootstrap)
      .provide([[matchers.select.selector(walletAddressSelector), MOCK_WALLET]])
      .not.put.actionType(bootstrapSheetShown.type)
      .run()
  })

  it('skips when wallet address is unset', async () => {
    await expectSaga(maybeOfferBootstrap)
      .provide([[matchers.select.selector(walletAddressSelector), null]])
      .not.put.actionType(bootstrapSheetShown.type)
      .run()
  })
})
