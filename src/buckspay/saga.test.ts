import { expectSaga } from 'redux-saga-test-plan'
import * as matchers from 'redux-saga-test-plan/matchers'
import { EffectProviders, StaticProvider, throwError } from 'redux-saga-test-plan/providers'
import { select } from 'redux-saga/effects'
import { checkUserExists, submitTransaction } from 'src/buckspay/api'
import {
  apiSubmitted,
  checkUserComplete,
  cryptoSent,
  offrampError,
  offrampStart,
  statusUpdated,
} from 'src/buckspay/slice'
import { checkUserRegistrationSaga, offrampSaga } from 'src/buckspay/saga'
import { BankDetails } from 'src/buckspay/types'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { sendPreparedTransactions } from 'src/viem/saga'
import { walletAddressSelector } from 'src/web3/selectors'
import { createMockStore } from 'test/utils'
import { mockAccount } from 'test/values'

jest.mock('src/navigator/NavigationService', () => ({
  navigate: jest.fn(),
  navigateHome: jest.fn(),
}))

jest.mock('src/utils/Logger')

const mockWalletAddress = mockAccount
const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
const mockBankDetails: BankDetails = {
  bankName: 'Bancolombia',
  accountNumber: '12345678901',
  accountType: 'savings',
  bankCountry: 'Colombia',
}
const mockPreparedTransactions = [{ from: '0xfrom', to: '0xto', data: '0xdata' }]

describe('checkUserRegistrationSaga', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function createProviders(
    overrides: Partial<{
      walletAddress: string | null
      userExists: boolean
      throwCheckError: boolean
    }> = {}
  ): (EffectProviders | StaticProvider)[] {
    const {
      walletAddress = mockWalletAddress,
      userExists = true,
      throwCheckError = false,
    } = overrides

    const providers: (EffectProviders | StaticProvider)[] = [
      [select(walletAddressSelector), walletAddress],
    ]

    if (throwCheckError) {
      providers.push([matchers.call.fn(checkUserExists), throwError(new Error('Network error'))])
    } else {
      providers.push([
        matchers.call.fn(checkUserExists),
        { exists: userExists, ...(userExists ? { role: 'USER' } : {}) },
      ])
    }

    return providers
  }

  it('navigates to BankForm when user is registered', async () => {
    await expectSaga(checkUserRegistrationSaga)
      .withState(createMockStore({}).getState())
      .provide(createProviders({ userExists: true }))
      .put(checkUserComplete())
      .run()

    expect(navigate).toHaveBeenCalledWith(Screens.BucksPayBankForm)
  })

  it('navigates to WebView when user is not registered', async () => {
    await expectSaga(checkUserRegistrationSaga)
      .withState(createMockStore({}).getState())
      .provide(createProviders({ userExists: false }))
      .put(checkUserComplete())
      .run()

    expect(navigate).toHaveBeenCalledWith(Screens.WebViewScreen, {
      uri: 'https://app.buckspay.xyz/',
    })
  })

  it('navigates to WebView on API error', async () => {
    await expectSaga(checkUserRegistrationSaga)
      .withState(createMockStore({}).getState())
      .provide(createProviders({ throwCheckError: true }))
      .put(checkUserComplete())
      .run()

    expect(navigate).toHaveBeenCalledWith(Screens.WebViewScreen, {
      uri: 'https://app.buckspay.xyz/',
    })
  })

  it('completes without navigating when no wallet address', async () => {
    await expectSaga(checkUserRegistrationSaga)
      .withState(createMockStore({}).getState())
      .provide(createProviders({ walletAddress: null }))
      .put(checkUserComplete())
      .run()

    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('offrampSaga', () => {
  const offrampAction = offrampStart({
    bankDetails: mockBankDetails,
    preparedTransactions: mockPreparedTransactions as any,
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function createProviders(
    overrides: Partial<{
      walletAddress: string | null
      txHashes: string[]
      apiResult: { code: string; message: string; amount: number; network: number; status: string }
      throwSendError: boolean
      throwApiError: boolean
    }> = {}
  ): (EffectProviders | StaticProvider)[] {
    const {
      walletAddress = mockWalletAddress,
      txHashes = [mockTxHash],
      apiResult = {
        message: 'TRANSACTION_CREATED',
        code: 'AB1C',
        amount: 50000,
        network: 6,
        status: 'PENDING',
      },
      throwSendError = false,
      throwApiError = false,
    } = overrides

    const providers: (EffectProviders | StaticProvider)[] = [
      [select(walletAddressSelector), walletAddress],
    ]

    if (throwSendError) {
      providers.push([
        matchers.call.fn(sendPreparedTransactions),
        throwError(new Error('Send failed')),
      ])
    } else {
      providers.push([matchers.call.fn(sendPreparedTransactions), txHashes])
    }

    if (throwApiError) {
      providers.push([
        matchers.call.fn(submitTransaction),
        throwError(new Error('API submit failed')),
      ])
    } else {
      providers.push([matchers.call.fn(submitTransaction), apiResult])
    }

    // Mock the race effect (polling + cancel) to resolve immediately
    providers.push({
      race: () => ({ poll: undefined }),
    } as any)

    return providers
  }

  it('completes full offramp flow successfully', async () => {
    await expectSaga(offrampSaga, offrampAction)
      .withState(createMockStore({}).getState())
      .provide(createProviders())
      .put(cryptoSent({ transactionHash: mockTxHash }))
      .put(apiSubmitted({ code: 'AB1C' }))
      .run()

    expect(navigate).toHaveBeenCalledWith(Screens.BucksPayStatus)
  })

  it('dispatches error when no wallet address', async () => {
    await expectSaga(offrampSaga, offrampAction)
      .withState(createMockStore({}).getState())
      .provide(createProviders({ walletAddress: null }))
      .put(offrampError('No wallet address'))
      .run()
  })

  it('dispatches error when crypto send fails', async () => {
    await expectSaga(offrampSaga, offrampAction)
      .withState(createMockStore({}).getState())
      .provide(createProviders({ throwSendError: true }))
      .put(offrampError('Send failed'))
      .not.put.actionType(cryptoSent.type)
      .run()
  })

  it('dispatches error when no prepared transactions', async () => {
    const emptyTxAction = offrampStart({
      bankDetails: mockBankDetails,
      preparedTransactions: [],
    })

    await expectSaga(offrampSaga, emptyTxAction)
      .withState(createMockStore({}).getState())
      .provide(createProviders())
      .put(offrampError('No prepared transactions'))
      .run()
  })
})
