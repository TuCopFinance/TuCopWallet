import type { ErrorClass } from 'src/lib/errors'
import type { NetworkId } from 'src/transactions/types'
import type { SerializableTransactionRequest } from 'src/viem/preparedTransactionSerialization'

export type FlowKind =
  | 'swap'
  | 'dollarsSpend'
  | 'send'
  | 'buckspay'
  | 'earn'
  | 'gold'
  | 'jumpstart'
  | 'subsidy'

export type InFlightStatus =
  | 'idle'
  | 'preparing'
  | 'awaiting-pin'
  | 'submitting'
  | 'pending-confirmation'
  | 'progress'
  | 'succeeded'
  | 'partial-failure'
  | 'failed'

export interface InFlightDescriptor {
  flowId: string
  flowKind: FlowKind
  steps: number
  currentStep: number
  status: InFlightStatus
  preparedTransactions: SerializableTransactionRequest[]
  networkId: NetworkId
  lastErrorClass?: ErrorClass
  retryCount: number
  startedAt: number
  // Multi-step: per-step accounting for partial-failure UI.
  completedStepIndices?: number[]
  failedStepIndex?: number | null
  // Optional feature-private blob carried along with the descriptor.
  // E.g. swap stores maxSlippagePercentage; subsidy stores recipientPhone hash.
  pollContext?: Record<string, unknown>
}

export type CustomPoll = (descriptor: InFlightDescriptor) => Promise<InFlightStatus | null>

export type RetryClassifier = (error: unknown) => ErrorClass

export interface RetryOptions {
  freshPreparedTransactions?: SerializableTransactionRequest[]
  pollContextPatch?: Record<string, unknown>
}

export interface UseTransactionInFlightArgs {
  scopeToFlowKind?: FlowKind
  customPoll?: CustomPoll
  retryClassifier?: RetryClassifier
}

export interface UseTransactionInFlightResult {
  current: InFlightDescriptor | null
  start: (
    descriptor: Omit<
      InFlightDescriptor,
      'flowId' | 'currentStep' | 'status' | 'retryCount' | 'startedAt'
    >
  ) => string
  advance: (flowId: string, toStatus: InFlightStatus, patch?: Partial<InFlightDescriptor>) => void
  fail: (flowId: string, errorClass: ErrorClass) => void
  retry: (flowId: string, opts?: RetryOptions) => void
  abort: (flowId: string) => void
  classifyError: (error: unknown) => ErrorClass
}
