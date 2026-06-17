import BigNumber from 'bignumber.js'
import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { dynamic, throwError } from 'redux-saga-test-plan/providers'
import { executeMultiSwap, executeMultiSwapSaga } from 'src/dollarsSpend/saga'
import { executeDollarsSpend7702Saga } from 'src/dollarsSpend/saga7702'
import {
  multiSwapCompleted,
  multiSwapStarted,
  multiSwapStepFailed,
  multiSwapStepSucceeded,
} from 'src/dollarsSpend/slice'
import { SpendStep } from 'src/dollarsSpend/types'
import { getFeatureGate } from 'src/statsig'
import { fetchSwapQuoteForExecution } from 'src/swap/useSwapQuote'
import { feeCurrenciesSelector, tokensByIdSelector } from 'src/tokens/selectors'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { walletAddressSelector } from 'src/web3/selectors'

jest.mock('src/statsig')
jest.mock('src/swap/useSwapQuote', () => ({
  ...jest.requireActual('src/swap/useSwapQuote'),
  fetchSwapQuoteForExecution: jest.fn(),
}))
jest.mock('src/web3/contracts', () => ({
  ...jest.requireActual('src/web3/contracts'),
  getViemWallet: jest.fn(),
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

const mockTokensById = {
  'celo-mainnet:usat': mockFromTokenUsat,
}

const stepUsat: SpendStep = {
  tokenId: 'celo-mainnet:usat',
  symbol: 'USAT',
  amountUsd: new BigNumber(30),
  amountTokenWhole: new BigNumber(30),
  decimals: 6,
}

const mockQuoteResult = {
  fromTokenId: 'celo-mainnet:usat',
  toTokenId: 'celo-mainnet:copm',
  swapAmount: { FROM: new BigNumber(30), TO: new BigNumber(122_400) },
  price: '4080',
  provider: 'squid',
  estimatedPriceImpact: null,
  preparedTransactions: {
    type: 'possible',
    feeCurrency: mockFromTokenUsat,
    transactions: [
      {
        // approve
        to: '0xd2ab3c9a02dbbab236bfec45d1d755df4267f771',
        data: '0x095ea7b3deadbeef',
        value: undefined,
      },
      {
        // swap (any valid 20-byte address; this is the mock Squid router)
        to: '0x1111111111111111111111111111111111111111',
        data: '0xdeadbeef',
        value: BigInt(0),
      },
    ],
  },
  receivedAt: 1234567890,
  appFeePercentageIncludedInPrice: undefined,
  allowanceTarget: '0x0000000000000000000000000000000000000000',
  sellAmount: '30000000',
  swapType: 'same-chain' as const,
}

const MOCK_TX_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

function mockWallet({
  signAuth = jest.fn().mockResolvedValue({
    chainId: 42220,
    nonce: 1,
    contractAddress: networkConfig.batchExecutorAddressCelo,
  }),
  sendTx = jest.fn().mockResolvedValue(MOCK_TX_HASH),
} = {}) {
  return {
    account: { address: MOCK_WALLET },
    signAuthorization: signAuth,
    sendTransaction: sendTx,
  } as any
}

describe('dollarsSpend saga dispatcher (flag-gated)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('when WRI_DOLLARS_SPEND_7702_V1 is off, runs the legacy sequential saga (no 7702 calls)', async () => {
    jest.mocked(getFeatureGate).mockReturnValue(false)
    jest.mocked(fetchSwapQuoteForExecution).mockResolvedValue(mockQuoteResult as any)
    const wallet = mockWallet()
    jest.mocked(getViemWallet as any).mockReturnValue(wallet)

    // Run the dispatcher with the flag off. We assert that multiSwapStarted is
    // emitted (legacy path entered) AND that the 7702 wallet helpers were not
    // touched. The legacy path's race/take logic is exercised by saga.test.ts;
    // here we only verify the branch.
    await expectSaga(
      executeMultiSwapSaga,
      executeMultiSwap({ steps: [stepUsat], toTokenId: 'celo-mainnet:copm' })
    )
      .provide([
        [matchers.call.fn(getFeatureGate), false],
        [matchers.select.selector(walletAddressSelector), MOCK_WALLET],
        [matchers.select.selector(tokensByIdSelector), mockTokensById],
        [matchers.select.selector(feeCurrenciesSelector), []],
        [matchers.call.fn(fetchSwapQuoteForExecution), mockQuoteResult],
        // The legacy saga waits on swap success via race(take(...)); stub it.
        {
          race: () => ({
            success: { type: 'swap/swapSuccess', payload: { swapId: 'mocked-1' } },
          }),
        },
      ])
      .put(multiSwapStarted({ steps: [stepUsat] }))
      .silentRun()

    expect(wallet.signAuthorization).not.toHaveBeenCalled()
    expect(wallet.sendTransaction).not.toHaveBeenCalled()
  })

  it('when flag is on, signs an EIP-7702 authorization pointing at the BatchExecutor and submits one tx', async () => {
    jest.mocked(getFeatureGate).mockReturnValue(true)
    jest.mocked(fetchSwapQuoteForExecution).mockResolvedValue(mockQuoteResult as any)
    const wallet = mockWallet()
    jest.mocked(getViemWallet as any).mockReturnValue(wallet)

    await expectSaga(
      executeDollarsSpend7702Saga,
      executeMultiSwap({ steps: [stepUsat], toTokenId: 'celo-mainnet:copm' })
    )
      .provide([
        [matchers.select.selector(walletAddressSelector), MOCK_WALLET],
        [matchers.select.selector(tokensByIdSelector), mockTokensById],
        [matchers.select.selector(feeCurrenciesSelector), []],
        [matchers.call.fn(fetchSwapQuoteForExecution), mockQuoteResult],
        [matchers.call.fn(getViemWallet), dynamic(() => wallet)],
      ])
      .put(multiSwapStarted({ steps: [stepUsat] }))
      .put(multiSwapStepSucceeded({ index: 0 }))
      .put(multiSwapCompleted())
      .not.put.actionType(multiSwapStepFailed.type)
      .silentRun()

    expect(wallet.signAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: networkConfig.batchExecutorAddressCelo,
        executor: 'self',
      })
    )
    expect(wallet.sendTransaction).toHaveBeenCalledTimes(1)
    const sendArg = wallet.sendTransaction.mock.calls[0][0]
    expect(sendArg.to).toBe(MOCK_WALLET)
    expect(sendArg.authorizationList).toHaveLength(1)
    // Fee currency is the first step's underlying ERC-20 address derived from
    // the tokenId (`celo-mainnet:<address>` -> `<address>`). Here the mock
    // step uses `celo-mainnet:usat` so we expect the second segment back.
    expect(sendArg.feeCurrency).toBe('usat')
  })

  it('dispatches multiSwapStepFailed when the 7702 batch submission throws', async () => {
    jest.useRealTimers()
    jest.mocked(getFeatureGate).mockReturnValue(true)
    jest.mocked(fetchSwapQuoteForExecution).mockResolvedValue(mockQuoteResult as any)
    const sendTx = jest.fn().mockRejectedValue(new Error('rpc dropped: 0x7b not accepted'))
    const wallet = mockWallet({ sendTx })
    jest.mocked(getViemWallet as any).mockReturnValue(wallet)

    try {
      await expectSaga(
        executeDollarsSpend7702Saga,
        executeMultiSwap({ steps: [stepUsat], toTokenId: 'celo-mainnet:copm' })
      )
        .provide([
          [matchers.select.selector(walletAddressSelector), MOCK_WALLET],
          [matchers.select.selector(tokensByIdSelector), mockTokensById],
          [matchers.select.selector(feeCurrenciesSelector), []],
          [matchers.call.fn(fetchSwapQuoteForExecution), mockQuoteResult],
          [matchers.call.fn(getViemWallet), dynamic(() => wallet)],
        ])
        .put.actionType(multiSwapStepFailed.type)
        .not.put.actionType(multiSwapCompleted.type)
        .silentRun(500)
    } finally {
      jest.useFakeTimers()
    }
  })

  it('dispatches multiSwapStepFailed when a quote refetch throws (flag on)', async () => {
    jest.useRealTimers()
    jest.mocked(getFeatureGate).mockReturnValue(true)
    const quoteError = new Error('Squid 500')

    try {
      await expectSaga(
        executeDollarsSpend7702Saga,
        executeMultiSwap({ steps: [stepUsat], toTokenId: 'celo-mainnet:copm' })
      )
        .provide([
          [matchers.select.selector(walletAddressSelector), MOCK_WALLET],
          [matchers.select.selector(tokensByIdSelector), mockTokensById],
          [matchers.select.selector(feeCurrenciesSelector), []],
          [matchers.call.fn(fetchSwapQuoteForExecution), throwError(quoteError)],
        ])
        .put.actionType(multiSwapStepFailed.type)
        .not.put.actionType(multiSwapCompleted.type)
        .silentRun(500)
    } finally {
      jest.useFakeTimers()
    }
  })
})
