import { FetchMock } from 'jest-fetch-mock'
import { checkUserExists, getTransactionStatus, submitTransaction } from 'src/buckspay/api'
import { BUCKSPAY_API_BASE_URL } from 'src/web3/networkConfig'

const mockFetch = fetch as FetchMock

jest.mock('src/utils/Logger')

describe('buckspay/api', () => {
  beforeEach(() => {
    mockFetch.resetMocks()
  })

  describe('checkUserExists', () => {
    it('returns user data when user exists', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ exists: true, role: 'USER' }))

      const result = await checkUserExists('0x1234')

      expect(result).toEqual({ exists: true, role: 'USER' })
      expect(mockFetch).toHaveBeenCalledWith(
        `${BUCKSPAY_API_BASE_URL}/api/check/0x1234`,
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    it('returns false when user does not exist', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ exists: false }))

      const result = await checkUserExists('0x5678')

      expect(result).toEqual({ exists: false })
    })

    it('throws on HTTP error with message', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ message: 'INVALID_ADDRESS' }), {
        status: 400,
      })

      await expect(checkUserExists('bad')).rejects.toThrow('INVALID_ADDRESS')
    })

    it('throws with HTTP status when no message in error body', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({}), { status: 500 })

      await expect(checkUserExists('0x1234')).rejects.toThrow('HTTP 500')
    })
  })

  describe('submitTransaction', () => {
    const body = {
      address: '0xabc',
      trxHash: '0xtxhash',
      network: 6,
      type: 'transfer',
      number: '123456',
      bankName: 'Bancolombia',
    }

    it('submits transaction and returns response', async () => {
      const apiResponse = {
        message: 'TRANSACTION_CREATED',
        code: 'AB1C',
        amount: 50000,
        network: 6,
        status: 'PENDING',
      }
      mockFetch.mockResponseOnce(JSON.stringify(apiResponse))

      const result = await submitTransaction(body)

      expect(result).toEqual(apiResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        `${BUCKSPAY_API_BASE_URL}/api/transaction`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    })

    it('throws on duplicate transaction', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ message: 'TRANSACTION_PROCESSED_ALREADY' }), {
        status: 400,
      })

      await expect(submitTransaction(body)).rejects.toThrow('TRANSACTION_PROCESSED_ALREADY')
    })

    it('throws on auth error', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ message: 'INVALID_API_KEY' }), {
        status: 401,
      })

      await expect(submitTransaction(body)).rejects.toThrow('INVALID_API_KEY')
    })
  })

  describe('getTransactionStatus', () => {
    it('returns pending status', async () => {
      const apiResponse = {
        status: 'PENDING',
        transaction: {
          code: 'AB1C',
          amount: 50000,
          valueCurrency: 50000,
          nationalCurrency: 'COP',
          cryptoCurrency: 'ccop',
          network: 6,
          externalTrxHash: '0xtxhash',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z',
        },
      }
      mockFetch.mockResponseOnce(JSON.stringify(apiResponse))

      const result = await getTransactionStatus('0xtxhash')

      expect(result).toEqual(apiResponse)
      expect(mockFetch).toHaveBeenCalledWith(
        `${BUCKSPAY_API_BASE_URL}/api/transaction/0xtxhash`,
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('returns finished status with certificate', async () => {
      const apiResponse = {
        status: 'FINISHED',
        transaction: {
          status: 'FINISHED',
          code: 'AB1C',
          amount: 50000,
          valueCurrency: 50000,
          nationalCurrency: 'COP',
          cryptoCurrency: 'ccop',
          network: 6,
          externalTrxHash: '0xtxhash',
          certificate: 'https://cdn.buckspay.com/receipts/abc.jpg',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T11:00:00.000Z',
        },
      }
      mockFetch.mockResponseOnce(JSON.stringify(apiResponse))

      const result = await getTransactionStatus('0xtxhash')

      expect(result.status).toBe('FINISHED')
      expect(result.transaction?.certificate).toBe('https://cdn.buckspay.com/receipts/abc.jpg')
    })

    it('returns NOT_FOUND when transaction does not exist', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ status: 'NOT_FOUND' }))

      const result = await getTransactionStatus('0xunknown')

      expect(result.status).toBe('NOT_FOUND')
    })

    it('throws on HTTP error', async () => {
      mockFetch.mockResponseOnce(JSON.stringify({ message: 'INVALID_API_KEY' }), {
        status: 401,
      })

      await expect(getTransactionStatus('0xtxhash')).rejects.toThrow('INVALID_API_KEY')
    })
  })
})
