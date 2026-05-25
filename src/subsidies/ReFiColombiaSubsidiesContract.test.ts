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

  it('selects USDm as fee currency when wallet holds only USDm', async () => {
    const usdmAddress = '0x765de816845861e75a25fca122bb6898b8b1282a' as Address
    const usdmToken = buildTokenBalance({
      tokenId: 'celo-mainnet:0x765de816845861e75a25fca122bb6898b8b1282a',
      address: usdmAddress,
      symbol: 'USDm',
      decimals: 18,
      balance: new BigNumber(50),
      isFeeCurrency: true,
      isNative: false,
    })

    const { _feeCurrenciesByNetworkIdSelector } = require('src/tokens/selectors')
    _feeCurrenciesByNetworkIdSelector.mockReturnValue({
      'celo-mainnet': [usdmToken],
    })
    ;(prepareTransactions as jest.Mock).mockResolvedValue({
      type: 'possible',
      feeCurrency: usdmToken,
      transactions: [
        {
          to: REFI_COLOMBIA_SUBSIDIES_ADDRESS,
          data: '0xencoded',
          gas: 100000n,
          maxFeePerGas: 1000n,
          maxPriorityFeePerGas: 100n,
          feeCurrency: usdmAddress,
        },
      ],
    })

    const result = await ReFiColombiaSubsidiesContract.claimSubsidy(mockWalletAddress, 'pass')

    expect(mockWallet.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ feeCurrency: usdmAddress })
    )
    expect(result.success).toBe(true)
  })

  it('dispatches INSUFFICIENT_FUNDS_FOR_GAS when no fee currency has enough balance', async () => {
    const { _feeCurrenciesByNetworkIdSelector } = require('src/tokens/selectors')
    _feeCurrenciesByNetworkIdSelector.mockReturnValue({
      'celo-mainnet': [],
    })
    ;(prepareTransactions as jest.Mock).mockResolvedValue({
      type: 'not-enough-balance-for-gas',
      feeCurrencies: [],
    })

    const result = await ReFiColombiaSubsidiesContract.claimSubsidy(mockWalletAddress, 'pass')

    expect(mockWallet.sendTransaction).not.toHaveBeenCalled()
    expect(store.dispatch).toHaveBeenCalledWith(showError(ErrorMessages.INSUFFICIENT_FUNDS_FOR_GAS))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Not enough balance to pay for gas/)
  })

  it('passes the prioritized fee currency list from selectors to prepareTransactions', async () => {
    const celo = buildTokenBalance({
      tokenId: 'celo-mainnet:celo',
      symbol: 'CELO',
      address: '0x471ece3750da237f93b8e339c536989b8978a438' as Address,
      isNative: true,
      balance: new BigNumber(1),
    })
    const copm = buildTokenBalance({
      tokenId: 'celo-mainnet:copm',
      symbol: 'COPm',
      address: '0x8a567e2ae79ca692bd748ab832081c45de4041ea' as Address,
      balance: new BigNumber(50000),
    })

    const { _feeCurrenciesByNetworkIdSelector } = require('src/tokens/selectors')
    _feeCurrenciesByNetworkIdSelector.mockReturnValue({
      'celo-mainnet': [celo, copm],
    })
    ;(prepareTransactions as jest.Mock).mockResolvedValue({
      type: 'possible',
      feeCurrency: celo,
      transactions: [
        {
          to: REFI_COLOMBIA_SUBSIDIES_ADDRESS,
          data: '0xencoded',
          gas: 100000n,
          maxFeePerGas: 1000n,
          maxPriorityFeePerGas: 100n,
        },
      ],
    })

    await ReFiColombiaSubsidiesContract.claimSubsidy(mockWalletAddress, 'pass')

    const callArg = (prepareTransactions as jest.Mock).mock.calls[0][0]
    expect(callArg.feeCurrencies.length).toBeGreaterThan(0)
    expect(callArg.baseTransactions[0].to).toBe(REFI_COLOMBIA_SUBSIDIES_ADDRESS)
    expect(callArg.origin).toBe('subsidies')
  })
})
