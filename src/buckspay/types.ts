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
  { id: 'davivienda', name: 'Davivienda', accountType: ['savings', 'checking'] },
  { id: 'daviplata', name: 'Daviplata', accountType: ['nequi'] },
  { id: 'banco_de_bogota', name: 'Banco de Bogotá', accountType: ['savings', 'checking'] },
  { id: 'bbva', name: 'BBVA Colombia', accountType: ['savings', 'checking'] },
  { id: 'banco_de_occidente', name: 'Banco de Occidente', accountType: ['savings', 'checking'] },
  { id: 'banco_popular', name: 'Banco Popular', accountType: ['savings', 'checking'] },
  {
    id: 'scotiabank_colpatria',
    name: 'Scotiabank Colpatria',
    accountType: ['savings', 'checking'],
  },
  { id: 'banco_av_villas', name: 'Banco AV Villas', accountType: ['savings', 'checking'] },
  { id: 'banco_caja_social', name: 'Banco Caja Social', accountType: ['savings', 'checking'] },
  { id: 'banco_agrario', name: 'Banco Agrario', accountType: ['savings', 'checking'] },
  { id: 'banco_itau', name: 'Banco Itaú', accountType: ['savings', 'checking'] },
  { id: 'banco_pichincha', name: 'Banco Pichincha', accountType: ['savings', 'checking'] },
  { id: 'banco_falabella', name: 'Banco Falabella', accountType: ['savings', 'checking'] },
  { id: 'banco_serfinanza', name: 'Banco Serfinanza', accountType: ['savings', 'checking'] },
  { id: 'banco_w', name: 'Banco W', accountType: ['savings', 'checking'] },
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
