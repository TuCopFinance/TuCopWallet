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
import { fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { walletAddressSelector } from 'src/web3/selectors'

jest.mock('src/swap/useSwapQuote', () => ({
  ...jest.requireActual('src/swap/useSwapQuote'),
  fetchSwapQuoteForExecution: jest.fn(),
}))

const MOCK_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

const mockFromTokenUsat = {
  tokenId: 'celo-mainnet:usat',
  networkId: 'celo-mainnet',
  symbol: 'USAT',
  decimals: 6,
  balance: new BigNumber(100),
  priceUsd: new BigNumber(1),
  address: '0xd2ab00000000000000000000000000000000abcd',
} as any

const mockFromTokenUsdm = {
  tokenId: 'celo-mainnet:usdm',
  networkId: 'celo-mainnet',
  symbol: 'USDm',
  decimals: 18,
  balance: new BigNumber(50),
  priceUsd: new BigNumber(1),
  address: '0x765de816845861e75a25fca122bb6898b8b1282a',
} as any

const mockTokensById = {
  'celo-mainnet:usat': mockFromTokenUsat,
  'celo-mainnet:usdm': mockFromTokenUsdm,
}

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
  preparedTransactions: { type: 'possible', transactions: [], feeCurrency: mockFromTokenUsat },
  receivedAt: 1234567890,
  appFeePercentageIncludedInPrice: undefined,
  allowanceTarget: '0x0000000000000000000000000000000000000000',
  sellAmount: '30000000',
  swapType: 'same-chain' as const,
})

// Base providers shared across tests.
function baseProviders(): StaticProvider[] {
  return [
    [matchers.select.selector(walletAddressSelector), MOCK_WALLET],
    [matchers.select.selector(tokensByIdSelector), mockTokensById],
    [matchers.select.selector(feeCurrenciesSelector), []],
  ]
}

describe('executeMultiSwapSaga', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest
      .mocked(fetchSwapQuoteForExecution)
      .mockResolvedValue(mockQuoteResult('celo-mainnet:usat') as any)
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
      [matchers.call.fn(fetchSwapQuoteForExecution), mockQuoteResult('celo-mainnet:usat')],
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
      [matchers.call.fn(fetchSwapQuoteForExecution), mockQuoteResult('celo-mainnet:usat')],
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
      [matchers.call.fn(fetchSwapQuoteForExecution), Promise.reject(quoteError) as any],
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
