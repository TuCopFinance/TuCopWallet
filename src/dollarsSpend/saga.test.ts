import BigNumber from 'bignumber.js'
import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { EffectProviders, StaticProvider } from 'redux-saga-test-plan/providers'
import { executeMultiSwap, executeMultiSwapSaga } from 'src/dollarsSpend/saga'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
} from 'src/dollarsSpend/slice'
import { SpendStep } from 'src/dollarsSpend/types'
import { swapError, swapSuccess } from 'src/swap/slice'
import { fetchSwapQuote } from 'src/swap/useSwapQuote'
import { walletAddressSelector } from 'src/web3/selectors'

jest.mock('src/swap/useSwapQuote', () => ({
  ...jest.requireActual('src/swap/useSwapQuote'),
  fetchSwapQuote: jest.fn(),
}))

const stepUsat: SpendStep = {
  tokenId: 'celo-mainnet:usat',
  symbol: 'USAT',
  amountUsd: new BigNumber(30),
  amountTokenWhole: new BigNumber(30),
}
const stepUsdm: SpendStep = {
  tokenId: 'celo-mainnet:usdm',
  symbol: 'USDm',
  amountUsd: new BigNumber(50),
  amountTokenWhole: new BigNumber(50),
}

const mockQuoteResult = (fromTokenId: string) => ({
  fromTokenId,
  toTokenId: 'celo-mainnet:copm',
  swapAmount: { FROM: new BigNumber(30), TO: new BigNumber(122_400) },
  price: '4080',
  provider: 'squid',
  estimatedPriceImpact: null,
})

const MOCK_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

// Base providers shared across tests: mock the wallet select so
// the saga doesn't crash trying to access state.web3 without a store.
function baseProviders(): StaticProvider[] {
  return [[matchers.select.selector(walletAddressSelector), MOCK_WALLET]]
}

describe('executeMultiSwapSaga', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(fetchSwapQuote).mockResolvedValue(mockQuoteResult('celo-mainnet:usat') as any)
  })

  it('runs the happy path: 2 steps both succeed', async () => {
    let raceCallIndex = 0
    const raceProvider: EffectProviders = {
      race(_effect, _next) {
        raceCallIndex += 1
        return {
          success: { type: swapSuccess.type, payload: { swapId: `mocked-${raceCallIndex}` } },
        }
      },
    }

    const providers: (EffectProviders | StaticProvider)[] = [
      ...baseProviders(),
      [matchers.call.fn(fetchSwapQuote), mockQuoteResult('celo-mainnet:usat')],
      raceProvider,
    ]

    await expectSaga(
      executeMultiSwapSaga,
      executeMultiSwap({ steps: [stepUsat, stepUsdm], toTokenId: 'celo-mainnet:copm' })
    )
      .provide(providers)
      .put(multiSwapStarted({ steps: [stepUsat, stepUsdm] }))
      .put(multiSwapStepSucceeded({ index: 0 }))
      .put(multiSwapStepSucceeded({ index: 1 }))
      .put(multiSwapCompleted())
      .not.put.actionType(multiSwapStepFailed.type)
      .silentRun()
  })

  it('halts and emits stepFailed when a step swap fails', async () => {
    let raceCallIndex = 0
    const raceProvider: EffectProviders = {
      race(_effect, _next) {
        raceCallIndex += 1
        if (raceCallIndex === 1) {
          return { success: { type: swapSuccess.type, payload: { swapId: 'mocked-1' } } }
        }
        return { error: { type: swapError.type, payload: 'mocked-2' } }
      },
    }

    const providers: (EffectProviders | StaticProvider)[] = [
      ...baseProviders(),
      [matchers.call.fn(fetchSwapQuote), mockQuoteResult('celo-mainnet:usat')],
      raceProvider,
    ]

    await expectSaga(
      executeMultiSwapSaga,
      executeMultiSwap({ steps: [stepUsat, stepUsdm], toTokenId: 'celo-mainnet:copm' })
    )
      .provide(providers)
      .put(multiSwapStepSucceeded({ index: 0 }))
      .put.actionType(multiSwapStepFailed.type)
      .not.put.actionType(multiSwapCompleted.type)
      .silentRun()
  })

  it('emits stepFailed when a quote refetch throws', async () => {
    const quoteError = new Error('Squid 500')
    const providers: (EffectProviders | StaticProvider)[] = [
      ...baseProviders(),
      [matchers.call.fn(fetchSwapQuote), Promise.reject(quoteError) as any],
    ]

    await expectSaga(
      executeMultiSwapSaga,
      executeMultiSwap({ steps: [stepUsat], toTokenId: 'celo-mainnet:copm' })
    )
      .provide(providers)
      .put.actionType(multiSwapStepFailed.type)
      .not.put.actionType(multiSwapCompleted.type)
      .silentRun()
  })
})
