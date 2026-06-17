import BigNumber from 'bignumber.js'
import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { EffectProviders, StaticProvider, throwError } from 'redux-saga-test-plan/providers'
import { call } from 'redux-saga/effects'
import { BaseStandbyTransaction, addStandbyTransaction } from 'src/transactions/slice'
import { Network, NetworkId, TokenTransactionTypeV2 } from 'src/transactions/types'
import { publicClient } from 'src/viem'
import { ViemWallet } from 'src/viem/getLockableWallet'
import { TransactionRequest } from 'src/viem/prepareTransactions'
import { getSerializablePreparedTransactions } from 'src/viem/preparedTransactionSerialization'
import { sendPreparedTransactions } from 'src/viem/saga'
import { markConfirmed, recordSent } from 'src/viem/sentTransactionLog'
import { getViemWallet } from 'src/web3/contracts'
import networkConfig from 'src/web3/networkConfig'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { createMockStore } from 'test/utils'
import {
  mockAccount,
  mockCeloAddress,
  mockCeloTokenId,
  mockCusdTokenId,
  mockQRCodeRecipient,
} from 'test/values'
import { getTransactionCount } from 'viem/actions'

const preparedTransactions: TransactionRequest[] = [
  {
    from: '0xa',
    to: '0xb',
    value: BigInt(0),
    data: '0x0',
    gas: BigInt(59_480),
    maxFeePerGas: BigInt(12_000_000_000),
    _baseFeePerGas: BigInt(6_000_000_000),
  },
  {
    from: '0xa',
    to: '0xc',
    value: BigInt(0),
    data: '0x0',
    gas: BigInt(1_325_000),
    maxFeePerGas: BigInt(12_000_000_000),
    _baseFeePerGas: BigInt(6_000_000_000),
  },
]
const serializablePreparedTransactions = getSerializablePreparedTransactions(preparedTransactions)
const mockStandbyTransactions: BaseStandbyTransaction[] = [
  {
    context: { id: 'mockContext1' },
    networkId: NetworkId['celo-mainnet'],
    type: TokenTransactionTypeV2.Approval,
    tokenId: mockCusdTokenId,
    approvedAmount: '1',
  },
  {
    context: { id: 'mockContext2' },
    type: TokenTransactionTypeV2.Sent,
    networkId: NetworkId['celo-mainnet'],
    amount: {
      value: BigNumber(10).negated().toString(),
      tokenAddress: mockCeloAddress,
      tokenId: mockCeloTokenId,
    },
    address: mockQRCodeRecipient.address,
    metadata: {},
  },
]
const mockCreateBaseStandbyTransactions = [
  (transactionHash: string, feeCurrencyId?: string) => ({
    ...mockStandbyTransactions[0],
    transactionHash,
    feeCurrencyId,
  }),
  (transactionHash: string, feeCurrencyId?: string) => ({
    ...mockStandbyTransactions[1],
    feeCurrencyId,
    transactionHash,
  }),
]

