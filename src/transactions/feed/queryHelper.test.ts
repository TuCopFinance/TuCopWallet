import BigNumber from 'bignumber.js'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { SwapEvents } from 'src/analytics/Events'
import { vibrateSuccess } from 'src/styles/hapticFeedback'
import * as TokenSelectors from 'src/tokens/selectors'
import { TokenBalance } from 'src/tokens/slice'
import {
  QueryResponse,
  handlePollResponse,
  isTransactionEligible,
} from 'src/transactions/feed/queryHelper'
import { updateTransactions } from 'src/transactions/slice'
import {
  NetworkId,
  TokenExchange,
  TokenTransaction,
  TokenTransactionTypeV2,
  TokenTransfer,
  TransactionStatus,
} from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import {
  mockAddress,
  mockApprovalTransaction,
  mockCeloTokenId,
  mockEarnClaimRewardTransaction,
  mockEarnDepositTransaction,
  mockEarnSwapDeposit,
  mockEarnWithdrawTransaction,
} from 'test/values'

jest.mock('src/styles/hapticFeedback')

const mockSentTransaction: TokenTransfer = {
  type: TokenTransactionTypeV2.Sent,
  amount: {
    value: '1',
    tokenId: networkConfig.ccopTokenId,
  },
  transactionHash: '0x123',
  timestamp: Date.now(),
  block: '1234',
  networkId: NetworkId['celo-mainnet'],
  address: mockAddress,
  status: TransactionStatus.Complete,
  metadata: {},
  fees: [],
}

const mockReceivedTransaction: TokenTransfer = {
  ...mockSentTransaction,
  type: TokenTransactionTypeV2.Received,
  amount: {
    value: '1',
    tokenId: networkConfig.ccopTokenId,
  },
}

const mockSwapTransaction: TokenExchange = {
  type: TokenTransactionTypeV2.SwapTransaction,
  inAmount: {
    value: '1',
    tokenId: networkConfig.ccopTokenId,
  },
  outAmount: {
    value: '1',
    tokenId: networkConfig.usdtTokenId,
  },
  transactionHash: '0x123',
  timestamp: Date.now(),
  block: '1234',
  networkId: NetworkId['celo-mainnet'],
  status: TransactionStatus.Complete,
  fees: [],
}

