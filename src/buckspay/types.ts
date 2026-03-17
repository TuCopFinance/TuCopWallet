import { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'

export type AccountType = 'savings' | 'checking' | 'nequi'

export interface ColombianBank {
  id: string
  name: string
  accountType: AccountType[]
  isDefault?: boolean
}

export const COLOMBIAN_BANKS: ColombianBank[] = [
  { id: 'bancolombia', name: 'Bancolombia', accountType: ['savings', 'checking'], isDefault: true },
  { id: 'nequi', name: 'Nequi', accountType: ['nequi'] },
]

export const DEFAULT_BANK = COLOMBIAN_BANKS.find((b) => b.isDefault)!

export const BUCKSPAY_MIN_AMOUNT = 10_000
export const BUCKSPAY_MAX_AMOUNT = 300_000

export interface BankDetails {
  bankName: string
  accountNumber: string
  accountType: AccountType
  bankCountry: string
}

export interface BucksPayOfframpInfo {
  amount: string
  bankDetails: BankDetails
  preparedTransactions: SerializableTransactionRequest[]
}

// API response types

export interface CheckUserExistsResponse {
  exists: boolean
  role?: 'ADMIN' | 'USER' | 'FROG' | 'LIQUIDATOR'
}

export interface SubmitTransactionRequest {
  address: string
  trxHash: string
  network: number
  type: string
  number: string
  bankName: string
  bankCountry?: string
  nationalCurrency?: string
}

export interface SubmitTransactionResponse {
  message: string
  code: string
  amount: number
  network: number
  status: 'PENDING'
}

export type BucksPayTransactionStatus = 'PENDING' | 'INPROGRESS' | 'STARTED' | 'PAYED' | 'FINISHED'

export interface TransactionStatusResponse {
  status: BucksPayTransactionStatus | 'NOT_FOUND'
  transaction?: {
    status: string
    code: string
    amount: number
    valueCurrency: number
    nationalCurrency: string
    cryptoCurrency: string
    network: number
    externalTrxHash: string
    certificate?: string | null
    createdAt: string
    updatedAt: string
  }
}

export interface BucksPayErrorResponse {
  message: string
  error?: string
}