describe('sendPreparedTransactions', () => {
  let sendCallCount = 0
  let signCallCount = 0
  const mockViemWallet = {
    account: { address: mockAccount },
    signTransaction: jest.fn(async () => {
      return `0xmockSerializedTransaction${++signCallCount}`
    }),
    sendRawTransaction: jest.fn(async () => {
      return `0xmockTxHash${++sendCallCount}`
    }),
  } as any as ViemWallet

  function createDefaultProviders() {
    const defaultProviders: (EffectProviders | StaticProvider)[] = [
      [call(getConnectedUnlockedAccount), mockAccount],
      [matchers.call.fn(getViemWallet), mockViemWallet],
      [matchers.call.fn(getTransactionCount), 10],
    ]
    return defaultProviders
  }

  beforeEach(() => {
    sendCallCount = 0
    signCallCount = 0
    jest.clearAllMocks()
  })

  it('sends the prepared transactions and adds standby transactions to the store', async () => {
    await expectSaga(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkConfig.defaultNetworkId,
      mockCreateBaseStandbyTransactions
    )
      .withState(createMockStore({}).getState())
      .provide(createDefaultProviders())
      .call(getViemWallet, networkConfig.viemChain.celo, false)
      .put(
        addStandbyTransaction({
          ...mockStandbyTransactions[0],
          feeCurrencyId: mockCeloTokenId,
          transactionHash: '0xmockTxHash1',
        })
      )
      .put(
        addStandbyTransaction({
          ...mockStandbyTransactions[1],
          feeCurrencyId: mockCeloTokenId,
          transactionHash: '0xmockTxHash2',
        })
      )
      .returns(['0xmockTxHash1', '0xmockTxHash2'])
      .run()

    expect(mockViemWallet.signTransaction).toHaveBeenCalledTimes(2)
    expect(mockViemWallet.signTransaction).toHaveBeenNthCalledWith(1, {
      ...preparedTransactions[0],
      nonce: 10,
    })
    expect(mockViemWallet.signTransaction).toHaveBeenNthCalledWith(2, {
      ...preparedTransactions[1],
      nonce: 11,
    })
    expect(mockViemWallet.sendRawTransaction).toHaveBeenCalledTimes(2)
    expect(mockViemWallet.sendRawTransaction).toHaveBeenNthCalledWith(1, {
      serializedTransaction: '0xmockSerializedTransaction1',
    })
    expect(mockViemWallet.sendRawTransaction).toHaveBeenNthCalledWith(2, {
      serializedTransaction: '0xmockSerializedTransaction2',
    })
  })

  it('throws if the number of prepared transactions and standby transaction creators do not match', async () => {
    await expect(
      expectSaga(
        sendPreparedTransactions,
        serializablePreparedTransactions,
        networkConfig.defaultNetworkId,
        [mockCreateBaseStandbyTransactions[0]]
      )
        .withState(createMockStore({}).getState())
        .provide(createDefaultProviders())
        .run()
    ).rejects.toThrowError(
      'Mismatch in number of prepared transactions and standby transaction creators'
    )
  })

  it('throws if networkId cannot be matched to a network', async () => {
    await expect(
      expectSaga(
        sendPreparedTransactions,
        serializablePreparedTransactions,
        'unrecognisedNetworkId' as any,
        mockCreateBaseStandbyTransactions
      )
        .withState(createMockStore({}).getState())
        .provide(createDefaultProviders())
        .run()
    ).rejects.toThrowError('No matching network found for network id: unrecognisedNetworkId')
  })

  it('throws if the wallet cannot be unlocked', async () => {
    await expect(
      expectSaga(
        sendPreparedTransactions,
        serializablePreparedTransactions,
        networkConfig.defaultNetworkId,
        mockCreateBaseStandbyTransactions
      )
        .withState(createMockStore({}).getState())
        .provide([
          [call(getConnectedUnlockedAccount), throwError(new Error('incorrectPin'))],
          ...createDefaultProviders(),
        ])
        .run()
    ).rejects.toThrowError('incorrectPin')
  })

  it('throws if the wallet account is missing', async () => {
    await expect(
      expectSaga(
        sendPreparedTransactions,
        serializablePreparedTransactions,
        networkConfig.defaultNetworkId,
        mockCreateBaseStandbyTransactions
      )
        .withState(createMockStore({}).getState())
        .provide([[matchers.call.fn(getViemWallet), {}], ...createDefaultProviders()])
        .run()
    ).rejects.toThrowError('No account found in the wallet')
  })

  // Idempotency layer (Track B Task 1) tests:
  //
  // The saga records each submission to the `sentTransactionLog` slice BEFORE
  // moving to the next iteration so that a crash mid-batch can be recovered
  // on reentry with the same flowId.

  it('records each tx submission to the sentTransactionLog on first run', async () => {
    const flowId = 'test-flow-first-run'
    await expectSaga(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkConfig.defaultNetworkId,
      mockCreateBaseStandbyTransactions,
      false,
      flowId
    )
      .withState(createMockStore({}).getState())
      .provide(createDefaultProviders())
      .put(recordSent({ flowId, index: 0, nonce: 10, hash: '0xmockTxHash1' }))
      .put(recordSent({ flowId, index: 1, nonce: 11, hash: '0xmockTxHash2' }))
      .returns(['0xmockTxHash1', '0xmockTxHash2'])
      .run()

    expect(mockViemWallet.sendRawTransaction).toHaveBeenCalledTimes(2)
  })

  it('skips re-sending on reentry when records are already confirmed', async () => {
    const flowId = 'test-flow-confirmed-reentry'
    const preloadedState = createMockStore({
      sentTransactionLog: {
        byFlow: {
          [flowId]: [
            {
              flowId,
              index: 0,
              nonce: 10,
              hash: '0xpriorHash1',
              status: 'confirmed' as const,
            },
            {
              flowId,
              index: 1,
              nonce: 11,
              hash: '0xpriorHash2',
              status: 'confirmed' as const,
            },
          ],
        },
      },
    }).getState()

    await expectSaga(
      sendPreparedTransactions,
      serializablePreparedTransactions,
      networkConfig.defaultNetworkId,
      mockCreateBaseStandbyTransactions,
      false,
      flowId
    )
      .withState(preloadedState)
      .provide(createDefaultProviders())
      .returns(['0xpriorHash1', '0xpriorHash2'])
      .run()

    // No new submissions should have happened — both indices were already confirmed.
    expect(mockViemWallet.signTransaction).not.toHaveBeenCalled()
    expect(mockViemWallet.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('waits for receipt on reentry when records are pending instead of re-sending', async () => {
    const flowId = 'test-flow-pending-reentry'
    const preloadedState = createMockStore({
      sentTransactionLog: {
        byFlow: {
          [flowId]: [
            {
              flowId,
              index: 0,
              nonce: 10,
              hash: '0xpendingHash1',
              status: 'pending' as const,
            },
          ],
        },
      },
    }).getState()

    const network = Network.Celo
    await expectSaga(
      sendPreparedTransactions,
      // Only one prepared tx for this test so we exercise the pending path
      // without then proceeding to a normal-send second iteration.
      [serializablePreparedTransactions[0]],
      networkConfig.defaultNetworkId,
      [mockCreateBaseStandbyTransactions[0]],
      false,
      flowId
    )
      .withState(preloadedState)
      .provide([
        [
          matchers.call.fn(publicClient[network].waitForTransactionReceipt),
          { status: 'success', transactionHash: '0xpendingHash1' },
        ],
        ...createDefaultProviders(),
      ])
      .put(markConfirmed({ flowId, hash: '0xpendingHash1' }))
      .returns(['0xpendingHash1'])
      .run()

    expect(mockViemWallet.signTransaction).not.toHaveBeenCalled()
    expect(mockViemWallet.sendRawTransaction).not.toHaveBeenCalled()
  })
})