describe('handlePollResponse', () => {
  const dispatchSpy = jest.fn()

  const mockCompletedTransaction = {
    transactionHash: '0x123',
    status: TransactionStatus.Complete,
  } as TokenTransaction

  const mockPendingTransaction = {
    transactionHash: '0xabc',
    status: TransactionStatus.Pending,
  } as TokenTransaction

  const mockPendingCrossChainTransaction = {
    type: TokenTransactionTypeV2.CrossChainSwapTransaction,
    transactionHash: '0xabc',
    status: TransactionStatus.Pending,
  } as TokenTransaction

  const mockCompletedCrossChainTransaction = {
    type: TokenTransactionTypeV2.CrossChainSwapTransaction,
    transactionHash: '0xabc',
    status: TransactionStatus.Complete,
    inAmount: {
      value: '0.1',
      tokenId: 'op-mainnet:native',
    },
    outAmount: {
      value: '0.2',
      tokenId: 'base-mainnet:native',
    },
    fees: [
      {
        type: 'SECURITY_FEE',
        amount: {
          value: '0.3',
          tokenId: 'base-mainnet:native',
        },
      },
      {
        type: 'APP_FEE',
        amount: {
          value: '0.4',
          tokenId: 'base-mainnet:native',
        },
      },
      {
        type: 'CROSS_CHAIN_FEE',
        amount: {
          value: '0.5',
          tokenId: 'base-mainnet:native',
        },
      },
    ],
  } as TokenTransaction

  const mockQueryResponse = (mockTransactions: TokenTransaction[]): QueryResponse => ({
    data: {
      tokenTransactionsV3: {
        transactions: mockTransactions,
        pageInfo: {
          startCursor: null,
          endCursor: null,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should update cached transactions and vibrate when there are new completed transactions', () => {
    const mockTransactions = [mockCompletedTransaction]
    handlePollResponse({
      pageInfo: {},
      setFetchedResult: jest.fn(),
      completedTxHashesByNetwork: {},
      pendingTxHashesByNetwork: {},
      pendingStandbyTxHashesByNetwork: {},
      dispatch: dispatchSpy,
    })(NetworkId['celo-mainnet'], mockQueryResponse(mockTransactions))

    expect(vibrateSuccess).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(
      updateTransactions({ networkId: NetworkId['celo-mainnet'], transactions: mockTransactions })
    )
  })

  it('should update cached transactions and vibrate when the cached transaction was in the pending status', () => {
    const mockTransactions = [mockCompletedTransaction]

    handlePollResponse({
      pageInfo: {},
      setFetchedResult: jest.fn(),
      completedTxHashesByNetwork: {},
      pendingTxHashesByNetwork: {
        [NetworkId['celo-mainnet']]: new Set([mockCompletedTransaction.transactionHash]),
      },
      pendingStandbyTxHashesByNetwork: {},
      dispatch: dispatchSpy,
    })(NetworkId['celo-mainnet'], mockQueryResponse(mockTransactions))

    expect(vibrateSuccess).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(
      updateTransactions({ networkId: NetworkId['celo-mainnet'], transactions: mockTransactions })
    )
  })

  it('should not update cached transactions when there are no new completed transactions', () => {
    const mockTransactions = [mockCompletedTransaction]

    handlePollResponse({
      pageInfo: {},
      setFetchedResult: jest.fn(),
      completedTxHashesByNetwork: {
        [NetworkId['celo-mainnet']]: new Set([mockCompletedTransaction.transactionHash]),
      },
      pendingTxHashesByNetwork: {},
      pendingStandbyTxHashesByNetwork: {},
      dispatch: dispatchSpy,
    })(NetworkId['celo-mainnet'], mockQueryResponse(mockTransactions))

    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(vibrateSuccess).not.toHaveBeenCalled()
  })

  it('should update cached transactions without vibration when there are new pending transactions', () => {
    const mockTransactions = [mockPendingTransaction]
    handlePollResponse({
      pageInfo: {},
      setFetchedResult: jest.fn(),
      completedTxHashesByNetwork: {},
      pendingTxHashesByNetwork: {},
      pendingStandbyTxHashesByNetwork: {},
      dispatch: dispatchSpy,
    })(NetworkId['celo-mainnet'], mockQueryResponse(mockTransactions))

    expect(vibrateSuccess).not.toHaveBeenCalled()
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(
      updateTransactions({ networkId: NetworkId['celo-mainnet'], transactions: mockTransactions })
    )
  })

  it('should not update cached transactions when there are no new pending transactions', () => {
    const mockTransactions = [mockPendingTransaction]

    handlePollResponse({
      pageInfo: {},
      setFetchedResult: jest.fn(),
      completedTxHashesByNetwork: {},
      pendingTxHashesByNetwork: {
        [NetworkId['celo-mainnet']]: new Set([mockPendingTransaction.transactionHash]),
      },
      pendingStandbyTxHashesByNetwork: {},
      dispatch: dispatchSpy,
    })(NetworkId['celo-mainnet'], mockQueryResponse(mockTransactions))

    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(vibrateSuccess).not.toHaveBeenCalled()
  })

  it.each([
    { caseName: 'pending', propName: 'pendingTxHashesByNetwork' },
    { caseName: 'standby', propName: 'pendingStandbyTxHashesByNetwork' },
  ])(
    'should send analytics event when cross-chain $caseName transaction status changed to `Complete`',
    ({ propName }) => {
      jest.spyOn(TokenSelectors, 'tokensByIdSelector').mockReturnValue({
        'op-mainnet:native': { priceUsd: new BigNumber(100) } as TokenBalance,
        'base-mainnet:native': { priceUsd: new BigNumber(1000) } as TokenBalance,
      })

      handlePollResponse({
        pageInfo: {},
        setFetchedResult: jest.fn(),
        completedTxHashesByNetwork: {},
        pendingTxHashesByNetwork: {},
        pendingStandbyTxHashesByNetwork: {},
        [propName]: {
          [NetworkId['celo-mainnet']]: new Set([mockPendingCrossChainTransaction.transactionHash]),
        },
        dispatch: dispatchSpy,
      })(NetworkId['celo-mainnet'], mockQueryResponse([mockCompletedCrossChainTransaction]))

      expect(AppAnalytics.track).toHaveBeenCalledWith(SwapEvents.swap_execute_success, {
        swapType: 'cross-chain',
        swapExecuteTxId: '0xabc',
        toTokenId: 'op-mainnet:native',
        toTokenAmount: '0.1',
        toTokenAmountUsd: 10,
        fromTokenId: 'base-mainnet:native',
        fromTokenAmount: '0.2',
        fromTokenAmountUsd: 200,
        networkFeeTokenId: 'base-mainnet:native',
        networkFeeAmount: '0.3',
        networkFeeAmountUsd: 300,
        appFeeTokenId: 'base-mainnet:native',
        appFeeAmount: '0.4',
        appFeeAmountUsd: 400,
        crossChainFeeTokenId: 'base-mainnet:native',
        crossChainFeeAmount: '0.5',
        crossChainFeeAmountUsd: 500,
      })
    }
  )
})

describe('isTransactionEligible', () => {
  it.each([
    { ...mockApprovalTransaction, tokenId: networkConfig.ccopTokenId },
    mockSentTransaction,
    mockReceivedTransaction,
    mockSwapTransaction,
  ])('should return true if tokens involved is an allowed token ($type)', (transaction) => {
    expect(isTransactionEligible(transaction)).toEqual(true)
  })

  it.each([
    mockApprovalTransaction,
    { ...mockSentTransaction, amount: { value: 1, tokenId: mockCeloTokenId } },
    { ...mockReceivedTransaction, amount: { value: 1, tokenId: mockCeloTokenId } },
    { ...mockSwapTransaction, inAmount: { value: 1, tokenId: mockCeloTokenId } },
    { ...mockSwapTransaction, outAmount: { value: 1, tokenId: mockCeloTokenId } },
  ])('should return false if tokens involved is not an allowed token ($type)', (transaction) => {
    expect(isTransactionEligible(transaction)).toEqual(false)
  })

  it.each([
    mockEarnClaimRewardTransaction,
    mockEarnSwapDeposit,
    mockEarnDepositTransaction,
    mockEarnWithdrawTransaction,
    { type: TokenTransactionTypeV2.CrossChainSwapTransaction } as TokenTransaction,
    { type: TokenTransactionTypeV2.NftReceived } as TokenTransaction,
    { type: TokenTransactionTypeV2.NftSent } as TokenTransaction,
  ])('should return false for transaction type: $type', (transaction) => {
    expect(isTransactionEligible(transaction)).toEqual(false)
  })
})
