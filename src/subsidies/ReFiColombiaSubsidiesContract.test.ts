import BigNumber from 'bignumber.js'
import { showError } from 'src/alert/actions'
import { ErrorMessages } from 'src/app/ErrorMessages'
import { store } from 'src/redux/store'
import ReFiColombiaSubsidiesContract, {
  REFI_COLOMBIA_SUBSIDIES_ADDRESS,
} from 'src/subsidies/ReFiColombiaSubsidiesContract'
import { NetworkId } from 'src/transactions/types'
import { prepareTransactions } from 'src/viem/prepareTransactions'
import { getKeychainAccounts } from 'src/web3/contracts'
import { Address } from 'viem'

jest.mock('src/redux/store', () => ({
  store: {
    dispatch: jest.fn(),
    getState: jest.fn(),
  },
}))

jest.mock('src/viem', () => ({
  publicClient: {
    celo: {
      getCode: jest.fn(),
      readContract: jest.fn(),
      simulateContract: jest.fn(),
      waitForTransactionReceipt: jest.fn(),
      getBlockNumber: jest.fn(),
      getLogs: jest.fn(),
    },
  },
}))

jest.mock('src/viem/prepareTransactions', () => ({
  prepareTransactions: jest.fn(),
}))

jest.mock('src/viem/getLockableWallet', () => ({
  __esModule: true,
  default: jest.fn(),
}))

jest.mock('src/web3/contracts', () => ({
  getKeychainAccounts: jest.fn(),
}))

jest.mock('src/tokens/selectors', () => ({
  _feeCurrenciesByNetworkIdSelector: jest.fn().mockReturnValue({}),
}))

jest.mock('src/web3/networkConfig', () => ({
  __esModule: true,
  default: {
    viemChain: { celo: { id: 42220, name: 'Celo' } },
    networkToNetworkId: { celo: 'celo-mainnet' },
    defaultNetworkId: 'celo-mainnet',
  },
}))

const mockWalletAddress: Address = '0x0000000000000000000000000000000000000abc'

const buildTokenBalance = (overrides: Partial<any>) => ({
  tokenId: 'celo-mainnet:0x000',
  address: '0x000',
  symbol: 'CELO',
  decimals: 18,
  balance: new BigNumber(0),
  priceUsd: new BigNumber(1),
  networkId: NetworkId['celo-mainnet'],
  isFeeCurrency: true,
  isNative: false,
  ...overrides,
})

describe('ReFiColombiaSubsidiesContract.claimSubsidy', () => {
  let mockWallet: {
    unlockAccount: jest.Mock
    sendTransaction: jest.Mock
    writeContract: jest.Mock
  }

  beforeEach(() => {
    jest.clearAllMocks()

    mockWallet = {
      unlockAccount: jest.fn().mockResolvedValue(true),
      sendTransaction: jest.fn().mockResolvedValue('0xclaimtxhash'),
      writeContract: jest.fn(),
    }
    const getLockableViemWallet = require('src/viem/getLockableWallet').default
    getLockableViemWallet.mockReturnValue(mockWallet)
    ;(getKeychainAccounts as jest.Mock).mockResolvedValue({})

    const { publicClient } = require('src/viem')
    publicClient.celo.getCode.mockResolvedValue('0xdeployedcode')
    publicClient.celo.readContract.mockResolvedValue(true) // isBeneficiary
    publicClient.celo.simulateContract.mockResolvedValue({})
    publicClient.celo.waitForTransactionReceipt.mockResolvedValue({
      blockNumber: 1n,
      logs: [],
    })
    publicClient.celo.getBlockNumber.mockResolvedValue(1000n)
    publicClient.celo.getLogs.mockResolvedValue([])
  })

  it('selects COPm as fee currency when wallet holds only COPm', async () => {
    const copmAddress = '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as Address
    const copmToken = buildTokenBalance({
      tokenId: 'celo-mainnet:0x8a567e2ae79ca692bd748ab832081c45de4041ea',
      address: copmAddress,
      symbol: 'COPm',
      decimals: 18,
      balance: new BigNumber(100000),
      isFeeCurrency: true,
      isNative: false,
    })

    const { _feeCurrenciesByNetworkIdSelector } = require('src/tokens/selectors')
    _feeCurrenciesByNetworkIdSelector.mockReturnValue({
      'celo-mainnet': [copmToken],
    })
    ;(prepareTransactions as jest.Mock).mockResolvedValue({
      type: 'possible',
      feeCurrency: copmToken,
      transactions: [
        {
          to: REFI_COLOMBIA_SUBSIDIES_ADDRESS,
          data: '0xencoded',
          gas: 100000n,
          maxFeePerGas: 1000n,
          maxPriorityFeePerGas: 100n,
          feeCurrency: copmAddress,
        },
      ],
    })

    const result = await ReFiColombiaSubsidiesContract.claimSubsidy(mockWalletAddress, 'pass')

    expect(prepareTransactions).toHaveBeenCalledTimes(1)
    expect(mockWallet.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: REFI_COLOMBIA_SUBSIDIES_ADDRESS,
        feeCurrency: copmAddress,
      })
    )
    expect(result.success).toBe(true)
    expect(result.txHash).toBe('0xclaimtxhash')
  })
})
